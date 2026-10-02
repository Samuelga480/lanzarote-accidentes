/**
 * Redacta los pendientes y las publicadas con el texto del medio.
 *
 *   npx tsx scripts:redactar-pendientes.ts
 *
 * ---------------------------------------------------------------------------
 *  POR QUE HACE FALTA
 * ---------------------------------------------------------------------------
 *
 * `ingestArticle` pasaba la fecha del suceso con `formatLocal()`, que devuelve
 * algo para leer ("2 de octubre de 2026 a las 08:48"). El redactor hace
 * `new Date(esa cadena)`, que es una fecha invalida, y en vez de redactar
 * devolvia un error mudo. Todas las noticias se guardaron con el texto del
 * medio y con la nota "La IA no pudo reescribirla".
 *
 * Aqui se vuelven a redactar con los DATOS ORIGINALES que ya estan guardados, que
 * no se borran al redactar justamente para poder rehacerlo. No se inventa nada:
 * el redactor por reglas solo escribe lo que ve en los hechos extraidos.
 *
 * Las noticias que no son de la isla se saltan con el filtro nuevo, por si
 * quedara alguna de las que se colaron antes.
 */

import { prisma } from "@/lib/prisma";
import { extractFacts } from "@/lib/facts";
import { rewriteByRules } from "@/lib/ai/rewrite-rules";
import { evaluaIsla } from "@/lib/traffic-gate";
import { MUNICIPALITY_BY_SLUG } from "@/lib/constants";

async function main() {
  /*
    Se redraftan tambien las YA PUBLICADAS. Estas se redactaron con el codigo
    anterior, que escribia "estaba implicado una bicicleta" y cerraba siempre con
    la misma frase. Corregir el redactor no cambia lo ya publicado: hay que pasar
    por delante. Aqui si se tocan articles en vivo, y a proposito: son fallos de
    redaccion, no cambios de contenido.
  */
  const lista = await prisma.accident.findMany({
    orderBy: { occurredAt: "desc" },
    where: { status: { in: ["PENDING_REVIEW", "PUBLISHED"] } },
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      originalTitle: true,
      originalSummary: true,
      originalBody: true,
      occurredAt: true,
      aiModel: true,
      rewrittenAt: true,
      reviewNotes: true,
      zone: true,
      municipality: { select: { slug: true, name: true } },
    },
  });

  console.log(`\n  Pendientes y publicadas a redactar: ${lista.length}\n`);

  let redactados = 0;
  let saltados = 0;
  let fueraDeLaIsla = 0;

  for (const a of lista) {
    const titulo = a.originalTitle ?? a.title;
    const cuerpo = a.originalBody ?? a.body;
    const resumen = a.originalSummary ?? a.summary ?? "";

    const isla = evaluaIsla(titulo, `${resumen} ${cuerpo}`);
    if (!isla.deLanzarote) {
      fueraDeLaIsla++;
      console.log(`  x ${a.title.slice(0, 66)}`);
      console.log(`      no es de Lanzarote: ${isla.motivo}`);
      continue;
    }

    const facts = extractFacts(titulo, cuerpo);
    const municipio = MUNICIPALITY_BY_SLUG.get(facts.municipalitySlug ?? a.municipality.slug);

    const r = rewriteByRules({
      title: titulo,
      body: cuerpo,
      summary: resumen,
      facts,
      municipalityName: municipio?.name ?? a.municipality.name,
      occurredAtIso: a.occurredAt.toISOString(),
      outlet: "Redaccion por reglas",
      sourceUrl: "/admin",
    });

    if (!r.ok) {
      saltados++;
      console.log(`  ! ${a.title.slice(0, 66)}`);
      console.log(`      no se pudo redactar: ${r.error}`);
      continue;
    }

    // La nota que decia "no se pudo reescribir" se quita: ya es falso.
    const notas = (a.reviewNotes ?? "")
      .replace(/La IA no pudo reescribirla: el texto es el original\.\s*/g, "")
      .replace(/Solapamiento con el original:[^.]*\.\s*/g, "")
      .trim();

    await prisma.accident.update({
      where: { id: a.id },
      data: {
        title: r.title,
        summary: r.summary,
        body: r.body,
        seoTitle: r.seoTitle,
        metaDescription: r.metaDescription,
        excerpt: r.excerpt,
        aiModel: null,
        rewrittenAt: new Date(),
        reviewNotes: notas || null,
        // Los hechos que el redactor ha confirmado se guardan aqui para que el
        // editor no tenga que releer el articulo entero.
        category: facts.category ?? undefined,
        vehicleType: facts.vehicleType ?? undefined,
        road: facts.road ?? undefined,
        zone: facts.zoneSlug ?? null,
      },
    });

    redactados++;
    console.log(`  + ${r.title}`);
    console.log(`      municipio: ${municipio?.name ?? a.municipality.name}${facts.areaLabel ? " / " + facts.areaLabel : ""}`);
    console.log(`      cuerpo   : ${r.body.replace(/\n+/g, " ").slice(0, 140)}`);
  }

  console.log(`\n  Redactados: ${redactados} | Sin poder: ${saltados} | No son de la isla: ${fueraDeLaIsla}`);
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error("Error:", String(e).split("\n")[0]);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
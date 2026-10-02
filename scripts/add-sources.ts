/**
 * Da de alta las fuentes de noticias que se han verificado de verdad.
 *
 *   npx tsx scripts/add-sources.ts
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTE FICHERO ES UNA LISTA CORTA Y NO UNA CONSTANTE EN EL CODIGO
 * ---------------------------------------------------------------------------
 *
 * Las fuentes se guardan en la base de datos y no en el repositorio porque son
 * datos que cambian: un medio cierra su RSS y hay que darlo de baja sin tocar
 * el codigo ni desplegar. Lo que vive aqui es el arranque, no la configuracion.
 *
 * ---------------------------------------------------------------------------
 *  SOLO ENTRA LO QUE RESPONDE
 * ---------------------------------------------------------------------------
 *
 * scripts/probe-feeds.ts se encargo de comprobar que cada direccion devuelve
 * un feed de verdad y con entradas. Anadir una fuente que devuelve 404 solo
 * sirve para que el panel se llene de errores y el ciclo falle por culpa de un
 * medio que no existe.
 */

import { prisma } from "@/lib/prisma";

/**
 * Fuentes verificadas el 2 de octubre de 2026 con probe-feeds.ts.
 *
 * De los 40 candidatos, solo dos devolvieron un feed con entradas. Los demas
 * respondian 404, 403, 406 o una pagina HTML en lugar de XML.
 */
const FUENTES: Array<{
  name: string;
  url: string;
  kind: "rss" | "atom" | "html";
  region: "LANZAROTE" | "CANARIAS" | "NACIONAL";
  baseScore: number;
  notes: string;
}> = [
  {
    name: "La Voz de Lanzarote",
    url: "https://www.lavozdelanzarote.com/rss",
    kind: "rss",
    region: "LANZAROTE",
    baseScore: 0.9,
    notes:
      "Diario principal de la isla. Es la unica fuente local con RSS activo: los " +
      "demas medios Lanzarote&#8203; devuelven 404, 403 o HTML en vez de XML. " +
      "El feed trae 75 entradas y no pagina, asi que cubre unos dos dias: " +
      "habria que pasarle cada pocas horas o se pierden noticias.",
  },
  {
    name: "20 minutos",
    url: "https://www.20minutos.es/rss/",
    kind: "rss",
    region: "NACIONAL",
    baseScore: 0.5,
    notes:
      "Nacional. Entra para no perder el accidente de una isla que recoge la " +
      "agencia, pero casi todo su contenido es de otras zonas: el filtro de " +
      "isla descarta la mayor parte. Puntuacion baja a proposito.",
  },
];

async function main() {
  console.log("Dando de alta las fuentes verificadas...\n");

  for (const f of FUENTES) {
    const existing = await prisma.feedSource.findUnique({ where: { url: f.url } });

    if (existing) {
      // Solo se escribe si algo cambio: escribir siempre moveria updatedAt y
      // haria pensar al panel que la fuente acaba de cambiar.
      const cambia =
        existing.name !== f.name ||
        existing.kind !== f.kind ||
        existing.region !== f.region ||
        existing.baseScore !== f.baseScore ||
        existing.enabled !== true;

      if (cambia) {
        await prisma.feedSource.update({
          where: { url: f.url },
          data: {
            name: f.name,
            kind: f.kind,
            region: f.region,
            baseScore: f.baseScore,
            notes: f.notes,
            enabled: true,
          },
        });
        console.log(`  ~ ${f.name} (actualizada)`);
      } else {
        console.log(`  = ${f.name} (sin cambios)`);
      }
      continue;
    }

    await prisma.feedSource.create({ data: f });
    console.log(`  + ${f.name}`);
  }

  const todas = await prisma.feedSource.findMany({ orderBy: { name: "asc" } });
  console.log(`\n  ${todas.length} fuente(s) en la base de datos:`);
  for (const t of todas) {
    console.log(`    ${t.enabled ? "activa " : "inactiva"} | ${t.name.padEnd(24)} | ${t.url}`);
  }
}

main()
  .catch((e) => {
    console.error("Error al dar de alta las fuentes:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
/**
 * Reclasifica las noticias ya publicadas y descarta las que no son de la isla.
 *
 * ---------------------------------------------------------------------------
 *  QUE ARREGLA
 * ---------------------------------------------------------------------------
 *
 * La ingestion traducía "no he podido clasificar esta noticia" por "es un
 * accidente". Con 85 noticias en la base de datos, 68 acabaron marcadas como
 * ACCIDENTE_TRAFICO y solo unas pocas eran de verdad accidentes: un partido de
 * balonmano, un horoscopo, una serie de television, una nota de prensa de Madrid.
 *
 * Este script vuelve a pasar cada noticia por el clasificador y corrige la
 * categoria. Lo que no reconoce de la isla se deja como OTRO, que es de la
 * familia de informacion y no alimenta el mapa ni los resumenes.
 *
 * ---------------------------------------------------------------------------
 *  CUIDADO CON LO QUE NO ES DE LA ISLA
 * ---------------------------------------------------------------------------
 *
 * Un titular de Madrid o de Barcelona no debe publicarse aqui, aunque se haya
 * colado antes. Con `--descartar` esos pasan a estado REJECTED, que es la misma
 * palabra que usa el panel para lo que el editor rechaza: se conservan en el
 * historial y no se ven en el sitio. No se borra nada.
 *
 * El filtro usa evaluaIsla, que ya estaba puesto y probado. Una noticia con la
 * palabra "Lanzarote" en un pie de foto se queda como de la isla; es el mismo
 * criterio que usa la puerta de entrada, asi que no hay dos reglas distintas.
 *
 * ---------------------------------------------------------------------------
 *  USO
 * ---------------------------------------------------------------------------
 *
 *   npx tsx scripts/reclasificar.ts             informe, no escribe
 *   npx tsx scripts/reclasificar.ts --aplicar   corrige las categorias
 *   npx tsx scripts/reclasificar.ts --aplicar --descartar   y descarta lo de fuera
 *
 * Guarda una copia antes:  npx tsx scripts/reclasificar.ts --copia
 */

import { PrismaClient } from "@prisma/client";
import { resolveCategory } from "@/lib/resolve-category";
import { extractFacts } from "@/lib/facts";
import { evaluaIsla } from "@/lib/traffic-gate";
import { esSuceso, etiquetaDe } from "@/lib/categorias";

const APLICAR = process.argv.includes("--aplicar");
const DESCARTAR = process.argv.includes("--descartar");
const COPIA = process.argv.includes("--copia");

async function main() {
  const prisma = new PrismaClient();

  const lista = await prisma.accident.findMany({
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      category: true,
      status: true,
      originalTitle: true,
    },
    orderBy: { occurredAt: "desc" },
  });

  if (COPIA) {
    const copia = lista.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      status: a.status,
    }));
    const { writeFileSync } = await import("node:fs");
    writeFileSync("categorias-antes.json", JSON.stringify(copia, null, 2), "utf8");
    console.log(`\n  Copia guardada en categorias-antes.json (${copia.length} noticias)\n`);
    await prisma.$disconnect();
    return;
  }

  console.log(
    `\n  Noticias: ${lista.length}   ${APLICAR ? "ESCRIBIENDO" : "solo informe"}${DESCARTAR ? " y descartando lo de fuera" : ""}\n`,
  );

  let cambiada = 0;
  let fuera = 0;
  let yaBien = 0;

  for (const a of lista) {
    const titulo = a.title;
    const cuerpo = a.body ?? a.summary ?? "";
    const original = a.originalTitle ?? "";

    // La puerta de la isla, con el titular y el original. Se prueban los dos
    // porque el original viene del medio y a veces el titular reescrito pierde
    // el topónimo.
    const isla = evaluaIsla(titulo, cuerpo);
    const islaConOriginal = evaluaIsla(original, cuerpo);
    const deLaIsla = isla.deLanzarote || islaConOriginal.deLanzarote;

    const nueva = resolveCategory(
      extractFacts(titulo, cuerpo).category,
      titulo,
      a.summary ?? "",
      cuerpo,
    );

    const cambio = nueva !== a.category;

    if (!deLaIsla) {
      fuera++;
      console.log(`  FUERA DE LA ISLA  [${a.category}] ${titulo.slice(0, 56)}`);
      console.log(`      ${islaConOriginal.deLanzarote ? isla : islaConOriginal.motivo}`);

      if (APLICAR && DESCARTAR) {
        await prisma.accident.update({
          where: { id: a.id },
          data: {
            status: "REJECTED",
            category: "OTRO",
            reviewedAt: new Date(),
            reviewedBy: "reclasificar",
            reviewNotes: "Descartada: no es de Lanzarote.",
          },
        });
        console.log(`      -> descartada`);
      }
      continue;
    }

    if (!cambio) {
      yaBien++;
      continue;
    }

    cambiada++;
    console.log(`  ${a.category} -> ${nueva}   ${titulo.slice(0, 52)}`);
    console.log(`      ${esSuceso(nueva) ? "suceso" : "información"}: ${etiquetaDe(nueva)}`);

    if (APLICAR) {
      await prisma.accident.update({
        where: { id: a.id },
        data: {
          category: nueva as never,
          reviewedAt: new Date(),
          reviewedBy: "reclasificar",
          reviewNotes: `Reclasificado de ${a.category} a ${nueva}.`,
        },
      });
    }
  }

  console.log(`\n  Sin cambio: ${yaBien}`);
  console.log(`  Reclasificadas: ${cambiada}`);
  console.log(`  Fuera de la isla: ${fuera}`);

  if (!APLICAR) console.log(`\n  Nada escrito. Repite con --aplicar.\n`);
  else if (!DESCARTAR) console.log(`\n  Hecho. Lo de fuera sigue publicado; usa --descartar para descartarlo.\n`);
  else console.log(`\n  Hecho.\n`);

  await prisma.$disconnect();
}

main();
/**
 * Deja la base de datos(Requesto) alineada con la lista de municipios nueva.
 *
 * ---------------------------------------------------------------------------
 *  QUE HACE Y POR QUE
 * ---------------------------------------------------------------------------
 *
 * En la tabla Municipality habia una fila `tizayuca` que no es un municipio de
 * Lanzarote (es una demarcacion dentro de Teguise) y faltaba `san-bartolome`,
 * que si lo es. Ademas las coordenadas de las siete estaban desplazadas entre 30
 * y55 km, dos de ellas en mar abierto, asi que los pines del mapa salian en el
 * sitio equivocado.
 *
 * No se borra ninguna fila ni se cambia ningun id: la de Tizayuca se RENOMBRA a
 * San Bartolome conservando su id, para que las noticias que la apuntaran no se
 * queden huerfanas. En este momento no hay ninguna, pero el dia que las haya el
 * script sigue siendo seguro.
 *
 * Por defecto solo informa. Hay que pasar `--aplicar` para escribir.
 */

import { PrismaClient } from "@prisma/client";
import { MUNICIPALITIES } from "../src/lib/constants";

const APLICAR = process.argv.includes("--aplicar");

/** El slug viejo que hay que renombrar, y al que pasa. */
const RENOMBRA: Record<string, string> = { tizayuca: "san-bartolome" };

async function main() {
  const prisma = new PrismaClient();

  console.log(`\n  Municipios: ${APLICAR ? "ESCRIBIENDO" : "solo informe"}\n`);

  const existentes = await prisma.municipality.findMany({ orderBy: { slug: "asc" } });
  const porSlug = new Map(existentes.map((m) => [m.slug, m]));

  /*
    1. Renombrar el que sobra.

    Ojo con el mapa: despues de renombrar hay que sacar la fila de la clave
    vieja y meterla en la nueva. Si no, el paso 2 sigue creyendo que
    San Bartolome no existe e intenta crear una segunda fila con el mismo slug.
    Se hace igual con y sin --aplicar, para que el informe diga la verdad sobre
    como quedaria la tabla.
  */
  for (const [viejo, nuevo] of Object.entries(RENOMBRA)) {
    const fila = porSlug.get(viejo);
    if (!fila) continue;

    const destino = porSlug.get(nuevo);
    if (destino) {
      console.log(`  - ${viejo} NO se toca: ya existe ${nuevo} (id ${destino.id})`);
      continue;
    }

    if (APLICAR) {
      await prisma.municipality.update({
        where: { id: fila.id },
        data: { slug: nuevo, name: MUNICIPALITIES.find((m) => m.slug === nuevo)?.name ?? nuevo },
      });
    }

    porSlug.delete(viejo);
    porSlug.set(nuevo, { ...fila, slug: nuevo });

    console.log(`  ${APLICAR ? "~" : "?"} ${viejo} -> ${nuevo}  (id ${fila.id}, conservado)`);
  }

  // 2. Anadir el que falta y poner las coordenadas buenas.
  for (const m of MUNICIPALITIES) {
    const fila = porSlug.get(m.slug);
    if (!fila) {
      if (APLICAR) await prisma.municipality.create({ data: { slug: m.slug, name: m.name, lat: m.lat, lon: m.lon } });
      console.log(`  ${APLICAR ? "+" : "?"} ${m.slug} no existia, se crea`);
      continue;
    }
    const movido = Math.abs(fila.lat - m.lat) > 0.0005 || Math.abs(fila.lon - m.lon) > 0.0005;
    if (movido && APLICAR) {
      await prisma.municipality.update({ where: { id: fila.id }, data: { name: m.name, lat: m.lat, lon: m.lon } });
    }
    console.log(
      `  ${movido ? (APLICAR ? "~" : "?") : " "} ${m.slug.padEnd(14)} ${fila.lat}, ${fila.lon}  ->  ${m.lat}, ${m.lon}` +
        (movido ? `   (${Math.round(Math.hypot((m.lat - fila.lat) * 111, (m.lon - fila.lon) * 93))} km)` : ""),
    );
  }

  // 3. Resumen.
  const finales = APLICAR
    ? await prisma.municipality.findMany({ orderBy: { slug: "asc" } })
    : existentes;
  console.log(`\n  Municipios en la tabla: ${finales.length}`);
  for (const m of finales) {
    const usos = await prisma.accident.count({ where: { municipalityId: m.id } });
    console.log(`    ${m.slug.padEnd(14)} ${m.name.padEnd(14)} ${m.lat}, ${m.lon}   (${usos} noticias)`);
  }

  if (!APLICAR) console.log(`\n  Nada escrito. Repite con --aplicar.\n`);
  else console.log(`\n  Hecho.\n`);

  await prisma.$disconnect();
}

main();
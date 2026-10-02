/**
 * Datos iniciales de la base de datos.
 *
 * ES JavaScript plano a proposito. La version anterior estaba en TypeScript y
 * necesitaba `tsx`, que es una devDependency: en el contenedor de produccion,
 * que se instala con `npm ci --omit=dev`, `prisma db seed` habria fallado con
 * "tsx: not found". Este fichero se ejecuta con el `node` de siempre.
 *
 * Solo carga lo que el sistema necesita para arrancar: los siete municipios de
 * Lanzarote. No se insertan noticias de ejemplo.
 *
 * La version anterior metia doce accidentes inventados, con fechas y horas
 * concretas, como si fueran reales. En un medio de coworkers eso es la peor
 * forma de sembrar la base de datos: cuando el sistema empiece a detectar
 * noticias reales, se mezclarian con ficticias sin forma de distinguirlas.
 *
 * Para probar la interfaz: `npm run monitor:once`. Las noticias entran por el
 * ciclo real de deteccion y quedan a la espera de revision, que es exactamente
 * lo que tiene que pasar.
 *
 *   npm run db:seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Los siete municipios con las coordenadas de su casco urbano.
 *
 * FUENTE DE VERDAD: src/lib/constants.ts (array MUNICIPALITIES). Si se cambia
 * aqui, hay que cambiarlo alla. Se repiten a mano para que este fichero no
 * dependa del compilador de TypeScript ni de los alias de importacion, que es
 * lo que permite ejecutarlo dentro del contenedor de produccion.
 *
 * Los municipios vienen bien. Antes nueve: Betancuria y Femes son de
 * Fuerteventura, "San Bartolome de Lanzarote" es un pueblo de Haria y no un
 * municipio, y Tinajo aparecia con el slug "tinaj" mientras el extractor
 * generaba "tinajo". Ademas faltaba Tizayuca, que si es municipio.
 */
const MUNICIPALITIES = [
  { slug: "arrecife", name: "Arrecife", lat: 28.4843, lon: -13.7845 },
  { slug: "haria", name: "Haría", lat: 29.115, lon: -13.435 },
  { slug: "teguise", name: "Teguise", lat: 28.56, lon: -13.65 },
  { slug: "tinajo", name: "Tinajo", lat: 28.6833, lon: -13.6833 },
  { slug: "tias", name: "Tías", lat: 28.7005, lon: -13.633 },
  { slug: "tizayuca", name: "Tizayuca", lat: 28.99, lon: -13.611 },
  { slug: "yaiza", name: "Yaiza", lat: 28.817, lon: -13.633 },
];

/**
 * El municipio de Tinajo se guardaba con el slug "tinaj", que no existe. Se
 * renombra en el sitio en vez de borrarlo y recrearlo: si llegara a tener
 * noticias, el identificador de la fila es el mismo y no se rompe ninguna
 * referencia.
 *
 * Va ANTES de crear los municipios nuevos. El nombre es único, asi que si se
 * hiciera despues, el intento de crear "Tinajo" fallaria porque la fila vieja
 * ya ocupa ese nombre.
 */
const RENOMBRES = [{ de: "tinaj", a: "tinajo", nombre: "Tinajo" }];

/**
 * Municipios que estaban en la base de datos y ya no son municipios de
 * Lanzarote:
 *
 *   betancuria -> es de Fuerteventura
 *   femes      -> tambien es de Fuerteventura (Pajara)
 *   san-bartolome -> es un pueblo de Haria. Sigue existiendo, pero como zona.
 *
 * No se borran a la fuerza: si alguno llegara a tener noticias, se avisa y se
 * deja. Perder noticias porque se ha corregido un topónimo seria peor que
 * dejar un dato viejo a la vista.
 */
const OBSOLETOS = ["betancuria", "femes", "san-bartolome"];

async function main() {
  console.log("Cargando municipios de Lanzarote...");

  // --- 1. Corregir los slugs que estaban mal ---
  for (const { de, a, nombre } of RENOMBRES) {
    const viejo = await prisma.municipality.findUnique({
      where: { slug: de },
      select: { id: true, _count: { select: { accidents: true } } },
    });
    if (!viejo) continue;

    const destino = await prisma.municipality.findUnique({ where: { slug: a }, select: { id: true } });
    if (destino) {
      // Ya existe la fila correcta. Solo se puede tirar la vieja si no tiene nada.
      if (viejo._count.accidents > 0) {
        console.log(`  ! ${nombre} ya existe con el slug correcto y hay noticias en la fila antigua.`);
        console.log("    Revisa a mano: no se borra nada.");
        continue;
      }
      await prisma.municipality.delete({ where: { slug: de } });
      console.log(`  - ${nombre} (slug antiguo "${de}") eliminado: ya habia "${a}"`);
      continue;
    }

    await prisma.municipality.update({ where: { slug: de }, data: { slug: a, name: nombre } });
    console.log(`  ~ ${nombre}: slug "${de}" -> "${a}"${viejo._count.accidents > 0 ? ` (${viejo._count.accidents} noticia/s conservadas)` : ""}`);
  }

  // --- 2. Retirar los municipios que no son de Lanzarote ---
  for (const slug of OBSOLETOS) {
    const viejo = await prisma.municipality.findUnique({
      where: { slug },
      select: { id: true, name: true, _count: { select: { accidents: true } } },
    });
    if (!viejo) continue;

    if (viejo._count.accidents > 0) {
      console.log(
        `  ! ${viejo.name} no es un municipio de Lanzarote y tiene ${viejo._count.accidents} noticia(s).`,
      );
      console.log("    No se borra: reasigna esas noticias antes de retirarlo.");
      continue;
    }

    await prisma.municipality.delete({ where: { slug } });
    console.log(`  - ${viejo.name} retirado (no es municipio de Lanzarote)`);
  }

  // --- 3. Crear o actualizar los siete municipios ---
  let created = 0;
  let updated = 0;

  for (const m of MUNICIPALITIES) {
    const existing = await prisma.municipality.findUnique({
      where: { slug: m.slug },
      select: { id: true, lat: true, lon: true, name: true },
    });

    if (!existing) {
      await prisma.municipality.create({ data: m });
      created++;
      console.log(`  + ${m.name}`);
      continue;
    }

    // Solo se escribe si algo cambio de verdad. Comparar por comision haria
    // una escritura en cada arranque y actualiza updatedAt sin motivo.
    const moved = Math.abs(existing.lat - m.lat) > 0.0001 || Math.abs(existing.lon - m.lon) > 0.0001;
    const renamed = existing.name !== m.name;

    if (moved || renamed) {
      await prisma.municipality.update({ where: { slug: m.slug }, data: m });
      updated++;
      console.log(`  ~ ${m.name} (actualizado)`);
    }
  }

  console.log(`\n  ${created} municipio(s) creados, ${updated} actualizados.`);

  const total = await prisma.municipality.count();
  console.log(`  Total en la base de datos: ${total}`);

  const news = await prisma.accident.count();
  if (news === 0) {
    console.log("\n  La tabla de noticias esta vacia, y es lo correcto.");
    console.log("  Ejecuta `npm run monitor:once` para detectar noticias reales.");
  } else {
    console.log(`\n  Hay ${news} noticia(s) en la base de datos.`);
  }
}

main()
  .catch((err) => {
    console.error("Error al cargar los datos iniciales:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
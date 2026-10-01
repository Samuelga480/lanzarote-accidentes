/**
 * Datos iniciales de la base de datos.
 *
 * ES JavaScript plano a proposito. La version anterior estaba en TypeScript y
 * necesitaba `tsx`, que es una devDependency: en el contenedor de produccion,
 * que se instala con `npm ci --omit=dev`, `prisma db seed` habria fallado con
 * "tsx: not found". Este fichero se ejecuta con el `node` de siempre.
 *
 * Solo carga lo que el sistema necesita para arrancar: los nueve municipios de
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
 * Los nueve municipios con las coordenadas de su casco urbano.
 *
 * FUENTE DE VERDAD: src/lib/constants.ts (array MUNICIPALITIES). Si se cambia
 * aqui, hay que cambiarlo alla. Se repiten a mano para que este fichero no
 * dependa del compilador de TypeScript ni de los alias de importacion, que es
 * lo que permite ejecutarlo dentro del contenedor de produccion.
 */
const MUNICIPALITIES = [
  { slug: "arrecife", name: "Arrecife", lat: 28.4843, lon: -13.7845 },
  { slug: "teguise", name: "Teguise", lat: 28.56, lon: -13.65 },
  { slug: "tias", name: "Tías", lat: 28.7005, lon: -13.633 },
  { slug: "tinaj", name: "Tinajo", lat: 28.6833, lon: -13.6833 },
  { slug: "yaiza", name: "Yaiza", lat: 28.817, lon: -13.633 },
  { slug: "haria", name: "Haría", lat: 29.115, lon: -13.435 },
  { slug: "san-bartolome", name: "San Bartolomé de Lanzarote", lat: 29.0333, lon: -13.5833 },
  { slug: "betancuria", name: "Betancuria", lat: 29.1, lon: -13.5333 },
  { slug: "femes", name: "Femés", lat: 29.0833, lon: -13.55 },
];

async function main() {
  console.log("Cargando municipios de Lanzarote...");

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
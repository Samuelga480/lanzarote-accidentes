/**
 * Datos iniciales de la base de datos.
 *
 * Solo carga lo que el sistema necesita para arrancar: los nueve municipios de
 * Lanzarote. Las coordenadas son del casco urbano y se usan como punto de
 * referencia del mapa, nunca como ubicacion exacta de un accidente.
 *
 * NO se insertan noticias de ejemplo. El version anterior metia doce accidentes
 * inventados, con fechas y horas concretas, como si fueran reales. En un medio
 * de successively esa es la peor forma de sembrar la base de datos: cuando el
 * sistema empiece a detectar noticias de verdad, se mezclaran con ficticias sin
 * forma de distinguirlas.
 *
 * Para probar la interfaz, ejecuta `npm run monitor:once`: las noticias entran
 * por el ciclo real de deteccion y quedan a la espera de revision, que es
 * exactamente lo que tiene que pasar.
 *
 *   npm run db:seed
 */

import { PrismaClient } from "@prisma/client";
import { MUNICIPALITIES } from "../src/lib/constants";

const prisma = new PrismaClient();

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
      await prisma.municipality.create({
        data: { slug: m.slug, name: m.name, lat: m.lat, lon: m.lon },
      });
      created++;
      console.log(`  + ${m.name}`);
    } else {
      // Solo se actualiza si las coordenadas han cambiado de verdad: detectar
      // el cambio por comision haria una escritura en cada arranque.
      const moved =
        Math.abs(existing.lat - m.lat) > 0.0001 || Math.abs(existing.lon - m.lon) > 0.0001;
      const renamed = existing.name !== m.name;

      if (moved || renamed) {
        await prisma.municipality.update({
          where: { slug: m.slug },
          data: { name: m.name, lat: m.lat, lon: m.lon },
        });
        updated++;
        console.log(`  ~ ${m.name} (actualizado)`);
      }
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

/**
 * Crea una noticia de prueba en PENDING_REVIEW para poder probar el panel a
 * mano contra una base de datos de desarrollo. NO se ejecuta en produccion.
 *
 *   npx tsx scripts/noticia-de-prueba.ts
 */

import { prisma } from "@/lib/prisma";

async function main() {
  const creada = await prisma.accident.create({
    data: {
      slug: `noticia-de-prueba-${Date.now()}`,
      title: "Prueba de boton Aprobar en el panel",
      summary:
        "Resumen de prueba para comprobar que los botones del panel funcionan de verdad contra la base de datos.",
      body:
        "Cuerpo de la noticia de prueba. Tiene que tener al menos cincuenta caracteres para que el formulario de edicion lo acepte sin quejarse.",
      occurredAt: new Date(),
      municipality: { connect: { slug: "arrecife" } },
      vehicleType: "COCHE",
      severity: "LEVE",
      category: "ACCIDENTE_TRAFICO",
      status: "PENDING_REVIEW",
      origin: "AI",
      sources: {
        create: [{ outlet: "Prueba", url: "https://example.org/prueba", publishedAt: new Date() }],
      },
    },
    select: { id: true, slug: true, status: true },
  });

  console.log(creada);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
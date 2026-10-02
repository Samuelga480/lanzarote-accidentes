/**
 * Estado real de la base de datos: cuantas noticias hay y cuales son.
 *
 *   npx tsx scripts/db-noticias.ts
 *
 * Se ejecuta con la DATABASE_URL de .env.production puesta a mano, porque el
 * .env del proyecto apunta al postgres local, que no esta arrancado.
 */

import { prisma } from "@/lib/prisma";

async function main() {
  const total = await prisma.accident.count();
  console.log(`\n  TOTAL de noticias: ${total}`);

  const todas = await prisma.accident.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      origin: true,
      zone: true,
      occurredAt: true,
      createdAt: true,
      municipality: { select: { name: true } },
      sources: { select: { outlet: true } },
    },
  });

  for (const a of todas) {
    console.log("  ---");
    console.log(`    titulo   : ${a.title}`);
    console.log(`    slug     : ${a.slug}`);
    console.log(`    estado   : ${a.status} | origen: ${a.origin} | zona: ${a.zone ?? "-"}`);
    console.log(`    municipio: ${a.municipality?.name ?? "-"}`);
    console.log(`    suceso   : ${a.occurredAt.toISOString()}`);
    console.log(`    creado   : ${a.createdAt.toISOString()}`);
    console.log(`    fuentes  : ${a.sources.map((s) => s.outlet).join(", ") || "-"}`);
  }

  const [runs, seen, feeds] = await Promise.all([
    prisma.scrapeRun.count(),
    prisma.seenEntry.count(),
    prisma.feedSource.findMany({ orderBy: { name: "asc" } }),
  ]);

  console.log(`\n  pasadas de scraping: ${runs}`);
  console.log(`  URLs ya vistas    : ${seen}`);
  console.log(`\n  fuentes de noticias:`);
  for (const f of feeds) {
    console.log(`    ${f.enabled ? "activa " : "inactiva"} | ${f.name.padEnd(38)} | ${f.url}`);
  }
  if (feeds.length === 0) console.log("    (ninguna)");

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error("Error:", String(e).split("\n")[0]);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
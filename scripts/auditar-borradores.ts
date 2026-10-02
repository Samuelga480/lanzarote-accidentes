/**
 * Por que los borradores guardados tienen el titular del medio y no el del
 * redactor. Lee el rastro de reescritura que deja el pipeline.
 *
 *   npx tsx scripts/auditar-borradores.ts
 */

import { prisma } from "@/lib/prisma";

async function main() {
  const lista = await prisma.accident.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      title: true,
      originalTitle: true,
      aiModel: true,
      rewrittenAt: true,
      reviewNotes: true,
      severity: true,
      category: true,
      verificationStatus: true,
      verificationNotes: true,
      summary: true,
      body: true,
      status: true,
    },
  });

  console.log(`\n  Borradores: ${lista.length}\n`);

  for (const a of lista) {
    console.log("=".repeat(72));
    console.log(`  GUARDADO : ${a.title}`);
    console.log(`  ORIGINAL : ${a.originalTitle ?? "(null)"}`);
    console.log(`  IA       : ${a.aiModel ?? "(null)"}`);
    console.log(`  reescrito: ${a.rewrittenAt ? a.rewrittenAt.toISOString() : "(nunca)"}`);
    console.log(`  estado   : ${a.status} | verificacion: ${a.verificationStatus}`);
    console.log(`  notas    : ${a.reviewNotes ?? "(null)"}`);
    console.log(`  verif.   : ${(a.verificationNotes ?? "").slice(0, 200)}`);
    console.log(`  resumen  : ${(a.summary ?? "").slice(0, 160)}`);
    console.log(`  cuerpo   : ${(a.body ?? "").slice(0, 260).replace(/\n+/g, " | ")}`);
  }

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error("Error:", String(e).split("\n")[0]);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
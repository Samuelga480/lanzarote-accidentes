import { prisma } from "@/lib/prisma";

const ID = process.argv[2] ?? "";

async function main() {
  const a = await prisma.accident.findUnique({
    where: { id: ID },
    select: {
      status: true,
      publishedAt: true,
      reviewedAt: true,
      reviewedBy: true,
      revisions: { orderBy: { createdAt: "desc" }, take: 6, select: { editor: true, note: true, createdAt: true } },
    },
  });
  console.log("estado      :", a?.status);
  console.log("publishedAt :", a?.publishedAt?.toISOString() ?? "null");
  console.log("reviewedBy  :", a?.reviewedBy);
  console.log("revisiones  :");
  for (const r of a?.revisions ?? []) {
    console.log("   ", new Date(r.createdAt).toISOString(), (r.editor ?? "").padEnd(8), r.note ?? "");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FALLO", e.message);
  process.exit(1);
});
import { prisma } from "@/lib/prisma";
import { changeStatus } from "@/lib/admin";

const ID = "cmuqu8wb90000me7kpzj93y7s";

async function estado() {
  const a = await prisma.accident.findUnique({
    where: { id: ID },
    select: { status: true, publishedAt: true, reviewedAt: true, reviewedBy: true },
  });
  if (!a) return "NO EXISTE";
  return [
    a.status.padEnd(14),
    "publishedAt=" + (a.publishedAt ? a.publishedAt.toISOString() : "null"),
    "reviewedBy=" + String(a.reviewedBy),
  ].join("  ");
}

async function main() {
  console.log("inicial   ", await estado());

  await changeStatus(ID, "PUBLISHED", "editor", "prueba: aprobar");
  console.log("aprobada  ", await estado());

  const primera = (await prisma.accident.findUnique({ where: { id: ID }, select: { publishedAt: true } }))?.publishedAt;

  await changeStatus(ID, "PUBLISHED", "editor", "prueba: reaprobar");
  const segunda = (await prisma.accident.findUnique({ where: { id: ID }, select: { publishedAt: true } }))?.publishedAt;
  console.log("reaprobada", await estado());
  console.log("  fecha de publicacion intacta al reaprobar:", primera?.getTime() === segunda?.getTime());

  await changeStatus(ID, "REJECTED", "editor", "prueba: rechazar");
  console.log("rechazada ", await estado());

  await changeStatus(ID, "PUBLISHED", "editor", "prueba: reaprobar");
  console.log("aprobada2 ", await estado());

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FALLO", e.message);
  process.exit(1);
});
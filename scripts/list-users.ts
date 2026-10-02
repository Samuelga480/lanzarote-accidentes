import { prisma } from "@/lib/prisma";

/**
 * Lista las cuentas de usuario del sitio.
 *
 * Solo imprime datos de identificacion. Los hash de contrasena no se sacan de
 * la base de datos para nada.
 */
async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      email: true,
      name: true,
      role: true,
      createdAt: true,
      _count: { select: { comments: true } },
    },
  });

  if (users.length === 0) {
    console.log("No hay ninguna cuenta de usuario dada de alta.");
    return;
  }

  console.log(`${users.length} cuenta(s):\n`);
  for (const u of users) {
    console.log(`  ${u.email}`);
    console.log(`    rol: ${u.role === "ADMIN" ? "administrador" : "invitado"}`);
    if (u.name) console.log(`    nombre: ${u.name}`);
    console.log(`    alta: ${u.createdAt.toISOString().slice(0, 10)}`);
    console.log(`    comentarios: ${u._count.comments}`);
    console.log("");
  }

  const admins = users.filter((u) => u.role === "ADMIN").length;
  console.log(`  administradores: ${admins} | invitados: ${users.length - admins}`);
}

main()
  .catch((e) => {
    console.error("Error:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
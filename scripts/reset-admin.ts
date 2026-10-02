import { prisma } from "@/lib/prisma";

/**
 * Deja el sitio con una unica cuenta de administrador y la que se le pase.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx scripts/reset-admin.ts
 *
 * Es destructivo a proposito: borra todas las cuentas que haya ahora, incluidos
 * sus comentarios, y deja una sola con el correo indicado. La contrasena se
 * guarda hasheada con scrypt, nunca en claro.
 *
 * Los comentarios se borran porque son de la cuenta que se elimina y no tienen
 * autor al que atribuirse. Las noticias no se tocan.
 */
async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!email || !password) {
    console.log("Faltan ADMIN_EMAIL o ADMIN_PASSWORD en el entorno. No se hace nada.");
    return;
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.log(`El correo "${email}" no tiene un formato valido.`);
    return;
  }

  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    console.log("La contraseña debe tener al menos 8 caracteres, con letras y numeros.");
    return;
  }

  const { hashPassword } = await import("@/lib/user-auth");

  const existentes = await prisma.user.findMany({
    select: { id: true, email: true, role: true, _count: { select: { comments: true } } },
  });

  console.log(`Cuentas actuales: ${existentes.length}`);
  for (const u of existentes) {
    console.log(`  ${u.email} (${u.role}, ${u._count.comments} comentarios)`);
  }

  const conservan = existentes.filter((u) => u.email === email);
  const seBorra = existentes.filter((u) => u.email !== email);

  for (const u of seBorra) {
    // Los comentarios se van en cascada: la foreign key es ON DELETE CASCADE.
    await prisma.user.delete({ where: { id: u.id } });
    console.log(`  borrada: ${u.email}`);
  }

  const hash = hashPassword(password);

  for (const u of conservan) {
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: hash, role: "ADMIN" },
    });
    console.log(`  actualizada: ${u.email} -> ADMIN`);
  }

  if (conservan.length === 0) {
    await prisma.user.create({ data: { email, passwordHash: hash, role: "ADMIN" } });
    console.log(`  creada: ${email} -> ADMIN`);
  }

  const quedan = await prisma.user.findMany({ select: { email: true, role: true } });
  console.log(`\nQuedan ${quedan.length} cuenta(s):`);
  for (const u of quedan) console.log(`  ${u.email} (${u.role})`);
}

main()
  .catch((e) => {
    console.error("Error:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
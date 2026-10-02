import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/user-auth";

/**
 * Da de alta la cuenta de administrador del sitio.
 *
 * El sitio original lo hacia a mano, en el fichero de servidor, con la
 * contrasena escrita en claro:
 *
 *   'samuelgarciagadanha4@gmail.com': { password: 'Estapaginaesmia', role: 'admin' }
 *
 * Eso no se recupera. Aqui se crea la misma cuenta con la contrasena hasheada
 * con scrypt, y el rol ADMIN.
 *
 * El script es idempotente: si la cuenta ya existe, solo actualiza el hash si
 * se le pasa una contrasena nueva por consola. Sin eso no toca nada.
 *
 * Uso:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx scripts/create-admin.ts
 */
async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!email || !password) {
    console.log("Faltan ADMIN_EMAIL o ADMIN_PASSWORD en el entorno.");
    console.log("No se hace nada. El resto de ADMIN_PASSWORD del .env sigue sirviendo");
    console.log("para entrar al panel: se puede trabajar sin esta cuenta.");
    return;
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.log(`El correo "${email}" no tiene un formato valido.`);
    return;
  }

  if (password.length < 8) {
    console.log("La contraseña debe tener al menos 8 caracteres.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash: hashPassword(password), role: "ADMIN" },
    });
    console.log(`Cuenta actualizada: ${email} (ADMIN)`);
    return;
  }

  await prisma.user.create({
    data: { email, passwordHash: hashPassword(password), role: "ADMIN" },
  });
  console.log(`Cuenta creada: ${email} (ADMIN)`);
}

main()
  .catch((e) => {
    console.error("Error:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
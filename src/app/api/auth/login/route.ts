import { NextResponse } from "next/server";
import { randomBytes, scryptSync } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, setUserSession, verifyPassword } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

/**
 * Hash de relleno.
 *
 * Se genera al cargar el modulo y solo sirve para gastar el mismo tiempo que
 * una comprobacion real. Sin esto, una peticion con correo inexistente
 * responderia mucho mas rapido que una con correo real, y el tiempo de respuesta
 * acabaria diciendo que correos estan registrados.
 */
const HASH_FALLBACK = (() => {
  const salt = randomBytes(16);
  const hash = scryptSync("relleno-para-igualar-tiempos", salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
})();

/**
 * Inicio de sesion.
 *
 * El mensaje de error es el mismo tanto si el correo no existe como si la
 * contrasena no cuadra: distinguirlo permitiria enumerar las cuentas dadas de
 * alta en el sitio.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Peticion invalida." }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as Record<string, string>;

  const emailNorm = normalizeEmail(email ?? "");
  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: { id: true, passwordHash: true, role: true, emailVerifiedAt: true },
  });

  if (!user) {
    // Se verifica igualmente, con el hash de relleno, para no delatar por
    // tiempo de respuesta que el correo no esta dado de alta.
    verifyPassword(password ?? "", HASH_FALLBACK);
    return NextResponse.json({ error: "Correo o contrasena incorrectos." }, { status: 401 });
  }

  if (!verifyPassword(password ?? "", user.passwordHash)) {
    return NextResponse.json({ error: "Correo o contrasena incorrectos." }, { status: 401 });
  }

  /*
    Cuenta sin confirmar el correo: la contrasena es correcta pero todavia no
    ha pulsado el enlace de confirmacion. Se responde con 403 y un codigo
    propio para que la pantalla de acceso ofrezca reenviar el correo en vez de
    un error generico, que no le diria que hacer.
  */
  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      {
        error: "Confirma tu correo antes de entrar. Te lo enviamos al darte de alta.",
        codigo: "correo-sin-confirmar",
      },
      { status: 403 },
    );
  }

  await setUserSession(user.id);
  return NextResponse.json({ ok: true, role: user.role });
}
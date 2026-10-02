import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  isValidEmail,
  normalizeEmail,
  setUserSession,
  validatePassword,
} from "@/lib/user-auth";

export const dynamic = "force-dynamic";

/**
 * Alta de cuenta de invitado.
 *
 * Equivale al `register.html` del sitio original, con las dos diferencias que
 * importan: la contrasena se guarda hasheada y no se devuelve ningun token en
 * la respuesta (la sesion va en cookie httpOnly, que el JavaScript del navegador
 * no puede leer).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Peticion invalida." }, { status: 400 });
  }

  const { email, password, confirmPassword } = (body ?? {}) as Record<string, string>;

  const emailNorm = normalizeEmail(email ?? "");
  if (!isValidEmail(emailNorm)) {
    return NextResponse.json({ error: "El correo no parece valido." }, { status: 400 });
  }

  const pwd = password ?? "";
  const check = validatePassword(pwd);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  if ((confirmPassword ?? "") !== pwd) {
    return NextResponse.json({ error: "Las contrasenas no coinciden." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: emailNorm }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "Este correo ya esta registrado." }, { status: 400 });
  }

  const user = await prisma.user.create({
    data: {
      email: emailNorm,
      passwordHash: hashPassword(pwd),
      role: "INVITADO",
    },
    select: { id: true },
  });

  await setUserSession(user.id);

  return NextResponse.json({ ok: true, role: "INVITADO" }, { status: 201 });
}
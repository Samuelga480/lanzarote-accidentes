import { NextResponse } from "next/server";
import { reenviarConfirmacion } from "@/lib/email-verificacion";
import { normalizeEmail } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

/**
 * Vuelve a mandar el correo de confirmacion.
 *
 * Se llama desde la pantalla de acceso, cuando alguien dice que no le ha
 * llegado el correo. Hay un intervalo minimo entre envios porque esta ruta es
 * la via para usar tu SMTP contra quien quieras.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Peticion invalida." }, { status: 400 });
  }

  const { email } = (body ?? {}) as Record<string, string>;
  const emailNorm = normalizeEmail(email ?? "");

  if (!emailNorm) {
    return NextResponse.json({ error: "Escribe el correo con el que te diste de alta." }, { status: 400 });
  }

  const resultado = await reenviarConfirmacion(emailNorm);

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
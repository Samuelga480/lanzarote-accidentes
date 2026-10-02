import { NextResponse } from "next/server";
import { clearUserSession } from "@/lib/user-auth";
import { clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Cierre de sesion.
 *
 * Borra las dos cookies: la de usuario (/entrar) y la del panel. Cerrar solo una
 * dejaria al usuario con una sesion viva y con la sensacion de haber salido.
 */
export async function POST() {
  await clearUserSession();
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
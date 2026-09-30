import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "lz_admin_session";
const MAX_AGE = 60 * 60 * 8; // 8 horas

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET no configurado o demasiado corto. Copia .env.example a .env y define un valor aleatorio de 64 caracteres.",
    );
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Comprueba la contrasena del panel. Comparacion en tiempo constante. */
export function verifyPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error("ADMIN_PASSWORD no configurado.");
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Genera el valor de la cookie de sesion. */
export function createSessionToken(): string {
  const payload = `admin:${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export async function setSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Indica si la peticion actual tiene una sesion de administrador valida. */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return false;

  const idx = token.lastIndexOf(".");
  if (idx < 0) return false;

  const payload = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

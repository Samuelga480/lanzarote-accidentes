import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Autenticacion de usuarios del sitio (invitados y administradores).
 *
 * El sitio original guardaba las contrasenas en claro y devolvia un token fijo
 * escrito dentro del propio servidor. Eso no se recupera: aqui la contrasena
 * se guarda como hash scrypt con sal aleatoria y la sesion es una cookie
 * firmada que solo contiene el identificador del usuario.
 */

const COOKIE_NAME = "lz_user_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

/** Longitud de la clave scrypt en bytes. */
const KEY_LEN = 64;

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET no configurado o demasiado corto. Se usa la misma clave que firma las sesiones de administrador.",
    );
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/* ==========================================================================
 *  Contrasenas
 * ======================================================================== */

/**
 * Devuelve "scrypt$<sal hex>$<hash hex>".
 *
 * La sal se genera con randomBytes, no con Math.random: sin ella dos usuarios
 * con la misma contrasena tendrian el mismo hash y un filtrado de la tabla lo
 * delataria de golpe.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Comparacion en tiempo constante contra el hash guardado. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (expected.length !== KEY_LEN) return false;

  const actual = scryptSync(password, salt, KEY_LEN);
  return timingSafeEqual(actual, expected);
}

/* ==========================================================================
 *  Validacion de entrada
 * ======================================================================== */

/** Normaliza un correo: minusculas y sin espacios alrededor. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Comprueba el formato del correo. No reemplaza al envio de verificacion: solo
 * evita guardar basura.
 */
export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254;
}

/**
 * Valida una contrasena de alta.
 *
 * El sitio original no exigia nada. Con cuentas de invitado que comentan en
 * nombre propio, una contrasena de cuatro caracteres deja el sitio abierto, asi
 * que se exige un minimo razonable.
 */
export function validatePassword(password: string): { ok: boolean; error?: string } {
  if (password.length < 8) return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  if (password.length > 200) return { ok: false, error: "La contraseña es demasiado larga." };
  if (!/[a-zA-Z]/.test(password)) return { ok: false, error: "La contraseña debe incluir al menos una letra." };
  if (!/[0-9]/.test(password)) return { ok: false, error: "La contraseña debe incluir al menos un número." };
  return { ok: true };
}

/* ==========================================================================
 *  Sesion
 * ======================================================================== */

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "INVITADO";
  photoUrl: string | null;
};

/** Crea el valor de la cookie para un usuario concreto. */
function createToken(userId: string): string {
  const payload = `u:${userId}:${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** Comprueba la firma de un token y devuelve el id del usuario, o null. */
function readToken(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;

  const payload = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  // El formato es "u:<id>:<marcador>". Se parsea sin.split para no crear un
  // array con el resto del payload.
  if (!payload.startsWith("u:")) return null;
  const rest = payload.slice(2);
  const sep = rest.lastIndexOf(":");
  if (sep < 0) return null;
  return rest.slice(0, sep);
}

export async function setUserSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearUserSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Usuario de la sesion actual, o null.
 *
 * Consulta la base de datos en vez de fiarse del identificador de la cookie:
 * si la cuenta se borra, la cookie deja de valer en la misma peticion.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const userId = readToken(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, photoUrl: true },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "ADMIN" | "INVITADO",
    photoUrl: user.photoUrl,
  };
}
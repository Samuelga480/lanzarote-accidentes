import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getSessionUser } from "@/lib/user-auth";

/**
 * Guardia de las Server Actions del panel.
 *
 * Se aceptan dos formas de entrar, porque las dos existen:
 *
 *   1. La cuenta de usuario con rol ADMIN, iniciada en /entrar. Es la via
 *      normal y la que usa el sitio original.
 *   2. La cookie del panel, que se abre con la variable ADMIN_PASSWORD. Se
 *      mantiene como acceso de emergencia: si se perdiera la cuenta de
 *      administrador, seguiría habiendo forma de entrar.
 *
 * Existe para que no se repita la comprobacion en cada accion. Lanzar una
 * excepcion en vez de devolver `false` es intencionado: si una accion se
 * olvida de comprobar, es preferible que falle ruidosamente a que escriba sin
 * autorizacion.
 */
export async function requireAuth(): Promise<string> {
  const user = await getSessionUser();
  if (user?.role === "ADMIN") return user.email;

  if (await isAuthenticated()) return "editor";

  redirect("/entrar");
}

/** Igual que requireAuth, pero devuelve null en vez de redirigir. */
export async function getSession(): Promise<{ id: string } | null> {
  const user = await getSessionUser();
  if (user?.role === "ADMIN") return { id: user.email };

  if (await isAuthenticated()) return { id: "editor" };
  return null;
}

/**
 * Indica si la peticion actual puede entrar al panel. Lo usan las Server
 * Actions para responder con 401 en vez de redirigir, que en un fetch se queda
 * colgado.
 */
export async function canAuthenticate(): Promise<boolean> {
  const user = await getSessionUser();
  if (user?.role === "ADMIN") return true;
  return isAuthenticated();
}
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

/**
 * Guardia de las Server Actions del panel.
 *
 * Existe para que no se repita `isAuthenticated()` en cada accion. La accion
 * receives, comprueba y devuelve el identificador del editor para poder
 * auditar quien ha hecho el cambio.
 *
 * Lanzar una excepcion en vez de devolver `false` es intencionado: si una
 * accion se olvida de comprobar, es preferible que falle ruidosamente a que
 * escriba sin autorizacion.
 */
export async function requireAuth(): Promise<string> {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  // La sesion actual es de un unico editor. Cuando haya varios, este es el
  // punto donde se devolveria el identificador real del usuario.
  return "editor";
}

/** Igual que requireAuth, pero devuelve null en vez de redirigir. */
export async function getSession(): Promise<{ id: string } | null> {
  if (!(await isAuthenticated())) return null;
  return { id: "editor" };
}
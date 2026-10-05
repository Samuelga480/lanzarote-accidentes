/**
 * Cierre de sesion, como Server Actions.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTA EN UN ARCHIVO PROPIO
 * ---------------------------------------------------------------------------
 *
 * El boton de "Cerrar sesion" vive en dos sitios: en el desplegable de la cabecera
 * (que lo ve todo el mundo) y en la cabecera del panel. Antes los dos apuntaban a
 * `POST /api/auth/logout` con un `<form>`, que es una peticion del navegador a un
 * endpoint propio. Con Server Action el navegador no pide nada: el formulario
 * invoca directamente a estas funciones en el servidor.
 *
 * Las dos borran las cookies httpOnly: la de usuario (`/entrar`) y la del panel.
 * Cerrar solo una dejaria al usuario con una sesion viva y con la sensacion de
 * haber salido.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE HAY UN REDIRECT Y NO UN "OK"
 * ---------------------------------------------------------------------------
 *
 * La cabecera se dibuja en el servidor leyendo la cookie. Con `redirect()` el
 * servidor manda al navegador a otra pagina y la cabecera se vuelve a pintar con
 * la sesion ya cerrada. Con la respuesta "todo bien" de un fetch, en cambio,
 * habia que recargar a mano porque el arbol de clientes conservaba la version
 * antigua de la cabecera.
 */

"use server";

import { redirect } from "next/navigation";
import { clearUserSession } from "@/lib/user-auth";
import { clearSessionCookie } from "@/lib/auth";

/** Cierre de sesion desde el desplegable de la cabecera. Vuelve a portada. */
export async function cerrarSesionAction(): Promise<void> {
  await clearUserSession();
  await clearSessionCookie();
  redirect("/");
}

/**
 * Cierre de sesion desde la cabecera del panel.
 *
 * Vuelve a `/admin`, que es la pagina que muestra el formulario de acceso cuando
 * no hay sesion. Es la misma pagina y no `/admin/login`, para no dejar una URL que
 * no existe en ninguna parte del panel.
 */
export async function cerrarSesionAdminAction(): Promise<void> {
  await clearUserSession();
  await clearSessionCookie();
  redirect("/admin");
}
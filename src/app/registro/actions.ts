/**
 * Alta de cuenta de invitado, como Server Action.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE NO ES UN ENDPOINT
 * ---------------------------------------------------------------------------
 *
 * Antes era `POST /api/auth/register`, con el formulario haciendo un `fetch` con
 * JSON. Con Server Actions el `<form action={...}>` llama a esta funcion en el
 * servidor y no hay ninguna peticion del navegador a una API propia.
 *
 * Equivale al `register.html` del sitio original, con las diferencias que importan:
 * la contrasena se guarda hasheada y nunca se devuelve ningun token (la sesion va
 * en cookie httpOnly, que el JavaScript del navegador no puede leer).
 */

"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  isValidEmail,
  normalizeEmail,
  setUserSession,
  validatePassword,
} from "@/lib/user-auth";
import { dominioAceptaCorreo, prepararYConfirmar } from "@/lib/email-verificacion";
import { emailVerifyConfig } from "@/lib/env";
import type { RegisterState } from "./state";

/**
 * Alta de cuenta de invitado.
 *
 * Antes de crear la cuenta se comprueba que el dominio del correo acepte correo.
 * Es la unica comprobacion que se puede hacer en el momento sin falsos negativos:
 * no demuestra que la bandeja exista, pero detecta el dominio mal escrito, que es
 * el error de lejos mas frecuente.
 */
export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";

  const emailNorm = normalizeEmail(email);

  const fallo = (error: string): RegisterState => ({ error, email });

  if (!isValidEmail(emailNorm)) return fallo("El correo no parece valido.");

  const check = validatePassword(password);
  if (!check.ok) return fallo(check.error ?? "La contrasena no cumple las condiciones.");

  if (confirmPassword !== password) return fallo("Las contrasenas no coinciden.");

  // Antes de tocar la base de datos: si el dominio no recibe correo, no hay cuenta
  // que crear.
  if (emailVerifyConfig.comprobarDominio()) {
    const dominio = await dominioAceptaCorreo(emailNorm);
    if (!dominio.ok) return fallo(dominio.motivo ?? "Ese correo no se encuentra.");
  }

  const existing = await prisma.user.findUnique({ where: { email: emailNorm }, select: { id: true } });
  if (existing) return fallo("Este correo ya esta registrado.");

  const user = await prisma.user.create({
    data: { email: emailNorm, passwordHash: hashPassword(password), role: "INVITADO" },
    select: { id: true },
  });

  // Manda el correo de confirmacion y deja la cuenta verificada o pendiente.
  const { verificado } = await prepararYConfirmar(user.id, emailNorm);

  /*
    Dos finales distintos. Sin SMTP la cuenta nace verificada y hay sesion
    abierta: se va al perfil. Con SMTP hay que confirmar el correo antes de
    entrar, asi que se manda a la pantalla de acceso avisando.

    En los dos casos es un `redirect`, no una respuesta que el cliente convierta
    en navegacion: la cabecera se dibuja en el servidor leyendo la cookie, y con
    un `router.refresh()` el menu seguia enseñando "Acceder" hasta recargar a
    mano.
  */
  if (verificado) {
    await setUserSession(user.id);
    redirect("/perfil");
  }

  redirect("/entrar?confirmado=1");
}
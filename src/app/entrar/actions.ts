/**
 * Inicio de sesion y reenvio de la confirmacion, como Server Actions.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE NO ES UN ENDPOINT
 * ---------------------------------------------------------------------------
 *
 * Antes eran `POST /api/auth/login` y `POST /api/auth/reenviar`, y el formulario
 * hacia un `fetch` con JSON. Eso obliga al navegador a montar la peticion, leer
 * el JSON y decidir que pintar. Con Server Actions el `<form action={...}>` llama
 * directamente a la funcion de este fichero en el servidor: no hay ninguna
 * peticion del navegador a una API propia, y el formulario funciona igual sin
 * JavaScript.
 *
 * Los errores se devuelven como estado (`LoginState`, en `state.ts`), que es lo
 * que `useActionState` pinta en pantalla.
 *
 * ---------------------------------------------------------------------------
 *  LOS DOS FINALES DISTINTOS
 * ---------------------------------------------------------------------------
 *
 * Con sesion abierta se va al perfil. Con la cuenta creada pero el correo sin
 * confirmar se vuelve aqui con un aviso, y por eso el error de ese caso no es un
 * fallo seco: lleva el correo a mano y enciende el boton de reenviar.
 */

"use server";

import { randomBytes, scryptSync } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, setUserSession, verifyPassword } from "@/lib/user-auth";
import { reenviarConfirmacion } from "@/lib/email-verificacion";
import type { LoginState } from "./state";

/**
 * Hash de relleno.
 *
 * Se genera al cargar el modulo y solo sirve para gastar el mismo tiempo que una
 * comprobacion real. Sin esto, un correo inexistente responderia mucho mas rapido
 * que uno real, y el tiempo de respuesta acabaria diciendo que correos estan
 * registrados.
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
 * contrasena no cuadra: distinguirlos permitiria enumerar las cuentas dadas de
 * alta en el sitio.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const emailNorm = normalizeEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: { id: true, passwordHash: true, role: true, emailVerifiedAt: true },
  });

  if (!user) {
    // Se verifica igualmente, con el hash de relleno, para no delatar por tiempo
    // de respuesta que el correo no esta dado de alta.
    verifyPassword(password, HASH_FALLBACK);
    return { error: "Correo o contrasena incorrectos.", aviso: "", necesitaReenvio: false, email };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { error: "Correo o contrasena incorrectos.", aviso: "", necesitaReenvio: false, email };
  }

  /*
    Cuenta sin confirmar el correo: la contrasena es correcta pero todavia no ha
    pulsado el enlace de confirmacion. Se devuelve el estado en vez de un error
    generico, porque aqui el error si dice que hacer: ofrece reenviar el correo.
  */
  if (!user.emailVerifiedAt) {
    return {
      error: "Confirma tu correo antes de entrar. Te lo enviamos al darte de alta.",
      aviso: "",
      necesitaReenvio: true,
      email,
    };
  }

  await setUserSession(user.id);

  /*
    `redirect` no devuelve nunca: lanza una excepcion que Next convierte en una
    respuesta de redireccion. Es lo que hace que la cabecera se vuelva a pintar
    con la sesion ya abierta, sin recargar a mano.
  */
  redirect("/perfil");
}

/**
 * Vuelve a mandar el correo de confirmacion.
 *
 * El intervalo minimo entre envios lo pone `reenviarConfirmacion`: esta accion es
 * la via para usar tu SMTP contra quien quieras.
 */
export async function reenviarConfirmacionAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = normalizeEmail(formData.get("email")?.toString() ?? "");

  if (!email) {
    return {
      error: "Escribe el correo con el que te diste de alta.",
      aviso: "",
      necesitaReenvio: false,
      email: "",
    };
  }

  const resultado = await reenviarConfirmacion(email);

  if (!resultado.ok) {
    return {
      error: resultado.error,
      aviso: "",
      // El boton se queda: si lo que ha fallado es el intervalo de espera, hay
      // que poder pulsar otra vez sin reescribir el correo.
      necesitaReenvio: true,
      email,
    };
  }

  return {
    error: "",
    aviso: "Correo de confirmacion enviado. Revisa tambien la carpeta de spam.",
    necesitaReenvio: false,
    email,
  };
}
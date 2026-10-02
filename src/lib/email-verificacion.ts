/**
 * Verificacion del correo en el alta de cuenta.
 *
 * ---------------------------------------------------------------------------
 *  QUE COMPRUEBA Y QUE NO, Y POR QUE
 * ---------------------------------------------------------------------------
 *
 * Hay dos comprobaciones y conviene no mezclarlas, porque miden cosas distintas
 * y una es mucho mas fiable que la otra.
 *
 * 1. EL DOMINIO TIENE SERVIDOR DE CORREO (registros MX en DNS)
 *
 *    Esto es una verdad consultable: si `gmail.com` no publica registros MX,
 *    ese dominio no recibe correo y está escrito mal. No hay falsos negativos
 *    con un correo de verdad, asi que se puede avisar al usuario en el momento
 *    sin riesgo. Atrapa el error tipografico, que es el caso frecuente.
 *
 *    NO demuestra que la bandeja exista. Un dominio puede tener servidor de
 *    correo y no existir la persona.
 *
 * 2. QUE ALGUIEN CONTROLE LA BANDEJA (enlace de confirmacion)
 *
 *    Es lo unico que demuestra de verdad que el correo existe y que hay una
 *    persona detras. Se manda un correo con un enlace y la cuenta queda sin
 *    verificar hasta que se pulsa.
 *
 * 3. LO QUE NO SE HACE, Y POR QUE
 *
 *    Existe una tercera via que suene como lo que se pide: conectarse al
 *    servidor de correo del destinatario y preguntarle directamente si esa
 *    cuenta existe (RCPT TO). No se usa, y el motivo es concreto:
 *
 *      - Gmail, Outlook, Yahoo y casi todos los servidores de correo grandes
 *        rechazan o traquetan los sondeos. En la practica responden "error
 *        temporal" a casi todo, y el resultado es rechazar cuentas validas.
 *      - Muchos servidores tienen buzon de captura: aceptan
 *        cualquier direccion. Ahi el sondeo daria "existe" para direcciones
 *        que no existen.
 *      - Es una practica que los proveedores consideran abuso. Repetirla desde
 *        tu servidor acaba con la IP bloqueada, y entonces fallan tus correos
 *        de verdad, no solo estos.
 *
 *    La confirmacion por correo consigue lo mismo sin ninguno de esos riesgos:
 *    si la bandeja no existe, el correo rebota y el enlace nunca se pulsa.
 */

import { promises as dns } from "node:dns";
import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { notifyConfig, emailVerifyConfig } from "@/lib/env";
import { siteUrl } from "@/lib/env";
import { log, serializeError, redact } from "@/lib/logger";
import { SITE } from "@/lib/constants";

/* -------------------------------------------------------------------------- */
/*  1. El dominio recibe correo                                                 */
/* -------------------------------------------------------------------------- */

/** Resultado de mirar los registros MX de un dominio. */
export type DominioVeredicto = {
  ok: boolean;
  /** Motivo, solo si no ok. */
  motivo?: string;
};

/**
 * Indica si el dominio de un correo publica servidores de correo.
 *
 * Es la comprobacion que se puede hacer sin equivocar. Devuelve "no puede
 * comprobarse" como `ok: true`, nunca como `ok: false`: si el DNS falla, no
 * sabemos nada y no se debe rechazar una cuenta por algo que no sabemos.
 */
export async function dominioAceptaCorreo(email: string): Promise<DominioVeredicto> {
  const dominio = email.split("@")[1]?.toLowerCase().trim();
  if (!dominio) return { ok: false, motivo: "El correo no tiene dominio." };

  try {
    const registros = await withTimeout(
      dns.resolveMx(dominio),
      emailVerifyConfig.dnsTimeoutMs(),
    );
    if (registros.length > 0) return { ok: true };
    return {
      ok: false,
      motivo: `El dominio "${dominio}" no tiene servidor de correo. Revisa si está bien escrito.`,
    };
  } catch (err) {
    /*
      NXDOMAIN es una respuesta valida y significa algo: el dominio no existe.
      Cualquier otro error (timeout, DNS caido) es incertidumbre, no una
      respuesta, asi que se deja pasar.
    */
    const code = (err as { code?: string })?.code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return {
        ok: false,
        motivo: `El dominio "${dominio}" no existe. Revisa si está bien escrito.`,
      };
    }
    log.debug("No se pudo consultar el DNS del dominio", {
      dominio: redact(dominio),
      ...serializeError(err),
    });
    return { ok: true };
  }
}

/** Promise con limite de tiempo, para que un DNS lento no tumbe el registro. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/* -------------------------------------------------------------------------- */
/*  2. El token                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Crea un token de confirmacion y su hash.
 *
 * Se devuelve el token en claro para mandarlo por correo, y el hash para
 * guardarlo. Nunca se guarda el token: si alguien lee la tabla de la base de
 * datos podria fabricar un enlace de confirmacion valido para cualquier cuenta.
 */
export function nuevoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
}

/** SHA-256 en hexadecimal. El token ya es aleatorio, asi que no hace falta scrypt. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** El enlace que va dentro del correo. */
export function enlaceConfirmacion(token: string): string {
  return `${siteUrl()}/api/auth/verificar?token=${encodeURIComponent(token)}`;
}

/* -------------------------------------------------------------------------- */
/*  3. El correo                                                               */
/* -------------------------------------------------------------------------- */

export type EnvioResultado = { ok: boolean; error?: string };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Manda el correo de confirmacion.
 *
 * Devuelve el resultado en vez de lanzar: quien llama decide que hacer si no se
 * pudo enviar, y normalmente es seguirRegistrarConFallback mejor que fallar.
 */
export async function enviarConfirmacion(email: string, token: string): Promise<EnvioResultado> {
  if (!emailVerifyConfig.puedeEnviar()) {
    return { ok: false, error: "No hay SMTP configurado." };
  }

  const from = notifyConfig.email.from();
  if (!from) return { ok: false, error: "No hay remitente configurado (NOTIFY_FROM)." };

  const enlace = enlaceConfirmacion(token);
  const horas = emailVerifyConfig.validoHoras();

  const texto =
    `Bienvenido a ${SITE.name}.\n\n` +
    `Confirma esta direccion de correo para empezar a comentar:\n\n` +
    `${enlace}\n\n` +
    `El enlace vale ${horas} horas. Si no lo pulsas, la cuenta se queda sin ` +
    `verificar y no podras entrar.\n\n` +
    `Si no has pedido esta cuenta, ignora este correo: no pasa nada.\n`;

  const html =
    `<div style="font-family:system-ui,sans-serif;max-width:520px">` +
    `<h1 style="font-size:20px">Bienvenido a ${escapeHtml(SITE.name)}</h1>` +
    `<p>Confirma esta direccion de correo para empezar a comentar:</p>` +
    `<p><a href="${escapeHtml(enlace)}" ` +
    `style="display:inline-block;background:#d3232f;color:#fff;text-decoration:none;` +
    `padding:12px 22px;border-radius:6px;font-weight:600">Confirmar mi correo</a></p>` +
    `<p style="font-size:13px;color:#666">El enlace vale ${horas} horas. ` +
    `Si no has pedido esta cuenta, ignora este correo: no pasa nada.</p>` +
    `</div>`;

  try {
    const transport = nodemailer.createTransport({
      host: notifyConfig.email.host(),
      port: notifyConfig.email.port(),
      secure: notifyConfig.email.port() === 465,
      auth: notifyConfig.email.user()
        ? { user: notifyConfig.email.user(), pass: notifyConfig.email.pass() }
        : undefined,
      connectionTimeout: emailVerifyConfig.envioTimeoutMs(),
    });

    await transport.sendMail({
      from: `"${SITE.name}" <${from}>`,
      to: email,
      subject: `Confirma tu correo en ${SITE.name}`.slice(0, 150),
      text: texto,
      html,
    });

    return { ok: true };
  } catch (err) {
    log.warn("No se pudo enviar el correo de confirmacion", {
      ...serializeError(err),
    });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* -------------------------------------------------------------------------- */
/*  4. Alta y confirmacion                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Prepara el alta de una cuenta y envia el correo de confirmacion.
 *
 * Devuelve si la cuenta ha quedado verificada o pendiente. Se puede quedar
 * verificada sin haber enviado nada: si no hay SMTP, exigir la confirmacion
 * dejaria el registro inutilizable, asi que en ese caso la cuenta nace
 * verificada. /api/health dice que no hay SMTP, asi que no queda oculto.
 */
export async function prepararYConfirmar(userId: string, email: string): Promise<{ verificado: boolean }> {
  if (!emailVerifyConfig.exigeConfirmacion) {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), verificationTokenHash: null },
    });
    log.warn("Cuenta creada sin verificar porque no hay SMTP configurado", { email: redact(email) });
    return { verificado: true };
  }

  const { token, hash } = nuevoToken();
  const ahora = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: { verificationTokenHash: hash, verificationSentAt: ahora },
  });

  const envio = await enviarConfirmacion(email, token);
  if (!envio.ok) {
    // El token se queda guardado: si el envio falla por un fallo puntual del
    // SMTP, el usuario puede pedir el reenvio desde el acceso sin confirmar.
    log.warn("Cuenta creada pero el correo de confirmacion no salio", {
      email: redact(email),
      error: envio.error,
    });
  }

  return { verificado: false };
}

/**
 * Confirma una cuenta a partir del token del enlace.
 *
 * Devuelve "ok" | "invalido" | "caducado". El token se borra siempre que se
 * usa, salga bien o mal: si no, un enlace reenviado por correo podria volver a
 * servir.
 */
export async function confirmarConToken(
  token: string,
): Promise<{ resultado: "ok" | "invalido" | "caducado" }> {
  if (!token || token.length < 16 || token.length > 128) return { resultado: "invalido" };

  const hash = hashToken(token);
  const user = await prisma.user.findUnique({
    where: { verificationTokenHash: hash },
    select: { id: true, emailVerifiedAt: true, verificationSentAt: true },
  });
  if (!user) return { resultado: "invalido" };

  // Ya confirmada: se limpia el token y se responde que bien, para que volver a
  // pulsar un correo antiguo no parezca un error.
  if (user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { verificationTokenHash: null } });
    return { resultado: "ok" };
  }

  const limite = emailVerifyConfig.validoHoras() * 60 * 60 * 1000;
  const enviado = user.verificationSentAt ? user.verificationSentAt.getTime() : 0;
  if (enviado > 0 && Date.now() - enviado > limite) {
    await prisma.user.update({ where: { id: user.id }, data: { verificationTokenHash: null } });
    return { resultado: "caducado" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), verificationTokenHash: null },
  });

  log.info("Correo confirmado", { userId: user.id });
  return { resultado: "ok" };
}

/**
 * Vuelve a mandar el correo de confirmacion.
 *
 * Respeta un intervalo minimo entre envios: sin el, el reenvio es una forma
 * de usar tu SMTP para mandar correo a quien quiera, solo que un poco mas
 * despacio.
 */
export async function reenviarConfirmacion(email: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!emailVerifyConfig.puedeEnviar()) {
    return { ok: false, error: "No hay correo configurado en el servidor." };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true, verificationSentAt: true },
  });

  // Mismo texto exista o no la cuenta: responder distinto permite saber si un
  // correo esta dado de alta. Es el mismo motivo por el que el registro no
  // dice "ya registrado"... salvo que aqui se ha pedido explicitarlo.
  if (!user) return { ok: false, error: "No hay ninguna cuenta pendiente de confirmar con ese correo." };
  if (user.emailVerifiedAt) return { ok: false, error: "Ese correo ya esta confirmado." };

  const espera = emailVerifyConfig.reenvioMinutos() * 60 * 1000;
  if (user.verificationSentAt && Date.now() - user.verificationSentAt.getTime() < espera) {
    const minutos = Math.ceil((espera - (Date.now() - user.verificationSentAt.getTime())) / 60000);
    return { ok: false, error: `Espera ${minutos} minutos para pedirlo otra vez.` };
  }

  const { token, hash } = nuevoToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { verificationTokenHash: hash, verificationSentAt: new Date() },
  });

  const envio = await enviarConfirmacion(email, token);
  if (!envio.ok) return { ok: false, error: "No se ha podido enviar el correo. Intentalo mas tarde." };

  return { ok: true };
}
/**
 * Notificaciones al administrador.
 *
 * Cuando aparece una noticia nueva, el sistema avisa por todos los canales
 * configurados. Ninguno es obligatorio: si no hay ninguno, el sistema funciona
 * igual y lo dice al arrancar.
 *
 * Dos propiedades importantes:
 *
 *  1. Idempotencia. La tabla NotificationLog evita el envio multiple. Si el
 *     mismo accidente se vuelve a detectar desde otra fuente, no se reenvia.
 *  2. Aislamiento. Un canal que falla (Telegram caido) no impide que los otros
 *     se envien, ni que la noticia se cree. Los errores se registran y se
 *     muestran en el panel.
 */

import nodemailer from "nodemailer";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { notifyConfig } from "@/lib/env";
import { log, serializeError, redact } from "@/lib/logger";

export type Channel = "EMAIL" | "TELEGRAM" | "DISCORD" | "WEBHOOK";

export type NotifyPayload = {
  accidentId: string;
  title: string;
  summary: string;
  excerpt?: string | null;
  municipality: string;
  road?: string | null;
  occurredAtIso: string;
  confidenceScore: number;
  sourceScore: number;
  verificationStatus: string;
  sourceUrl: string;
  sourceOutlet: string;
  /** Panel de revision. */
  reviewUrl: string;
  imageUrl?: string | null;
};

export type DeliveryResult = {
  channel: Channel;
  target: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  error?: string;
  durationMs: number;
};

/* -------------------------------------------------------------------------- */
/*  Envio                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Envia la notificacion por todos los canales activos.
 * Nunca lanza: devuelve el resultado por canal.
 */
export async function notifyNewArticle(payload: NotifyPayload): Promise<DeliveryResult[]> {
  const results = await Promise.all([
    sendEmail(payload),
    sendTelegram(payload),
    sendDiscord(payload),
    sendWebhook(payload),
  ]);

  // Registro de lo enviado. El log permite ver, para un accidente concreto,
  // por que el administrador no recibio el aviso.
  try {
    await prisma.notificationLog.createMany({
      data: results.map((r) => ({
        accidentId: payload.accidentId,
        channel: r.channel,
        target: r.target,
        status: r.status,
        error: r.error ?? null,
        preview: `${payload.title}`.slice(0, 200),
      })),
    });
  } catch (err) {
    log.warn("No se pudo registrar la notificacion", serializeError(err));
  }

  // Marca la noticia como notificada, para no reenviar en la siguiente pasada.
  try {
    await prisma.accident.update({
      where: { id: payload.accidentId },
      data: { notifiedAt: new Date() },
    });
  } catch (err) {
    log.warn("No se pudo marcar la noticia como notificada", serializeError(err));
  }

  const sent = results.filter((r) => r.status === "SENT").length;
  log.info("Notificacion enviada", {
    accidentId: payload.accidentId,
    sent,
    failed: results.filter((r) => r.status === "FAILED").length,
  });

  return results;
}

/** Se envio alguna vez con exito una notificacion de este canal? */
export async function alreadyNotified(
  accidentId: string,
  channel: Channel,
): Promise<boolean> {
  const found = await prisma.notificationLog.findFirst({
    where: { accidentId, channel, status: "SENT" },
    select: { id: true },
  });
  return found !== null;
}

/* -------------------------------------------------------------------------- */
/*  Plantilla                                                                 */
/* -------------------------------------------------------------------------- */

function buildMessage(payload: NotifyPayload): string {
  const confidence = `${Math.round(payload.confidenceScore * 100)} %`;
  const source = `${Math.round(payload.sourceScore * 100)} %`;

  return [
    `*Nueva noticia pendiente de revision*`,
    ``,
    `*${payload.title}*`,
    ``,
    payload.summary,
    ``,
    `Municipio: ${payload.municipality}`,
    payload.road ? `Carretera: ${payload.road}` : "",
    `Suceso: ${payload.occurredAtIso}`,
    `Confianza: ${confidence} | Fuente: ${source} | Estado: ${payload.verificationStatus}`,
    ``,
    `Fuente original: ${payload.sourceOutlet}`,
    `${payload.sourceUrl}`,
    ``,
    `Revisar y aprobar: ${payload.reviewUrl}`,
    ``,
    `_Nada se publica sin tu aprobacion._`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildPlainText(payload: NotifyPayload): string {
  return [
    "Nueva noticia pendiente de revision",
    "",
    payload.title,
    "",
    payload.summary,
    "",
    `Municipio: ${payload.municipality}`,
    payload.road ? `Carretera: ${payload.road}` : "",
    `Suceso: ${payload.occurredAtIso}`,
    `Confianza: ${Math.round(payload.confidenceScore * 100)} % | Fuente: ${Math.round(payload.sourceScore * 100)} % | Estado: ${payload.verificationStatus}`,
    "",
    `Fuente original: ${payload.sourceOutlet} - ${payload.sourceUrl}`,
    `Revisar y aprobar: ${payload.reviewUrl}`,
    "",
    "Nada se publica sin tu aprobacion.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Email                                                                     */
/* -------------------------------------------------------------------------- */

async function sendEmail(payload: NotifyPayload): Promise<DeliveryResult> {
  const started = Date.now();

  if (!notifyConfig.email.enabled) {
    return { channel: "EMAIL", target: "-", status: "SKIPPED", durationMs: 0 };
  }

  const from = notifyConfig.email.from();
  const to = notifyConfig.email.to();
  if (!from || !to) {
    return { channel: "EMAIL", target: to ?? "-", status: "SKIPPED", durationMs: 0 };
  }

  try {
    const transport = nodemailer.createTransport({
      host: notifyConfig.email.host(),
      port: notifyConfig.email.port(),
      secure: notifyConfig.email.port() === 465,
      auth: {
        user: notifyConfig.email.user(),
        pass: notifyConfig.email.pass(),
      },
    });

    await transport.sendMail({
      from: `"Tráfico Lanzarote" <${from}>`,
      to,
      subject: `[Revisión] ${payload.title}`.slice(0, 150),
      text: buildPlainText(payload),
      html: renderHtml(payload),
    });

    return { channel: "EMAIL", target: to, status: "SENT", durationMs: Date.now() - started };
  } catch (err) {
    log.warn("Fallo el envio de correo", serializeError(err));
    return {
      channel: "EMAIL", target: to, status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}

/** Plantilla HTML minima y sin CSS complejo: llega bien a cualquier cliente. */
function renderHtml(payload: NotifyPayload): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Noticia pendiente</title></head>
<body style="margin:0;padding:20px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#18181b">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">
  <div style="background:#d3232f;padding:14px 20px;color:#fff;font-weight:700">Nueva noticia pendiente de revisión</div>
  <div style="padding:20px">
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escape(payload.title)}</h1>
    <p style="margin:0 0 16px;color:#52525b">${escape(payload.summary)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
      <tr><td style="padding:4px 0;color:#71717a;width:110px">Municipio</td><td>${escape(payload.municipality)}</td></tr>
      ${payload.road ? `<tr><td style="padding:4px 0;color:#71717a">Carretera</td><td>${escape(payload.road)}</td></tr>` : ""}
      <tr><td style="padding:4px 0;color:#71717a">Suceso</td><td>${escape(payload.occurredAtIso)}</td></tr>
      <tr><td style="padding:4px 0;color:#71717a">Confianza</td><td>${Math.round(payload.confidenceScore * 100)} %</td></tr>
      <tr><td style="padding:4px 0;color:#71717a">Fuente</td><td>${Math.round(payload.sourceScore * 100)} % (${escape(payload.sourceOutlet)})</td></tr>
      <tr><td style="padding:4px 0;color:#71717a">Estado</td><td>${escape(payload.verificationStatus)}</td></tr>
    </table>
    <p style="margin:0 0 16px;font-size:13px">
      <a href="${escape(payload.sourceUrl)}" style="color:#d3232f">Ver artículo original ↗</a>
    </p>
    <p style="margin:0 0 20px">
      <a href="${escape(payload.reviewUrl)}" style="display:inline-block;background:#d3232f;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600;font-size:14px">Revisar y aprobar</a>
    </p>
    <p style="margin:0;font-size:12px;color:#a1a1aa">Nada se publica sin tu aprobación.</p>
  </div>
</div>
</body></html>`;
}

/* -------------------------------------------------------------------------- */
/*  Telegram                                                                  */
/* -------------------------------------------------------------------------- */

async function sendTelegram(payload: NotifyPayload): Promise<DeliveryResult> {
  const started = Date.now();

  if (!notifyConfig.telegram.enabled) {
    return { channel: "TELEGRAM", target: "-", status: "SKIPPED", durationMs: 0 };
  }

  const token = notifyConfig.telegram.token();
  const chatId = notifyConfig.telegram.chatId();
  if (!token || !chatId) {
    return { channel: "TELEGRAM", target: "-", status: "SKIPPED", durationMs: 0 };
  }

  try {
    // Markdown en Telegram tiene sintaxis estricta: un caracter suelto rompe el
  // envio. Se envia texto plano, que siempre funciona.
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildPlainText(payload),
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Telegram ${response.status}: ${detail.slice(0, 200)}`);
    }

    return { channel: "TELEGRAM", target: chatId, status: "SENT", durationMs: Date.now() - started };
  } catch (err) {
    log.warn("Fallo el envio a Telegram", { ...serializeError(err) });
    return {
      channel: "TELEGRAM", target: chatId, status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Discord                                                                   */
/* -------------------------------------------------------------------------- */

async function sendDiscord(payload: NotifyPayload): Promise<DeliveryResult> {
  const started = Date.now();

  if (!notifyConfig.discord.enabled) {
    return { channel: "DISCORD", target: "-", status: "SKIPPED", durationMs: 0 };
  }

  const webhookUrl = notifyConfig.discord.webhookUrl();
  if (!webhookUrl) {
    return { channel: "DISCORD", target: "-", status: "SKIPPED", durationMs: 0 };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Tráfico Lanzarote",
        embeds: [
          {
            title: payload.title,
            description: payload.summary,
            url: payload.reviewUrl,
            color: 0xd3232f,
            fields: [
              { name: "Municipio", value: payload.municipality, inline: true },
              ...(payload.road ? [{ name: "Carretera", value: payload.road, inline: true }] : []),
              { name: "Confianza", value: `${Math.round(payload.confidenceScore * 100)} %`, inline: true },
              { name: "Estado", value: payload.verificationStatus, inline: true },
              { name: "Fuente", value: `[${payload.sourceOutlet}](${payload.sourceUrl})`, inline: false },
            ],
            footer: { text: "Nada se publica sin aprobación" },
            timestamp: new Date().toISOString(),
            ...(payload.imageUrl ? { image: { url: payload.imageUrl } } : {}),
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Discord ${response.status}: ${detail.slice(0, 200)}`);
    }

    return {
      channel: "DISCORD",
      target: redact(webhookUrl),
      status: "SENT",
      durationMs: Date.now() - started,
    };
  } catch (err) {
    log.warn("Fallo el envio a Discord", { ...serializeError(err) });
    return {
      channel: "DISCORD", target: redact(webhookUrl), status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Webhook generico                                                          */
/* -------------------------------------------------------------------------- */

async function sendWebhook(payload: NotifyPayload): Promise<DeliveryResult> {
  const started = Date.now();

  if (!notifyConfig.webhook.enabled) {
    return { channel: "WEBHOOK", target: "-", status: "SKIPPED", durationMs: 0 };
  }

  const url = notifyConfig.webhook.url();
  if (!url) return { channel: "WEBHOOK", target: "-", status: "SKIPPED", durationMs: 0 };

  try {
    const body = JSON.stringify({
      event: "news.detected",
      detectedAt: new Date().toISOString(),
      article: {
        id: payload.accidentId,
        title: payload.title,
        summary: payload.summary,
        excerpt: payload.excerpt ?? null,
        municipality: payload.municipality,
        road: payload.road ?? null,
        occurredAt: payload.occurredAtIso,
        confidenceScore: payload.confidenceScore,
        sourceScore: payload.sourceScore,
        verificationStatus: payload.verificationStatus,
        status: "PENDING_REVIEW",
      },
      source: {
        outlet: payload.sourceOutlet,
        url: payload.sourceUrl,
      },
      reviewUrl: payload.reviewUrl,
    });

    const secret = notifyConfig.webhook.secret();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "TraficoLanzarote/2.0",
    };

    // Firma HMAC del cuerpo: quien reciba el webhook puede comprobar que viene
    // de este servidor y que no lo han alterado por el camino.
    if (secret) {
      headers["X-Signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Webhook ${response.status}: ${detail.slice(0, 200)}`);
    }

    return {
      channel: "WEBHOOK",
      target: redact(url),
      status: "SENT",
      durationMs: Date.now() - started,
    };
  } catch (err) {
    log.warn("Fallo el envio del webhook", { ...serializeError(err) });
    return {
      channel: "WEBHOOK", target: redact(url), status: "FAILED",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}

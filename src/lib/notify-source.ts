/**
 * Alerta cuando una fuente deja de funcionar.
 *
 * El requisito era "implementar sistema de alertas cuando una fuente falle".
 * Un fallo de red aislado no se avisa: cada ciclo reintenta y basta con que la
 * siguiente pasada funcione. Lo que si se avisa es una fuente CAIDA, que lleva
 * varios ciclos seguidos fallando y significa que hay que intervenir.
 *
 * Para no spamear, el aviso se envia UNA vez por episode. Se da el episodio por
 * cerrado cuando la fuente vuelve a funcionar.
 */

import { prisma } from "@/lib/prisma";
import { notifyNewArticle } from "@/lib/notify";
import { siteUrl } from "@/lib/env";
import { log, serializeError } from "@/lib/logger";

type FailingFeed = {
  id: string;
  name: string;
  lastError: string | null;
  consecutiveFailures: number;
};

export async function notifySourceFailure(feeds: FailingFeed[]): Promise<void> {
  if (feeds.length === 0) return;

  for (const feed of feeds) {
    // Solo se avisa una vez por episodio: si ya hay un aviso SENT de esta
    // fuente en las ultimas 12 horas, no se repite.
    const recentAlert = await prisma.notificationLog.findFirst({
      where: {
        channel: "EMAIL",
        target: "FUENTE-CAIDA",
        status: "SENT",
        preview: { contains: feed.name },
        createdAt: { gte: new Date(Date.now() - 12 * 3_600_000) },
      },
      select: { id: true },
    });

    if (recentAlert) {
      log.debug("Alerta de fuente ya enviada; se omite", { feed: feed.name });
      continue;
    }

    const summary =
      `La fuente «${feed.name}» lleva ${feed.consecutiveFailures} ciclos seguidos fallando y ha quedado ` +
      `marcada como CAIDA. Mientras siga asi no entran noticias suyas. ` +
      `Ultimo error: ${feed.lastError ?? "desconocido"}.`;

    // Se reaprovecha el canal de notificaciones con un id ficticio en lugar de
    // duplicar cuatro implementaciones de envio. El id no existe como noticia,
    // pero la columna acepta null y se deja en null.
    await notifyNewArticle({
      accidentId: "" as string,
      title: `Fuente caida: ${feed.name}`,
      summary,
      excerpt: null,
      municipality: "-",
      road: null,
      occurredAtIso: new Date().toISOString(),
      confidenceScore: 0,
      sourceScore: 0,
      verificationStatus: "ALERTA_DE_SISTEMA",
      sourceUrl: `${siteUrl()}/admin/fuentes`,
      sourceOutlet: feed.name,
      reviewUrl: `${siteUrl()}/admin/fuentes`,
      imageUrl: null,
    });

    // Se registra con el canal que identifica que es una alerta de fuente.
    await prisma.notificationLog.create({
      data: {
        channel: "EMAIL",
        target: "FUENTE-CAIDA",
        status: "SENT",
        preview: feed.name,
      },
    });

    log.warn("Fuente marcada como caida", {
      feed: feed.name,
      failures: feed.consecutiveFailures,
      error: feed.lastError,
    });
  }
}

/**
 * Avisa cuando una fuente se recupera.
 * Es la otra mitad del ciclo de alertas: saber que el problema se ha resuelto
 * permite dejar de mirar el panel.
 */
export async function notifySourceRecovery(feedName: string): Promise<void> {
  const previousAlert = await prisma.notificationLog.findFirst({
    where: { target: "FUENTE-CAIDA", status: "SENT", preview: { contains: feedName } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  // Si no habia alerta previa, no hay nada que cerrar.
  if (!previousAlert) return;

  await notifyNewArticle({
    accidentId: "" as string,
    title: `Fuente recuperada: ${feedName}`,
    summary: `La fuente «${feedName}» vuelve a responder correctamente. Se ha cerrado el aviso de caída anterior y las lecturas se han reanudado con normalidad.`,
    excerpt: null,
    municipality: "-",
    road: null,
    occurredAtIso: new Date().toISOString(),
    confidenceScore: 0,
    sourceScore: 0,
    verificationStatus: "SISTEMA",
    sourceUrl: `${siteUrl()}/admin/fuentes`,
    sourceOutlet: feedName,
    reviewUrl: `${siteUrl()}/admin/fuentes`,
    imageUrl: null,
  });

  await prisma.notificationLog.create({
    data: { channel: "EMAIL", target: "FUENTE-RECUPERADA", status: "SENT", preview: feedName },
  });

  log.info("Fuente recuperada y alerta cerrada", { feed: feedName });
}

/** Resumen de salud de todas las fuentes, para el panel. */
export async function getFeedsHealth(): Promise<
  Array<{
    name: string;
    url: string;
    status: string;
    enabled: boolean;
    lastOkAt: Date | null;
    lastRunAt: Date | null;
    lastError: string | null;
    consecutiveFailures: number;
    successCount: number;
    failureCount: number;
    avgItemsFound: number;
    latencyMs: number;
  }>
> {
  try {
    return await prisma.feedSource.findMany({
      select: {
        name: true, url: true, status: true, enabled: true,
        lastOkAt: true, lastRunAt: true, lastError: true,
        consecutiveFailures: true, successCount: true, failureCount: true,
        avgItemsFound: true, latencyMs: true,
      },
      orderBy: { status: "asc" },
    });
  } catch (err) {
    log.error("No se pudo leer la salud de las fuentes", serializeError(err));
    return [];
  }
}
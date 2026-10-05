/**
 * Ciclo de monitorizacion.
 *
 * Se ejecuta cada minuto desde un cron externo que llama a
 * `GET /api/cron/monitor`. Hace cuatro cosas por fuente:
 *
 *   1. Lee el feed y parsea los items.
 *   2. Actualiza la salud de la fuente (contadores, latencia, ultimo error).
 *   3. Ingesta los items nuevos o modificados -> borrador PENDING_REVIEW.
 *   4. Marca como MISSING las URLs que llevan varias pasadas sin aparecer.
 *
 * CONCURRENCIA: dos llamadas simultaneas podrian leer el mismo feed y crear el
 * mismo borrador dos veces. Se evita con un lock en la base de datos en lugar de
 * un mutex en memoria, porque en Render puede haber mas de una instancia y un
 * `setTimeout` en memoria no las coordina. La tabla ScrapeRun con un estado
 * `RUNNING` reciente hace de cerrojo.
 */

import { prisma } from "@/lib/prisma";
import { FEEDS, contentTypeLooksXml } from "@/lib/feeds";
import { safeFetch } from "@/lib/net";
import { parseFeed } from "@/lib/rss";
import { ingestArticle, type IngestOutcome } from "@/lib/ingest";
import { monitorConfig, alertConfig } from "@/lib/env";
import { log, serializeError, redact, timer, audit } from "@/lib/logger";
import { notifySourceFailure } from "@/lib/notify-source";

export type CycleResult = {
  ok: boolean;
  durationMs: number;
  startedAt: string;
  feedsChecked: number;
  feedsFailed: number;
  itemsFound: number;
  draftsCreated: number;
  duplicatesMerged: number;
  rejected: number;
  skipped: number;
  errors: string[];
  locked: boolean;
};

/**
 * Presupuesto de tiempo de un ciclo.
 *
 * En un servidor normal (Docker, Render, VPS) un ciclo puede durarse casi un
 * minuto entero. En Vercel las funciones serverless tienen un limite de
 * ejecucion que depende del plan: 10 segundos en Hobby y hasta 300 en Pro.
 * Si el ciclo se pasa de ese limite, la plataforma lo mata a mitad y devuelve
 * un error sin haber guardado nada.
 *
 * Por eso el presupuesto baja a 8 segundos en Vercel: es lo que deja margen
 * para el resto de la funcion y completar la respuesta HTTP.
 */
function cycleBudgetMs(): number {
  if (process.env.VERCEL) return 8_000;
  return 55_000;
}

const CYCLE_BUDGET_MS = cycleBudgetMs();

/* -------------------------------------------------------------------------- */
/*  Lock                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Intenta tomar el cerrojo del ciclo.
 *
 * Se considera ocupado si hay un ScrapeRun global (feedSourceId null) que
 * empezo hace menos de 90 segundos. Ese margen superior a 60 segundos cubre el
 * caso de que un cron se dispare dos veces seguidas o de que dos servicios
 * Render se solapen.
 */
async function acquireLock(trigger: "CRON" | "MANUAL" | "STARTUP"): Promise<boolean> {
  const cutoff = new Date(Date.now() - 90_000);
  const running = await prisma.scrapeRun.findFirst({
    where: {
      feedSourceId: null,
      trigger: { in: ["CRON", "STARTUP", "MANUAL"] },
      startedAt: { gte: cutoff },
      finishedAt: null,
    },
    select: { id: true },
  });
  if (running) return false;

  await prisma.scrapeRun.create({
    data: { trigger, startedAt: new Date(), ok: true },
  });
  return true;
}

/* -------------------------------------------------------------------------- */
/*  Cadencia: cada cuanto se pasa                                              */
/* -------------------------------------------------------------------------- */

/**
 * Cada cuanto se admite una pasada, en ms.
 *
 * Por defecto, una hora. El plan Hobby de Vercel deja dos cron al dia, asi que el
 * ritmo se consigue con `runCycleIfDue`, que dispara un ciclo desde el propio
 * trafico del sitio. El cron de Vercel queda como suelo para cuando no entra nadie.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE UNA HORA Y NO MENOS
 * ---------------------------------------------------------------------------
 *
 * Los feeds guardan entre 2 y 17 dias de noticias, asi que la ventana de "esto es
 * nuevo" no es el problema: un articulo de hace veinte minutos sigue ahi dentro
 * de una semana. El problema es el coste, y aqui no hay cron de pago con el que
 * pagarlo. Una hora por visita es lo que aguanta el plan gratis sin castigar la
 * latencia.
 *
 * Se puede cambiar con `MONITOR_CYCLE_MS`, pero bajar el valor no da noticias mas
 * frescas: los feeds no cambian tan a menudo, y lo que se gasta es tiempo de
 * funcion en Vercel (8 s de presupuesto por pasada) y peticiones a las fuentes.
 *
 * La ventana de 90 minutos que se mira en `monitorConfig.lookbackMinutes()` es
 * MAYOR que la cadencia a proposito: si una pasada se salta o se retrasa, la
 * siguiente sigue cubriendo lo que se le habia escapado. Con una ventana igual
 * que la cadencia, el retraso de una pasada equivaldria a perder noticias.
 */
export const CADENCIA_MS = monitorConfig.cycleMs();

/**
 * Ultima vez que este proceso comprobó que tocaba. Solo en memoria.
 *
 * Sirve para no pegarle una consulta a la base de datos en cada peticion: tras la
 * primera comprobacion se sabe que no toca hasta dentro de 15 minutos y se
 * contesta sin tocar la base de datos. En una instancia de serverless esto
 * significa una consulta por arranque en frio, no una por visita.
 */
let proximaPasadaAdmitida = 0;

/**
 * Si toca pasar, ejecuta un ciclo. Si no toca, no hace nada y se responde casi
 * al instante.
 *
 * El cerrojo de `acquireLock` sigue siendo la garantía de que no haya dos ciclos
 * a la vez: esto solo evita el trabajo duplicado.
 */
export async function runCycleIfDue(
  trigger: "CRON" | "MANUAL" | "STARTUP",
  ahora: number = Date.now(),
): Promise<{ ejecutado: boolean; motivo: string }> {
  if (ahora < proximaPasadaAdmitida) {
    return {
      ejecutado: false,
      motivo: `Todavia no toca: quedan ${Math.ceil((proximaPasadaAdmitida - ahora) / 60_000)} min.`,
    };
  }

  // Se reserva ANTES de ir a la base de datos. Aunque el ciclo falle o la pagina
  // no llegue a terminar, no se reintenta en cada peticion.
  proximaPasadaAdmitida = ahora + CADENCIA_MS;

  try {
    const r = await runCycle(trigger);
    return {
      ejecutado: true,
      motivo: `Ciclo ejecutado en ${Math.round(r.durationMs / 1000)} s: ${r.draftsCreated} borrador(es) nuevo(s), ${r.itemsFound} item(s) leido(s).`,
    };
  } catch (err) {
    log.error("El ciclo disparado desde el trafico fallo", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ejecutado: true, motivo: "El ciclo fallo. Se reintentara en la siguiente ventana." };
  }
}

/**
 * Solo para pruebas: olvida la reserva en memoria.
 */
export function olvidarCadencia(): void {
  proximaPasadaAdmitida = 0;
}

/* -------------------------------------------------------------------------- */
/*  Sincronizacion de fuentes                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Sincroniza FEEDS (codigo) con la tabla FeedSource (base de datos).
 *
 * El codigo es la declaracion de intent: que fuentes existen. La tabla guarda el
 * estado: cuando fue la ultima vez que funciono, cuantos fallos lleva. Asi se
 * puede deshabilitar una fuente desde la base de datos sin desplegar.
 */
export async function syncFeeds(): Promise<number> {
  let count = 0;
  for (const definition of FEEDS) {
    const existing = await prisma.feedSource.findUnique({
      where: { name: definition.name },
      select: { id: true, url: true, enabled: true },
    });

    if (!existing) {
      await prisma.feedSource.create({
        data: {
          name: definition.name,
          url: definition.url,
          kind: definition.kind,
          region: definition.region,
          baseScore: definition.baseScore,
          enabled: definition.enabled,
          notes: definition.notes ?? null,
          status: "OK",
        },
      });
      count++;
    } else if (existing.url !== definition.url) {
      // La URL cambio en el codigo: se actualiza y se reinicia la salud.
      await prisma.feedSource.update({
        where: { id: existing.id },
        data: {
          url: definition.url,
          kind: definition.kind,
          region: definition.region,
          baseScore: definition.baseScore,
          notes: definition.notes ?? null,
          consecutiveFailures: 0,
          status: "OK",
          lastError: null,
        },
      });
      log.info("URL de fuente actualizada", { feed: definition.name, url: definition.url });
      count++;
    }

    /*
      `enabled` NO se toca en la rama de arriba, a proposito: una fuente se
      apaga desde la base de datos sin tener que desplegar. La excepcion es
      `forceDisabled`, que dice "esta fuente esta muerta, apagala aunque la base
      de datos diga lo contrario". Sin ella, una fuente marcada en el codigo
      seguiria leyendose si alguien la habia reactivado a mano.
    */
    if (definition.forceDisabled && existing?.enabled) {
      await prisma.feedSource.update({
        where: { id: existing.id },
        data: { enabled: false, notes: definition.notes ?? null },
      });
      log.info("Fuente apagada desde el codigo", { feed: definition.name });
      count++;
    }
  }
  return count;
}

/* -------------------------------------------------------------------------- */
/*  Procesado de una fuente                                                    */
/* -------------------------------------------------------------------------- */

type FeedOutcome = {
  feedName: string;
  ok: boolean;
  itemsFound: number;
  drafts: number;
  duplicates: number;
  rejected: number;
  skipped: number;
  error?: string;
};

async function processFeed(
  feed: { id: string; name: string; url: string; baseScore: number },
  trigger: "CRON" | "MANUAL" | "STARTUP",
): Promise<FeedOutcome> {
  const elapsed = timer();
  const run = await prisma.scrapeRun.create({
    data: { feedSourceId: feed.id, trigger, startedAt: new Date(), ok: true },
  });

  const outcome: FeedOutcome = {
    feedName: feed.name, ok: false, itemsFound: 0,
    drafts: 0, duplicates: 0, rejected: 0, skipped: 0,
  };

  const finish = async (error?: string) => {
    const durationMs = elapsed();

    /*
      `outcome.ok` no se ponia en ningun sitio. Se inicializa a false y solo se
      leia, asi que el contador daba "6 de 6 fuentes fallidas" y la ruta del cron
      respondia 207 en todas las pasadas, aunque las fuentes estuvieran
      perfectas. Lo que si se guardaba bien era el estado real en la tabla
      (lastOkAt, consecutiveFailures, status), que es por eso que el fallo
      pasaba desapercibido: la base de datos decia que todo iba bien y el
      resultado del ciclo decia lo contrario.
    */
    outcome.ok = !error;

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        durationMs,
        ok: !error,
        error: error ?? null,
        itemsFound: outcome.itemsFound,
        itemsNew: outcome.drafts,
        itemsDuplicate: outcome.duplicates,
        itemsRemoved: 0,
      },
    });

    // Media movil del numero de items relevantes: una fuente que baja de 20 a
    // 0 items de un dia a otro casi siempre ha cambiado el formato del feed.
    const history = await prisma.scrapeRun.findMany({
      where: { feedSourceId: feed.id },
      select: { itemsFound: true },
      orderBy: { startedAt: "desc" },
      take: 20,
    });
    const avg = history.length > 0
      ? history.reduce((a, r) => a + r.itemsFound, 0) / history.length
      : 0;

    if (error) {
      const current = await prisma.feedSource.findUnique({
        where: { id: feed.id },
        select: { consecutiveFailures: true, failureCount: true, successCount: true },
      });
      const failures = (current?.consecutiveFailures ?? 0) + 1;

      await prisma.feedSource.update({
        where: { id: feed.id },
        data: {
          status: failures >= alertConfig.failureThreshold() ? "FAILING" : "DEGRADED",
          lastRunAt: new Date(),
          lastError: error.slice(0, 500),
          consecutiveFailures: failures,
          failureCount: (current?.failureCount ?? 0) + 1,
          latencyMs: durationMs,
          avgItemsFound: avg,
        },
      });

      log.warn("Fallo la lectura de la fuente", {
        feed: feed.name, error, failures,
      });
    } else {
      const current = await prisma.feedSource.findUnique({
        where: { id: feed.id },
        select: { consecutiveFailures: true, failureCount: true, successCount: true },
      });
      await prisma.feedSource.update({
        where: { id: feed.id },
        data: {
          status: "OK",
          lastRunAt: new Date(),
          lastOkAt: new Date(),
          lastError: null,
          consecutiveFailures: 0,
          successCount: (current?.successCount ?? 0) + 1,
          latencyMs: durationMs,
          avgItemsFound: avg,
        },
      });
    }
  };

  // --- 1. Descargar el feed ---
  const response = await safeFetch(feed.url, {
    accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
  });

  if (!response.ok) {
    outcome.error = response.error ?? `HTTP ${response.status}`;
    await finish(outcome.error);
    return outcome;
  }

  // --- 2. Comprobar que es XML y no una pagina HTML ---
  if (!contentTypeLooksXml(response.contentType)) {
    outcome.error = `La URL responde "${response.contentType}" en lugar de un feed XML. Revisar la direccion.`;
    await finish(outcome.error);
    return outcome;
  }

  // --- 3. Parsear ---
  const parsed = parseFeed(response.body, feed.name);
  if (!parsed.valid) {
    outcome.error = parsed.error ?? "El documento no es un feed valido";
    await finish(outcome.error);
    return outcome;
  }

  // Un feed con cero items puede ser legitimo (poco se publica) o puede estar
  // roto de una forma que el parser no detecta. Se avisa solo si el historico
  // dice que deberia haber contenido.
  if (parsed.items.length === 0) {
    log.warn("El feed no devuelve items", { feed: feed.name, url: feed.url });
  }

  outcome.itemsFound = parsed.items.length;

  // --- 4. Limitar y ordenar por fecha descendente ---
  const maxItems = monitorConfig.maxArticlesPerFeed();
  const lookbackMs = monitorConfig.lookbackMinutes() * 60_000;
  const now = Date.now();

  const candidates = [...parsed.items]
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .filter((item) => {
      // Lo mas viejo que se acepta es el limite de antiguedad.
      if (!item.publishedAt) return true;
      const age = now - item.publishedAt.getTime();
      return age <= monitorConfig.maxAgeDays() * 86_400_000;
    })
    .slice(0, maxItems);

  // --- 5. Ingesta ---
  const feedState = await prisma.feedSource.findUnique({
    where: { id: feed.id },
    select: { successCount: true, failureCount: true, consecutiveFailures: true },
  });
  const totalRuns = (feedState?.successCount ?? 0) + (feedState?.failureCount ?? 0);
  // Sin historio suficiente se supone 0.5: ni se penaliza ni se favorece a la
  // fuente. Un 0 here haria que la primera lectura recibiera siempre 0 en
  // sourceScore.
  const successRate = totalRuns > 0 ? (feedState?.successCount ?? 0) / totalRuns : 0.5;

  for (const item of candidates) {
    if (elapsed() > CYCLE_BUDGET_MS) {
      log.info("Se agota el presupuesto del ciclo; quedan items para la siguiente pasada", {
        feed: feed.name,
      });
      break;
    }

    // El lookback evita reintentar en cada pasada lo de hace tres dias.
    if (item.publishedAt && now - item.publishedAt.getTime() > lookbackMs) continue;

    const source = {
      name: feed.name,
      url: feed.url,
      baseScore: feed.baseScore,
      consecutiveFailures: feedState?.consecutiveFailures ?? 0,
      successRate,
    };

    let result: IngestOutcome;
    try {
      result = await ingestArticle({
        url: item.url,
        source,
        feedPublishedAt: item.publishedAt,
        feedSummary: item.summary,
        feedImageUrl: item.imageUrl,
      });
    } catch (err) {
      log.warn("Fallo la ingesta de un item", {
        feed: feed.name,
        url: redact(item.url),
        ...serializeError(err),
      });
      outcome.skipped++;
      continue;
    }

    switch (result.kind) {
      case "draft":
        outcome.drafts++;
        break;
      case "duplicate":
        outcome.duplicates++;
        break;
      case "rejected":
        outcome.rejected++;
        log.info("Articulo descartado", { feed: feed.name, reason: result.reason });
        break;
      case "skipped":
        outcome.skipped++;
        break;
    }
  }

  await finish();
  return outcome;
}

/* -------------------------------------------------------------------------- */
/*  Deteccion de bajas                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Marca como MISSING las URLs que llevan varias pasadas sin aparecer.
 *
 * Un feed solo muestra los ultimos N articulos, asi que "ha desaparecido del
 * feed" NO significa que la noticia se haya borrado: normalmente solo ha salido
 * de la portada. Por eso no se borra nada: se anota, y una noticia ya publicada
 * nunca se retira por esto.
 */
export async function detectMissing(): Promise<number> {
  const threshold = monitorConfig.missingThreshold();

  // Primero se restauran las que han vuelto a aparecer (lo hace recordSeen al
  // verlas), despues se Deco el resto.
  const stale = await prisma.seenEntry.findMany({
    where: {
      state: "PRESENT",
      missingCount: { lt: threshold },
      lastSeenAt: {
        // Mas viejo que el umbral de pasadas: con un ciclo de 60 s, 6 pasadas
        // equivalen aproximadamente a 6 minutos.
        lt: new Date(Date.now() - threshold * 60_000),
      },
    },
    select: { id: true },
    take: 500,
  });

  if (stale.length === 0) return 0;

  // Se incrementa en bloque; el estado pasa a MISSING al superar el umbral.
  await prisma.seenEntry.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { missingCount: { increment: 1 } },
  });

  const nowMissing = await prisma.seenEntry.updateMany({
    where: {
      id: { in: stale.map((s) => s.id) },
      missingCount: { gte: threshold },
      state: "PRESENT",
    },
    data: { state: "MISSING" },
  });

  if (nowMissing.count > 0) {
    log.info("URLs marcadas como ausentes del feed", {
      count: nowMissing.count,
      threshold,
      aviso:
        "Una noticia que sale del feed no esta eliminada: los medios solo publican los ultimos articulos. Ninguna noticia publicada se retira por esto.",
    });
  }

  return nowMissing.count;
}

/* -------------------------------------------------------------------------- */
/*  Ciclo completo                                                            */
/* -------------------------------------------------------------------------- */

export async function runCycle(trigger: "CRON" | "MANUAL" | "STARTUP" = "CRON"): Promise<CycleResult> {
  const startedAt = new Date();
  const elapsed = timer();

  const result: CycleResult = {
    ok: true,
    durationMs: 0,
    startedAt: startedAt.toISOString(),
    feedsChecked: 0,
    feedsFailed: 0,
    itemsFound: 0,
    draftsCreated: 0,
    duplicatesMerged: 0,
    rejected: 0,
    skipped: 0,
    errors: [],
    locked: false,
  };

  const acquired = await acquireLock(trigger);
  if (!acquired) {
    result.locked = true;
    result.durationMs = elapsed();
    log.info("Ciclo omitido: ya hay uno en marcha");
    return result;
  }

  try {
    await syncFeeds();

    const feeds = await prisma.feedSource.findMany({
      where: { enabled: true },
      orderBy: { baseScore: "desc" },
    });

    result.feedsChecked = feeds.length;

    // Las fuentes se procesan en serie y no en paralelo. Con una o dos fuentes
    // activas no se gana nada paralelizando, y en serie el presupuesto de 55 s
    // es mucho mas facil de respetar. Si alguna vez hay muchas, el orden de
    // baseScore garantiza que las mejores se procesen primero.
    for (const feed of feeds) {
      if (elapsed() > CYCLE_BUDGET_MS) {
        result.errors.push("Se agoto el presupuesto del ciclo: quedan fuentes sin revisar.");
        break;
      }

      const outcome = await processFeed(feed, trigger);

      result.itemsFound += outcome.itemsFound;
      result.draftsCreated += outcome.drafts;
      result.duplicatesMerged += outcome.duplicates;
      result.rejected += outcome.rejected;
      result.skipped += outcome.skipped;

      if (!outcome.ok) {
        result.feedsFailed++;
        if (outcome.error) result.errors.push(`${outcome.feedName}: ${outcome.error}`);
      }
    }

    result.draftsCreated += await detectMissing();

    // Alerta de fuentes caidas, una vez por ciclo y no por item.
    const failing = await prisma.feedSource.findMany({
      where: { status: "FAILING" },
      select: { id: true, name: true, lastError: true, consecutiveFailures: true },
    });
    if (failing.length > 0) {
      await notifySourceFailure(failing);
    }

    result.ok = result.feedsFailed < feeds.length || feeds.length === 0;
  } catch (err) {
    result.ok = false;
    result.errors.push(err instanceof Error ? err.message : String(err));
    log.error("Fallo el ciclo de monitorizacion", serializeError(err));
  } finally {
    result.durationMs = elapsed();

    // Cierra el cerrojo.
    await prisma.scrapeRun.updateMany({
      where: { feedSourceId: null, startedAt: { gte: startedAt }, finishedAt: null },
      data: {
        finishedAt: new Date(),
        durationMs: result.durationMs,
        ok: result.ok,
        error: result.errors.length > 0 ? result.errors.join(" | ").slice(0, 1000) : null,
        itemsFound: result.itemsFound,
        itemsNew: result.draftsCreated,
        itemsDuplicate: result.duplicatesMerged,
      },
    });

    await audit({
      actor: "SCRAPER",
      action: "CRON",
      entity: "cycle",
      detail: {
        trigger,
        feedsChecked: result.feedsChecked,
        feedsFailed: result.feedsFailed,
        drafts: result.draftsCreated,
        duplicates: result.duplicatesMerged,
        durationMs: result.durationMs,
      },
    });

    log.info("Ciclo completado", {
      trigger,
      feeds: `${result.feedsChecked - result.feedsFailed}/${result.feedsChecked}`,
      items: result.itemsFound,
      drafts: result.draftsCreated,
      duplicates: result.duplicatesMerged,
      rejected: result.rejected,
      durationMs: result.durationMs,
      errors: result.errors.length,
    });
  }

  return result;
}
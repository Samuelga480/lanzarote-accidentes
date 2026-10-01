/**
 * Ingesta de un articulo concreto: de una URL a un borrador en revision.
 *
 * Invariante de este modulo y de todo lo que llama: el resultado SIEMPRE se
 * guarda con status PENDING_REVIEW y origin AI. No hay ninguna ruta por la que
 * este fichero produzca una noticia publicada. La unica forma de publicar es
 * `changeStatus()` en src/lib/admin.ts, que solo llama el panel y exige sesion
 * de administrador.
 *
 * El orden de los pasos importa y no es arbitrario:
 *
 *   1. Descargar la pagina. Antes de gastar nada, ver si ya se vio esa URL.
 *   2. Extraer el articulo (titulo, cuerpo, imagen, fecha).
 *   3. Comprobar que es de Lanzarote y que trata de un suceso.
 *   4. Verificar fechas y cifras.
 *   5. Buscar duplicados. Si es duplicado, se ANADE la fuente a la noticia
 *      existente y se termina aqui. No se crea una noticia nueva.
 *   6. Reescribir con IA (si hay clave configurada).
 *   7. Procesar la imagen.
 *   8. Guardar como PENDING_REVIEW.
 *   9. Notificar al administrador.
 */

import { prisma } from "@/lib/prisma";
import { safeFetch } from "@/lib/net";
import { extractArticle } from "@/lib/extract";
import { extractFacts, relevanceScore, type ExtractedFacts } from "@/lib/facts";
import { parseSourceDate, resolveOccurredAt, validateDate, localDayKey, formatLocal } from "@/lib/dates";
import { verifyArticle, type VerificationResult } from "@/lib/verify";
import { checkDuplicate, urlHashOf, mergeIntoCanonical } from "@/lib/dedupe";
import { rewriteArticle, embedArticle } from "@/lib/ai/rewrite";
import { aiConfig, monitorConfig, siteUrl } from "@/lib/env";
import { processImage } from "@/lib/images";
import { sanitizeAccident, summarizeFindings } from "@/lib/privacy";
import { slugify, uniqueSlug } from "@/lib/slug";
import { perturbCoordinate } from "@/lib/ai/pipeline";
import { MUNICIPALITY_BY_SLUG } from "@/lib/constants";
import { notifyNewArticle } from "@/lib/notify";
import { contentHashOf, simHash, tidy, truncate } from "@/lib/text";
import { log, serializeError, redact, timer, audit } from "@/lib/logger";

/* -------------------------------------------------------------------------- */
/*  Tipos                                                                     */
/* -------------------------------------------------------------------------- */

export type IngestSource = {
  name: string;
  url: string;
  baseScore: number;
  consecutiveFailures: number;
  successRate: number;
};

export type IngestOutcome =
  | { kind: "draft"; accidentId: string; slug: string; title: string; confidenceScore: number; verificationStatus: string; rewritten: boolean; notified: boolean }
  | { kind: "duplicate"; canonicalId: string; sourcesAdded: number; reason: string }
  | { kind: "rejected"; reason: string }
  | { kind: "skipped"; reason: string };

/* -------------------------------------------------------------------------- */
/*  Ingesta                                                                    */
/* -------------------------------------------------------------------------- */

export async function ingestArticle(params: {
  url: string;
  source: IngestSource;
  /** Fecha del feed, si la tiene. */
  feedPublishedAt: Date | null;
  /** Resumen del feed, usado si no se puede descargar la pagina. */
  feedSummary: string;
  /** Imagen declarada en el feed, como respaldo de la del articulo. */
  feedImageUrl: string | null;
}): Promise<IngestOutcome> {
  const { url, source } = params;
  const elapsed = timer();

  // --- 1. ¿Ya vista esta URL? ---
  const urlHash = urlHashOf(url);
  const existing = await prisma.seenEntry.findUnique({
    where: { urlHash },
    select: { id: true, accidentId: true, title: true, contentHash: true },
  });

  if (existing) {
    // Actualizar lastSeenAt mantiene viva la entrada. Si la noticia asociada ya
    // existe, no hay nada que hacer.
    await prisma.seenEntry.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date(), missingCount: 0, state: "PRESENT" },
    });
    return { kind: "skipped", reason: "La URL ya estaba registrada." };
  }

  // --- 2. Descargar y extraer ---
  const page = await safeFetch(url, { accept: "text/html,application/xhtml+xml" });

  if (!page.ok) {
    log.debug("No se pudo descargar el articulo", { url: redact(url), error: page.error });
    // Se registra igualmente: la proxima pasada lo reintentara.
    await recordSeen({
      url, urlHash, title: "", contentHash: "", state: "MISSING",
      sourceUrl: source.url,
    });
    return { kind: "skipped", reason: `No se pudo descargar: ${page.error}` };
  }

  const article = extractArticle(page.body, page.url);

  const title = article.title?.trim();
  if (!title || title.length < 10) {
    return { kind: "skipped", reason: "La pagina no tiene un titular utilizable." };
  }

  const body = article.body.trim();
  // El respaldo es `summary` y no `excerpt`: si el cuerpo no se pudo extraer,
  // el resumen completo del feed sirve mejor que la meta description, que
  // suelen ser las dos la misma frase de 150 caracteres.
  const summary = article.summary?.trim() || params.feedSummary || "";
  const fullText = body.length >= 200 ? body : summary;

  // --- 3. Relevancia y geolocalizacion ---
  const relevance = relevanceScore(title, fullText);
  if (relevance < 0.25) {
    await recordSeen({
      url: page.url, urlHash, title, contentHash: contentHashOf(title, fullText),
      state: "PRESENT", sourceUrl: source.url, publishedAt: article.publishedAt,
    });
    return { kind: "skipped", reason: `No es relevante (relevancia ${Math.round(relevance * 100)} %).` };
  }

  const facts: ExtractedFacts = extractFacts(title, fullText);

  if (facts.outsideLanzarote) {
    await recordSeen({
      url: page.url, urlHash, title, contentHash: contentHashOf(title, fullText),
      state: "PRESENT", sourceUrl: source.url,
    });
    return { kind: "rejected", reason: "El articulo menciona otra isla." };
  }

  // Sin municipio no se descarta: puede ser un accidente en una carretera
  // insular que el medio noSitua por nombre. Quedara como pendiente y el editor
  // lo situa. Lo que no se hace es inventarle un municipio.
  if (!facts.municipalitySlug) {
    log.debug("Articulo relevante sin municipio identificable", { title });
  }

  // --- 4. Fechas ---
  const articleDate = parseSourceDate(
    article.publishedAt?.toISOString() ?? null,
    "utc",
  );
  const feedDate = parseSourceDate(params.feedPublishedAt?.toISOString() ?? null, "utc");

  const dateVerdict = validateDate(articleDate?.date ?? feedDate?.date ?? null, {
    maxAgeDays: monitorConfig.maxAgeDays(),
  });

  if (!dateVerdict.ok) {
    await recordSeen({
      url: page.url, urlHash, title, contentHash: contentHashOf(title, fullText),
      state: "PRESENT", sourceUrl: source.url,
    });
    return { kind: "rejected", reason: dateVerdict.note ?? dateVerdict.problem ?? "Fecha no valida." };
  }

  const occurredAt = resolveOccurredAt(
    articleDate?.date ?? null,
    feedDate?.date ?? null,
    facts.timeOfDay,
    dateVerdict.corrected ?? new Date(),
  );

  // --- 5. Verificacion ---
  const verification = verifyArticle({
    title,
    body: fullText,
    summary,
    date: articleDate ?? feedDate,
    facts,
    baseScore: source.baseScore,
    consecutiveFailures: source.consecutiveFailures,
    successRate: source.successRate,
    maxAgeDays: monitorConfig.maxAgeDays(),
  });

  if (verification.autoReject) {
    await recordSeen({
      url: page.url, urlHash, title, contentHash: contentHashOf(title, fullText),
      state: "PRESENT", sourceUrl: source.url, publishedAt: article.publishedAt,
    });
    return {
      kind: "rejected",
      reason: verification.notes.join(" ") || "La verificacion automatica lo ha descartado.",
    };
  }

  // --- 6. Duplicados ---
  // El embedding se pide una sola vez y se reutiliza para la comparacion
  // semantica y para guardar en la noticia.
  let embedding: number[] | null = null;

  const duplicate = await checkDuplicate({
    url: page.url,
    title,
    body: fullText,
    occurredAt,
    // `embedding` se omite aqui a proposito: todavia no se ha calculado, y el
    // duplicado se detectara por URL, hash o SimHash. La comparacion semantica
    // es el ultimo recurso y se hace tras reescribir.
  });

  if (duplicate.isDuplicate && duplicate.canonicalId) {
    const merge = await mergeIntoCanonical({
      duplicateId: await ensureDuplicateDraft({
        url: page.url, urlHash, title, body: fullText, summary, facts,
        occurredAt, verification, source, occurredAtIso: occurredAt.toISOString(),
        municipalityName: facts.municipalitySlug ?? "sin municipio",
      }),
      canonicalId: duplicate.canonicalId,
    });

    await recordSeen({
      url: page.url, urlHash, title, contentHash: contentHashOf(title, fullText),
      state: "PRESENT", sourceUrl: source.url, publishedAt: article.publishedAt,
      accidentId: duplicate.canonicalId,
    });

    log.info("Noticia duplicada, fuente fusionada", {
      canonicalId: duplicate.canonicalId,
      sourcesAdded: merge.sourcesAdded,
      reason: duplicate.reason,
    });

    return {
      kind: "duplicate",
      canonicalId: duplicate.canonicalId,
      sourcesAdded: merge.sourcesAdded,
      reason: duplicate.reason,
    };
  }

  // --- 7. Reescritura con IA ---
  const municipalitySlug = facts.municipalitySlug;
  const municipalityName = municipalitySlug
    ? (MUNICIPALITY_BY_SLUG.get(municipalitySlug)?.name ?? municipalitySlug)
    : "Lanzarote";

  if (aiConfig.enabled()) {
    embedding = await embedArticle(title, fullText);
  }

  let finalTitle = title;
  let finalSummary = truncate(tidy(fullText).slice(0, 480), 480);
  let finalBody = fullText.length >= 300 ? fullText : `${fullText}\n\n${summary}`;
  let seoTitle: string | null = null;
  let metaDescription: string | null = null;
  let excerpt: string | null = null;
  let aiModel: string | null = null;
  let rewritten = false;

  const rewrite = await rewriteArticle({
    title,
    body: fullText,
    summary,
    facts,
    municipalityName,
    occurredAtIso: formatLocal(occurredAt),
    outlet: source.name,
    sourceUrl: url,
  });

  if (rewrite.ok) {
    finalTitle = rewrite.title!;
    finalSummary = rewrite.summary!;
    finalBody = rewrite.body!;
    seoTitle = rewrite.seoTitle;
    metaDescription = rewrite.metaDescription;
    excerpt = rewrite.excerpt;
    aiModel = rewrite.model;
    rewritten = true;
  } else {
    // Se guarda igualmente, con el texto original y la nota de que la IA no
    // pudo reescribir. Perder la noticia es peor que guardarla sin pulir.
    log.warn("No se pudo reescribir la noticia; se guarda el texto original", {
      title: truncate(title, 80),
      error: rewrite.error,
    });
  }

  // --- Privacidad: ultima barrera antes de la base de datos ---
  const { data: clean, findings } = sanitizeAccident({
    title: finalTitle,
    summary: finalSummary,
    body: finalBody,
    locationDescription: facts.road ? `Carretera ${facts.road}` : null,
  });
  const privacyNote = summarizeFindings(findings);

  // --- Ubicacion aproximada ---
  const base = municipalitySlug
    ? MUNICIPALITY_BY_SLUG.get(municipalitySlug)
    : undefined;
  const approx = perturbCoordinate(
    base ? { lat: base.lat, lon: base.lon } : { lat: 29.0, lon: -13.63 },
  );

  // --- 8. Guardar como PENDING_REVIEW ---
  const slug = await uniqueSlug(slugify(clean.title), async (candidate) => {
    const found = await prisma.accident.findUnique({ where: { slug: candidate }, select: { id: true } });
    return found !== null;
  });

  // Sin municipio identificado se usa Arrecife SOLO como referencia cartografica
  // del marcador del mapa, nunca como dato editorial: el campo de municipio
  // real lo rellena el editor. Es la unica concession a que el mapa tenga un
  // punto, y no aparece en el texto publicado.
  const municipalityConnect = municipalitySlug ?? "arrecife";
  const municipalityUncertain = !municipalitySlug;

  const notesToEditor = [
    ...verification.notes,
    rewritten ? null : "La IA no pudo reescribirla: el texto es el original.",
    rewrite.ok ? `Solapamiento con el original: ${Math.round((rewrite.overlap ?? 0) * 100)} %.` : null,
    municipalityUncertain
      ? "ATENCION: no se ha podido determinar el municipio. Esta marcado como Arrecife solo para que aparezca en el mapa; corrigelo antes de publicar."
      : null,
    privacyNote,
  ].filter((n): n is string => Boolean(n)).join(" ");

  const created = await prisma.accident.create({
    data: {
      slug,
      title: clean.title,
      summary: clean.summary,
      body: clean.body,
      seoTitle,
      metaDescription,
      excerpt,

      occurredAt,
      municipality: { connect: { slug: municipalityConnect } },
      vehicleType: facts.vehicleType ?? "OTROS",
      severity: facts.severity ?? "MODERADO",
      category: facts.category ?? "ACCIDENTE_TRAFICO",
      road: facts.road,

      status: "PENDING_REVIEW",
      origin: "AI",
      fatalities: facts.fatalities ?? 0,
      injuries: facts.injuries ?? 0,
      isFeatured: false,

      approxLat: approx.lat,
      approxLon: approx.lon,
      locationDescription: clean.locationDescription ?? null,

      confidenceScore: verification.confidenceScore,
      sourceScore: verification.sourceScore,
      verificationStatus: verification.verificationStatus,
      verificationNotes: verification.notes.join(" "),

      contentHash: contentHashOf(title, fullText),
      simHash: simHash(`${title} ${fullText}`),
      embedding: embedding ? JSON.stringify(embedding) : null,

      originalTitle: title,
      originalSummary: truncate(summary, 500),
      originalBody: truncate(fullText, 8000),
      originalUrl: page.url,
      aiModel,
      rewrittenAt: rewritten ? new Date() : null,
      detectedAt: new Date(),
      lastSeenAt: new Date(),

      reviewNotes: notesToEditor || null,

      sources: {
        create: [{
          outlet: source.name,
          url: page.url,
          publishedAt: article.publishedAt ?? params.feedPublishedAt,
          excerpt: truncate(summary, 2000),
        }],
      },
    },
    select: { id: true, slug: true, title: true, status: true },
  });

  // Invariante verificada en tiempo de ejecucion, no solo en un comentario.
  if (created.status !== "PENDING_REVIEW") {
    throw new Error(
      "Invariante rota: la ingesta ha creado la noticia con un estado distinto de PENDING_REVIEW.",
    );
  }

  await recordSeen({
    url: page.url, urlHash, title, contentHash: contentHashOf(title, fullText),
    state: "PRESENT", sourceUrl: source.url, publishedAt: article.publishedAt,
    accidentId: created.id,
  });

  await prisma.revision.create({
    data: {
      accidentId: created.id,
      editor: "sistema",
      note: rewritten
        ? "Borrador creado automaticamente: extraido, verificado y reescrito con IA"
        : "Borrador creado automaticamente: extraido y verificado, sin reescritura de IA",
      snapshot: JSON.stringify({
        title: clean.title,
        status: "PENDING_REVIEW",
        origin: "AI",
        confidenceScore: verification.confidenceScore,
        sourceScore: verification.sourceScore,
        verificationStatus: verification.verificationStatus,
        overlap: rewrite.ok ? rewrite.overlap : null,
        aiModel,
        source: source.name,
        sourceUrl: page.url,
        capturedAt: new Date().toISOString(),
      }),
    },
  });

  // --- Imagen ---
  const imageUrl = article.imageUrl ?? params.feedImageUrl;
  let finalImageUrl: string | null = null;
  if (imageUrl) {
    const processed = await processImage({
      accidentId: created.id,
      url: imageUrl,
      alt: clean.title,
      kind: "HERO",
    });
    if (processed.ok && processed.heroPath) {
      finalImageUrl = processed.heroPath;
    } else {
      // Si el procesado falla, se guarda la URL original para no perder la foto.
      finalImageUrl = imageUrl;
      log.info("Se usa la imagen original; el procesado fallo", {
        accidentId: created.id, error: processed.error,
      });
    }
  }

  if (finalImageUrl) {
    await prisma.accident.update({
      where: { id: created.id },
      data: {
        imageUrl: finalImageUrl,
        imageAlt: clean.title,
      },
    });
  }

  await audit({
    actor: "SCRAPER",
    action: "INGEST",
    entity: "accident",
    entityId: created.id,
    detail: {
      outlet: source.name,
      confidence: verification.confidenceScore,
      verification: verification.verificationStatus,
      rewritten,
      durationMs: elapsed(),
    },
  });

  // --- 9. Notificar ---
  await notifyNewArticle({
    accidentId: created.id,
    title: clean.title,
    summary: clean.summary,
    excerpt,
    municipality: municipalityName,
    road: facts.road,
    occurredAtIso: formatLocal(occurredAt),
    confidenceScore: verification.confidenceScore,
    sourceScore: verification.sourceScore,
    verificationStatus: verification.verificationStatus,
    sourceUrl: page.url,
    sourceOutlet: source.name,
    reviewUrl: `${siteUrl()}/admin/${created.id}`,
    imageUrl: finalImageUrl,
  });

  log.info("Borrador creado", {
    accidentId: created.id,
    slug: created.slug,
    outlet: source.name,
    confidence: verification.confidenceScore,
    verification: verification.verificationStatus,
    rewritten,
    durationMs: elapsed(),
  });

  return {
    kind: "draft",
    accidentId: created.id,
    slug: created.slug,
    title: clean.title,
    confidenceScore: verification.confidenceScore,
    verificationStatus: verification.verificationStatus,
    rewritten,
    notified: true,
  };
}

/* -------------------------------------------------------------------------- */
/*  Auxiliares                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Crea un borrador minimo para poder fusionarlo.
 *
 * Se usa cuando el articulo resulta ser duplicado: se necesita un registro con
 * sus fuentes para traspasar esas fuentes a la noticia canonica. Se crea igual
 * como PENDING_REVIEW y se marca de inmediato como duplicado, de modo que no
 * aparece en el panel ni se puede publicar por error.
 */
async function ensureDuplicateDraft(params: {
  url: string; urlHash: string; title: string; body: string; summary: string;
  facts: ExtractedFacts; occurredAt: Date; verification: VerificationResult;
  source: IngestSource; occurredAtIso: string; municipalityName: string;
}): Promise<string> {
  const existing = await prisma.seenEntry.findUnique({
    where: { urlHash: params.urlHash },
    select: { accidentId: true },
  });
  if (existing?.accidentId) return existing.accidentId;

  const slug = await uniqueSlug(slugify(params.title), async (candidate) => {
    const found = await prisma.accident.findUnique({ where: { slug: candidate }, select: { id: true } });
    return found !== null;
  });

  const created = await prisma.accident.create({
    data: {
      slug,
      title: truncate(params.title, 200),
      summary: truncate(params.summary || params.body.slice(0, 400), 500),
      body: truncate(params.body || params.summary, 20000),
      occurredAt: params.occurredAt,
      municipality: { connect: { slug: params.facts.municipalitySlug ?? "arrecife" } },
      vehicleType: params.facts.vehicleType ?? "OTROS",
      severity: params.facts.severity ?? "MODERADO",
      category: params.facts.category ?? "ACCIDENTE_TRAFICO",
      status: "PENDING_REVIEW",
      origin: "AI",
      fatalities: params.facts.fatalities ?? 0,
      injuries: params.facts.injuries ?? 0,
      confidenceScore: params.verification.confidenceScore,
      sourceScore: params.verification.sourceScore,
      verificationStatus: params.verification.verificationStatus,
      originalTitle: params.title,
      originalUrl: params.url,
      contentHash: contentHashOf(params.title, params.body),
      simHash: simHash(`${params.title} ${params.body}`),
      sources: {
        create: [{
          outlet: params.source.name,
          url: params.url,
          publishedAt: new Date(),
          excerpt: truncate(params.summary, 2000),
        }],
      },
    },
    select: { id: true },
  });

  return created.id;
}

/** Registra la URL en SeenEntry para el control de altas y bajas. */
async function recordSeen(params: {
  url: string;
  urlHash: string;
  title: string;
  contentHash: string;
  state: "PRESENT" | "MISSING" | "REMOVED";
  sourceUrl: string;
  publishedAt?: Date | null;
  accidentId?: string;
}): Promise<void> {
  try {
    const existing = await prisma.seenEntry.findUnique({
      where: { urlHash: params.urlHash },
      select: { id: true },
    });

    if (existing) {
      await prisma.seenEntry.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          missingCount: 0,
          state: params.state,
          ...(params.title ? { title: params.title } : {}),
          ...(params.contentHash ? { contentHash: params.contentHash } : {}),
          ...(params.accidentId ? { accidentId: params.accidentId } : {}),
        },
      });
      return;
    }

    await prisma.seenEntry.create({
      data: {
        url: params.url,
        canonicalUrl: params.url,
        urlHash: params.urlHash,
        title: truncate(params.title, 300) || "(sin titular)",
        contentHash: params.contentHash || "sin-hash",
        state: params.state,
        publishedAt: params.publishedAt ?? null,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        accidentId: params.accidentId ?? null,
      },
    });
  } catch (err) {
    log.debug("No se pudo registrar la URL vista", { url: redact(params.url), ...serializeError(err) });
  }
}
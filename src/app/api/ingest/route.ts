import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { extractFacts, type IncidentCategory, type VehicleType, type AccidentSeverity } from "@/lib/facts";
import { verifyArticle, sourceScoreFor } from "@/lib/verify";
import { validateDate, parseSourceDate, resolveOccurredAt } from "@/lib/dates";
import { checkDuplicate, mergeIntoCanonical, urlHashOf } from "@/lib/dedupe";
import { embedArticle, rewriteArticle } from "@/lib/ai/rewrite";
import { processImage } from "@/lib/images";
import { sanitizeAccident, summarizeFindings } from "@/lib/privacy";
import { slugify, uniqueSlug } from "@/lib/slug";
import { perturbCoordinate } from "@/lib/ai/pipeline";
import { MUNICIPALITY_BY_SLUG } from "@/lib/constants";
import { monitorConfig, siteUrl, aiConfig } from "@/lib/env";
import { isAuthorized } from "@/lib/cron-auth";
import { notifyNewArticle } from "@/lib/notify";
import { contentHashOf, simHash, tidy, truncate } from "@/lib/text";
import { formatLocal } from "@/lib/dates";
import { log, serializeError, audit } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Este endpoint descarga el articulo, verifica, reescribe con IA y procesa la
 * imagen, asi que tarda bastante mas que una peticion normal. Sin esto, Vercel
 * lo cortaria a los 10 segundos por defecto del plan Hobby y el trabajo se
 * perderia a medias.
 */
export const maxDuration = 60;

/**
 * POST /api/ingest
 *
 * Punto de entrada para que un servicio externo (un script propio, un bot, un
 * panel de crisis) envie una noticia ya detectada. El sistema se encarga del
 * resto: verificacion, duplicados, reescritura, imagen y aviso.
 *
 * El cuerpo puede traer un articulo ya redactado o solo la URL. Si trae `url` y
 * no `title`, se descarga y se extrae aqui, igual que hace el monitor.
 *
 * GARANTIA: todo lo que entra por aqui se guarda como PENDING_REVIEW. No existe
 * ningun parametro del payload que permita publicarlo, ni siquiera por error.
 * El propio esquema no tiene campo de estado.
 *
 * Sin INGEST_WEBHOOK_SECRET devuelve 503: un despliegue mal configurado no
 * deja la via de escritura abierta.
 */

const sourceSchema = z.object({
  outlet: z.string().trim().min(1).max(120),
  url: z.string().url().max(600),
  publishedAt: z.string().trim().optional().nullable(),
  excerpt: z.string().trim().max(2000).optional().nullable(),
  baseScore: z.number().min(0).max(1).optional(),
});

const ingestSchema = z.object({
  title: z.string().trim().min(10).max(200).optional(),
  summary: z.string().trim().min(20).max(2000).optional(),
  body: z.string().trim().max(20000).optional(),
  url: z.string().url().max(600).optional(),
  municipalitySlug: z.string().trim().max(60).optional(),
  occurredAt: z.string().trim().optional(),
  imageUrl: z.string().url().max(600).optional().nullable(),
  imageAlt: z.string().trim().max(200).optional().nullable(),
  sources: z.array(sourceSchema).min(1, "Se requiere al menos una fuente verificable"),
  /** Peticion de reescritura con IA. Por defecto se reescribe si hay clave. */
  rewrite: z.boolean().optional(),
  /** No enviar notificacion. Util para importaciones en lote. */
  notify: z.boolean().optional(),
});

type IngestPayload = z.infer<typeof ingestSchema>;

/* -------------------------------------------------------------------------- */

// La autenticacion vive en src/lib/cron-auth.ts, compartida con el endpoint del
// cron: si las dos implementaciones difieren, una de las dos acaba siendo
// inconsistente con la otra.
function authorized(request: NextRequest, secret: string): boolean {
  return isAuthorized({
    authorization: request.headers.get("authorization"),
    searchSecret: request.nextUrl.searchParams.get("secret"),
    expected: secret,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = monitorConfig.cronSecret();

  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Ingesta deshabilitada. Define INGEST_WEBHOOK_SECRET (o CRON_SECRET) en el entorno para activarla.",
      },
      { status: 503 },
    );
  }

  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const payload = parsed.data;

  if (!payload.title && !payload.url) {
    return NextResponse.json(
      { error: "Indica al menos `title` o `url`." },
      { status: 400 },
    );
  }

  try {
    const result = await processIngest(payload);
    return NextResponse.json(result, { status: result.ok ? 201 : 200 });
  } catch (err) {
    log.error("Fallo la ingesta manual", serializeError(err));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error inesperado en la ingesta." },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */

type IngestResult = {
  ok: boolean;
  result: "created" | "merged" | "rejected";
  id?: string;
  slug?: string;
  reason?: string;
  verification?: { confidenceScore: number; sourceScore: number; verificationStatus: string };
  rewritten?: boolean;
  overlap?: number | null;
  notified?: boolean;
  notice?: string;
};

async function processIngest(payload: IngestPayload): Promise<IngestResult> {
  // --- Fuente principal ---
  const primarySource = payload.sources[0];

  // --- Descarga y extraccion si no viene redactado ---
  let title = payload.title ?? "";
  let body = payload.body ?? "";
  let summary = payload.summary ?? "";
  let imageUrl = payload.imageUrl ?? null;
  let imageAlt = payload.imageAlt ?? null;
  let articleDate: Date | null = null;

  if (payload.url && !payload.title) {
    const { safeFetch } = await import("@/lib/net");
    const { extractArticle } = await import("@/lib/extract");

    const page = await safeFetch(payload.url, { accept: "text/html,application/xhtml+xml" });
    if (!page.ok) {
      return { ok: false, result: "rejected", reason: `No se pudo descargar la URL: ${page.error}` };
    }

    const article = extractArticle(page.body, page.url);
    if (!article.title || article.title.length < 10) {
      return { ok: false, result: "rejected", reason: "La página no tiene un titular utilizable." };
    }

    title = article.title;
    body = article.body;
    summary = article.summary ?? article.excerpt ?? "";
    imageUrl = payload.imageUrl ?? article.imageUrl ?? null;
    imageAlt = payload.imageAlt ?? article.imageAlt ?? null;
    articleDate = article.publishedAt;
  }

  const fullText = body.length >= 200 ? body : summary;
  if (!title || fullText.length < 50) {
    return {
      ok: false,
      result: "rejected",
      reason: "Falta contenido: se necesita un titular y al menos 50 caracteres de texto.",
    };
  }

  // --- Hechos estructurados ---
  const facts = extractFacts(title, fullText);

  // El municipio puede venir forzado por quien llama: es un dato editorial, no
  // de seguridad, asi que se acepta. Aun asi se registra como nota de revision.
  const forcedMunicipality = payload.municipalitySlug ?? null;
  const municipalitySlug = forcedMunicipality ?? facts.municipalitySlug;

  /*
    Si quien llama fuerza el municipio, la zona detectada puede quedarse
    huérfana: un "Puerto del Carmen" forzado a Teguise ya no encaja. Se descarta,
    no se guarda a la fuerza.
  */
  const zoneSlug =
    facts.zoneSlug && facts.municipalitySlug === municipalitySlug ? facts.zoneSlug : null;

  if (forcedMunicipality && !MUNICIPALITY_BY_SLUG.has(forcedMunicipality)) {
    return {
      ok: false,
      result: "rejected",
      reason: `Municipio desconocido: ${forcedMunicipality}`,
    };
  }

  if (facts.outsideLanzarote && !forcedMunicipality) {
    return { ok: false, result: "rejected", reason: "El texto menciona otra isla." };
  }

  // --- Fechas ---
  const sourceDate = parseSourceDate(payload.occurredAt ?? articleDate?.toISOString() ?? primarySource.publishedAt ?? null, "utc");
  const dateVerdict = validateDate(sourceDate?.date ?? null, {
    maxAgeDays: monitorConfig.maxAgeDays(),
  });

  if (!dateVerdict.ok) {
    return {
      ok: false,
      result: "rejected",
      reason: dateVerdict.note ?? dateVerdict.problem ?? "Fecha no válida.",
    };
  }

  const occurredAt = resolveOccurredAt(
    sourceDate?.date ?? null,
    primarySource.publishedAt ? new Date(primarySource.publishedAt) : null,
    facts.timeOfDay,
    dateVerdict.corrected ?? new Date(),
  );

  // --- Verificacion ---
  const verification = verifyArticle({
    title,
    body: fullText,
    summary,
    date: sourceDate,
    facts: { ...facts, municipalitySlug },
    baseScore: primarySource.baseScore ?? 0.7,
    consecutiveFailures: 0,
    successRate: 0.8,
    maxAgeDays: monitorConfig.maxAgeDays(),
  });

  if (verification.autoReject) {
    return {
      ok: false,
      result: "rejected",
      reason: verification.notes.join(" ") || "Descartada por la verificación automática.",
    };
  }

  // --- Duplicados ---
  let embedding: number[] | null = null;
  if (aiConfig.enabled()) embedding = await embedArticle(title, fullText);

  const duplicate = await checkDuplicate({
    url: primarySource.url,
    title,
    body: fullText,
    occurredAt,
    embedding,
  });

  if (duplicate.isDuplicate && duplicate.canonicalId) {
    // En una ingesta manual no se crea una noticia provisional para fusionar:
    // lo correcto es añadir la fuente nueva a la noticia existente.
    const canonical = await prisma.accident.findUnique({
      where: { id: duplicate.canonicalId },
      select: { id: true, title: true, slug: true },
    });

    if (canonical) {
      const existingUrl = await prisma.source.findFirst({
        where: { accidentId: canonical.id, url: primarySource.url },
        select: { id: true },
      });

      if (!existingUrl) {
        await prisma.source.create({
          data: {
            accidentId: canonical.id,
            outlet: primarySource.outlet,
            url: primarySource.url,
            publishedAt: primarySource.publishedAt ? new Date(primarySource.publishedAt) : null,
            excerpt: primarySource.excerpt ?? null,
            mergedFromId: null,
          },
        });
        await prisma.accident.update({
          where: { id: canonical.id },
          data: { lastSeenAt: new Date() },
        });
      }

      await audit({
        actor: "API",
        action: "MERGE",
        entity: "accident",
        entityId: canonical.id,
        detail: { reason: duplicate.reason, source: primarySource.url },
      });

      return {
        ok: true,
        result: "merged",
        id: canonical.id,
        slug: canonical.slug,
        reason: duplicate.reason,
        verification: {
          confidenceScore: verification.confidenceScore,
          sourceScore: verification.sourceScore,
          verificationStatus: verification.verificationStatus,
        },
        notice: `Se ha añadido como fuente a una noticia ya existente: «${canonical.title}».`,
      };
    }
  }

  // --- Reescritura ---
  const municipalityName = municipalitySlug
    ? (MUNICIPALITY_BY_SLUG.get(municipalitySlug)?.name ?? municipalitySlug)
    : "Lanzarote";

  const wantRewrite = payload.rewrite ?? aiConfig.enabled();

  let finalTitle = title;
  let finalSummary = truncate(tidy(fullText).slice(0, 480), 480);
  let finalBody = tidy(fullText);
  let seoTitle: string | null = null;
  let metaDescription: string | null = null;
  let excerpt: string | null = null;
  let aiModel: string | null = null;
  let overlap: number | null = null;
  let rewritten = false;

  if (wantRewrite && aiConfig.enabled()) {
    const rewrite = await rewriteArticle({
      title, body: fullText, summary, facts,
      municipalityName,
      occurredAtIso: formatLocal(occurredAt),
      outlet: primarySource.outlet,
      sourceUrl: primarySource.url,
    });

    if (rewrite.ok) {
      finalTitle = rewrite.title!;
      finalSummary = rewrite.summary!;
      finalBody = rewrite.body!;
      seoTitle = rewrite.seoTitle;
      metaDescription = rewrite.metaDescription;
      excerpt = rewrite.excerpt;
      aiModel = rewrite.model;
      overlap = rewrite.overlap;
      rewritten = true;
    } else {
      log.warn("Ingesta manual: la reescritura ha fallado", { error: rewrite.error });
    }
  }

  // --- Privacidad ---
  const { data: clean, findings } = sanitizeAccident({
    title: finalTitle,
    summary: finalSummary,
    body: finalBody,
    locationDescription: facts.road ? `Carretera ${facts.road}` : null,
  });
  const privacyNote = summarizeFindings(findings);

  // --- Slug ---
  const slug = await uniqueSlug(slugify(clean.title), async (candidate) => {
    const found = await prisma.accident.findUnique({ where: { slug: candidate }, select: { id: true } });
    return found !== null;
  });

  // --- Ubicacion aproximada ---
  const base = municipalitySlug ? MUNICIPALITY_BY_SLUG.get(municipalitySlug) : undefined;
  const approx = perturbCoordinate(base ? { lat: base.lat, lon: base.lon } : { lat: 29.0, lon: -13.63 });

  const editorNotes = [
    "Enviada mediante POST /api/ingest.",
    forcedMunicipality ? `Municipio indicado por quien la envió: ${forcedMunicipality}.` : null,
    rewritten ? null : "No se ha reescrito con IA: el texto es el recibido.",
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
      municipality: { connect: { slug: municipalitySlug ?? "arrecife" } },
      zone: zoneSlug,
      vehicleType: (facts.vehicleType ?? "OTROS") as VehicleType,
      severity: (facts.severity ?? "MODERADO") as AccidentSeverity,
      category: (facts.category ?? "OTRO") as IncidentCategory,
      road: facts.road,
      // Punto innegociable.
      status: "PENDING_REVIEW",
      origin: "AI",
      fatalities: facts.fatalities ?? 0,
      injuries: facts.injuries ?? 0,
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
      originalUrl: payload.url ?? primarySource.url,
      aiModel,
      rewrittenAt: rewritten ? new Date() : null,
      reviewNotes: editorNotes || null,
      sources: {
        create: payload.sources.map((s) => ({
          outlet: s.outlet,
          url: s.url,
          publishedAt: s.publishedAt ? new Date(s.publishedAt) : null,
          excerpt: s.excerpt ?? null,
        })),
      },
    },
    select: { id: true, slug: true, status: true },
  });

  if (created.status !== "PENDING_REVIEW") {
    throw new Error("Invariante rota: la ingesta manual creó la noticia con otro estado.");
  }

  // Registro de las URLs vistas.
  for (const s of payload.sources) {
    try {
      const urlHash = urlHashOf(s.url);
      const seen = await prisma.seenEntry.findUnique({ where: { urlHash }, select: { id: true } });
      if (seen) {
        await prisma.seenEntry.update({
          where: { id: seen.id },
          data: { lastSeenAt: new Date(), missingCount: 0, state: "PRESENT", accidentId: created.id },
        });
      } else {
        await prisma.seenEntry.create({
          data: {
            url: s.url,
            canonicalUrl: s.url,
            urlHash,
            title: truncate(clean.title, 300),
            contentHash: contentHashOf(title, fullText),
            state: "PRESENT",
            accidentId: created.id,
          },
        });
      }
    } catch {
      /* no es critico */
    }
  }

  // --- Imagen ---
  if (imageUrl) {
    const processed = await processImage({ accidentId: created.id, url: imageUrl, alt: clean.title });
    const finalImage = processed.ok && processed.heroPath ? processed.heroPath : imageUrl;
    await prisma.accident.update({
      where: { id: created.id },
      data: { imageUrl: finalImage, imageAlt: imageAlt ?? clean.title },
    });
  }

  await prisma.revision.create({
    data: {
      accidentId: created.id,
      editor: "api",
      note: rewritten ? "Enviada por API y reescrita con IA" : "Enviada por API sin reescritura",
      snapshot: JSON.stringify({
        title: clean.title, status: "PENDING_REVIEW", origin: "AI",
        confidenceScore: verification.confidenceScore, aiModel, overlap,
        capturedAt: new Date().toISOString(),
      }),
    },
  });

  await audit({
    actor: "API",
    action: "INGEST",
    entity: "accident",
    entityId: created.id,
    detail: { sources: payload.sources.length, rewritten, confidence: verification.confidenceScore },
  });

  // --- Notificacion ---
  let notified = false;
  if (payload.notify !== false) {
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
      sourceUrl: payload.url ?? primarySource.url,
      sourceOutlet: primarySource.outlet,
      reviewUrl: `${siteUrl()}/admin/${created.id}`,
      imageUrl,
    });
    notified = true;
  }

  return {
    ok: true,
    result: "created",
    id: created.id,
    slug: created.slug,
    verification: {
      confidenceScore: verification.confidenceScore,
      sourceScore: verification.sourceScore,
      verificationStatus: verification.verificationStatus,
    },
    rewritten,
    overlap,
    notified,
    notice: "Guardada como PENDING_REVIEW. Requiere aprobación manual en /admin.",
  };
}

/** Documentacion del endpoint. */
export async function GET(): Promise<NextResponse> {
  const secret = monitorConfig.cronSecret();
  return NextResponse.json({
    endpoint: "POST /api/ingest",
    enabled: Boolean(secret),
    auth: "Authorization: Bearer <INGEST_WEBHOOK_SECRET>",
    guarantees: [
      "Todo lo recibido se guarda como PENDING_REVIEW. El esquema no tiene campo de estado.",
      "Si se detecta que la noticia ya existe, la fuente se añade a la existente en lugar de crear otra.",
      "Se eliminan matrículas, teléfonos, documentos y correos antes de guardar.",
      "La reescritura con IA se comprueba: se rechaza si copia más de un 12 % del original o pierde cifras.",
    ],
    payload: {
      title: "opcional si se envía `url`. 10-200 caracteres",
      summary: "opcional. 20-2000 caracteres",
      body: "opcional. Hasta 20000 caracteres",
      url: "opcional. Si se envía sin `title`, se descarga y extrae",
      municipalitySlug: "opcional. Fuerza el municipio; debe existir en el catálogo",
      occurredAt: "opcional. ISO 8601 o el formato de los medios",
      imageUrl: "opcional",
      sources: "OBLIGATORIO. [{ outlet, url, publishedAt?, excerpt? }] mínimo 1",
      rewrite: "opcional. Por defecto se reescribe si hay OPENROUTER_API_KEY",
      notify: "opcional. false para importaciones en lote",
    },
  });
}
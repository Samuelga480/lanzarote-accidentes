/**
 * Deteccion y fusion de duplicados.
 *
 * El caso que hay que resolver: La Voz de Lanzarote y Lanzarote Ahora cuentan
 * el mismo accidente de la LZ-2. Titulares distintos, redactores distintos,
 * incluso cifras de heridos redactadas de forma diferente. El resultado
 * wanted es UNA noticia con DOS fuentes, no dos noticias.
 *
 * Se buscan candidatos en este orden, del mas barato al mas caro:
 *
 *   1. urlHash  identico      -> es literalmente el mismo articulo
 *   2. contentHash identico   -> mismo texto, distinto titular
 *   3. SimHash + titulo       -> mismo suceso, otra redaccion
 *   4. Embeddings             -> mismo suceso, otro enfoque
 *
 * La busqueda se acota a una ventana temporal: dos articulos con el mismo texto
 * separados por tres meses no son el mismo suceso, es una repeticion. Y todos
 * los candidatos se confirman contra una coincidencia deTIEMPO, no solo de texto:
 * dos accidentes de moto en Tias pueden parecerse mucho y no ser el mismo.
 */

import { prisma } from "@/lib/prisma";
import {
  contentHashOf, simHash, sha256, hammingDistance, jaccard, tokenize,
  cosine, parseEmbedding, normalizeText,
} from "@/lib/text";
import { dedupeConfig } from "@/lib/env";
import type { Prisma } from "@prisma/client";

export type DuplicateCandidate = {
  accidentId: string;
  slug: string;
  title: string;
  /** Como se ha detectado. */
  reason: "url" | "contenido" | "simhash" | "titulo" | "semantico";
  /** 0..1 */
  similarity: number;
  happenedAt: Date;
};

export type DedupeVerdict = {
  isDuplicate: boolean;
  /** La noticia canonica a la que debe fusionarse, si la hay. */
  canonicalId: string | null;
  similarity: number;
  reason: string;
};

/** Hash de URL, la clave de deduplicacion mas barata que existe. */
export function urlHashOf(url: string): string {
  return sha256(normalizeUrl(url));
}

/**
 * Normaliza una URL para que dos enlaces al mismo articulo colisionen.
 * Sin esto, `.../noticia?utm_source=twitter` y `.../noticia` son dos entradas.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const TRACKING = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "utm_id", "gclid", "fbclid", "mc_cid", "mc_eid", "ref", "amp",
      "amp", "output", "ito", "ns_campaign", "ns_mchannel", "ns_source",
    ];
    for (const k of TRACKING) u.searchParams.delete(k);
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./, "").toLowerCase();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
      u.port = "";
    }
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/* -------------------------------------------------------------------------- */
/*  Consulta de candidatos                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Candidatos a duplicado: noticias con entstando dentro de la ventana temporal.
 * No se filtran por estado a proposito: una noticia rechazada por duplicada
 * sigue siendo el mismo suceso, y si vuelve a salir de otra fuente conviene
 * fusionar en la buena.
 */
async function findCandidates(occurredAt: Date): Promise<
  Array<{
    id: string; slug: string; title: string; occurredAt: Date;
    contentHash: string | null; simHash: string | null; embedding: string | null;
  }>
> {
  const windowHours = dedupeConfig.windowHours();
  const from = new Date(occurredAt.getTime() - windowHours * 3_600_000);
  const to = new Date(occurredAt.getTime() + windowHours * 3_600_000);

  return prisma.accident.findMany({
    where: {
      occurredAt: { gte: from, lte: to },
      duplicateOfId: null, // no encadenar duplicados de duplicados
    },
    select: {
      id: true, slug: true, title: true, occurredAt: true,
      contentHash: true, simHash: true, embedding: true,
    },
    // Solo los 60 mas recientes: suficiente para la ventana y acotado.
    orderBy: { occurredAt: "desc" },
    take: 60,
  });
}

/* -------------------------------------------------------------------------- */
/*  Evaluacion                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Decide si un articulo es duplicado de uno ya guardado.
 *
 * Devuelve la razon para poder explicarsela al editor: no basta con "es
 * duplicado", conviene saber si coincidio por URL, por texto o por sentido.
 */
export async function checkDuplicate(params: {
  url: string;
  title: string;
  body: string;
  occurredAt: Date;
  embedding?: number[] | null;
  excludeId?: string;
}): Promise<DedupeVerdict> {
  const candidates = await findCandidates(params.occurredAt);
  if (candidates.length === 0) {
    return { isDuplicate: false, canonicalId: null, similarity: 0, reason: "Sin candidatos en la ventana temporal." };
  }

  const incomingUrl = normalizeUrl(params.url);
  const incomingHash = contentHashOf(params.title, params.body);
  const incomingSim = simHash(`${params.title} ${params.body}`);
  const incomingTokens = tokenize(params.title);

  let best: DuplicateCandidate | null = null;

  for (const c of candidates) {
    if (params.excludeId && c.id === params.excludeId) continue;

    // --- Nivel 1: URL ---
    // Se consulta la fuente guardada en lugar de un campo de URL en Accident,
    // porque la URL vive en la tabla Source.
    const sameUrl = await prisma.source.findFirst({
      where: { accidentId: c.id, url: { in: [params.url, incomingUrl] } },
      select: { id: true },
    });
    if (sameUrl) {
      if (!best || best.similarity < 1) {
        best = { accidentId: c.id, slug: c.slug, title: c.title, reason: "url", similarity: 1, happenedAt: c.occurredAt };
      }
      continue;
    }

    // --- Nivel 2: hash de contenido ---
    if (c.contentHash && c.contentHash === incomingHash) {
      if (!best || best.similarity < 0.99) {
        best = { accidentId: c.id, slug: c.slug, title: c.title, reason: "contenido", similarity: 0.99, happenedAt: c.occurredAt };
      }
      continue;
    }

    // --- Nivel 3: SimHash del cuerpo + similitud de titular ---
    const simDistance = c.simHash ? hammingDistance(c.simHash, incomingSim) : 64;
    const simScore = 1 - simDistance / 64;
    const titleScore = jaccard(tokenize(c.title), incomingTokens);

    // El SimHash solo cuenta si el titular se parece: dos articulos con el
    // mismo cuerpo generico ("Los bomberos extinuen el incendio") no son el
    // mismo suceso aunque coincidan mucho.
    const combined = simScore * 0.6 + titleScore * 0.4;

    const simPasses = simDistance <= dedupeConfig.simHashDistance() && titleScore >= dedupeConfig.titleThreshold();
    const titlePasses = titleScore >= 0.95;

    if (simPasses || titlePasses) {
      if (!best || best.similarity < combined) {
        best = {
          accidentId: c.id, slug: c.slug, title: c.title,
          reason: simPasses ? "simhash" : "titulo",
          similarity: combined,
          happenedAt: c.occurredAt,
        };
      }
      continue;
    }

    // --- Nivel 4: embeddings ---
    if (params.embedding && params.embedding.length > 0) {
      const other = parseEmbedding(c.embedding);
      if (other && other.length === params.embedding.length) {
        const cos = cosine(params.embedding, other);
        if (cos >= dedupeConfig.semanticThreshold() && (!best || best.similarity < cos)) {
          best = {
            accidentId: c.id, slug: c.slug, title: c.title,
            reason: "semantico", similarity: cos, happenedAt: c.occurredAt,
          };
        }
      }
    }
  }

  if (!best) {
    return { isDuplicate: false, canonicalId: null, similarity: 0, reason: "Ningun candidato coincide." };
  }

  return {
    isDuplicate: true,
    canonicalId: best.accidentId,
    similarity: Math.round(best.similarity * 1000) / 1000,
    reason: describeReason(best.reason, best.similarity),
  };
}

function describeReason(reason: DuplicateCandidate["reason"], similarity: number): string {
  const pct = (similarity * 100).toFixed(0);
  switch (reason) {
    case "url": return "Misma URL que una noticia ya guardada.";
    case "contenido": return "Texto identico a otra noticia.";
    case "simhash": return `Suceso equivalente (similitud ${pct} % en contenido y titular).`;
    case "titulo": return `Titular practicamente identico (${pct} %).`;
    case "semantico": return `Mismo suceso con otro enfoque (similitud semantica ${pct} %).`;
  }
}

/* -------------------------------------------------------------------------- */
/*  Fusion                                                                     */
/* -------------------------------------------------------------------------- */

export type MergeResult = {
  merged: boolean;
  canonicalId: string | null;
  sourcesAdded: number;
  error?: string;
};

/**
 * Fusiona una noticia duplicada en su canonica.
 *
 * Al fusionar NO se borra la noticia duplicada: se marca con `duplicateOfId`
 * y se le quitan las fuentes, que se traspasan a la canonica. Se conserva asi
 * la trazabilidad: se puede ver de donde salio cada fuente, y si la canonica se
 * borrara por error, la duplicada sigue ahI con su historial.
 */
export async function mergeIntoCanonical(params: {
  duplicateId: string;
  canonicalId: string;
}): Promise<MergeResult> {
  const { duplicateId, canonicalId } = params;

  if (duplicateId === canonicalId) {
    return { merged: false, canonicalId, sourcesAdded: 0, error: "La noticia es la misma." };
  }

  try {
    const duplicate = await prisma.accident.findUnique({
      where: { id: duplicateId },
      include: { sources: true },
    });
    const canonical = await prisma.accident.findUnique({
      where: { id: canonicalId },
      select: { id: true, sources: true, fatalities: true, injuries: true },
    });

    if (!duplicate || !canonical) {
      return { merged: false, canonicalId, sourcesAdded: 0, error: "No se encontro alguna de las dos noticias." };
    }

    const existingUrls = new Set(canonical.sources.map((s) => s.url));

    await prisma.$transaction(async (tx) => {
      // 1. Anadir las fuentes que aun no estaban. `skipDuplicates` evita el
      //    error cuando la misma URL aparece en las dos noticias.
      const newSources = duplicate.sources.filter((s) => !existingUrls.has(s.url));
      if (newSources.length > 0) {
        await tx.source.createMany({
          data: newSources.map((s) => ({
            accidentId: canonicalId,
            outlet: s.outlet,
            url: s.url,
            publishedAt: s.publishedAt,
            excerpt: s.excerpt,
            mergedFromId: duplicateId,
          })),
          skipDuplicates: true,
        });
      }

      // 2. Reconciliar las cifras: se toma el maximo conocido, no la media.
      //    Es lo mas conservador para una cifra de heridos o fallecidos.
      const fatalities = Math.max(canonical.fatalities, duplicate.fatalities);
      const injuries = Math.max(canonical.injuries, duplicate.injuries);

      await tx.accident.update({
        where: { id: canonicalId },
        data: {
          fatalities,
          injuries,
          // La noticia canonica se marca comoHaving mas fuentes.
          lastSeenAt: new Date(),
        },
      });

      // 3. Marcar la duplicada. No se borra.
      await tx.accident.update({
        where: { id: duplicateId },
        data: { duplicateOfId: canonicalId },
      });
    });

    return {
      merged: true,
      canonicalId,
      sourcesAdded: duplicate.sources.filter((s) => !existingUrls.has(s.url)).length,
    };
  } catch (err) {
    return {
      merged: false,
      canonicalId,
      sourcesAdded: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Consulta directa                                                          */
/* -------------------------------------------------------------------------- */

/** ¿Esta URL concreta ya se ha visto alguna vez? */
export async function urlAlreadySeen(url: string): Promise<boolean> {
  const hash = urlHashOf(url);
  const found = await prisma.seenEntry.findUnique({
    where: { urlHash: hash },
    select: { id: true },
  });
  return found !== null;
}

/** Noticias marcadas como duplicadas, para el panel. */
export async function findDuplicateClusters(
  take = 20,
): Promise<
  Array<{
    id: string;
    title: string;
    slug: string;
    duplicateOfId: string | null;
    sourceCount: number;
  }>
> {
  const rows = await prisma.accident.findMany({
    where: { OR: [{ duplicateOfId: { not: null } }, { sources: { some: {} } }] },
    select: {
      id: true, title: true, slug: true, duplicateOfId: true,
      _count: { select: { sources: true } },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });

  // Prisma devuelve el recuento en `_count`; se renombra para que el consumidor
  // no tenga que conocer la forma interna de la consulta.
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    duplicateOfId: r.duplicateOfId,
    sourceCount: r._count.sources,
  }));
}

/** Candidatos a duplicado para el panel, sin modificar nada. */
export async function findSimilar(
  id: string,
): Promise<Array<{ id: string; title: string; similarity: number; reason: string }>> {
  const acc = await prisma.accident.findUnique({
    where: { id },
    select: { title: true, body: true, occurredAt: true, contentHash: true, simHash: true, embedding: true },
  });
  if (!acc) return [];

  const candidates = await findCandidates(acc.occurredAt);
  const incomingHash = acc.contentHash ?? contentHashOf(acc.title, acc.body);
  const incomingSim = acc.simHash ?? simHash(`${acc.title} ${acc.body}`);
  const incomingTokens = tokenize(acc.title);
  const embedding = parseEmbedding(acc.embedding);

  const out: Array<{ id: string; title: string; similarity: number; reason: string }> = [];

  for (const c of candidates) {
    if (c.id === id) continue;

    let similarity = 0;
    let reason = "";

    if (c.contentHash && c.contentHash === incomingHash) {
      similarity = 0.99;
      reason = "contenido";
    } else {
      const simScore = c.simHash ? 1 - hammingDistance(c.simHash, incomingSim) / 64 : 0;
      const titleScore = jaccard(tokenize(c.title), incomingTokens);
      similarity = simScore * 0.6 + titleScore * 0.4;
      reason = simScore >= titleScore ? "simhash" : "titulo";
    }

    if (similarity >= 0.8) {
      out.push({
        id: c.id,
        title: c.title,
        similarity: Math.round(similarity * 1000) / 1000,
        reason,
      });
    }
  }

  return out.sort((a, b) => b.similarity - a.similarity);
}

/** Filtro SQL para acortar la ventana en consultas del panel. */
export function duplicateFilter(): Prisma.AccidentWhereInput {
  return { duplicateOfId: null };
}
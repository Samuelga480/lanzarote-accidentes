/**
 * Ingesta de un articulo concreto: de una URL a un borrador en revision.
 *
 * ---------------------------------------------------------------------------
 *  INVARIANTE: LO QUE SE CREA ES SIEMPRE UN BORRADOR
 * ---------------------------------------------------------------------------
 *
 * Lo que este modulo CREA va siempre con status PENDING_REVIEW y origin AI, y hay
 * una comprobacion en tiempo de ejecucion que rompe en voz alta si alguna vez no
 * (`created.status !== "PENDING_REVIEW"`). El unico sitio por el que se publica
 * es `changeStatus()` en `src/lib/admin.ts`.
 *
 * La excepcion es deliberada y esta al final del flujo: si `AUTO_PUBLISH` esta
 * encendido, un borrador recien creado puede pasarse a PUBLISHED en el paso 9. No
 * es una puerta trasera: tambien pasa por `changeStatus()`, asi que sus bloqueos
 * (duplicadas, archivadas) siguen valiendo, y queda en el historial como una
 * operacion mas. Apagado, ese paso no hace nada.
 *
 * ---------------------------------------------------------------------------
 *  EL ORDEN DE LOS PASOS IMPORTA Y NO ES ARBITRARIO
 * ---------------------------------------------------------------------------
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
 *   9. Publicar sin revision, SOLO si AUTO_PUBLISH esta encendido y el borrador
 *      pasa el liston de `lib/auto-publicar.ts`.
 *  10. Notificar al administrador.
 */

import { prisma } from "@/lib/prisma";
import { safeFetch } from "@/lib/net";
import { extractArticle } from "@/lib/extract";
import { extractFacts, relevanceScore, type ExtractedFacts } from "@/lib/facts";
import { evaluaAccidenteTrafico, evaluaIsla } from "@/lib/traffic-gate";
import { parseSourceDate, resolveOccurredAt, validateDate, localDayKey } from "@/lib/dates";
import { verifyArticle, type VerificationResult } from "@/lib/verify";
import {
  detectaErrores,
  erroresEnTexto,
  erroresParaElPrompt,
  resumenDeErrores,
  type EditorialError,
} from "@/lib/errores";
import { checkDuplicate, urlHashOf, mergeIntoCanonical } from "@/lib/dedupe";
import { rewriteArticle, embedArticle } from "@/lib/ai/rewrite";
import { rewriteByRules } from "@/lib/ai/rewrite-rules";
import { aiConfig, monitorConfig, siteUrl } from "@/lib/env";
import { processImage } from "@/lib/images";
import { imageConfig } from "@/lib/env";
import { sanitizeAccident, summarizeFindings } from "@/lib/privacy";
import { slugify, uniqueSlug } from "@/lib/slug";
import { puntoAproximado } from "@/lib/map-point";
import { MUNICIPALITY_BY_SLUG } from "@/lib/constants";
import { notifyNewArticle } from "@/lib/notify";
import { changeStatus } from "@/lib/admin";
import {
  decidirAutoPublicacion,
  puedeIntentarAutoPublicar,
  palabras,
} from "@/lib/auto-publicar";
import { resolveCategory } from "@/lib/resolve-category";
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
  | { kind: "draft"; accidentId: string; slug: string; title: string; confidenceScore: number; verificationStatus: string; rewritten: boolean; publicadaAutomaticamente?: boolean; notified: boolean }
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

  // --- 3. Alcance del sitio: ¿es de Lanzarote? ---
  /*
    ESTE ES AHORA EL UNICO FILTRO DURO DE LA INGESTA.

    Antes habia dos mas. Uno era la puerta de trafico, que exigia suceso +
    vehiculo o via; el otro, un corte de relevancia por vocabulario de
    accidentes ("colision", "atropello", "112"...). Los dos descartaban
    exactamente lo que este sitio ahora quiere recoger: una noticia de deporte,
    de cultura o de una decision del Cabildo sobre Lanzarote puntuaba cero y se
    perdia. El sitio paso a ser de cualquier noticia de la isla, asi que la
    condicion es que sea de Lanzarote.

    `outsideLanzarote` no alcanza por si solo: mira si el articulo nombra OTRAS
    ISLAS, y una noticia de guardia en Pontevedra no nombra ninguna. Por eso se
    exige ademas una mencion positiva de Lanzarote.

    Aflojar el filtro automatico es aceptable porque TODO lo que entra sigue
    siendo un borrador y necesita aprobacion humana en el panel. El coste de que
    llegue de mas es que el editor descarte; el de seguir descartando por
    palabras seria que la noticia nunca llegue a existir.
  */
  const facts: ExtractedFacts = extractFacts(title, fullText);

  const isla = evaluaIsla(title, fullText);
  if (!isla.deLanzarote || facts.outsideLanzarote) {
    await recordSeen({
      url: page.url, urlHash, title, contentHash: contentHashOf(title, fullText),
      state: "PRESENT", sourceUrl: source.url,
    });
    const motivo = facts.outsideLanzarote
      ? "El articulo menciona otra isla."
      : `No es de Lanzarote: ${isla.motivo}.`;
    log.debug("Descartado por no ser de la isla", { title, motivo });
    return { kind: "rejected", reason: motivo };
  }

  /*
    La puerta de trafico no se borra: pasa a CLASIFICAR. Dice si la noticia es un
    suceso con vehiculo, y eso alimenta el tipo de noticia y la nota que ve el
    editor, pero ya no decide si entra.

    La relevancia tampoco descarta. Sigue midiendo, y de hecho una noticia que no
    habla de accidentes sale con puntuacion baja: es informacion util para el
    editor, que es quien decide.
  */
  const trafico = evaluaAccidenteTrafico(title, fullText);
  const relevance = relevanceScore(title, fullText);
  log.debug("Clasificado", {
    title,
    esSuceso: trafico.esAccidente,
    motivo: trafico.motivo,
    relevancia: Math.round(relevance * 100),
  });

  // Sin municipio no se descarta: puede ser una carretera insular que el medio no
  // situa por nombre, o una noticia sobre la isla en general. Quedara como
  // pendiente y el editor lo situa. Lo que no se hace es inventarle un municipio.
  if (!facts.municipalitySlug) {
    log.debug("Articulo de la isla sin municipio identificable", { title });
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
    const draftId = await ensureDuplicateDraft({
      url: page.url, urlHash, title, body: fullText, summary, facts,
      occurredAt, verification, source, occurredAtIso: occurredAt.toISOString(),
      municipalityName: facts.municipalitySlug ?? "sin municipio",
    });

    const merge = await mergeIntoCanonical({
      duplicateId: draftId,
      canonicalId: duplicate.canonicalId,
    });

    /*
      Si la fusion falla, el borrador que se acaba de crear se queda
      PENDING_REVIEW y SIN marcar como duplicado: en el panel es indistinguible
      de una noticia nueva y el editor puede aprobarlo, con lo que el mismo
      suceso acaba publicado dos veces. Antes este `merge` no se comprobaba.

      Marcarlo aqui es la compensacion: aunque no se hayan traspasado las
      fuentes, la noticia queda descartada y enlazada a la canonica, que es
      justamente lo que impide que se publique. La fuente se reintentara en la
      siguiente pasada, cuando `checkDuplicate` vuelva a encontrarla.
    */
    if (!merge.merged && draftId !== duplicate.canonicalId) {
      await prisma.accident.updateMany({
        where: { id: draftId, duplicateOfId: null },
        data: {
          duplicateOfId: duplicate.canonicalId,
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedBy: "dedupe",
          isFeatured: false,
          reviewNotes: `Fusion fallida (${merge.error ?? "motivo desconocido"}): descartada para no duplicar la noticia canonica.`,
        },
      });

      log.warn("La fusion de la duplicada fallo; el borrador queda descartado", {
        duplicateId: draftId,
        canonicalId: duplicate.canonicalId,
        error: merge.error,
      });
    }

    await recordSeen({
      url: page.url, urlHash, title, contentHash: contentHashOf(title, fullText),
      state: "PRESENT", sourceUrl: source.url, publishedAt: article.publishedAt,
      accidentId: duplicate.canonicalId,
    });

    log.info("Noticia duplicada, fuente fusionada", {
      canonicalId: duplicate.canonicalId,
      sourcesAdded: merge.sourcesAdded,
      merged: merge.merged,
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

  // Primero la IA, si hay llave. Sin ella, o si falla, se redacta por reglas:
  // un texto propio construido con los datos extraidos es siempre mejor que
  // copiar el del medio, y no depende de ninguna cuenta ni de ser mayor de edad.
  /*
   * La categoria ya resuelta y los errores que se han detectado en el texto.
   *
   * Van aqui, antes de redactar, por dos razones. La primera es que el redactor
   * tiene que recibirlos: si no, solo ve un titulo que dice ACCIDENTE_TRAFICO y da
   * forma a un texto que no habla de ningun accidente. La segunda es que se
   * calculan sobre el texto ORIGINAL y no sobre el ya limpiado. Los fallos que se
   * buscan estan en lo que publico el medio; si se mirase despues, retocar el texto
   * los taparia y el aviso se perderia.
   *
   * municipalityUncertain todavia no existe aqui, asi que se comprueba el slug: si
   * es null, el municipio es el valor por defecto que se pone para el mapa.
   */
  const category = resolveCategory(facts.category, title, summary, fullText);

  const erroresEditoriales: EditorialError[] = detectaErrores({
    title,
    summary,
    body: fullText,
    category,
    categoryDetectada: facts.category,
    municipalitySlug,
    municipalityDelTexto: municipalitySlug !== null,
    occurredAt,
    sourceScore: verification.sourceScore,
    gravedad: facts.severity,
    vehicleType: facts.vehicleType,
  });

  // Al redactor solo le llegan los graves y los avisos: las notas no son nada que
  // el pueda arreglar y solo cargan el prompt.
  const erroresParaRedactor = erroresParaElPrompt(erroresEditoriales);

  const peticion = {
    title,
    body: fullText,
    summary,
    facts,
    municipalityName,
    occurredAtIso: occurredAt.toISOString(),
    outlet: source.name,
    sourceUrl: url,
    errores: erroresParaRedactor,
  };

  const rewrite = aiConfig.enabled()
    ? await rewriteArticle(peticion)
    : { ok: false as const, error: "OPENROUTER_API_KEY no esta definido.", overlap: null };

  if (!rewrite.ok) {
    /*
      Camino de reserva: reglas. SOLO para articulos que son realmente un
      suceso.

      El redactor por reglas no resume: construye la noticia con los datos
      extraidos (suceso, vehiculo, heridos) y siempre la redacta como
      accidente. Cuando el sitio solo recogia accidentes eso era justo lo que
      tocaba, pero ahora entra cualquier noticia de la isla: aplicarlo a una de
      deporte o de una decision del Cabildo fabrificaba un accidente que no ha
      ocurrido, con su titular, su resumen y su cuerpo. Eso es peor que no
      reescribir nada.

      Asi que, si el articulo no es un suceso, se conserva el texto original
      tal como lo publico el medio. El editor lo ve en el panel y decide.
    */
    const esSuceso = trafico.esAccidente || (facts.category !== null && facts.category !== "OTRO");

    if (esSuceso) {
      const porReglas = rewriteByRules(peticion);

      if (porReglas.ok) {
        finalTitle = porReglas.title;
        finalSummary = porReglas.summary;
        finalBody = porReglas.body;
        seoTitle = porReglas.seoTitle;
        metaDescription = porReglas.metaDescription;
        excerpt = porReglas.excerpt;
        aiModel = null;
        rewritten = true;
        log.info("Noticia redactada por reglas", {
          motivo: rewrite.error,
          title: truncate(finalTitle, 80),
        });
      } else {
        // Ultimo recurso: el texto tal cual. El editor lo vera en el panel y
        // decidira si se publica.
        log.warn("No se pudo reescribir la noticia; se guarda el texto original", {
          title: truncate(title, 80),
          error: porReglas.error,
        });
      }
    } else {
      log.info("No es un suceso: se conserva el texto original del medio", {
        title: truncate(title, 80),
        motivo: rewrite.error,
      });
    }
  } else {
    finalTitle = rewrite.title;
    finalSummary = rewrite.summary;
    finalBody = rewrite.body;
    seoTitle = rewrite.seoTitle;
    metaDescription = rewrite.metaDescription;
    excerpt = rewrite.excerpt;
    aiModel = rewrite.model;
    rewritten = true;
  }

  // --- Privacidad: ultima barrera antes de la base de datos ---
  const { data: clean, findings } = sanitizeAccident({
    title: finalTitle,
    summary: finalSummary,
    body: finalBody,
    locationDescription: facts.road ? `Carretera ${facts.road}` : null,
  });
  const privacyNote = summarizeFindings(findings);

  /*
    La zona solo se guarda si de verdad pertenece al municipio detectado. Si el
    texto nombra una localidad que no encaja, se descarta en vez de forzar el
    almacenado: un dato editorial equivocado es peor que no tener dato.
  */
  const zone =
    facts.zoneSlug && facts.municipalitySlug === municipalitySlug ? facts.zoneSlug : null;

  // --- Ubicacion aproximada ---
  /*
    Sin punto de reserva. Antes, si no habia municipio, se colocaba el marcador en
    un punto fijo (29.0, -13.63), que esta en el norte de la isla, mientras que en
    la base de datos se guardaba Arrecife, en el sur. El marcador acababa a 60 km
    del nombre que llevaba al lado. Si no se sabe donde, no se pinta nada.
  */

  const approx = puntoAproximado(municipalitySlug, zone);

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
    erroresEditoriales.length > 0
      ? `Errores detectados al redactar (${resumenDeErrores(erroresEditoriales)}):`
      : null,
    ...erroresEnTexto(erroresEditoriales).split("\n"),
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
      zone,
      vehicleType: facts.vehicleType ?? "OTROS",
      severity: facts.severity ?? "MODERADO",
      category,
      road: facts.road,

      status: "PENDING_REVIEW",
      origin: "AI",
      fatalities: facts.fatalities ?? 0,
      injuries: facts.injuries ?? 0,
      isFeatured: false,

      approxLat: approx?.lat ?? null,
      approxLon: approx?.lon ?? null,
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
  let processedLocally = false;
  if (imageUrl) {
    const processed = await processImage({
      accidentId: created.id,
      url: imageUrl,
      alt: clean.title,
      kind: "HERO",
    });
    if (processed.ok && processed.heroPath) {
      finalImageUrl = processed.heroPath;
      // En modo "external" processImage devuelve la URL del medio y no hay
      // ninguna escritura en disco. Hay que distinguirlo de una copia local
      // para no generar rutas /media/... que no existen.
      processedLocally = processed.variants !== null;
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

  // En modo "external" el heroPath ES la URL del medio, no una ruta local. Sin
  // este aviso, el panel y el JSON-LD generarian rutas /media/... que no existen.
  if (imageUrl && !processedLocally && imageConfig.mode() === "external") {
    log.info("La imagen se sirve desde el medio; no hay copia local", {
      accidentId: created.id,
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

  // --- 9. Publicar sin revision, solo si la puerta lo permite ---
  /*
    Este bloque es el UNICO camino del sistema por el que una noticia nace
    publicada sin que una persona la haya aprobado, y solo existe si `AUTO_PUBLISH`
    esta encendido. Apagado, el `if` no se cumple y no se ejecuta nada.

    La publicacion se pide a `changeStatus()`, que es la misma funcion que usa el
    panel y la unica via de publicacion del sistema. Asi los bloqueos que viven
    dentro de ella (una duplicada no se publica, una archivada tampoco) siguen
    valiendo tambien aqui: no hay una puerta trasera.

    Va DESPUES de crear la noticia y DESPUES de comprobar el invariante de
    PENDING_REVIEW, para que ese invariante siga significando lo que dice: lo que
    crea la ingesta es siempre un borrador. Publicar despues es otra operacion, y
    queda en el historial como tal.
  */
  let publicadaAutomaticamente = false;

  if (puedeIntentarAutoPublicar()) {
    const decision = decidirAutoPublicacion({
      verificationStatus: verification.verificationStatus,
      confidenceScore: verification.confidenceScore,
      sourceScore: verification.sourceScore,
      rewritten,
      palabrasCuerpo: palabras(clean.body),
      // `municipalityUncertain` ya se calculo mas arriba para las notas.
      municipioConocido: !municipalityUncertain,
      esDuplicada: false,
      horasAntiguedad: (Date.now() - occurredAt.getTime()) / 3_600_000,
      erroresGraves: erroresEditoriales.filter((e) => e.nivel === "grave").length,
      erroresAvisos: erroresEditoriales.filter((e) => e.nivel === "aviso").length,
      findingsPrivacidad: findings.length,
    });

    if (decision.publicar) {
      try {
        await changeStatus(
          created.id,
          "PUBLISHED",
          "scraper",
          `Publicada automaticamente. ${decision.motivo}`,
        );
        publicadaAutomaticamente = true;
        log.info("Noticia publicada automaticamente", {
          accidentId: created.id,
          slug: created.slug,
          confidence: verification.confidenceScore,
        });
      } catch (e) {
        /*
          Un fallo aqui NO puede dejar la noticia a medias ni romper el ciclo. Se
          queda como borrador, que es el estado en el que puede quedarse una
          noticia, y se avisa. Perder una publicacion automatica es un fallo
          visible; que el resto del ciclo se caiga por ella no lo seria.
        */
        log.error("No se pudo publicar automaticamente; queda como borrador", {
          accidentId: created.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      log.info("No pasa el liston de publicacion automatica", {
        accidentId: created.id,
        motivo: decision.motivo,
      });
    }
  }

  // --- 10. Notificar ---
  await notifyNewArticle({
    accidentId: created.id,
    title: clean.title,
    summary: clean.summary,
    excerpt,
    municipality: municipalityName,
    road: facts.road,
    occurredAtIso: occurredAt.toISOString(),
    confidenceScore: verification.confidenceScore,
    sourceScore: verification.sourceScore,
    verificationStatus: verification.verificationStatus,
    sourceUrl: page.url,
    sourceOutlet: source.name,
    reviewUrl: `${siteUrl()}/admin/${created.id}`,
    imageUrl: finalImageUrl,
    /*
      El aviso dice "pendiente de revision" o "ya publicada" segun lo que haya
      pasado. Sin esto, con la publicacion automatica encendida, el editor recibiria
      un correo que le dice que tiene algo pendiente que en realidad ya esta en la
      web.
    */
    yaPublicada: publicadaAutomaticamente,
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
    publicadaAutomaticamente,
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
      category: resolveCategory(
        params.facts.category,
        params.title,
        params.summary ?? "",
        params.body ?? "",
      ),
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
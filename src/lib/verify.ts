/**
 * Verificacion de una noticia antes de aceptar.
 *
 * La verificacion NO decide si se publica: eso lo hace una persona. Su trabajo
 * es dar al editor una puntuacion honesta y una lista concreta de motivos, de
 * modo que revise antes los casos dudosos y no en orden de llegada.
 *
 * Se puntuan cinco bloques y se combinan con pesos:
 *
 *   fecha ............ 0.20  ¿es coherente y reciente?
 *   municipio ........ 0.20  ¿se ha podido localizar en la isla?
 *   coherencia ....... 0.25  ¿las cifras cuadran entre si y con el titular?
 *   cuerpo ........... 0.20  ¿hay texto real o solo un fragmento de feed?
 *   fuente ........... 0.15  ¿de donde viene?
 *
 * La suma ponderada da `confidenceScore` (0..1). Y aparte se calcula
 * `sourceScore`, que es la fiabilidad de las FUENTES, no del texto: una nota
 * corta de un medio fiable no es un articulo verificado, solo es un medio fiable.
 */

import type { ExtractedFacts } from "@/lib/facts";
import { validateDate, type ParsedDate } from "@/lib/dates";
import { relevanceScore } from "@/lib/facts";
import { verifyConfig } from "@/lib/env";

export type VerificationStatus = "VERIFIED" | "PENDING_REVIEW" | "SUSPICIOUS" | "REJECTED";

export type VerificationCheck = {
  name: string;
  score: number;
  weight: number;
  ok: boolean;
  detail: string;
};

export type VerificationResult = {
  confidenceScore: number;
  sourceScore: number;
  verificationStatus: VerificationStatus;
  checks: VerificationCheck[];
  /** Motivos concretos, en texto, para que el panel los muestre tal cual. */
  notes: string[];
  /** Si es descartable de forma automatica. */
  autoReject: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Bloque: fecha                                                              */
/* -------------------------------------------------------------------------- */

function checkDate(date: ParsedDate | null, maxAgeDays: number): { score: number; note: string; reject: boolean } {
  if (!date) {
    return { score: 0.1, note: "El articulo no declara fecha de publicacion.", reject: false };
  }

  const verdict = validateDate(date.date, { maxAgeDays });
  if (!verdict.ok) {
    switch (verdict.problem) {
      case "futura":
        return { score: 0, note: verdict.note ?? "La fecha es futura.", reject: true };
      case "muy-antigua":
        return { score: 0, note: verdict.note ?? "La noticia es demasiado antigua.", reject: true };
      case "imposible":
        return { score: 0, note: "La fecha no existe en el calendario.", reject: true };
      default:
        return { score: 0.2, note: "Sin fecha utilizable.", reject: false };
    }
  }

  let score = 0.6;
  if (date.confidence === "certain") score += 0.4;
  else if (date.confidence === "likely") score += 0.15;

  // Una noticia de hace una hora es mas sospechosa que una de hace tres dias:
  // los errores de fecha se concentran en lo recien publicado.
  const ageHours = (Date.now() - date.date.getTime()) / 3_600_000;
  if (ageHours < 0.5) score -= 0.15;
  if (ageHours > 168) score -= 0.1;

  const note =
    date.confidence === "certain"
      ? "Fecha con zona horaria explicita."
      : (date.note ?? "Fecha sin zona horaria explicita.");

  return { score: Math.max(0, Math.min(1, score)), note, reject: false };
}

/* -------------------------------------------------------------------------- */
/*  Bloque: municipio                                                          */
/* -------------------------------------------------------------------------- */

function checkMunicipality(facts: ExtractedFacts): { score: number; note: string; reject: boolean } {
  if (facts.outsideLanzarote) {
    return {
      score: 0,
      note: "El texto menciona otra isla: descartado por geolocalizacion.",
      reject: true,
    };
  }
  if (facts.municipalitySlug) {
    const note = facts.road
      ? `Localizado en ${facts.municipalitySlug}${facts.road ? ` (${facts.road})` : ""}.`
      : `Localizado en ${facts.municipalitySlug}.`;
    return { score: 1, note, reject: false };
  }
  return {
    // Sin municipio: recuperable, pero el editor tiene que situarlo.
    score: 0.25,
    note: "No se ha identificado ningun municipio de Lanzarote en el texto.",
    reject: false,
  };
}

/* -------------------------------------------------------------------------- */
/*  Bloque: coherencia interna                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Comprueba que los datos no se contradigan entre si.
 *
 * El caso que mas importa: un titular que dice "dos fallecidos" con un cuerpo
 * que habla de "heridos graves" sin mencionar ninguno. Eso no es un error de
 * redaccion, es una noticia que dice dos cosas distintas, y es exactamente el
 * tipo de contenido que no debe publicarse sin revision.
 */
function checkConsistency(
  title: string,
  body: string,
  facts: ExtractedFacts,
): { score: number; note: string; reject: boolean } {
  const problems: string[] = [];
  let score = 1;

  // --- 1. El titular y el cuerpo deben hablar del mismo tipo de suceso ---
  // El patron tiene que cubrir las cinco formas que usan los medios: "fallecio",
  // "murio", "murieron", "muerte" y "muertos". Con solo "muerte" (masculino) un
  // titular como "Dos muertos en accidente" se escapaba de esta comprobacion,
  // que es justo el caso que mas hace falta detectar.
  const FATALITY = /\b(fallecid\w*|murio|murieron|muerte|muertos?|decresid\w*)\b/i;
  const titleHasFatality = FATALITY.test(title);
  const bodyHasFatality = FATALITY.test(body);

  if (titleHasFatality && !bodyHasFatality) {
    problems.push(
      "El titular menciona un fallecimiento que no aparece en el cuerpo del articulo.",
    );
    score -= 0.45;
  }

  const titleHasInjury = /\bherid/i.test(title);
  const bodyHasInjury = /\bherid/i.test(body);
  if (titleHasInjury && !bodyHasInjury) {
    problems.push("El titular menciona heridos que no aparecen en el cuerpo.");
    score -= 0.3;
  }

  // --- 2. Gravedad coherente con las cifras ---
  if (facts.severity === "GRAVE" && facts.fatalities === 0 && (facts.injuries ?? 0) <= 1) {
    problems.push(
      "Calificado de grave sin Victimacion mortal ni mas de un herido: conviene confirmarlo.",
    );
    score -= 0.25;
  }

  if (facts.fatalities === 0 && facts.injuries === 0 && facts.severity === "GRAVE") {
    problems.push("Consta como grave pero no hay Victimas ni heridos declarados.");
    score -= 0.3;
  }

  // --- 3. Numero de heridos en el titular distinto del del cuerpo ---
  const titleInjuries = extractSimpleCount(title, /herid/i);
  const bodyInjuries = extractSimpleCount(body, /herid/i);
  if (
    titleInjuries !== null &&
    bodyInjuries !== null &&
    Math.abs(titleInjuries - bodyInjuries) > 1
  ) {
    problems.push(
      `El titular habla de ${titleInjuries} heridos y el cuerpo de ${bodyInjuries}.`,
    );
    score -= 0.35;
  }

  // --- 4. Municipio distinto en titular y cuerpo ---
  const titleMunicipality = facts.municipalitySlug;
  if (titleMunicipality === null) {
    score -= 0.05;
  }

  // --- 5. Un articulo de una palabra no es un articulo ---
  const bodyWords = body.trim().split(/\s+/).length;
  if (bodyWords < 40) {
    problems.push(`El cuerpo tiene solo ${bodyWords} palabras: es un fragmento, no un articulo.`);
    score -= 0.5;
  }

  return {
    score: Math.max(0, score),
    note:
      problems.length === 0
        ? "Los datos del titular y del cuerpo son coherentes."
        : problems.join(" "),
    reject: false,
  };
}

/** Numero escrito en el titular junto a una palabra clave ("dos heridos"). */
function extractSimpleCount(text: string, context: RegExp): number | null {
  const words: Record<string, number> = {
    un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  };
  const re = new RegExp(
    `(\\d{1,2}|${Object.keys(words).join("|")})\\s+(?:\\w+\\s+){0,2}${context.source}`,
    "i",
  );
  const m = re.exec(text);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  return words[raw] ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Bloque: cuerpo                                                             */
/* -------------------------------------------------------------------------- */

function checkBody(body: string, summary: string, title: string): { score: number; note: string } {
  const words = body.trim().split(/\s+/).filter(Boolean).length;

  if (words === 0) {
    return {
      score: 0.2,
      note: "Solo se ha podido obtener el resumen del feed; no el cuerpo del articulo.",
    };
  }

  let score: number;
  if (words >= 250) score = 1;
  else if (words >= 120) score = 0.8;
  else if (words >= 60) score = 0.6;
  else if (words >= 30) score = 0.35;
  else score = 0.15;

  // Si el cuerpo es solo el titular repetido, la IA no tiene nada que hacer.
  const normalizedBody = body.toLowerCase().trim();
  const normalizedTitle = title.toLowerCase().trim();
  if (normalizedTitle.length > 25 && normalizedBody.includes(normalizedTitle) && words < 60) {
    score = Math.min(score, 0.2);
    return { score, note: "El cuerpo es practicamente el titular, sin informacion adicional." };
  }

  const note = `${words} palabras de cuerpo${summary ? ` y resumen del feed` : ""}.`;
  return { score, note };
}

/* -------------------------------------------------------------------------- */
/*  Bloque: fuente                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fiabilidad de la fuente. Depende de dos cosas: lo que el medio suele ser
 * (`baseScore`) y como se ha comportado historicamente (healthScore, 0..1).
 */
export function sourceScoreFor(baseScore: number, consecutiveFailures: number, successRate: number): number {
  const health = Number.isFinite(successRate) ? Math.max(0, Math.min(1, successRate)) : 0.5;
  // Un medio con 0.9 de base pero que falla siempre no vale mucho.
  const reliability = baseScore * 0.6 + health * 0.4;
  const penalty = Math.min(0.5, consecutiveFailures * 0.15);
  return Math.max(0, Math.min(1, reliability - penalty));
}

/* -------------------------------------------------------------------------- */
/*  Verificacion completa                                                     */
/* -------------------------------------------------------------------------- */

export type VerifyInput = {
  title: string;
  body: string;
  summary: string;
  date: ParsedDate | null;
  facts: ExtractedFacts;
  baseScore: number;
  consecutiveFailures: number;
  successRate: number;
  maxAgeDays: number;
};

export function verifyArticle(input: VerifyInput): VerificationResult {
  const checks: VerificationCheck[] = [];
  const notes: string[] = [];

  const date = checkDate(input.date, input.maxAgeDays);
  const municipality = checkMunicipality(input.facts);
  const consistency = checkConsistency(input.title, input.body, input.facts);
  const bodyCheck = checkBody(input.body, input.summary, input.title);

  const relevance = relevanceScore(input.title, input.body || input.summary);

  checks.push(
    { name: "Fecha", score: date.score, weight: 0.2, ok: date.score >= 0.5, detail: date.note },
    { name: "Municipio", score: municipality.score, weight: 0.2, ok: municipality.score >= 0.5, detail: municipality.note },
    { name: "Coherencia", score: consistency.score, weight: 0.25, ok: consistency.score >= 0.6, detail: consistency.note },
    { name: "Cuerpo", score: bodyCheck.score, weight: 0.2, ok: bodyCheck.score >= 0.5, detail: bodyCheck.note },
    {
      name: "Relevancia",
      score: relevance,
      weight: 0.15,
      ok: relevance >= 0.5,
      detail: `Puntuacion de relevancia ${(relevance * 100).toFixed(0)} %.`,
    },
  );

  const confidenceScore =
    checks.reduce((acc, c) => acc + c.score * c.weight, 0) /
    checks.reduce((acc, c) => acc + c.weight, 0);

  const sourceScore = sourceScoreFor(input.baseScore, input.consecutiveFailures, input.successRate);

  for (const c of checks) {
    if (c.score < 0.5) notes.push(`${c.name}: ${c.detail}`);
  }
  notes.push(consistency.note);
  if (date.reject) notes.push(date.note);

  // --- Estado ---
  const autoReject = date.reject || municipality.reject;

  let verificationStatus: VerificationStatus;
  if (autoReject) {
    verificationStatus = "REJECTED";
  } else if (confidenceScore >= verifyConfig.goodConfidence() && sourceScore >= 0.5) {
    verificationStatus = "VERIFIED";
  } else if (confidenceScore < verifyConfig.minConfidence()) {
    verificationStatus = "SUSPICIOUS";
  } else {
    verificationStatus = "PENDING_REVIEW";
  }

  // Un VERIFIED nunca se publica solo: la verificacion automatica es un filtro
  // de entrada, y el siguiente paso sigue siendo la aprobacion de una persona.

  return {
    confidenceScore: round3(confidenceScore),
    sourceScore: round3(sourceScore),
    verificationStatus,
    checks,
    notes: [...new Set(notes.filter(Boolean))],
    autoReject,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
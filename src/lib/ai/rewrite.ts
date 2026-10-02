/**
 * Reescritura de noticias con IA.
 *
 * REGLA DEL PROYECTO: NADA SE PUBLICA AUTOMATICAMENTE. Este modulo produce un
 * borrador que se guarda como PENDING_REVIEW. No importa, y no hay forma de
 * hacer que importe, que se convierta en publicado.
 *
 * REGLA SOBRE EL TEXTO: la IA no puede COPIAR. El encargo es redactar desde
 * cero conservando los hechos, y eso se comprueba, no se supone:
 *
 *   - El prompt lo prohibe expresamente.
 *   - Tras recibir el texto se mide el solapamiento con el original mediante
 *     n-gramas. Si hay un tramo largo verbatim, se rechaza y se reintenta.
 *   - Se verifican las cifras: todo numero del original debe aparecer en la
 *     reescritura. Si la IA "redondea" 23 heridos a "varios", se rechaza.
 *
 * Si la reescritura no supera la comprobacion, el articulo se guarda con el
 * texto original marcado como pendiente de reescritura. Es preferible publicar
 * despues un texto feo pero fiel que un texto bonito con un numero cambiado.
 */

// Este es el prompt mas importante del sistema: define como se redacta cada
// noticia. Si se degrada, las noticias salen copiadas o inventadas.
import { chat, embed, parseJsonLoose } from "@/lib/ai/openrouter";
import { aiConfig } from "@/lib/env";
import { log } from "@/lib/logger";
import { deaccent, normalizeText } from "@/lib/text";
import type { ExtractedFacts } from "@/lib/facts";

/* -------------------------------------------------------------------------- */
/*  Tipos                                                                     */
/* -------------------------------------------------------------------------- */

export type RewriteRequest = {
  title: string;
  body: string;
  summary: string;
  facts: ExtractedFacts;
  municipalityName: string;
  occurredAtIso: string;
  outlet: string;
  sourceUrl: string;
};

/**
 * Resultado de la reescritura.
 *
 * Union discriminada por `ok`, y no un objeto con campos a null: asi, cuando
 * `ok` es falso, TypeScript obliga a dar `error` e IMPIDE dar un `title` a
 * medio rellenar. Con un objeto plano es facil devolver un resultado fallido
 * con el titulo del primer intento y que el llamante lo use.
 */
export type RewriteResult =
  | {
      ok: true;
      title: string;
      summary: string;
      body: string;
      excerpt: string;
      seoTitle: string;
      metaDescription: string;
      model: string | null;
      /** Copia maxima medida entre el original y la reescritura, 0..1. */
      overlap: number;
    }
  | {
      ok: false;
      /** Motivo del rechazo. Siempre presente. */
      error: string;
      /** Copia medida en el rechazo, si llego a medirse. */
      overlap: number | null;
    };

/* -------------------------------------------------------------------------- */
/*  Deteccion de copia                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Proporcion de n-gramas de 6 palabras del original que aparecen tal cual en
 * la reescritura.
 *
 * Por que n-gramas y no "coincidencia de frases": la expresion "los servicios
 * de emergencia" es una formula del genero, inevitable en cualquier
 * redaccion, y marcarla como copia daria falsos positivos constantes. Con
 * 6 palabras consecutivas, coincidir es senal real de que se ha calcado.
 *
 * El umbral de 0.12 deja pasar esas formulas del genero (una introduccion sobre
 * el 112) sin permitir un parrafo copiado.
 */
export function measureOverlap(original: string, rewritten: string, n = 6): number {
  const origTokens = normalizeText(original).split(" ").filter(Boolean);
  const rewTokens = normalizeText(rewritten).split(" ").filter(Boolean);
  if (origTokens.length < n || rewTokens.length < n) return 0;

  const rewGrams = new Set<string>();
  for (let i = 0; i + n <= rewTokens.length; i++) {
    rewGrams.add(rewTokens.slice(i, i + n).join(" "));
  }

  let shared = 0;
  let total = 0;
  for (let i = 0; i + n <= origTokens.length; i++) {
    total++;
    if (rewGrams.has(origTokens.slice(i, i + n).join(" "))) shared++;
  }

  return total === 0 ? 0 : shared / total;
}

/** Numero maximo de copia admitido antes de rechazar la reescritura. */
const MAX_OVERLAP = 0.12;

/**
 * Contexto de cada cifra, para decidir si es victimacion o un dato de referencia
 * (hora, dia, numero de carretera, kilometraje).
 *
 * Por que hace falta: "23 heridos" es una cifra que hay que conservar, y "4
 * fallecidos" tambien. Pero "a las 14" o "la LZ-2" no son victimacion, y
 * exigir que la IA los repita tal cual seria absurdo. La version anterior
 * descartaba todos los numeros de 1 a 31, lo que hacia que "4 fallecidos"
 * pasara DESAPARECIDO de la comprobacion: exactamente la cifra que mas importa
 * en una noticia desucceso.
 */
export function classifyNumber(
  n: number,
  text: string,
  offset: number,
): "VICTIMACION" | "REFERENCIA" | "IGNORADO" {
  // La ventana alrededor de la cifra decide.
  const before = text.slice(Math.max(0, offset - 28), offset).toLowerCase();
  const after = text.slice(offset, offset + 34).toLowerCase();
  const window = `${before} ${after}`;

  // Un numero seguido de estas palabras es victimacion, tenga el valor que sea.
  if (
    /\b(herid|fallecid|muerto|muert|víctim|victima|personas|implicad|lesionad)\w*/.test(after) ||
    /\b(herid|fallecid|muerto|muert|víctim|victima)\w*/.test(before)
  ) {
    return "VICTIMACION";
  }

  // Cifras que nunca son victimacion por muy pequenas que sean.
  if (/\b(h|lz|carretera|km|kilometro|puerto|camino|vía|via)\s*-?\s*$/.test(before)) {
    return "REFERENCIA";
  }
  if (/^\s*(h|hs|horas|min|minutos)\b/.test(after)) {
    return "REFERENCIA";
  }
  if (/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(window)) {
    return "REFERENCIA";
  }

  // Un numero suelto sin contexto claro: no se exige conservar. Se prefiere un
  // falso negativo a rejectar una reescritura legitima por un "2" suelto.
  if (n < 10) return "IGNORADO";

  // A partir de 10 y sin contexto, se exige: 23 heridos, 35 victims, etc.
  return "VICTIMACION";
}

/**
 * Cifras de victimacion del original que NO aparecen en la reescritura.
 * Es la comprobacion que impide que la IA "redondee" 23 heridos a "varios".
 */
export function significantNumbers(text: string): number[] {
  const out = new Set<number>();
  const re = /\b(\d{1,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number.parseInt(m[1], 10);
    if (classifyNumber(n, text, m.index) === "VICTIMACION") out.add(n);
  }
  return [...out].sort((a, b) => b - a);
}

export function lostNumbers(original: string, rewritten: string): number[] {
  const rewrittenText = deaccent(rewritten);
  return significantNumbers(original).filter((n) => {
    // Se busca el numero entero Y, si es de una o dos cifras, tambien su
    // forma escrita ("cuatro"), porque un buen periodista puede redactar
    // "cuatro fallecidos" en lugar de "4 fallecidos".
    if (rewrittenText.includes(String(n))) return false;
    const spelled = n <= 30 ? SPELLED[n] : null;
    if (spelled && new RegExp(`\\b${spelled}\\b`, "i").test(rewrittenText)) return false;
    return true;
  });
}

/** Numeros de una y dos cifras en letra, para aceptar ambas redacciones. */
const SPELLED: Record<number, string> = {
  1: "un", 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco", 6: "seis", 7: "siete",
  8: "ocho", 9: "nueve", 10: "diez", 11: "once", 12: "doce", 13: "trece",
  14: "catorce", 15: "quince", 16: "dieciseis", 17: "diecisiete",
  18: "dieciocho", 19: "diecinueve", 20: "veinte", 21: "veintiuno",
  22: "veintidos", 23: "veintitres", 24: "veinticuatro", 25: "veinticinco",
  26: "veintiseis", 27: "veintisiete", 28: "veintiocho", 29: "veintinueve",
  30: "treinta",
};

/* -------------------------------------------------------------------------- */
/*  Prompt                                                                    */
/* -------------------------------------------------------------------------- */

const SYSTEM_PROMPT = `Eres un periodista de referencia en Canarias que cubre accidentes de trafico, emergencias y actuaciones de los servicios de emergencia.

REGLAS INNEGOCIABLES:

1. NO COPIES. No reproduzcas frases, parrafos ni secuencias de palabras del texto original. Debes redactar desde cero. Copiar un parrafo entero esta prohibido y hace que el trabajo se rechace.

2. CONSERVA LOS HECHOS. Aunque cambies las palabras, deben coincidir exactamente:
   - Fecha y hora del suceso.
   - Municipio y zona.
   - Carretera y kilometro, si aparecen.
   - Numero de heridos y de fallecidos. Si el original dice 7 heridos, dices 7 heridos. Nunca "varios" ni "multiples".
   - Estado y edad de los implicados, si se dan.
   - Organismos que intervienen.

3. NO INVENTES. Si el original no dice quien conducia, no lo digas. Si no dice
   la causa, no la especules. No anadas detalles, adjetivos ni cifras que no
   esten en el original.

4. ESTILO. Como un agencia local seria: titular informativo sin exageraciones,
   entradilla con lo esencial, desarrollo en orden cronologico, y cierre con el
   estado en que queda la situacion. Frases cortas. Presente de indicativo. Sin
   superlativos.

5. IDIOMA. Espanol de Espana. Terminologia de Canarias: "carretera insular",
   "Guardia Civil", "Cruz Roja", "policia local", "Hospital Universitario
   Insular de Lanzarote".

Responde UNICAMENTE con un objeto JSON con estas claves exactas:
{
  "title": "titular reescrito, entre 40 y 90 caracteres",
  "summary": "entradilla de 2 o 3 frases, entre 120 y 320 caracteres",
  "body": "articulo completo de 3 a 6 parrafos separados por \\n\\n, minimo 900 caracteres",
  "excerpt": "resumen de una sola frase para listados, maximo 160 caracteres",
  "seoTitle": "titulo optimizado para buscadores, entre 30 y 60 caracteres, con el municipio",
  "metaDescription": "descripcion para el meta description, entre 120 y 155 caracteres"
}`;

/* -------------------------------------------------------------------------- */
/*  Reescritura                                                                */
/* -------------------------------------------------------------------------- */

export async function rewriteArticle(request: RewriteRequest): Promise<RewriteResult> {
  if (!aiConfig.enabled()) {
    return {
      ok: false,
      error: "OPENROUTER_API_KEY no esta definido: no se puede reescribir.",
      overlap: null,
    };
  }

  // Sin modelo explicito: chat() va probando los de la configuracion en orden,
  // asi que si el principal falla por limite de peticiones usa el suplente.
  const factsContext = buildFactsContext(request.facts);

  const userPrompt = `DATOS VERIFICADOS POR EL SISTEMA (extracidos del texto, no los cambies):
${factsContext}

TITULAR ORIGINAL (no lo copies, reescribelo):
${request.title}

TEXTO ORIGINAL (fuente de los hechos; no lo copies):
"""
${request.body || request.summary}
"""

REGLAS ADICIONALES PARA ESTE CASO:
- El suceso ocurrio en ${request.municipalityName}.
- Fecha y hora: ${request.occurredAtIso}.
- Medio de origen: ${request.outlet}.
- Titular SEO que incluya el municipio, con menos de 60 caracteres.
- metaDescription con menos de 155 caracteres.

Devuelve solo el objeto JSON.`;

  // Se recuerda que modelo contesto, porque con la cadena de suplentes puede no
  // ser el primero de la configuracion.
  let modeloUsado: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: attempt === 1 ? userPrompt : userPrompt + "\n\nEl intento anterior fue rechazado por copiar texto. Redacta con otras palabras." },
      ],
      temperature: attempt === 1 ? 0.6 : 0.85,
      maxTokens: 3000,
      json: true,
    });

    if (!response.ok) {
      log.warn("Fallo la llamada de reescritura", { error: response.error, attempt });
      if (attempt === 2) {
        return { ok: false, error: response.error, overlap: null };
      }
      continue;
    }

    modeloUsado = response.model ?? null;

    const parsed = parseJsonLoose<{
      title?: string; summary?: string; body?: string; excerpt?: string;
      seoTitle?: string; metaDescription?: string;
    }>(response.data);

    if (!parsed) {
      if (attempt === 2) {
        return { ok: false, error: "La IA no devolvio un JSON legible.", overlap: null };
      }
      continue;
    }

    // --- Validacion de forma ---
    const title = cleanString(parsed.title, 10, 200);
    const summary = cleanString(parsed.summary, 40, 700);
    const body = cleanString(parsed.body, 300, 20000);
    const excerpt = cleanString(parsed.excerpt, 20, 200);
    const seoTitle = cleanString(parsed.seoTitle, 20, 70);
    const metaDescription = cleanString(parsed.metaDescription, 70, 170);

    if (!title || !summary || !body) {
      if (attempt === 2) {
        return {
          ok: false,
          error: `La IA devolvio campos vacios o demasiado cortos (title=${title ? "ok" : "falta"}, summary=${summary ? "ok" : "falta"}, body=${body ? "ok" : "falta"}).`,
          overlap: null,
        };
      }
      continue;
    }

    // --- Validacion de copia ---
    const original = `${request.title}\n${request.body || request.summary}`;
    const overlap = measureOverlap(original, `${title} ${body}`);

    if (overlap > MAX_OVERLAP) {
      log.warn("Reescritura rechazada por copiar el original", {
        overlap: Math.round(overlap * 100) / 100,
        limit: MAX_OVERLAP,
        attempt,
      });
      if (attempt === 2) {
        return {
          ok: false,
          error: `La reescritura copia un ${(overlap * 100).toFixed(0)} % del original (limite ${(MAX_OVERLAP * 100).toFixed(0)} %). Se reintento dos veces.`,
          overlap,
        };
      }
      continue;
    }

    // --- Validacion de cifras ---
    const lost = lostNumbers(original, `${summary} ${body}`);
    if (lost.length > 0) {
      log.warn("Reescritura rechazada por perder cifras", { lost, attempt });
      if (attempt === 2) {
        return {
          ok: false,
          error: `La reescritura perdio estas cifras del original: ${lost.join(", ")}.`,
          overlap,
        };
      }
      continue;
    }

    return {
      ok: true,
      title,
      summary,
      body,
      excerpt: excerpt ?? summary.slice(0, 160),
      seoTitle: seoTitle ?? title.slice(0, 60),
      metaDescription: metaDescription ?? summary.slice(0, 155),
      // Que modelo redacto de verdad: con la cadena de suplentes puede no ser el
    // primero de la configuracion.
      model: modeloUsado,
      overlap: Math.round(overlap * 1000) / 1000,
    };
  }

  return { ok: false, error: "No se pudo reescribir la noticia.", overlap: null };
}

/* -------------------------------------------------------------------------- */
/*  Contexto de hechos                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Presenta al modelo lo que el sistema ya ha extraido por reglas.
 *
 * Esto hace dos cosas. Una, reduce los errores: la IA no tiene que contar
 * heridos. Dos, y mas importante, crea un TERCER canter para las cifras: la
 * reescritura se contrasta con los datos del extractor, no solo con el texto.
 */
function buildFactsContext(facts: ExtractedFacts): string {
  const lines: string[] = [];
  if (facts.municipalitySlug) lines.push(`- Municipio: ${facts.municipalitySlug}`);
  if (facts.areaLabel) lines.push(`- Zona: ${facts.areaLabel}`);
  if (facts.road) lines.push(`- Carretera: ${facts.road}`);
  if (facts.vehicleType) lines.push(`- Vehiculo: ${facts.vehicleType}`);
  if (facts.category) lines.push(`- Categoria: ${facts.category}`);
  if (facts.fatalities !== null) lines.push(`- Fallecidos: ${facts.fatalities}`);
  if (facts.injuries !== null) lines.push(`- Heridos: ${facts.injuries}`);
  if (facts.severity) lines.push(`- Gravedad: ${facts.severity}`);
  if (facts.timeOfDay) lines.push(`- Hora del suceso: ${facts.timeOfDay}`);

  if (lines.length === 0) {
    return "- No se ha podido extraer ningun dato estructurado. Basate solo en el texto.";
  }
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Embeddings                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Vector de embedding del articulo, para la similitud semantica.
 * Devuelve null si falla: la deduplicacion por SimHash y titular sigue
 * funcionando sin embeddings, asi que no es un punto unico de fallo.
 */
export async function embedArticle(title: string, body: string): Promise<number[] | null> {
  if (!aiConfig.enabled()) return null;
  const text = `${title}\n\n${body}`.slice(0, 6000);
  const result = await embed(text);
  if (!result.ok) {
    log.warn("No se pudo generar el embedding", { error: result.error });
    return null;
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/*  Utilidades                                                                */
/* -------------------------------------------------------------------------- */

function cleanString(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    // Quita el marcado que algun modelo anade pese a pedir JSON puro.
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/^\s*(?:titular|entradilla|resumen)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < min) return null;
  return cleaned.slice(0, max);
}

export { MAX_OVERLAP };

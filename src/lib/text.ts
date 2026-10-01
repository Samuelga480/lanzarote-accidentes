/**
 * Utilidades de texto para deteccion de duplicados.
 *
 * El objetivo es reconocer que dos medios cuentan el mismo suceso. Se resuelve
 * en cuatro niveles, de mas barato a mas caro:
 *
 *   1. URL canonica exacta    -> coste cero
 *   2. SHA-256 del contenido  -> coste cero, detecta el articulo copiado
 *   3. SimHash + tokens       -> detecta el mismo suceso con otro enfoque
 *   4. Embeddings             -> coste de API, detecta reformulaciones
 *
 * Los niveles 1-3 son deterministas y funcionan sin IA. El 4 es opcional.
 */

import { createHash } from "node:crypto";

/* -------------------------------------------------------------------------- */
/*  Normalizacion                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza para comparar: minusculas, sin acentos, sin puntuacion y sin
 * palabras vacias. Los medios escriben "Arrecife", "arrecife" y "Arrecife.";
 * para el sistema es lo mismo.
 */
const STOPWORDS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "del", "al", "y", "e",
  "en", "por", "para", "con", "sin", "sobre", "tras", "su", "sus", "lo", "le", "les",
  "que", "se", "es", "son", "fue", "fueron", "ha", "han", "hay", "a", "o", "u",
  "the", "of", "in", "on", "at", "to", "for", "and", "por", "como", "mas", "más",
  "segun", "según", "ano", "año", "anos", "años", "nuevo", "nueva",
]);

/** Quita acentos sin depender de la configuracion regional del servidor. */
export function deaccent(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeText(input: string): string {
  return deaccent(input.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens significativos, sin palabras vacias, con duplicados eliminados. */
export function tokenize(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of normalizeText(input).split(" ")) {
    if (t.length < 3) continue;
    if (STOPWORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Hashing                                                                    */
/* -------------------------------------------------------------------------- */

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Hash del contenido de un articulo.
 *
 * Se normaliza antes de hashear para que dos copias del mismo texto con
 * distinta puntuacion o acentos den el mismo hash. Se incluyen los 20
 * primeros tokens en orden, lo que hace sensible el hash al titular: un mismo
 * cuerpo con otro angulo no se considera copia literal.
 */
export function contentHashOf(title: string, body: string): string {
  const tokens = tokenize(`${title} ${title} ${body}`).slice(0, 200);
  return sha256(tokens.join(" "));
}

/* -------------------------------------------------------------------------- */
/*  SimHash                                                                    */
/* -------------------------------------------------------------------------- */

/** hash FNV-1a de 32 bits, determinista entre procesos y maquinas. */
function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Multiplicacion por el primo FNV sobre Math.imul para no perder precision
    // en enteros de 32 bits.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * SimHash de 64 bits sobre los shingles del texto.
 *
 * Usa bigramas en lugar de palabras sueltas porque dos medios cuentan el mismo
 * suceso cambiando la sintaxis pero repiten las frases largas. Devuelve 16
 * caracteres en hexadecimal.
 */
export function simHash(input: string): string {
  const tokens = tokenize(input);
  if (tokens.length === 0) return "0".repeat(16);

  // Shingles de 2 y 3 tokens.
  const shingles: string[] = [];
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      shingles.push(tokens.slice(i, i + n).join("_"));
    }
  }
  if (shingles.length === 0) shingles.push(...tokens);

  // 64 acumuladores, uno por bit.
  const vector = new Array<number>(64).fill(0);

  for (const shingle of shingles) {
    const h = fnv1a32(shingle);
    // Cada shingle contributes su peso a los 64 bits de forma independiente.
    for (let bit = 0; bit < 64; bit++) {
      const set = bit < 32 ? (h >>> bit) & 1 : (fnv1a32(shingle + "#" + bit) & 1);
      vector[bit] += set === 1 ? 1 : -1;
    }
  }

  let hex = "";
  for (let nibble = 0; nibble < 16; nibble++) {
    let value = 0;
    for (let b = 0; b < 4; b++) {
      const bit = nibble * 4 + b;
      if (vector[bit] > 0) value |= 1 << (3 - b);
    }
    hex += value.toString(16);
  }
  return hex;
}

/** Distancia de Hamming entre dos SimHash en hexadecimal (0..64). */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 64;
  let distance = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

/** Similitud 1..1 entre dos SimHash, derivada de la distancia de Hamming. */
export function simHashSimilarity(a: string, b: string): number {
  return 1 - hammingDistance(a, b) / 64;
}

/* -------------------------------------------------------------------------- */
/*  Similitud de tokens                                                        */
/* -------------------------------------------------------------------------- */

/** Indice de Jaccard entre dos conjuntos de tokens. */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Similitud de coseno entre dos vectores densos (embeddings).
 * Se usa solo si ambos vectores tienen la misma longitud.
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Convierte un array JSON de numeros a vector, o null si no es valido. */
export function parseEmbedding(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const nums = parsed.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    return nums.length > 0 ? nums : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Limpieza de HTML                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Convierte HTML en texto plano conservando los saltos de parrafo.
 * Se usa como red de seguridad: si un extractor devuelve marcado, la IA nunca
 * lo ve.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&apos;": "'", "&#39;": "'", "&mdash;": "—", "&ndash;": "–",
  "&hellip;": "…", "&laquo;": "«", "&raquo;": "»", "&ldquo;": "“",
  "&rdquo;": "”", "&rsquo;": "’", "&lsquo;": "‘", "&aacute;": "á",
  "&eacute;": "é", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú",
  "&ntilde;": "ñ", "&Aacute;": "Á", "&Eacute;": "É", "&Iacute;": "Í",
  "&Oacute;": "Ó", "&Uacute;": "Ú", "&Ntilde;": "Ñ", "&deg;": "°",
};

/** Decodifica las entidades HTML mas comunes, incluidas las numericas. */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z]+;/gi, (m: string) => ENTITIES[m.toLowerCase()] ?? m);
}

/** Colapsa espacios y deja como mucho dos saltos de linea consecutivos. */
export function tidy(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Corta un texto a un maximo de caracteres, sin partir palabras. */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}
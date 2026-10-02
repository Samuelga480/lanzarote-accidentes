/**
 * Extraccion de hechos estructurados desde el texto de un articulo.
 *
 * REGLA PRINCIPAL DE ESTE FICHERO: si un dato no aparece en el texto, se
 * devuelve `null`. No hay valores por defecto inventados.
 *
 * El scraper original hacia exactamente lo contrario: `extraerMunicipio()`
 * devolvia "Arrecife" cuando no encontraba el municipio, y
 * `extraerTipoAccidente()` devolvia "Colision" siempre. Cualquier articulo de
 * trafico de toda Canarias quedaba atribuido a Arrecife y clasificado como
 * colision. Un `null` honesto es recuperable; un dato falso no lo es nunca.
 *
 * NOTA SOBRE LOS PATRONES: todo el texto se pasa antes por `norm()`, que quita
 * acentos y puntuacion y lo deja en minusculas. Por eso NINGUN patron de este
 * fichero puede llevar tildes, y los que necesitan distinguir mayusculas (como
 * "LZ-2", que tras normalizar queda "lz-2") necesitan la Bandera `i`.
 */

import { deaccent } from "@/lib/text";
import { MUNICIPALITIES, MUNICIPALITY_BY_SLUG, ZONES } from "@/lib/constants";

/* -------------------------------------------------------------------------- */
/*  Tipos                                                                     */
/* -------------------------------------------------------------------------- */

export const VEHICLE_TYPES = [
  "COCHE", "MOTO", "CAMION", "BICICLETA", "PEATON", "OTROS",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const ACCIDENT_SEVERITIES = ["LEVE", "MODERADO", "GRAVE"] as const;
export type AccidentSeverity = (typeof ACCIDENT_SEVERITIES)[number];

export const INCIDENT_CATEGORIES = [
  "ACCIDENTE_TRAFICO", "ATROPELLO", "INCENDIO", "RESCATE",
  "EMERGENCIA_SANITARIA", "ACTUACION_SERVICIOS", "DESAPARICION", "OTRO",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export type ExtractedFacts = {
  /** null = no se ha podido determinar. No se inventa. */
  municipalitySlug: string | null;
  /** Zona o localidad concreta, si se ha identificado. null si solo hay municipio. */
  zoneSlug: string | null;
  /** Nombre legible de la zona o localidad, si se ha identificado. */
  areaLabel: string | null;
  road: string | null;
  vehicleType: VehicleType | null;
  category: IncidentCategory | null;
  severity: AccidentSeverity | null;
  injuries: number | null;
  fatalities: number | null;
  /** Hora del suceso si el texto la menciona, en formato HH:mm. */
  timeOfDay: string | null;
  /** true si el texto menciona otra isla y conviene descartar. */
  outsideLanzarote: boolean;
  /** Terminos que han justificado que el articulo sea relevante. */
  matchedTerms: string[];
};

/** Normaliza para busqueda: minusculas, sin acentos, sin puntuacion. */
export function norm(input: string): string {
  return deaccent(input.toLowerCase()).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/* -------------------------------------------------------------------------- */
/*  Municipios y zonas                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Indice de topónimos de Lanzarote.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE SE GENERA Y NO SE ESCRIBE A MANO
 * ---------------------------------------------------------------------------
 *
 * Antes estaba escrito a mano y se desincronizó de la lista de municipios: el
 * índice decía `tinajo` y la lista decía `tinaj`, así que toda noticia de
 * Tinajo salía con un municipio que no existía. Betancuria y Femés se
 * quedaron metidos porque están en Fuerteventura.
 *
 * Ahora sale de MUNICIPALITIES y ZONES, que son la única fuente de verdad. Si
 * mañana se añade un municipio, el índice lo recoge solo y no puede quedar
 * desfasado.
 *
 * ---------------------------------------------------------------------------
 *  ORDEN
 * ---------------------------------------------------------------------------
 *
 * De más largo a más corto, para que "playa blanca" se pruebe antes que
 * "yaiza" y gane el nombre más específico. Y si dos entradas comparten el mismo
 * término se queda la primera: los municipios se añaden antes que las zonas,
 * de forma que un "Tinajo" a secas es el municipio y no una zona.
 */
type PlaceHit = {
  /** Término normalizado, tal y como aparece tras pasar por norm(). */
  term: string;
  municipalitySlug: string;
  /** null cuando lo que ha coincidence es el municipio entero. */
  zoneSlug: string | null;
  /** Nombre con mayúsculas para mostrar. */
  label: string;
};

const PLACE_INDEX: PlaceHit[] = (() => {
  const entries: PlaceHit[] = [];

  for (const m of MUNICIPALITIES) {
    entries.push({
      term: norm(m.name),
      municipalitySlug: m.slug,
      zoneSlug: null,
      label: m.name,
    });
  }

  for (const z of ZONES) {
    // El municipio de la zona tiene que existir. Si algún día se escribe mal,
    // la zona se descarta en vez de colar un municipio inventado.
    if (!MUNICIPALITY_BY_SLUG.has(z.municipalitySlug)) continue;

    for (const term of [norm(z.name), ...(z.aliases ?? []).map(norm)]) {
      if (term === "") continue;
      entries.push({ term, municipalitySlug: z.municipalitySlug, zoneSlug: z.slug, label: z.name });
    }
  }

  entries.sort((a, b) => b.term.length - a.term.length);

  const seen = new Set<string>();
  return entries.filter((e) => (seen.has(e.term) ? false : (seen.add(e.term), true)));
})();

/**
 * Municipios y zonas de OTRAS islas que aparecen a menudo en la prensa
 * regional. Sin esta lista, "Corralejo" (Fuerteventura) entraria como toponimo
 * desconocido y la noticia se publicaria en el mapa equivocado.
 */
const OUTSIDE_LANZAROTE = [
  "corralejo", "puerto del rosario", "la oliva", "pajara", "ajuy",
  "fuerteventura", "gran tarajal", "antigua", "caleta de fuste",
  "tenerife", "santa cruz de tenerife", "las palmas de gran canaria",
  "las palmas", "telde", "teide", "la gomera", "la palma",
  "el hierro", "gran canaria", "maspalomas", "playa del ingles",
];

const OUTSIDE_SET = new Set(OUTSIDE_LANZAROTE);

/* -------------------------------------------------------------------------- */
/*  Numeros escritos en texto                                                 */
/* -------------------------------------------------------------------------- */

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, unos: 1, unas: 1,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, treinta: 30,
};

/**
 * Patron de un numero, en cifras o en palabras. Se reutiliza en todas las
 * cuentas de personas para no repetir la lista de palabras veinte veces.
 */
const NUM =
  "(?:\\d{1,2}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|treinta)";

function toNumber(raw: string): number | null {
  if (/^\d+$/.test(raw)) {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
  const n = NUMBER_WORDS[raw];
  return typeof n === "number" ? n : null;
}

/**
 * Suma las cantidades que aparecen en todas las coincidencias de un patron.
 * Devuelve null si el patron no aparece.
 */
function sumCounts(text: string, pattern: string): number | null {
  const re = new RegExp(pattern, "gi");
  let total: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = toNumber(m[1] ?? "");
    if (n === null) continue;
    total = (total ?? 0) + n;
  }
  return total;
}

/** Expresiones que niegan la presencia de heridos. */
const NEGATION = /\b(sin|ningun|ninguna|no hay|no hubo|cero)\b/;

/** Numero de heridos, o null si el texto no lo dice. */
function extractInjuries(text: string): number | null {
  // "ileso", "sin lesiones", "no hay heridos": cero, no "no se".
  if (/\biles[oa]s?\b/.test(text)) return 0;
  if (/\bsin lesion(?:es)?\b/.test(text)) return 0;
  if (/\b(sin|no hay|no hubo)\s+herid/.test(text)) return 0;

  const counted = sumCounts(text, `\\b(${NUM})\\s+(?:personas\\s+)?herid[oa]s?\\b`);
  if (counted !== null) return counted;

  // "varios heridos", "al menos dos": hay heridos pero sin cifra exacta. Se
  // registra 1 como estimacion minima; el verificador lo marca como impreciso.
  if (/\bherid[oa]s?\b/.test(text) || /\bherid[oa]\b/.test(text)) return 1;
  return null;
}

/** Numero de fallecidos, o null si el texto no lo dice. */
function extractFatalities(text: string): number | null {
  const counted = sumCounts(
    text,
    `\\b(${NUM})\\s+(?:personas\\s+)?(?:fallecid[oa]s?|muert[oa]s?|victimas)\\b`,
  );
  if (counted !== null) return counted;

  // El texto ya viene normalizado sin tildes, asi que "falleció", "fallece" y
  // "fallecido" se reconocen todos con el mismo patron.
  if (/\b(fallecid[oa]|fallecimiento|murio|murieron|muere)\b/.test(text)) return 1;
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Carreteras                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Carretera insular. Acepta "LZ-2", "LZ 2", "L.Z. 2" y "lz-702".
 * Descarta numeros fuera de rango: "LZ-0" o "LZ-1200" no existen y suelen ser
 * un codigo postal o un numero de telefono mal partido.
 */
function extractRoad(text: string): string | null {
  // El texto llega normalizado a minusculas, asi que el patron necesita la
  // bandera "i": sin ella "lz-2" no casa nunca y la carretera sale null.
  const re = /\bL\.?\s?Z\.?\s?-?\s?(\d{1,3})\b/gi;
  let best: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const km = Number.parseInt(m[1], 10);
    if (km < 1 || km > 999) continue;
    // Si el articulo menciona varias ("LZ-2" y "LZ-20"), se toma la de menor
    // numero por ser la via principal; el resto son ramales.
    if (best === null || km < best) best = km;
  }
  return best === null ? null : `LZ-${best}`;
}

/* -------------------------------------------------------------------------- */
/*  Toponimos                                                                  */
/* -------------------------------------------------------------------------- */

/** Busca un termino con limites de palabra. */
function containsTerm(haystack: string, term: string): boolean {
  return ` ${haystack} `.includes(` ${term} `);
}

/**
 * Busca el topónimo mas especifico del texto.
 *
 * Devuelve null si no aparece ninguno: un municipio inventado es peor que
 * ninguno, porque el mapa lo enseña como si fuera cierto.
 */
function extractPlace(text: string): { slug: string | null; zone: string | null; area: string | null } {
  for (const hit of PLACE_INDEX) {
    if (!containsTerm(text, hit.term)) continue;
    return {
      slug: hit.municipalitySlug,
      zone: hit.zoneSlug,
      // El area solo se rellena cuando hay una zona de verdad. Si solo
      // aparece el municipio, se deja vacia: escribir "la zona de Tias, en
      // Tias" no dice nada y hace que el texto suene a relleno.
      area: hit.zoneSlug ? hit.label : null,
    };
  }
  return { slug: null, zone: null, area: null };
}

/* -------------------------------------------------------------------------- */
/*  Clasificacion                                                             */
/* -------------------------------------------------------------------------- */

/**
 * EL SUCESO MANDA SOBRE LOS ORGANISMOS QUE INTERVIENEN.
 *
 * Un articulo sobre un accidente casi siempre nombra a la Guardia Civil o a
 * los bomberos. Poner ACTUACION_SERVICIOS por delante de las categorias de
 * suceso hacia que practicamente TODAS las noticias de accidente acabaran
 * clasificadas como "actuacion de servicios", que es un dato inútil.
 *
 * El orden correcto es el contrario: primero se pregunta QUE PASO y, solo si no
 * hay un suceso identificado, se pregunta QUIEN intervino. Por eso
 * ACTUACION_SERVICIOS es la ultima regla de la lista.
 *
 * Dentro de cada bloque manda lo mas especifico: un atropello con bomberos
 * sigue siendo un atropello.
 */
const CATEGORY_RULES: Array<{ category: IncidentCategory; pattern: string }> = [
  { category: "DESAPARICION", pattern: "\\b(desaparecid[oa]s?|desaparicion)\\b" },
  { category: "ATROPELLO", pattern: "\\b(atropell[oa]s?|atropello|peaton|peatona|peatones|ciclista)\\b" },
  { category: "INCENDIO", pattern: "\\b(incendio|incendiado|incendios|arder|llamas|humo)\\b" },
  {
    category: "ACCIDENTE_TRAFICO",
    pattern:
      "\\b(accidente|accidentes|accidentado|accidentada|collision|colision|choque|choca|chocaron|vuelco|volcar|volco|salida de via|siniestro|siniestralidad)\\b",
  },
  {
    category: "RESCATE",
    pattern:
      "\\b(rescate|rescatad[oa]s?|helicoptero|buzo|equipo de rescate|evacuad[oa]s?|kaplan)\\b",
  },
  { category: "EMERGENCIA_SANITARIA", pattern: "\\b(emergencia|urgencias|ambulancia|112|botiquin)\\b" },
  {
    // Ultima de todas: casi cualquier articulo menciona a alguien de un
    // servicio de emergencia, asi que solo cuenta si no hay un suceso.
    category: "ACTUACION_SERVICIOS",
    pattern:
      "\\b(guardia civil|cuerpo de bomberos|proteccion civil|cruz roja|cruz verde|personal sanitario|servicios de emergencia|policia local|guardia de seguridad)\\b",
  },
];

function extractCategory(text: string): IncidentCategory | null {
  for (const rule of CATEGORY_RULES) {
    if (new RegExp(rule.pattern).test(text)) return rule.category;
  }
  return null;
}

function extractVehicleType(text: string): VehicleType | null {
  if (/\b(furgoneta|camion|camioneta|bus|cisterna|trailer|vehiculos pesados|grua)\b/.test(text)) return "CAMION";
  if (/\b(ciclista|ciclismo|bicicleta|bici|patinete)\b/.test(text)) return "BICICLETA";
  if (/\b(moto|motocicleta|motociclista|motorista|motoneta)\b/.test(text)) return "MOTO";
  if (/\b(peaton|peatona|peatones)\b/.test(text)) return "PEATON";
  if (/\b(turismo|automovil|coche|carro|vehiculo)\b/.test(text)) return "COCHE";
  return null;
}

function extractSeverity(
  text: string,
  fatalities: number | null,
  injuries: number | null,
): AccidentSeverity | null {
  // El numero de fallecidos manda sobre cualquier adjetivo del texto.
  if (fatalities !== null && fatalities > 0) return "GRAVE";
  if (/\b(grave|graves|critico|critica)\b/.test(text)) return "GRAVE";
  if (/\b(moderado|moderada|moderados|moderadas)\b/.test(text)) return "MODERADO";
  if (/\b(leve|leves|contusiones|sin lesion|ileso|ilesa)\b/.test(text)) return "LEVE";
  if (fatalities === 0) return "LEVE";
  if (injuries !== null && injuries === 0) return "LEVE";
  if (injuries !== null && injuries >= 3) return "MODERADO";
  return null;
}

/** Hora del suceso si el texto la menciona. */
function extractTimeOfDay(text: string): string | null {
  const m =
    /\b(?:sobre\s+las|alrededor\s+de\s+las|a\s+las|pasadas\s+las|hacia\s+las|cerca\s+de\s+las)\s+(\d{1,2})(?::|\s*h\s*)(\d{2})?\b/.exec(
      text,
    );
  if (!m) return null;
  const hour = Number.parseInt(m[1], 10);
  const minute = m[2] ? Number.parseInt(m[2], 10) : 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/*  Relevancia                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Terminos que hacen relevante un articulo, con su peso.
 *
 * Se distingue "accidente" (3) de "carretera" (1) porque una nota sobre el
 * estado de una carretera no es un accidente. El scraper original aceptaba
 * cualquier articulo que contuviera "carretera", y eso es casi cualquier
 * articulo de la seccion de trafico.
 */
const RELEVANCE_TERMS: Array<{ term: string; weight: number }> = [
  { term: "accidente", weight: 3 },
  { term: "accidentes", weight: 3 },
  { term: "accidentado", weight: 3 },
  { term: "accidentada", weight: 3 },
  { term: "atropello", weight: 3 },
  { term: "colision", weight: 3 },
  { term: "choque", weight: 3 },
  { term: "choca", weight: 2 },
  { term: "vuelco", weight: 3 },
  { term: "volcar", weight: 3 },
  { term: "volco", weight: 3 },
  { term: "salida de via", weight: 3 },
  { term: "siniestro", weight: 3 },
  { term: "siniestralidad", weight: 2 },
  { term: "herido grave", weight: 3 },
  { term: "heridos", weight: 2 },
  { term: "herida", weight: 2 },
  { term: "herido", weight: 2 },
  { term: "fallecido", weight: 2 },
  { term: "fallecimiento", weight: 2 },
  { term: "fallece", weight: 2 },
  { term: "fallecen", weight: 2 },
  { term: "emergencia", weight: 2 },
  { term: "rescate", weight: 2 },
  { term: "rescatado", weight: 2 },
  { term: "rescatada", weight: 2 },
  { term: "incendio", weight: 2 },
  { term: "bomberos", weight: 1 },
  { term: "112", weight: 1 },
  { term: "guardia civil", weight: 1 },
  { term: "carretera", weight: 1 },
  { term: "corte de circulacion", weight: 2 },
  { term: "aturdido", weight: 2 },
  { term: "imputado", weight: 1 },
  { term: "testigos", weight: 1 },
  { term: "cuesta abajo", weight: 1 },
];

/**
 * Analiza un articulo y extrae los hechos estructurados.
 * El titular se analiza aparte porque es donde el medio decide que es la
 * noticia; el cuerpo aporta el detalle.
 */
export function extractFacts(title: string, body: string): ExtractedFacts {
  const titleNorm = norm(title);
  const bodyNorm = norm(body);
  const combined = `${titleNorm} ${bodyNorm}`;

  const matched: string[] = [];
  let weight = 0;
  for (const { term, weight: w } of RELEVANCE_TERMS) {
    const inTitle = containsTerm(titleNorm, term);
    const inBody = containsTerm(bodyNorm, term);
    if (inTitle) {
      weight += w * 2;
      matched.push(term);
    } else if (inBody) {
      weight += w;
      matched.push(term);
    }
  }

  if (weight === 0) {
    return {
      municipalitySlug: null, zoneSlug: null, areaLabel: null, road: null, vehicleType: null,
      category: null, severity: null, injuries: null, fatalities: null,
      timeOfDay: null, outsideLanzarote: false, matchedTerms: [],
    };
  }

  // Toponimos: el titular manda, el cuerpo solo si el titular no los nombra.
  const fromTitle = extractPlace(titleNorm);
  const fromBody = extractPlace(bodyNorm);
  const place = fromTitle.slug ? fromTitle : fromBody.slug ? fromBody : null;
  const municipalitySlug = place?.slug ?? null;
  const zoneSlug = place?.zone ?? null;
  const areaLabel = place?.area ?? null;

  const fatalities = extractFatalities(combined);
  const injuries = extractInjuries(combined);
  const category = extractCategory(combined);

  return {
    municipalitySlug,
    zoneSlug,
    areaLabel,
    road: extractRoad(combined),
    vehicleType: extractVehicleType(combined),
    category,
    severity: extractSeverity(combined, fatalities, injuries),
    injuries,
    fatalities,
    timeOfDay: extractTimeOfDay(combined),
    outsideLanzarote: [...OUTSIDE_SET].some((t) => containsTerm(combined, t)),
    matchedTerms: [...new Set(matched)],
  };
}

/**
 * Puntuacion de relevancia 0..1. El umbral de corte esta en ingest.ts (0.25),
 * no aqui: este modulo no decide que entra, solo mide.
 */
export function relevanceScore(title: string, body: string): number {
  const titleNorm = norm(title);
  const bodyNorm = norm(body);
  let weight = 0;
  for (const { term, weight: w } of RELEVANCE_TERMS) {
    if (containsTerm(titleNorm, term)) weight += w * 2;
    else if (containsTerm(bodyNorm, term)) weight += w;
  }
  // 8 puntos es un articulo claramente de suceso; a partir de ahi satura.
  return Math.min(1, weight / 8);
}

export { extractInjuries, extractFatalities, extractRoad };
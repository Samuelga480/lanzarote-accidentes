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

/**
 * Los tipos de noticia. Deben coincidir con el enum `IncidentCategory` de
 * prisma/schema.prisma, o Prisma no dejara escribir la fila.
 *
 * Ojo con el reparto en dos familias: los sucesos van en CATEGORY_RULES, y en
 * lib/categorias.ts esta la lista completa de tipos de informacion. Anadir un
 * valor aqui sin anadirlo a la migracion rompe el guardado con un error de
 * Postgres.
 */
export const INCIDENT_CATEGORIES = [
  // --- Sucesos ---
  "ACCIDENTE_TRAFICO", "ATROPELLO", "INCENDIO", "RESCATE",
  "EMERGENCIA_SANITARIA", "ACTUACION_SERVICIOS", "DESAPARICION",

  // --- Informacion: politica e instituciones ---
  "POLITICA", "INSTITUCIONES",

  // --- Informacion: economia, trabajo y empresas ---
  "ECONOMIA", "EMPLEO", "EMPRESAS",

  // --- Informacion: servicios publicos ---
  "SERVICIOS", "TRANSPORTE", "URBANISMO", "AGUA", "ENERGIA", "RESIDUOS",

  // --- Informacion: salud, educacion y sociedad ---
  "SANIDAD", "EDUCACION", "SOCIEDAD", "VIVIENDA", "BIENESTAR_SOCIAL",

  // --- Informacion: territorio y economia primaria ---
  "MEDIO_AMBIENTE", "AGRICULTURA_GANADERIA", "PESCA_MAR",

  // --- Informacion: cultura, ocio y deporte ---
  "CULTURA", "FIESTAS_Y_TRADICIONES", "GASTRONOMIA", "DEPORTES",
  "TURISMO", "TELEVISION_Y_ESPECTACULOS", "SUERTES_Y_OCIO",

  // --- Informacion: ciencia, tiempo y ciudadania ---
  "CIENCIA_TECNOLOGIA", "METEOROLOGIA", "MAR", "TRAMITES_Y_SERVICIOS_CIUDADANO",
  "SEGURIDAD_CIUDADANA", "JURIDICO", "RELIGION", "ACTOS_PROTOCOLARIOS",

  "OTRO",
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

/**
 * Las reglas de SUCESOS. Van las primeras, antes que las de informacion, por un
 * motivo concreto: un articulo de un accidente casi siempre menciona a alguien
 * de un servicio de emergencia y a veces toca un tema, asi que si las reglas de
 * informacion se comprobaran primero, un atropello acabaria clasificado como
 * "seguridad ciudadana".
 */
function extractCategory(text: string): IncidentCategory | null {
  /* --- 1. Sucesos, pero solo con senal fuerte ---------------------------- */
  if (SENAL_FUERTE_DE_SUCESO.test(text)) {
    for (const rule of CATEGORY_RULES) {
      if (new RegExp(rule.pattern).test(text)) return rule.category;
    }
  }

  /* --- 2. Deportes y cultura, por delante de la informacion general ----- */
  for (const regla of RESPUESTAS_TEMPRANAS) {
    if (new RegExp(regla.pattern).test(text)) return regla.category;
  }

  /* --- 3. Sucesos con senal debil: atropellar a un ciclista, etc. ------- */
  if (!SENAL_FUERTE_DE_SUCESO.test(text)) {
    for (const rule of CATEGORY_RULES) {
      if (new RegExp(rule.pattern).test(text)) return rule.category;
    }
  }

  /* --- 4. El resto de temas de informacion ----------------------------- */
  for (const rule of INFO_RULES) {
    if (new RegExp(rule.pattern).test(text)) return rule.category;
  }
  return null;
}

/**
 * Palabras que delatan un suceso, sin mirar el contexto.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTA SEPARACION EXISTE
 * ---------------------------------------------------------------------------
 *
 * La regla de atropello busca "ciclista" y "pedon", y por si sola no dice nada
 * sobre el-sufficiency: un titular de la Vuelta Ciclista a Lanzarote es el caso
 * real que lo destapo. "Sara Reimondo y David Suarez, ganadores de la Vuelta
 * Ciclista a Lanzarote" salia clasificado como ATROPELLO, y un articulo de
 * ciclismo no es un atropello por la palabra "ciclista".
 *
 * Por eso las reglas de suceso se aplican en dos pasos: si el texto tiene una
 * de estas palabras, es un suceso y mandan ellas. Si no, "ciclista" o "pedon"
 * solo no bastan, y decide primero el tema (deportes, cultura) y despues, si
 * tampoco, las reglas de suceso.
 *
 * "Atropello a un peaton en Arrecife" sigue siendo atropello: "atropell" esta en
 * esta lista.
 */
const SENAL_FUERTE_DE_SUCESO =
  /\b(accidente|accidentad|accidentó|colision|choc|chocad|atropell|herid|herida|herido|fallec|muer|rescat|emergencia|bomberos|guardia civil|ambulancia|urgencias|incendio|incendi|explosion|desaparecid)/;

/**
 * Las que ganan a cualquier otra regla de informacion.
 *
 * El problema concreto: la palabra "partido" estaba en POLITICA, y sale en el
 * cuerpo de cualquier nota de deportes ("despues del partido de ayer"). Con la
 * tabla en orden, POLITICA se llevaba el titular entero y un partido de
 * balonmano acababa clasificado como noticia politica.
 *
 * Lo mismo con CULTURA: "festival de musica" y las "vuelta a Lanzarote" van
 * junto a carreras de ciclismo, y "carrera" se llevaba el titular.
 *
 * Aqui no hace falta un bloque entero: basta con adelantar la decision de
 * "esto es deporte" o "esto es cultura" al principio. Si ninguna de las dos
 * palabras aparece, la tabla sigue igual y no cambia nada.
 */
const RESPUESTAS_TEMPRANAS: Array<{ category: IncidentCategory; pattern: string }> = [
  {
    category: "DEPORTES",
    pattern:
      "\\b(futbol|balonmano|balon|ciclismo|ciclista|atletismo|baloncesto|voleibol|voleybol|tenis|natacion|motociclismo|maraton|deporte|deportes|deportista|club|equipo|cicar|corbelo|portero|entrenador|jugador|descenso|campeonato|torneo)\\b",
  },
  {
    category: "CULTURA",
    pattern:
      "\\b(museo|museos|festival|concierto|conciertos|teatro|exposicion|exposiciones|microrrelato|certamen|novela|escritor|escritora|literario|concurso)\\b",
  },
];

/**
 * Las reglas de INFORMACION, en el mismo orden que CATEGORIAS_INFORMACION.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE NO SE DEVUELVE NADA CUANDO NO HAY COINCIDENCIA
 * ---------------------------------------------------------------------------
 *
 * extractCategory devuelve null cuando no reconoce el texto, y el pipeline usa
 * ese null como "no se sabe". Antes, el pipeline lo traducía a
 * ACCIDENTE_TRAFICO, y por eso un horoscopo o una nota de prensa de Madrid salian
 * publicados como "Accidente". El fallo no estaba aqui sino en quien consumia el
 * null: marcar como accidente lo que no se ha podido clasificar es la peor
 * respuesta posible, porque asserts algo que nadie ha comprobado.
 *
 * Cuando no hay coincidencia la categoria se decide mas arriba, en la ingesta,
 * donde ya se sabe si la noticia es de la isla (ver evaluaIsla). Aqui solo se
 * decide el TEMA, no si entra o no.
 *
 * ---------------------------------------------------------------------------
 *  EL ORDEN IMPORTA
 * ---------------------------------------------------------------------------
 *
 * Va de mas especifico a mas general, y dentro de cada bloque manda el primero
 * que coincide. CULTURA va antes que DEPORTES porque los "festival de musica"
 * y las "vuelta a Lanzarote" aparecen junto a carreras de ciclismo, y si no, el
 * primero en encontrar la palabra seria deporte.
 */
const INFO_RULES: Array<{ category: IncidentCategory; pattern: string }> = [
  {
    category: "SUERTES_Y_OCIO",
    // Horoscopos, sorteos, quiromancia. Va el primero porque la prensa los mete
    // en la portada de la seccion general y si no, se cuelan en DEPORTES o en
    // SOCIEDAD por palabras sueltas del texto.
    pattern: "\\b(horoscopo|zodiaco|zodiacal|quiro|quiromancia|tarot|suerte|mayor[ez])\\b",
  },
  {
    category: "FIESTAS_Y_TRADICIONES",
    pattern: "\\b(fiestas|festejos|procesion|romeria|feria|carnaval|festejo|patronal|romeria)\\b",
  },
  {
    // Va la primera de las informacion porque casi cualquier articulo de la
    // isla toca el campo, y un articulo de vid es de agricultura aunque tambien
    // hable de musica o de fiestas. Los animales de granja se incluem aqui
    // porque en un contexto rural es lo mismo.
    category: "AGRICULTURA_GANADERIA",
    pattern:
      "\\b(agricultura|agricola|ganaderia|ganadero|viticola|vid|vinedo|uva|platanera|olivar|oliva|cosecha|siembra|riego|agricultor|cubo|malvasia|vaca|vacuno|caprino|oveja|cordero|granja|ganado|apicultura)\\b",
  },
  {
    category: "PESCA_MAR",
    pattern:
      "\\b(pesca|pescador|pesquera|cofradia|atun|atunero|marisqu|almunia|puerto pesquero|jábega|cebada)\\b",
  },
  {
    category: "POLITICA",
    // Muy por delante de lo demas: casi cualquier nota municipal toca algo de
    // esto, y es el tipo que mas se lee de un periodico local.
    pattern:
      "\\b(ayuntamiento|alcalde|alcaldesa|corregidor|concejal|concejala|partido|partidos|politica|electoral|elecciones|elecciones municipales|pleno|mojon|alcaldia)\\b",
  },
  {
    category: "INSTITUCIONES",
    pattern:
      "\\b(cabildo|parlamento|diputacion|consejo insular|consejo de|lastribuna|presidencia|generalitat)\\b",
  },
  {
    category: "EMPLEO",
    pattern: "\\b(empleo|trabajadores|trabajadoras|sindicato|sindical|paro|desempleo|sueldos|convenio colectivo|nómina|nomina)\\b",
  },
  {
    category: "ECONOMIA",
    pattern:
      "\\b(economia|economico|inflacion|ipc|vivienda|hipoteca|alquiler|mercantil|banco|pib|impuestos|iva)\\b",
  },
  {
    category: "EMPRESAS",
    pattern:
      "\\b(empresa|empresas|empresarial|industria|industrial|fabrica|planta|sociedad|mercantil|comercio)\\b",
  },
  {
    category: "SANIDAD",
    pattern: "\\b(sanidad|sanitario|salud|hospital|centenario|clínica|clinica|residencia|urgencias)\\b",
  },
  {
    category: "EDUCACION",
    pattern:
      "\\b(educacion|colegio|colegios|instituto|escuela|universidad|profesorado|profesor|alumno|alumnos|academia|matrícula)\\b",
  },
  {
    category: "AGUA",
    pattern: "\\b(agua|aguas|hidraulica|riego|embalse|pozo|desalinadora|pluviales|alcantarillado)\\b",
  },
  {
    category: "ENERGIA",
    pattern: "\\b(energia|electrica|eletrica|luz|placas solares|fotovoltaic|gas natural)\\b",
  },
  {
    category: "TRANSPORTE",
    pattern: "\\b(guaguas|bus|transport|transporte|aeropuerto|vueling|ryanair|linea Lanzarote|linea 30|linea 40|taxi)\\b",
  },
  {
    category: "URBANISMO",
    pattern: "\\b(urbanismo|urbanistica|obra|obras|licitacion|licitacion|planeamiento|edificacion|viviendas|constructor)\\b",
  },
  {
    category: "RESIDUOS",
    pattern: "\\b(residuo|residuos|basura|vertedero|punto limpio|reciclaje|reciclar)\\b",
  },
  {
    category: "SERVICIOS",
    // Reogisto general de servicios publicos que no encajen en los anteriores:
    // limpieza, mantenimiento,ahi servicios municipales en general.
    pattern: "\\b(servicio|recogida|limpieza|limpieza viaria|alcantarillado|servicios municipales|adjudicacion|concesion)\\b",
  },
  {
    category: "VIVIENDA",
    pattern: "\\b(vivienda|viviendas|vivienda vdh|promocion|promocion de viviendas|vivienda pública)\\b",
  },
  {
    category: "BIENESTAR_SOCIAL",
    pattern:
      "\\b(ayuda social|inclusion social|residencia|centro de mayores|personas mayores|familia|menores|infancia)\\b",
  },
  {
    category: "CULTURA",
    // Culture va antes que deportes: "festival de jazz" y las "vuelta a
    // Lanzarote" aparecen junto a carreras de ciclismo, y sin esta regla el
    // primero en encontrar la palabra seria deporte.
    //
    // Incluye "concurso", "certamen" y "microrrelato" porque son la palabra que
    // de verdad anuncia un concurso de Microrrelatos o un Certamen de Poetry, y
    // sin ellas titulos como "Conoce a los ganadores del concurso de
    // microrrelatos" se quedaban sin clasificar.
    pattern:
      "\\b(cultura|cultural|arte|artistico|museo|museos|exposicion|festival|concierto|conciertos|teatro|danza|musica|musical|libro|libros|novela|escritor|escritora|premio|premios|patrimonio|concurso|certamen|microrrelato|poesia|pintura|escultura|cine|cinema)\\b",
  },
  {
    category: "TELEVISION_Y_ESPECTACULOS",
    pattern: "\\b(television|serie|series|reality|telenovela|hbo|netflix|canal|prime time)\\b",
  },
  {
    category: "DEPORTES",
    // Los nombres de los clubs de la isla estan escritos porque son la unica
    // pista en un titular: "El CICAR Lanzarote suma su primera victoria" no
    // mencionaenticate deporte de ningun tipo, y es claramente deporte.
    pattern:
      "\\b(futbol|balonmano|balon|ciclismo|ciclista|atletismo|baloncesto|voleibol|tenis|natacion|motociclismo|maraton|deporte|deportes|deportista|club|equipo|cicar|corbelo|portada|las palmas de canarias cicar|playas de cartaya)\\b",
  },
  {
    category: "SOCIEDAD",
    /*
      Los animales domesticos no son un tema de sociedad en si mismo, pero los
      articulos de consulta sobre ellos ("El error de alimentar a los loros solo
      con semillas") no tienen otra palabra que los sitúe. Va despues de
      agricultura, donde un artículo de ganaderia tiene mas sentido.
    */
    pattern:
      "\\b(sociedad|veterinari|perro|gato|loros|mascota|mascotas|ave|aves|pajaro|pajaros|animal|animales|domestico|protector)\\b",
  },
  {
    category: "TURISMO",
    pattern: "\\b(turismo|turistico|turistas|hotel|hoteles|resort|playas|playa|vacaciones|aloja)\\b",
  },
  {
    category: "GASTRONOMIA",
    pattern: "\\b(restaurante|restaurantes|gastronom|gastronomia|restauracion|cocina|menu|delicatessen|catrufia)\\b",
  },
  {
    category: "MEDIO_AMBIENTE",
    pattern: "\\b(medioambiente|ecolog|ecologica|sostenib|contaminacion|biodiversidad|especie|reserva|carbonero|basura plastic)\\b",
  },
  {
    category: "METEOROLOGIA",
    pattern: "\\b(meteo|meteorolog|aemet|alerta naranja|lluvia|viento|calima|tormancha|oleaje)\\b",
  },
  {
    category: "MAR",
    pattern: "\\b(oleaje|maritimo|marea|bahia|puerto)\\b",
  },
  {
    category: "CIENCIA_TECNOLOGIA",
    pattern: "\\b(ciencia|cientifico|tecnolog|telecomunic|telefonia|internet|digital|innovacion|investiga)\\b",
  },
  {
    category: "SEGURIDAD_CIUDADANA",
    pattern: "\\b(policia|policia local|policia nacional|guardia civil|detenido|detencion|detencion|atentado|atraco|delito)\\b",
  },
  {
    category: "JURIDICO",
    pattern: "\\b(juzgado|juez|tribunal|sentencia|condena|condenado|demanda|juicio|audiencia penal|investigacion judicial)\\b",
  },
  {
    category: "TRAMITES_Y_SERVICIOS_CIUDADANO",
    pattern: "\\b(tramite|tramites|cita previa|padron|padrón|carne deApplying|documentacion|dni|nie)\\b",
  },
  {
    category: "RELIGION",
    pattern: "\\b(iglesia|iglesias|romeria|dioces|parroquia|obispo|papa|beatificacion|procesion)\\b",
  },
  {
    category: "ACTOS_PROTOCOLARIOS",
    pattern: "\\b(presidente|ministra|monarca|visita oficial|inauguracion|homenaje|conmemoracion|aniversario)\\b",
  },
];

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

  /*
    ---------------------------------------------------------------------------
    * POR QUE weight === 0 NO ABORTA NADA
    * ---------------------------------------------------------------------------
    *
    * Antes, un articulo sin terminos de relevancia devolvia todo en null y ya
    * estaba. Con solo los siete tipos de accidente, eso era correcto: si no
    * hablaba de accidentes, no era del sitio.
    *
    * Al abrir el sitio a la actualidad de la isla ese criterio se quedo corto:
    * un partido de balonmano o una nota del Cabildo no mencionan "accidente" ni
    * "carretera", asi que salian con todo en null. La ingesta traducía ese
    * por ACCIDENTE_TRAFICO y acababan publicados como accidentes.
    *
    * Ahora se sigue calculando igual, pero weight === 0 solo detiene el analisis
    * de accidente. Si el texto reconoce un tema de informacion, se sigue
    * adelante y se clasifica: el articulo no tiene por que ser un accidente para
    * que el sistema sepa de que va.
    */
  const tieneTemaDeInformacion = extractCategory(combined) !== null;

  if (weight === 0 && !tieneTemaDeInformacion) {
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
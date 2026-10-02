import type { AccidentSeverity, AccidentStatus, Origin, VehicleType } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Municipios de Lanzarote                                                    */
/* -------------------------------------------------------------------------- */

export type MunicipalitySeed = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
};

/**
 * Los siete municipios de Lanzarote.
 *
 * ---------------------------------------------------------------------------
 *  LO QUE SE CORRIGIO
 * ---------------------------------------------------------------------------
 *
 * La lista anterior tenia nueve entradas y tres estaban mal:
 *
 *   - "Tinaj" no existe. Es Tinajo, y el slug era `tinaj` mientras facts.ts
 *     generaba `tinajo`. Ninguna de las dos formas coincidia con la otra, asi que
 *     toda noticia de Tinajo salia con un municipio inexistente.
 *   - Betancuria es de Fuerteventura, no de Lanzarote.
 *   - Femés tambien: es un lugar de Pájara, tambien en Fuerteventura.
 *   - "San Bartolomé de Lanzarote" no es un municipio, es un pueblo de Haría.
 *     Sigue existiendo, pero como zona (ver ZONES), no como municipio.
 *
 * Y faltaba Tizayuca, que si es municipio de Lanzarote.
 *
 * Las coordenadas son del casco urbano y se usan como punto de referencia en el
 * mapa, nunca como ubicacion exacta de un accidente (eso va en approxLat/
 * approxLon y se desplaza de forma deliberada).
 */
export const MUNICIPALITIES: MunicipalitySeed[] = [
  { slug: "arrecife", name: "Arrecife", lat: 28.4843, lon: -13.7845 },
  { slug: "haria", name: "Haría", lat: 29.1150, lon: -13.4350 },
  { slug: "teguise", name: "Teguise", lat: 28.5600, lon: -13.6500 },
  { slug: "tinajo", name: "Tinajo", lat: 28.6833, lon: -13.6833 },
  { slug: "tias", name: "Tías", lat: 28.7005, lon: -13.6330 },
  { slug: "tizayuca", name: "Tizayuca", lat: 28.9900, lon: -13.6110 },
  { slug: "yaiza", name: "Yaiza", lat: 28.8170, lon: -13.6330 },
];

export const MUNICIPALITY_BY_SLUG = new Map(MUNICIPALITIES.map((m) => [m.slug, m]));

/* -------------------------------------------------------------------------- */
/*  Zonas y localidades de Lanzarote                                           */
/* -------------------------------------------------------------------------- */

export type ZoneSeed = {
  slug: string;
  name: string;
  /** Municipio al que pertenece. Es lo que se guarda en la noticia. */
  municipalitySlug: string;
  lat: number;
  lon: number;
  /**
   * Otros nombres por los que aparece en la prensa. Van ya normalizados
   * (minusculas y sin acentos), porque es como los compara facts.ts.
   */
  aliases?: string[];
};

/**
 * Las localidades y zonas de la isla.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE HACE FALTA ESTA LISTA
 * ---------------------------------------------------------------------------
 *
 * La prensa casi nunca dice "Teguise": dice "Costa Teguise", "Puerto del
 * Carmen" o "Playa San Juan". Sin esta tabla esas noticias se quedaban sin
 * municipio, y con el municipio mal atribuido el mapa mentia.
 *
 * ---------------------------------------------------------------------------
 *  ZONAS QUE COMPARTEN MUNICIPIO
 * ---------------------------------------------------------------------------
 *
 * Playa Blanca y Caleta de Famara son nucleos turisticos que tocan mas de un
 * municipio. Se les ha asignado el que corresponde a su casco urbano, que es
 * por donde entran las noticias, pero conviene saberlo antes de usarlas para
 * estadistica oficial.
 *
 * ---------------------------------------------------------------------------
 *  COORDENADAS
 * ---------------------------------------------------------------------------
 *
 * Son el centro aproximado de la localidad, no direcciones. Sirven para
 * colocar un pin en el mapa y como punto de referencia del municipio. Nunca se
 * usan como ubicacion de un accidente.
 */
export const ZONES: ZoneSeed[] = [
  // ---- Arrecife -------------------------------------------------------
  { slug: "puerto-de-naos", name: "Puerto de Naos", municipalitySlug: "arrecife", lat: 28.4770, lon: -13.7890, aliases: ["naos"] },
  { slug: "los-marmoles", name: "Los Mármoles", municipalitySlug: "arrecife", lat: 28.4775, lon: -13.7810, aliases: ["marmoles"] },
  { slug: "la-isleta", name: "La Isleta", municipalitySlug: "arrecife", lat: 28.4790, lon: -13.7810, aliases: ["isleta"] },
  { slug: "san-francisco", name: "San Francisco", municipalitySlug: "arrecife", lat: 28.4820, lon: -13.7850 },
  { slug: "las-canteras", name: "Las Canteras", municipalitySlug: "arrecife", lat: 28.4900, lon: -13.7880, aliases: ["canteras"] },
  { slug: "el-charco", name: "El Charco", municipalitySlug: "arrecife", lat: 28.4905, lon: -13.7760, aliases: ["charco"] },

  // ---- Haria ----------------------------------------------------------
  { slug: "orzola", name: "Órzola", municipalitySlug: "haria", lat: 29.1300, lon: -13.4350 },
  { slug: "las-brenas", name: "Las Breñas", municipalitySlug: "haria", lat: 29.0950, lon: -13.4350, aliases: ["brenas"] },
  { slug: "arrieta", name: "Arrieta", municipalitySlug: "haria", lat: 29.1050, lon: -13.4280 },
  { slug: "malpaso", name: "Malpaso", municipalitySlug: "haria", lat: 29.1150, lon: -13.4200 },
  { slug: "san-bartolome", name: "San Bartolomé", municipalitySlug: "haria", lat: 29.0900, lon: -13.4400, aliases: ["san bartolome"] },
  { slug: "temisas", name: "Temisas", municipalitySlug: "haria", lat: 29.1050, lon: -13.4600 },
  { slug: "las-manras", name: "Las Manras", municipalitySlug: "haria", lat: 29.1200, lon: -13.4500, aliases: ["manras"] },
  { slug: "el-jable", name: "El Jable", municipalitySlug: "haria", lat: 29.0500, lon: -13.4600, aliases: ["jable"] },

  // ---- Teguise --------------------------------------------------------
  { slug: "teguise-villa", name: "Teguise Villa", municipalitySlug: "teguise", lat: 28.5605, lon: -13.6500 },
  { slug: "costa-teguise", name: "Costa Teguise", municipalitySlug: "teguise", lat: 28.5900, lon: -13.6700 },
  { slug: "playa-san-juan", name: "Playa San Juan", municipalitySlug: "teguise", lat: 28.5900, lon: -13.6900, aliases: ["san juan"] },
  { slug: "papagayo", name: "Papagayo", municipalitySlug: "teguise", lat: 28.6150, lon: -13.6950 },
  { slug: "tahiche", name: "Tahíche", municipalitySlug: "teguise", lat: 28.5650, lon: -13.6620 },
  { slug: "soo", name: "Soo", municipalitySlug: "teguise", lat: 28.5600, lon: -13.6250 },
  { slug: "el-golfo", name: "El Golfo", municipalitySlug: "teguise", lat: 28.7800, lon: -13.7100, aliases: ["golfo"] },
  { slug: "playa-honda", name: "Playa Honda", municipalitySlug: "teguise", lat: 28.7600, lon: -13.6800 },
  { slug: "caleta-de-famara", name: "Caleta de Famara", municipalitySlug: "teguise", lat: 28.7400, lon: -13.6600, aliases: ["famara"] },
  { slug: "la-graciosa", name: "La Graciosa", municipalitySlug: "teguise", lat: 29.0100, lon: -13.4900, aliases: ["graciosa"] },

  // ---- Tinajo ---------------------------------------------------------
  { slug: "tinajo-pueblo", name: "Tinajo pueblo", municipalitySlug: "tinajo", lat: 28.6833, lon: -13.6833, aliases: ["tinajo"] },
  { slug: "quemada-de-tinajo", name: "Quemada de Tinajo", municipalitySlug: "tinajo", lat: 28.6900, lon: -13.7000, aliases: ["quemada"] },
  { slug: "famara-tinajo", name: "Famara (Tinajo)", municipalitySlug: "tinajo", lat: 28.7250, lon: -13.6550 },

  // ---- Tias -----------------------------------------------------------
  { slug: "puerto-del-carmen", name: "Puerto del Carmen", municipalitySlug: "tias", lat: 28.9400, lon: -13.6500, aliases: ["puerto carmen"] },
  { slug: "playa-de-las-americas", name: "Playa de las Américas", municipalitySlug: "tias", lat: 28.7300, lon: -13.6850, aliases: ["americas"] },
  { slug: "el-glan", name: "El Glan", municipalitySlug: "tias", lat: 28.7000, lon: -13.6200, aliases: ["glan"] },
  { slug: "san-jose", name: "San José", municipalitySlug: "tias", lat: 28.6650, lon: -13.6700, aliases: ["san jose"] },
  { slug: "morros", name: "Morros", municipalitySlug: "tias", lat: 28.7000, lon: -13.6400 },

  // ---- Tizayuca -------------------------------------------------------
  { slug: "playa-blanca", name: "Playa Blanca", municipalitySlug: "tizayuca", lat: 28.9900, lon: -13.6300 },
  { slug: "san-sebastian-de-la-gomera", name: "San Sebastián de La Gomera", municipalitySlug: "tizayuca", lat: 28.9910, lon: -13.6090, aliases: ["la gomera village"] },
  { slug: "tizayuca-pueblo", name: "Tizayuca pueblo", municipalitySlug: "tizayuca", lat: 28.9900, lon: -13.6110, aliases: ["tizayuca"] },

  // ---- Yaiza ----------------------------------------------------------
  { slug: "yaiza-pueblo", name: "Yaiza pueblo", municipalitySlug: "yaiza", lat: 28.8170, lon: -13.6330, aliases: ["yaiza"] },
  { slug: "uga", name: "Uga", municipalitySlug: "yaiza", lat: 28.8000, lon: -13.6300 },
  { slug: "playa-de-yaiza", name: "Playa de Yaiza", municipalitySlug: "yaiza", lat: 28.8100, lon: -13.6500 },
  { slug: "la-geria", name: "La Geria", municipalitySlug: "yaiza", lat: 28.8000, lon: -13.6800, aliases: ["geria"] },
  { slug: "puerto-calero", name: "Puerto Calero", municipalitySlug: "yaiza", lat: 28.7900, lon: -13.7200 },
];

export const ZONE_BY_SLUG = new Map(ZONES.map((z) => [z.slug, z]));

/** Zonas agrupadas por municipio, en el orden en que se declararon los municipios. */
export function zonesByMunicipality(): Array<{
  municipality: MunicipalitySeed;
  zones: ZoneSeed[];
}> {
  return MUNICIPALITIES.map((m) => ({
    municipality: m,
    zones: ZONES.filter((z) => z.municipalitySlug === m.slug),
  })).filter((g) => g.zones.length > 0);
}

/* -------------------------------------------------------------------------- */
/*  Etiquetas de los enums (texto para la interfaz)                            */
/* -------------------------------------------------------------------------- */

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  COCHE: "Coche",
  MOTO: "Moto",
  CAMION: "Camión",
  BICICLETA: "Bicicleta",
  PEATON: "Peatón",
  OTROS: "Otros vehículos",
};

/**
 * Categorias de incidente y la pastilla de color que lleva cada una.
 *
 * `pill` es el nombre de clase de site.css. Los cinco primeros son los del
 * diseno original (colision, atropello, salida, vuelco, moto); los siguientes
 * son las categorias nuevas de la base de datos y siguen el mismo patron pastel
 * para que la rejilla se lea igual de un vistazo.
 */
export const CATEGORY_LABEL: Record<string, string> = {
  ACCIDENTE_TRAFICO: "Accidente",
  ATROPELLO: "Atropello",
  INCENDIO: "Incendio",
  RESCATE: "Rescate",
  EMERGENCIA_SANITARIA: "Emergencia sanitaria",
  ACTUACION_SERVICIOS: "Servicios de emergencia",
  DESAPARICION: "Desaparición",
  OTRO: "Otro",
};

export const CATEGORY_PILL: Record<string, string> = {
  ACCIDENTE_TRAFICO: "colision",
  ATROPELLO: "atropello",
  INCENDIO: "incendio",
  RESCATE: "rescate",
  EMERGENCIA_SANITARIA: "sanitario",
  ACTUACION_SERVICIOS: "servicios",
  DESAPARICION: "servicios",
  OTRO: "neutral",
};

export const VEHICLE_LABEL_PLURAL: Record<VehicleType, string> = {
  COCHE: "Coches",
  MOTO: "Motos",
  CAMION: "Camiones",
  BICICLETA: "Bicicletas",
  PEATON: "Peatones",
  OTROS: "Otros vehículos",
};

export const VEHICLE_LIST: Array<{ value: VehicleType; label: string; plural: string }> = (
  Object.keys(VEHICLE_LABEL) as VehicleType[]
).map((value) => ({ value, label: VEHICLE_LABEL[value], plural: VEHICLE_LABEL_PLURAL[value] }));

export const SEVERITY_LABEL: Record<AccidentSeverity, string> = {
  LEVE: "Leve",
  MODERADO: "Moderado",
  GRAVE: "Grave",
};

export const STATUS_LABEL: Record<AccidentStatus, string> = {
  PENDING_REVIEW: "Pendiente de revisión",
  PUBLISHED: "Publicada",
  REJECTED: "Descartada",
  ARCHIVED: "Archivada",
};

export const ORIGIN_LABEL: Record<Origin, string> = {
  MANUAL: "Manual",
  AI: "Generada por IA",
};

/* -------------------------------------------------------------------------- */
/*  Otros datos del sitio                                                      */
/* -------------------------------------------------------------------------- */

export const SITE = {
  /**
   * El nombre debe coincidir con el dominio (accidenteslanzarote.com).
   *
   * Antes decia "Tráfico Lanzarote", que era el nombre del proyecto antiguo y
   * no el del sitio. Con el dominio ya cambiado, mantener el nombre viejo
   * desconcertaba: la direccion decia una cosa y la pagina otra.
   */
  name: "Accidentes Lanzarote",
  tagline: "Accidentes, emergencias y rescates en la isla",
  description:
    "Noticias de accidentes de coches, motos y otros vehículos, emergencias y rescates en Lanzarote. Información por municipio, carretera, fecha y tipo de vehículo.",
  organization: "Accidentes Lanzarote",
  locale: "es_ES",
  twitter: "@accidentesLZ",
};

/** Rango de fechas aceptado por los filtros (dias hacia atras). */
export const DATE_RANGE_OPTIONS = [
  { value: "1", label: "Últimas 24 horas" },
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 3 meses" },
  { value: "365", label: "Último año" },
] as const;

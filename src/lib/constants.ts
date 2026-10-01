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
 * Los nueve municipios de la isla. Las coordenadas son del casco urbano y se
 * usan como punto de referencia en el mapa, nunca como ubicacion exacta de un
 * accidente (eso va en approxLat/approxLon y sedesplaza de forma deliberada).
 */
export const MUNICIPALITIES: MunicipalitySeed[] = [
  { slug: "arrecife", name: "Arrecife", lat: 28.4843, lon: -13.7845 },
  { slug: "teguise", name: "Teguise", lat: 28.5600, lon: -13.6500 },
  { slug: "tias", name: "Tías", lat: 28.7005, lon: -13.6330 },
  { slug: "tinaj", name: "Tinaj", lat: 28.6833, lon: -13.6833 },
  { slug: "yaiza", name: "Yaiza", lat: 28.8170, lon: -13.6330 },
  { slug: "haria", name: "Haría", lat: 29.1150, lon: -13.4350 },
  { slug: "san-bartolome", name: "San Bartolomé de Lanzarote", lat: 29.0333, lon: -13.5833 },
  { slug: "betancuria", name: "Betancuria", lat: 29.1000, lon: -13.5333 },
  { slug: "femes", name: "Femés", lat: 29.0833, lon: -13.5500 },
];

export const MUNICIPALITY_BY_SLUG = new Map(MUNICIPALITIES.map((m) => [m.slug, m]));

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

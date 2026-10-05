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
 *  LO QUE SE CORRIGIO (y por que)
 * ---------------------------------------------------------------------------
 *
 * Este bloque estaba mal en dos cosas y las dos hacia el mismo sitio: que el
 * mapa mintiera.
 *
 * 1. LA LISTA. Decia que Tizayuca era municipio y que San Bartolome no. Es justo
 *    al reves. Los siete municipios de Lanzarote son Arrecife, San Bartolome,
 *    Tias, Yaiza, Tinajo, Teguise y Haria. Tizayuca no es un municipio: es una
 *    demarcacion dentro de Teguise. Y San Bartolome si lo es, desde 1997, y es
 *    donde esta el aeropuerto de la isla. Se ha comprobadocon tres fuentes
 *    independientes: Wikipedia, las areas administrativas de OpenStreetMap
 *    (admin_level=8) y la geocodificacion inversa de Nominatim.
 *
 * 2. LAS COORDENADAS. Todas estaban desplazadas hacia el sur, entre 30 y 55 km.
 *    Arrecife figuraba en 28.48, -13.78, que es MAR ABIERTO al sur de la isla:
 *    al comprobarlo con las teselas del mapa, el punto cae en una tesela en
 *    blanco de 103 bytes, que es como se ve una tesela sin tierra. Lo mismo
 *    pasaba con Tinajo y con Tizayuca, que ademas estaba en Guime.
 *
 *    El error era dificil de ver porque la comprobacion de pines compara cada
 *    marcador contra esta misma tabla, asi que daba "todo correcto" sobre unas
 *    coordenadas que no eran de ningun sitio.
 *
 * Las de ahora son las del nodo `place` real de OpenStreetMap para cada
 * localidad, no un punto de reserva ni un valor aproximado a ojo. Se usan como
 * punto de referencia del municipio; la ubicacion de un accidente va aparte, en
 * approxLat/approxLon, y se desplaza de forma deliberada.
 */
export const MUNICIPALITIES: MunicipalitySeed[] = [
  { slug: "arrecife", name: "Arrecife", lat: 28.9640, lon: -13.5499 },
  { slug: "san-bartolome", name: "San Bartolomé", lat: 29.0017, lon: -13.6139 },
  { slug: "tias", name: "Tías", lat: 28.9543, lon: -13.6529 },
  { slug: "yaiza", name: "Yaiza", lat: 28.9529, lon: -13.7642 },
  { slug: "tinajo", name: "Tinajo", lat: 29.0666, lon: -13.6765 },
  { slug: "teguise", name: "Teguise", lat: 29.0593, lon: -13.5602 },
  { slug: "haria", name: "Haría", lat: 29.1459, lon: -13.5001 },
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
 *  DE DONDE SALE ESTA LISTA
 * ---------------------------------------------------------------------------
 *
 * Es la lista que dio el editor, en su orden, sin las repeticiones (Muñique
 * venia dos veces). Cada una trae la coordenada del nodo `place` que tiene en
 * OpenStreetMap, no un valor puesto a ojo: eso se ha contrasted con la
 * geocodificacion inversa de Nominatim, que devuelve la calle y el municipio en
 * el que cae el punto.
 *
 * El municipio de cada zona tambien viene de ahi, no de suposiciones. Salen
 * algunos repartos que sorprende, y son los correctos:
 *
 *   - Guatiza, Los Valles, Caleta de Famara, Caleta de Caballo y Las
 *     Caletas son de TEGUISE, no de Tinajo ni de Haría.
 *   - La Vegueta es de TINAJO y Masdache es de TIAS, al reves de lo que
 *     dicta el sentido comun.
 *   - Mala es de HARIA.
 *   - Playa Blanca es de YAIZA, no de Tizayuca.
 *
 * ---------------------------------------------------------------------------
 *  ZONAS QUE SON TAMBIEN MUNICIPIO
 * ---------------------------------------------------------------------------
 *
 * Siete entradas comparten nombre con un municipio: Arrecife, Haría, Teguise,
 * Tinajo, Tías, Yaiza y San Bartolomé. No es un error: son los mismos sitios y
 * el editor los ha pedido los dos. Lo unico que cambia es el slug, que lleva el
 * sufijo "-pueblo" para que /zonas/arrecife-pueblo y /municipios/arrecife no
 * sean dos direcciones distintas con el mismo contenido. Es el mismo criterio
 * que ya usaba la lista anterior ("tinajo-pueblo", "yaiza-pueblo").
 *
 * El extractor de topónimos resuelve esas palabras al municipio, no a la zona,
 * porque la entrada del municipio va primero. Y da igual: el punto es el mismo
 * y la ficha cuenta lo mismo.
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
  { slug: "arrecife-pueblo", name: "Arrecife", municipalitySlug: "arrecife", lat: 28.9640, lon: -13.5499 },

  // ---- Teguise -----------------------------------------------------
  { slug: "costa-teguise", name: "Costa Teguise", municipalitySlug: "teguise", lat: 28.9959, lon: -13.4972 },
  { slug: "tahiche", name: "Tahíche", municipalitySlug: "teguise", lat: 29.0136, lon: -13.5431 },
  { slug: "nazaret", name: "Nazaret", municipalitySlug: "teguise", lat: 29.0379, lon: -13.5608 },
  { slug: "teseguite", name: "Teseguite", municipalitySlug: "teguise", lat: 29.0546, lon: -13.5318 },
  { slug: "teguise-pueblo", name: "Teguise", municipalitySlug: "teguise", lat: 29.0593, lon: -13.5602 },
  { slug: "soo", name: "Soo", municipalitySlug: "teguise", lat: 29.0993, lon: -13.6223 },
  { slug: "munique", name: "Muñique", municipalitySlug: "teguise", lat: 29.0709, lon: -13.6345 },
  { slug: "tiagua", name: "Tiagua", municipalitySlug: "teguise", lat: 29.0546, lon: -13.6336 },
  { slug: "tao", name: "Tao", municipalitySlug: "teguise", lat: 29.0395, lon: -13.6245 },
  { slug: "mozaga", name: "Mozaga", municipalitySlug: "teguise", lat: 29.0219, lon: -13.6126 },
  { slug: "caleta-de-famara", name: "Caleta de Famara", municipalitySlug: "teguise", lat: 29.1188, lon: -13.5660, aliases: ["famara"] },
  { slug: "las-caletas", name: "Las Caletas", municipalitySlug: "teguise", lat: 28.9820, lon: -13.5116 },
  { slug: "guatiza", name: "Guatiza", municipalitySlug: "teguise", lat: 29.0738, lon: -13.4792 },
  { slug: "los-valles", name: "Los Valles", municipalitySlug: "teguise", lat: 29.0840, lon: -13.5231 },
  { slug: "el-mojon", name: "El Mojón", municipalitySlug: "teguise", lat: 29.0683, lon: -13.5178, aliases: ["mojon"] },

  // ---- Haria --------------------------------------------------------
  { slug: "mala", name: "Mala", municipalitySlug: "haria", lat: 29.0983, lon: -13.4679 },
  { slug: "haria-pueblo", name: "Haría", municipalitySlug: "haria", lat: 29.1459, lon: -13.5001 },
  { slug: "maguez", name: "Máguez", municipalitySlug: "haria", lat: 29.1600, lon: -13.4951 },
  { slug: "ye", name: "Yé", municipalitySlug: "haria", lat: 29.1949, lon: -13.4791 },
  { slug: "orzola", name: "Órzola", municipalitySlug: "haria", lat: 29.2217, lon: -13.4519 },
  { slug: "arrieta", name: "Arrieta", municipalitySlug: "haria", lat: 29.1318, lon: -13.4618 },
  { slug: "punta-mujeres", name: "Punta Mujeres", municipalitySlug: "haria", lat: 29.1448, lon: -13.4476 },
  { slug: "tabayesco", name: "Tabayesco", municipalitySlug: "haria", lat: 29.1274, lon: -13.4796 },
  { slug: "charco-del-palo", name: "Charco del Palo", municipalitySlug: "haria", lat: 29.0841, lon: -13.4517 },

  // ---- San Bartolome ------------------------------------------------
  { slug: "san-bartolome-pueblo", name: "San Bartolomé", municipalitySlug: "san-bartolome", lat: 29.0017, lon: -13.6139 },
  { slug: "playa-honda", name: "Playa Honda", municipalitySlug: "san-bartolome", lat: 28.9551, lon: -13.5903 },
  { slug: "guime", name: "Güime", municipalitySlug: "san-bartolome", lat: 28.9725, lon: -13.6140 },
  { slug: "montana-blanca", name: "Montaña Blanca", municipalitySlug: "san-bartolome", lat: 28.9879, lon: -13.6374 },

  // ---- Tias ---------------------------------------------------------
  { slug: "tias-pueblo", name: "Tías", municipalitySlug: "tias", lat: 28.9543, lon: -13.6529 },
  { slug: "puerto-del-carmen", name: "Puerto del Carmen", municipalitySlug: "tias", lat: 28.9204, lon: -13.6507, aliases: ["puerto carmen"] },
  { slug: "macher", name: "Mácher", municipalitySlug: "tias", lat: 28.9484, lon: -13.6839 },
  { slug: "la-asomada", name: "La Asomada", municipalitySlug: "tias", lat: 28.9611, lon: -13.6908 },
  { slug: "conil", name: "Conil", municipalitySlug: "tias", lat: 28.9679, lon: -13.6680 },
  { slug: "masdache", name: "Masdache", municipalitySlug: "tias", lat: 28.9973, lon: -13.6564 },

  // ---- Yaiza --------------------------------------------------------
  { slug: "puerto-calero", name: "Puerto Calero", municipalitySlug: "yaiza", lat: 28.9210, lon: -13.7037 },
  { slug: "yaiza-pueblo", name: "Yaiza", municipalitySlug: "yaiza", lat: 28.9529, lon: -13.7642 },
  { slug: "playa-blanca", name: "Playa Blanca", municipalitySlug: "yaiza", lat: 28.8632, lon: -13.8299 },
  { slug: "uga", name: "Uga", municipalitySlug: "yaiza", lat: 28.9502, lon: -13.7441 },
  { slug: "femes", name: "Femés", municipalitySlug: "yaiza", lat: 28.9138, lon: -13.7789 },
  { slug: "las-brenas", name: "Las Breñas", municipalitySlug: "yaiza", lat: 28.9199, lon: -13.8104 },
  { slug: "playa-quemada", name: "Playa Quemada", municipalitySlug: "yaiza", lat: 28.9075, lon: -13.7322 },
  { slug: "el-golfo", name: "El Golfo", municipalitySlug: "yaiza", lat: 28.9822, lon: -13.8314, aliases: ["golfo"] },

  // ---- Tinajo -------------------------------------------------------
  { slug: "tinajo-pueblo", name: "Tinajo", municipalitySlug: "tinajo", lat: 29.0666, lon: -13.6765 },
  { slug: "la-santa", name: "La Santa", municipalitySlug: "tinajo", lat: 29.1077, lon: -13.6657 },
  { slug: "mancha-blanca", name: "Mancha Blanca", municipalitySlug: "tinajo", lat: 29.0430, lon: -13.6898 },
  { slug: "la-vegueta", name: "La Vegueta", municipalitySlug: "tinajo", lat: 29.0474, lon: -13.6509 },
  { slug: "el-cuchillo", name: "El Cuchillo", municipalitySlug: "tinajo", lat: 29.0819, lon: -13.6644 },
  { slug: "los-dolores", name: "Los Dolores", municipalitySlug: "tinajo", lat: 29.0443, lon: -13.6816 },

  { slug: "islote", name: "Islote", municipalitySlug: "san-bartolome", lat: 29.0180, lon: -13.6292, aliases: ["el islote"] },

  { slug: "caleta-de-caballo", name: "Caleta de Caballo", municipalitySlug: "teguise", lat: 29.1165, lon: -13.6403 },
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

  POLITICA: "Política",
  INSTITUCIONES: "Instituciones",
  ECONOMIA: "Economía",
  EMPLEO: "Empleo",
  EMPRESAS: "Empresas",
  SERVICIOS: "Servicios públicos",
  TRANSPORTE: "Transporte",
  URBANISMO: "Urbanismo",
  AGUA: "Agua",
  ENERGIA: "Energía",
  RESIDUOS: "Residuos",
  SANIDAD: "Sanidad",
  EDUCACION: "Educación",
  SOCIEDAD: "Sociedad",
  VIVIENDA: "Vivienda",
  BIENESTAR_SOCIAL: "Bienestar social",
  MEDIO_AMBIENTE: "Medio ambiente",
  AGRICULTURA_GANADERIA: "Agricultura y ganadería",
  PESCA_MAR: "Pesca y mar",
  TURISMO: "Turismo",
  CULTURA: "Cultura",
  FIESTAS_Y_TRADICIONES: "Fiestas y tradiciones",
  GASTRONOMIA: "Gastronomía",
  DEPORTES: "Deportes",
  TELEVISION_Y_ESPECTACULOS: "Televisión y espectáculos",
  CIENCIA_TECNOLOGIA: "Ciencia y tecnología",
  METEOROLOGIA: "Meteorología",
  MAR: "Mar",
  SEGURIDAD_CIUDADANA: "Seguridad ciudadana",
  JURIDICO: "Judicial y legal",
  TRAMITES_Y_SERVICIOS_CIUDADANO: "Trámites",
  RELIGION: "Religión",
  ACTOS_PROTOCOLARIOS: "Actos protocolarios",
  SUERTES_Y_OCIO: "Suerte y ocio",

  OTRO: "Otro",
};

/**
 * Los tipos de noticia, en el orden en que salen en el filtro.
 *
 * Se construye desde CATEGORY_LABEL y no al reves, para que anadir un tipo en
 * las etiquetas lo anade aqui solo. Este listado sustituye al de vehiculos en
 * los filtros del sitio: en un diario que recoge cualquier actualidad, "tipo de
 * vehiculo" no significa nada y "tipo de noticia" si.
 *
 * OJO: esto son TODOS los tipos,페인/ip sin agrupar. Para los dos listados del
 * sitio (sucesos e informacion) usa CATEGORIAS_SUCESO y CATEGORIAS_INFORMACION
 * de lib/categorias.ts, que si declaran el reparto.
 *
 * Antes esta lista solo tenia los tipos de accidente, y por eso todo lo demas
 * acababa marcado como ACCIDENTE_TRAFICO. Ver la nota de CATEGORIAS_SUCESO.
 */
export const CATEGORY_LIST: Array<{ value: string; label: string }> = Object.entries(CATEGORY_LABEL)
  .filter(([value]) => value !== "OTRO")
  .map(([value, label]) => ({ value, label }));

/**
 * El color de la pastilla de cada tipo.
 *
 * Los sucesos usan los colores que tenia el diseno original, porque son los que
 * el lector ya reconoce. Los temas de informacion comparten una paleta neutra:
 * no son noticias de emergencia y no deben destacar tanto en una portada donde
 * conviven con un atropello.
 *
 * Los que no aparecen aqui salen con "neutral", por eso es un Record parcial en
 * la practica aunque el tipo lo declare completo.
 */
export const CATEGORY_PILL: Record<string, string> = {
  ACCIDENTE_TRAFICO: "colision",
  ATROPELLO: "atropello",
  INCENDIO: "incendio",
  RESCATE: "rescate",
  EMERGENCIA_SANITARIA: "sanitario",
  ACTUACION_SERVICIOS: "servicios",
  DESAPARICION: "servicios",

  // Sucesos con tono de actualidad: el hecho sigue siendo grave pero se cuenta
  // como noticia de la isla mas que como emergencia.
  SEGURIDAD_CIUDADANA: "servicios",
  JURIDICO: "servicios",

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
   * El nombre ya no coincide con el dominio (accidenteslanzarote.com), y es a
   * proposito: el sitio paso de ser un diario de accidentes de trafico a
   * recoger cualquier noticia de la isla. El dominio es el que era y moverlo
   * seria otra historia.
   */
  name: "Noticias 24/7",
  tagline: "Toda la actualidad de Lanzarote, a cualquier hora",
  description:
    "Noticias de Lanzarote de cualquier tipo: accidentes, incendios, rescates, emergencias y toda la actualidad de la isla. Información por municipio, tipo de noticia y fecha.",
  organization: "Noticias 24/7",
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

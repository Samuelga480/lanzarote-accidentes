/**
 * Registro de fuentes.
 *
 * ---------------------------------------------------------------------------
 *  SONDEO DEL 2 DE OCTUBRE DE 2026
 * ---------------------------------------------------------------------------
 *
 * Se probaron mas de 60 direcciones a mano con scripts/probe-medios.ts. De los
 * nueve medios que se pidieron, cinco tienen algo legible por maquina y cuatro no
 * tienen nada. Los que fallan estan al final del fichero, con el motivo, para no
 * volver a probarlos dentro de seis meses.
 *
 * Un `200 text/html` es el caso peligroso: la peticion "funciona", el parser no
 * encuentra items y el sistema cree que la fuente no tiene nada. Por eso
 * `parseFeed` distingue "XML invalido" de "feed vacio", y `contentTypeLooksXml`
 * comprueba el tipo MIME antes de intentar analizar nada.
 *
 * ---------------------------------------------------------------------------
 *  LO QUE LIMITA A ESTOS FUENTES
 * ---------------------------------------------------------------------------
 *
 * Ningun RSS lleva historico: ninguno pasa de unos dias (de 2 a 17 segun el
 * medio). Para el historico hay que ir a la API de WordPress o a los sitemaps por
 * mes, que es lo que hace scripts/backfill.ts. Un RSS sirve para detectar lo
 * nuevo, no para reconstruir el ano.
 *
 * Ademas casi todos estos medios son de tema general: de 75 articulos de La Voz
 * de Lanzarote, cuatro son de trafico. Por eso existe la puerta de
 * traffic-gate.ts, y por eso el sitio se llenaba de politica local sin ella.
 */
export type FeedKind = "rss" | "atom" | "html";

export type FeedDefinition = {
  name: string;
  url: string;
  kind: FeedKind;
  region: "LANZAROTE" | "CANARIAS" | "NACIONAL";
  /** Fiabilidad de partida, 0..1. */
  baseScore: number;
  /** true si el medio sirve XML aunque la cabecera Content-Type no lo diga. */
  allowHtmlContentType?: boolean;
  enabled: boolean;
  /**
   * Apaga la fuente aunque la base de datos la tenga activa.
   *
   * Existe porque `syncFeeds` no toca `enabled` cuando la fila ya existe, para
   * que se pueda deshabilitar desde la base de datos sin desplegar. Con esto la
   * decision se toma en el codigo y es del mismo modo para todo el mundo.
   */
  forceDisabled?: boolean;
  notes?: string;
};

/**
 * Las fuentes que funcionan, todas comprobadas con `scripts/probe-medios.ts`.
 *
 * ---------------------------------------------------------------------------
 *  LO QUE HAY Y LO QUE NO
 * ---------------------------------------------------------------------------
 *
 * De los nueve medios que se pidieron, cinco tienen algo legible por máquina y
 * cuatro no. El detalle está en FUENTES_CANDIDATAS, que registra también los
 * que fallan y por qué, para no volver a probarlos dentro de seis meses.
 *
 * Advertencia sobre el alcance de los RSS: ninguno pasa de unos días. Traen lo
 * último publicado, no el histórico. Para llegar al 1 de enero hay que usar la
 * API de WordPress o los sitemaps por mes, que es lo que hace
 * `scripts/backfill.ts`.
 */
export const FEEDS: FeedDefinition[] = [
  {
    name: "112 Canarias",
    url: "https://www.112canarias.com/112/feed/",
    kind: "rss",
    region: "CANARIAS",
    baseScore: 0.9,
    enabled: true,
    notes:
      "Fuente oficial. El dominio es 112canarias.COM, no .es (con .es no resuelve). " +
      "Trae 10 entradas y cubre unos 10 dias. Casi todo son alertas de meteo y " +
      "riesgo forestal, que la puerta de trafico descarta; el resto son avisos " +
      "de incidente reales.",
  },
  {
    name: "Consorcio de Seguridad y Emergencias de Lanzarote",
    url: "https://emergenciaslanzarote.com/feed/",
    kind: "rss",
    region: "LANZAROTE",
    baseScore: 0.95,
    enabled: true,
    notes:
      "Fuente oficial y la mas cercana al tema: cada entrada es una actuacion " +
      "concreta (incendio, rescate, asistencia). Trae 10 entradas y cubre unos " +
      "8 dias. Tiene ademas API de WordPress y sitemaps por mes, de donde sale " +
      "el historico.",
  },
  {
    name: "Gobierno de Canarias - incidentes 112",
    url: "https://www3.gobiernodecanarias.org/noticias/category/consejeria-seguridad-y-emergencias/incidente-112/feed/",
    kind: "rss",
    region: "CANARIAS",
    baseScore: 0.95,
    enabled: true,
    notes:
      "No estaba en la lista pedida y se ha puesto porque es la que mas se " +
      "parece al tema: un parte por incidente, redactado por el CECOES. Los " +
      "titulos son directamente 'Tres heridos tras la colision frontal de dos " +
      "turismos'. Trae 50 entradas y cubre unos 17 dias.",
  },
  {
    name: "Cronicas de Lanzarote",
    url: "https://www.cronicasdelanzarote.es/rss",
    kind: "rss",
    region: "LANZAROTE",
    baseScore: 0.8,
    enabled: true,
    notes:
      "Diario local. El dominio es cronicasdelanzarote.ES (con .com no resuelve). " +
      "Trae 20 entradas y cubre unos 2 dias, asi que necesita al menos una " +
      "pasada al dia para no perder nada. Es de tema general: la puerta de " +
      "trafico descarta la mayor parte.",
  },
  {
    name: "La Voz de Lanzarote",
    url: "https://www.lavozdelanzarote.com/rss",
    kind: "rss",
    region: "LANZAROTE",
    baseScore: 0.85,
    enabled: true,
    notes:
      "Diario local. Trae 75 entradas y cubre unos 3 dias. Es de tema general, " +
      "asi que casi todo lo que publica queda fuera por la puerta de trafico.",
  },
  {
    name: "20 minutos",
    url: "https://www.20minutos.es/rss/",
    kind: "rss",
    region: "NACIONAL",
    baseScore: 0.4,
    enabled: true,
    notes:
      "Nacional. Entra para no perder el accidente de una isla que recoge la " +
      "agencia. Casi todo su contenido es de otras zonas y el filtro de isla lo " +
      "descarta. Puntuacion baja a proposito.",
  },
  {
    name: "Cabildo de Lanzarote",
    url: "https://www.cabildodelanzarote.com/noticias/rss.xml",
    kind: "rss",
    region: "LANZAROTE",
    baseScore: 0.85,
    enabled: false,
    forceDisabled: true,
    notes:
      "APAGADA. La direccion no esta verificada: devuelve 404. Se conserva la " +
      "fila para no perder el historial, pero no se lee. El Cabildo tiene " +
      "noticias en accidents, no en un RSS. Pendiente de buscar donde publica.",
  },
];

/**
 * Fuentes que se han probado y NO sirven. NO se registran: estan aqui para que
 * nadie vuelva a perder una hora probandolas, y para dejar escrito por que se
 * descartaron.
 *
 * Todas comprobadas el 2 de octubre de 2026 con scripts/probe-medios.ts.
 */
export const FUENTES_CANDIDATAS: Array<{
  name: string;
  candidates: string[];
  /** Por que no sirve. */
  motivo: string;
}> = [
  {
    name: "Lancelot Digital (grupo Lancelot Medios)",
    candidates: [
      "https://www.lancelotdigital.com/rss",
      "https://www.lancelotdigital.com/rss.xml",
      "https://www.lancelotdigital.com/feed",
      "https://www.lancelotdigital.com/sitemap.xml",
    ],
    motivo:
      "Ninguna de las cuatro existe (404). El sitio solo sirve HTML. Ojo: el " +
      "dominio del grupo no es lancelotmedios.com, que no resuelve, sino " +
      "lancelotdigital.com.",
  },
  {
    name: "Diario de Lanzarote",
    candidates: [
      "https://www.diariodelanzarote.com/rss",
      "https://www.diariodelanzarote.com/rss.xml",
      "https://www.diariodelanzarote.com/feed",
      "https://www.diariodelanzarote.com/sitemap.xml",
    ],
    motivo:
      "Solo rss.xml responde, y esta MUERTO: la entrada mas reciente es de hace " +
      "3 anos y son paginas de seccion ('DESTACAMOS', 'EL PASEO'), no noticias. " +
      "El sitio ha pasado a ser un portal que manda a diariodecanarias.es y a " +
      "diariodefuerteventura.com. Como fuente de Lanzarote, descartado.",
  },
  {
    name: "Cadena SER Lanzarote",
    candidates: [
      "https://cadenaser.com/rss/las-palmas/",
      "https://cadenaser.com/emisores/las-palmas/rss/",
      "https://cadenaser.com/rss/lanzarote/",
      "https://cadenaser.com/emisores/lanzarote/rss/",
      "https://cadenaser.com/rss/",
      "https://cadenaser.com/sitemap.xml",
    ],
    motivo:
      "Todo 404, y /rss/ da 403. La cadena no publica un RSS accesible. La " +
      "alternativa seria recorrer /tag/lanzarote/ en HTML, que es fragil.",
  },
  {
    name: "RTVC",
    candidates: [
      "https://www.rtvc.es/rss/",
      "https://www.rtvc.es/noticias/rss/",
      "https://www.rtvc.es/rss/canarias.xml",
      "https://www.rtvc.es/feed/",
      "https://www.rtvc.es/sitemap.xml",
    ],
    motivo:
      "Sin RSS: /rss/ y /feed/ devuelven HTML con codigo 200 y el resto da 404. " +
      "SI tiene sitemap_index.xml con 169 sitemaps de articulos (unos 85.000), " +
      "pero no hay indice por fecha, asi que hay que recorrerlos enteros para " +
      "encontrar las noticias de Lanzarote: 169 descargas. Es la unica via " +
      "posible y exige un trabajo aparte.",
  },
  {
    name: "Europa Press Canarias",
    candidates: [
      "https://e00-efe.uecdn.es/efe/amanecer/canarias/rss.xml",
      "https://www.europapress.es/rss/canarias/1.xml",
      "https://efe.com/canarias/rss.xml",
    ],
    motivo:
      "Los CDN de efe contestan con XML que no es un feed, y efe.com resuelve a " +
      "una direccion interna (192.0.78.24) que el filtro de SSRF bloquea. " +
      "Solo se podria leer entrando por europapress.es.",
  },
  {
    name: "Canarias7",
    candidates: [
      "https://www.canarias7.es/rss/",
      "https://www.canarias7.es/canarias/rss/",
      "https://www.canarias7.es/rss/lanzarote.xml",
    ],
    motivo:
      "Devuelve 200 con HTML, no XML. El 200 engaña: el sistema creeria que la " +
      "fuente no tiene noticias.",
  },
  {
    name: "La Provincia - Lanzarote",
    candidates: [
      "https://www.laprovincia.es/rss/lanzarote",
      "https://www.laprovincia.es/rss/canarias",
      "https://www.laprovincia.es/rss/",
    ],
    motivo: "Responde 406: rechaza la peticion del scraper.",
  },
];

/**
 * Comprueba una definicion sin tocar la base de datos. Lo usa
 * `npm run monitor:once -- --check-feeds` para validar las URLs al anadir una.
 */
export type FeedProbe = {
  definition: FeedDefinition;
  ok: boolean;
  status: number;
  contentType: string | null;
  items: number;
  valid: boolean;
  durationMs: number;
  error?: string;
};

/** Verifica que el tipo MIME no nos este enmascaranando un HTML. */
export function contentTypeLooksXml(contentType: string | null): boolean {
  if (!contentType) return true; // Ausente: se acepta y decide el parser.
  const ct = contentType.toLowerCase();
  return (
    ct.includes("xml") ||
    ct.includes("rss") ||
    ct.includes("atom") ||
    ct.includes("text/plain")
  );
}
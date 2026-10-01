/**
 * Registro de fuentes.
 *
 * Las URLs de aqui se comprobaron una a una con curl. El resultado fue que de
 * los ocho feeds que tenia el proyecto, UNO servia XML de verdad:
 *
 *   vozdelanzarote.com/rss          200 text/xml   <- el unico que funciona
 *   lanzaroteahora.es/feed/         200 text/html  <- NO es un feed (pagina)
 *   lanzaroteahora.com/feed/        200 text/html  <- NO es un feed (pagina)
 *   canarias7.es/rss/               200 text/html  <- NO es un feed
 *   laprovincia.es/rss/             406            <- rechaza la peticion
 *   feeds.elpais.com/...trafico     403            <- bloquea el acceso
 *   20minutos.es/rss/trafico/       404            <- no existe
 *   rtve.es/noticias/trafico/rss/   404            <- no existe
 *
 * Un `200 text/html` es el caso peligroso: la peticion "funciona", el parser no
 * encuentra items y el sistema cree que la fuente no tiene nada. Por eso
 * `parseFeed` distingue "XML invalido" de "feed vacio", y `verifyFeed` de este
 * fichero comprueba el tipo MIME.
 *
 * Cuando el XML sale correcto pero el tipo MIME no sirve, hay que ajustar aqui
 * el `accept` de la peticion o marcar `allowHtmlContentType: true` si el medio
 * sirve el feed con la cabecera equivocada.
 *
 * NOTA SOBRE LA COBERTURA: hoy solo hay una fuente local operativa. Con una
 * sola fuente, la deteccion depende por completo de ese medio y el anti-duplicado
 * no puede probarse de verdad (nunca hay dos medios contando lo mismo). Anadir
 * feeds locales functioning es la tarea de mantenimiento mas urgente del
 * proyecto; ver FUENTES_CANDIDATAS al final.
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
  notes?: string;
};

export const FEEDS: FeedDefinition[] = [
  {
    name: "La Voz de Lanzarote",
    url: "https://www.lavozdelanzarote.com/rss",
    kind: "rss",
    region: "LANZAROTE",
    baseScore: 0.9,
    enabled: true,
    notes: "Diario local. Unica fuente RSS verificada como operativa.",
  },
  {
    name: "Cabildo de Lanzarote",
    url: "https://www.cabildodelanzarote.com/noticias/rss.xml",
    kind: "rss",
    region: "LANZAROTE",
    // Sin verificar: se deja activa pero con puntuacion baja hasta que se
    // confirme la primera lectura. El monitor la marcara FAILING si falla.
    baseScore: 0.85,
    enabled: true,
    notes: "Fuente oficial. URL pendiente de verificar: activa a la espera.",
  },
];

/**
 * Fuentes candidatas para ampliar cobertura. NO se registran solas: cada una
 * necesita comprobarse con `npm run monitor:once` antes de confiar en ella.
 * Se documentan aqui para que la ampliacion sea una decision, no un accident.
 */
export const FUENTES_CANDIDATAS: Array<{ name: string; candidates: string[] }> = [
  {
    name: "Lanzarote Ahora",
    // El dominio real es .com; el .es que usaba el scraper no devuelve feed.
    candidates: [
      "https://www.lanzaroteahora.com/rss",
      "https://www.lanzaroteahora.com/feed",
      "https://www.lanzaroteahora.com/rss.xml",
    ],
  },
  {
    name: "Canarias7",
    candidates: [
      "https://www.canarias7.es/rss/",
      "https://www.canarias7.es/canarias/rss/",
      "https://www.canarias7.es/rss/lanzarote.xml",
    ],
  },
  {
    name: "La Provincia - Lanzarote",
    candidates: [
      "https://www.laprovincia.es/rss/lanzarote",
      "https://www.laprovincia.es/rss/canarias",
    ],
  },
  {
    name: "Europa Press Canarias",
    candidates: ["https://e00-efe.uecdn.es/efe/amanecer/canarias/rss.xml"],
  },
  {
    name: "EFE Canarias",
    candidates: ["https://efe.com/efe/amanecer/canarias/1"],
  },
  {
    name: "Onda Cero Canarias",
    candidates: ["https://www.ondacero.es/rss/canarias.xml"],
  },
  {
    name: "Cadena SER Lanzarote",
    candidates: ["https://cadenaser.com/rss/las-palmas/"],
  },
  {
    name: "Lanzarote Digital",
    candidates: ["https://www.lanzarotedigital.com/rss"],
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
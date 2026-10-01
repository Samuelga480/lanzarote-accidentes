/**
 * Lectura de feeds RSS 2.0 y Atom.
 *
 * El scraper original hacia esto con `xml2js` y antes una funcion `limpiarXML()`
 * que hacia sustituciones con regex sobre el XML crudo:
 *
 *   xml.replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g, '&amp;')
 *
 * Eso rompe el contenido: no distingue `&` sueltas de `&#8217;`, no respeta
 * CDATA y tritura el espaciado interno de los atributos. Cuando fallaba, el
 * catch devolvia `[]` en silencio y el sistema sigeria pensando que la fuente
 * no tenia noticias. Aqui se usa un parser XML de verdad, y un fallo de parseo
 * se reporta como fallo, no como "cero noticias".
 */

import { XMLParser } from "fast-xml-parser";
import { log, serializeError, timer } from "@/lib/logger";

export type FeedItem = {
  title: string;
  url: string;
  /** Fecha de publicacion del articulo, en UTC. */
  publishedAt: Date | null;
  /** Descripcion o resumen tal como viene en el feed. */
  summary: string;
  author: string | null;
  /** Imagen declarada en el propio feed, si la hay. */
  imageUrl: string | null;
  categories: string[];
  guid: string | null;
};

export type ParsedFeed = {
  items: FeedItem[];
  title: string | null;
  /** true si el documento era un feed valido aunque no tenga items. */
  valid: boolean;
  error?: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  // Un feed puede incluir HTML dentro de <description>; se conserva y se
  // limpia despues con htmlToText.
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  // Noticia con CDATA aparece como { "#text": ..., "@_rdf:resource": ... }.
  isArray: (name) =>
    ["item", "entry", "media:content", "media:thumbnail", "category", "enclosure"].includes(name),
});

/** fast-xml-parser envuelve los nodos con espacios de nombres o atributos en objetos. */
type XmlNode = Record<string, unknown>;

/** Lee el texto de un nodo, evitando que un objeto con @href se convierta en "[object Object]". */
function textOf(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  if (typeof node !== "object") return null;

  const obj = node as XmlNode;
  // Con atributos: preferimos el contenido, y si no hay, el href.
  const text = obj["#text"];
  if (typeof text === "string" && text.trim()) return text.trim();
  const href = obj["@_href"];
  if (typeof href === "string" && href.trim()) return href.trim();

  if (Array.isArray(node)) return textOf(node[0]);
  return null;
}

function arrayOf<T>(value: unknown): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? (value as T[]) : [value as T];
}

/** Normaliza RFC-822 (`Tue, 01 Oct 2026 14:30:00 +0000`) y W3CDTF a Date. */
export function parseFeedDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

/** Quita parametros de seguimiento: ?utm_source=... no identifica un articulo. */
export function canonicalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    const TRACKING = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "utm_id", "gclid", "fbclid", "mc_cid", "mc_eid", "ref", "amp",
    ];
    for (const k of TRACKING) u.searchParams.delete(k);
    // "/amp" al final es la version imprimible del mismo articulo.
    u.pathname = u.pathname.replace(/\/amp\/?$/, "/");
    u.hash = "";
    // Normaliza la barra final para que /noticia y /noticia/ no se traten como
    // dos entradas distintas en la deduplicacion por URL.
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return input;
  }
}

/** Busca la imagen declarada en el item, por orden de preferencia. */
function extractImage(item: XmlNode): string | null {
  // 1. enclosure con type de imagen (RSS)
  for (const enc of arrayOf(item["enclosure"])) {
    if (typeof enc !== "object" || enc === null) continue;
    const e = enc as XmlNode;
    const type = String(e["@_type"] ?? "");
    const url = e["@_url"];
    if (typeof url === "string" && (type.startsWith("image/") || !type)) return url;
  }
  // 2. media:content / media:thumbnail con medium="image"
  for (const key of ["media:content", "media:thumbnail"]) {
    for (const node of arrayOf(item[key])) {
      if (typeof node !== "object" || node === null) continue;
      const m = node as XmlNode;
      const url = m["@_url"];
      const medium = String(m["@_medium"] ?? m["@_type"] ?? "");
      if (typeof url === "string" && (medium.startsWith("image") || medium === "")) return url;
    }
  }
  // 3. itunes:image (podcast, raro en noticias, pero aparece)
  const itunes = item["itunes:image"];
  if (itunes) {
    const href = (itunes as XmlNode)["@_href"];
    if (typeof href === "string") return href;
  }
  // 4. <image> anidado
  const nested = item["image"];
  if (nested) {
    const url = (nested as XmlNode)["url"];
    const t = textOf(url);
    if (t) return t;
  }
  return null;
}

/** Limpia el HTML que envuelve el resumen de un feed. */
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parsea un documento RSS o Atom.
 * Nunca lanza: devuelve `valid: false` con el motivo si el XML no se puede leer.
 */
export function parseFeed(xml: string, sourceName: string): ParsedFeed {
  const elapsed = timer();

  // Un endpoint que responde HTML (pagina de error, parking, anticobot) llega
  // aqui. Se detecta antes de intentar parsearlo.
  const head = xml.slice(0, 300).trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) {
    return {
      items: [],
      title: null,
      valid: false,
      error: "La URL devuelve HTML, no un feed XML. Revisa la direccion del feed.",
    };
  }

  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    log.debug("XML no parseable", { source: sourceName, ...serializeError(err) });
    return { items: [], title: null, valid: false, error: "XML mal formado" };
  }

  const root = doc as XmlNode;
  const rss = root["rss"] as XmlNode | undefined;
  const channel = rss?.["channel"] as XmlNode | undefined;
  const atom = root["feed"] as XmlNode | undefined;
  const rdf = (root["RDF"] ?? root["rdf"]) as XmlNode | undefined;
  // RSS 1.0 (RDF) usa un elemento raiz `item` suelto, sin `channel`. El nombre
  // del elemento raiz no siempre conserva mayusculas segun el documento, asi
  // que se aceptan las dos grafias.
  const rawItems: unknown[] = channel
    ? arrayOf(channel["item"])
    : atom
      ? arrayOf(atom["entry"])
      : rdf
        ? arrayOf(rdf["item"])
        : [];

  const feedTitle = textOf(channel?.["title"]) ?? textOf(atom?.["title"]);

  if (!channel && !atom && rawItems.length === 0) {
    return {
      items: [],
      title: feedTitle,
      valid: false,
      error: "El documento no es un feed RSS ni Atom reconocible",
    };
  }

  const items: FeedItem[] = [];
  for (const raw of rawItems) {
    if (typeof raw !== "object" || raw === null) continue;
    const it = raw as XmlNode;

    // Atom usa <link href="..."/>; RSS usa <link>texto</link>. La diferencia
    // es la causa mas comun de "no encuentro la URL del articulo".
    let url = textOf(it["link"]);
    if (!url) {
      const links = arrayOf(it["link"]);
      const alt = links.find((l) => {
        if (typeof l !== "object" || l === null) return false;
        const rel = String((l as XmlNode)["@_rel"] ?? "alternate");
        return rel === "alternate";
      });
      url = textOf(alt);
    }

    const title = textOf(it["title"]);
    if (!url || !title) continue; // Item sin URL o sin titular: no sirve.

    const summaryRaw =
      textOf(it["description"]) ??
      textOf(it["summary"]) ??
      textOf(it["content"]) ??
      textOf(it["content:encoded"]) ??
      "";

    const publishedRaw =
      textOf(it["pubDate"]) ??
      textOf(it["published"]) ??
      textOf(it["updated"]) ??
      textOf(it["dc:date"]);

    const categories = arrayOf(it["category"])
      .map((c) => textOf(c))
      .filter((c): c is string => c !== null)
      .slice(0, 10);

    items.push({
      title: stripHtml(title),
      url: canonicalizeUrl(url),
      publishedAt: parseFeedDate(publishedRaw),
      summary: stripHtml(summaryRaw),
      author: textOf(it["author"]) ?? textOf(it["dc:creator"]),
      imageUrl: extractImage(it),
      categories,
      guid: textOf(it["guid"]) ?? textOf(it["id"]),
    });
  }

  log.debug("Feed parseado", {
    source: sourceName,
    items: items.length,
    durationMs: elapsed(),
  });

  return { items, title: feedTitle, valid: true };
}

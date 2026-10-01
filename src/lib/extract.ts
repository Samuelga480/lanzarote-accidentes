/**
 * Extraccion del contenido de un articulo.
 *
 * El scraper original nunca descargaba la pagina: se quedaba con el
 * <description> del feed, que suele ser un recorte de 200 caracteres o, en el
 * caso de los feeds que no traen descripcion, la cadena vacia. Por eso las
 * noticias no tenian cuerpo y la IA no tenia nada que reescribir.
 *
 * Aqui se descarga el HTML y se busca, por este orden:
 *
 *   1. JSON-LD `NewsArticle` / `Article`: es el que da el metodo mas fiable,
 *      porque el medio lo genera para Google.
 *   2. Open Graph y meta etiquetas (fecha, imagen, seccion).
 *   3. El contenedor de texto mas denso del HTML, elegido por puntuacion.
 *   4. Todo el <article> o, en su defecto, todo el <body>.
 */

import * as cheerio from "cheerio";
import { htmlToText, tidy, truncate } from "@/lib/text";

export type ExtractedArticle = {
  title: string | null;
  body: string;
  /** Descripcion corta: meta description o, en su defecto, el resumen. */
  excerpt: string | null;
  /** Resumen completo del articulo, del que se recorta `excerpt`. */
  summary: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  /** Fecha declarada en el HTML, en UTC. Mas fiable que la del feed. */
  publishedAt: Date | null;
  modifiedAt: Date | null;
  author: string | null;
  section: string | null;
  canonical: string | null;
  /** Metodo que ha servido para el cuerpo, util para depurar extractores. */
  method: "jsonld" | "dom" | "body" | "none";
  /** true si la pagina es valida pero no tiene texto de articulo. */
  suspicious: boolean;
};

/* -------------------------------------------------------------------------- */
/*  JSON-LD                                                                   */
/* -------------------------------------------------------------------------- */

type JsonLdNode = Record<string, unknown>;

/** Un @graph agrupa varios nodos; hay que buscar el que sea un articulo. */
function isArticleNode(node: unknown): node is JsonLdNode {
  if (typeof node !== "object" || node === null) return false;
  const type = (node as JsonLdNode)["@type"];
  const types = Array.isArray(type) ? type : [type];
  const wanted = ["NewsArticle", "Article", "ReportageNewsArticle", "LiveBlogPosting", "BlogPosting"];
  return types.some((t) => typeof t === "string" && wanted.includes(t));
}

/** Aplana un @type de Schema.org: puede ser string, array u objeto. */
function typeNames(node: JsonLdNode): string[] {
  const type = node["@type"];
  if (typeof type === "string") return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === "string");
  return [];
}

/** Recorre el JSON-LD buscando el primer nodo que sea un articulo. */
function findArticleNode(root: unknown, depth = 0): JsonLdNode | null {
  if (depth > 6 || root == null) return null;

  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findArticleNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof root !== "object") return null;

  const node = root as JsonLdNode;
  if (isArticleNode(node)) return node;

  if (Array.isArray(node["@graph"])) {
    const inGraph = findArticleNode(node["@graph"], depth + 1);
    if (inGraph) return inGraph;
  }

  return null;
}

/** Lee un campo de JSON-LD que puede ser string, objeto o array. */
function ldString(node: JsonLdNode, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find((v) => typeof v === "string" && v.trim());
      if (typeof first === "string") return first.trim();
    }
    if (typeof value === "object" && value !== null) {
      const name = (value as JsonLdNode)["name"] ?? (value as JsonLdNode)["@id"];
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  }
  return null;
}

/** Las fechas de JSON-LD suelen venir en ISO o en cabecera HTTP. */
function ldDate(node: JsonLdNode, ...keys: string[]): Date | null {
  for (const key of keys) {
    const value = node[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const d = new Date(value.trim());
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** El cuerpo puede ser HTML, texto o un array de bloques. */
function ldBody(node: JsonLdNode): string | null {
  for (const key of ["articleBody", "text", "description"]) {
    const value = node[key];
    if (typeof value === "string" && value.trim().length > 80) {
      return htmlToText(value);
    }
    if (Array.isArray(value)) {
      const joined = value
        .map((v) => (typeof v === "string" ? v : ""))
        .filter(Boolean)
        .join("\n\n");
      if (joined.trim().length > 80) return htmlToText(joined);
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Seleccion del cuerpo por densidad de texto                                 */
/* -------------------------------------------------------------------------- */

/**
 * Los medios envuelven el articulo en un <div> con una clase mas o menos
 * creativa. En vez de mantener una lista de selectores que se rompe con cada
 * redieño, se puntua cada contenedor por la cantidad de texto que aporta por
 * cada etiqueta que contiene, penalizando la Navegacion y los anuncios.
 */
function scoreContainer($: cheerio.CheerioAPI, el: unknown): number {
  const node = $(el as never);
  const paragraphs = node.find("p");
  if (paragraphs.length === 0) return 0;

  let length = 0;
  paragraphs.each((_, p) => {
    length += $(p).text().trim().length;
  });
  if (length < 200) return 0;

  // Proporcion texto por parrafo: un bloque de navigation puede tener mucho
  // texto repartido en muchos parrafos cortos.
  const density = length / paragraphs.length;

  let score = length + density * 4;

  // Bonificacion si parece un contenedor de articulo.
  const id = String(node.attr("id") ?? "");
  const className = String(node.attr("class") ?? "");
  const signature = `${id} ${className}`.toLowerCase();
  if (/\b(article|post|entry|content|body|txt|story|noticia)\b/.test(signature)) score *= 1.35;

  // Penalizacion de las zonas de navegacion y publicidad.
  if (/\b(nav|menu|sidebar|footer|header|widget|share|social|comment|related|advert|promo|banner|cookie|newsletter)\b/.test(signature)) {
    score *= 0.25;
  }

  // Penalizacion por densidad baja: listas de enlaces y texto suelto.
  if (density < 60) score *= 0.4;

  const links = node.find("a").text().length;
  if (links > length * 0.4) score *= 0.3; // casi todo es enlace: no es articulo.

  return score;
}

const STRIP_SELECTORS = [
  "script", "style", "noscript", "iframe", "ins", "aside",
  "nav", "header", "footer", "form", "button",
  ".advert", ".ads", ".advertisement", ".publicidad", ".banner",
  ".share", ".social", ".compartir", ".related", ".relacionados",
  ".comment", ".comments", ".comentarios", ".newsletter", ".suscribete",
  ".cookie", ".cookies", ".consent", ".sidebar", ".widget",
];

/* -------------------------------------------------------------------------- */
/*  API principal                                                             */
/* -------------------------------------------------------------------------- */

export function extractArticle(html: string, baseUrl: string): ExtractedArticle {
  const result: ExtractedArticle = {
    title: null, body: "", excerpt: null, summary: null, imageUrl: null, imageAlt: null,
    publishedAt: null, modifiedAt: null, author: null, section: null,
    canonical: null, method: "none", suspicious: false,
  };

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    result.suspicious = true;
    return result;
  }

  if ($("body").length === 0) {
    result.suspicious = true;
    return result;
  }

  // --- 1. JSON-LD ---
  let ldArticle: JsonLdNode | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (ldArticle) return;
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      ldArticle = findArticleNode(parsed);
    } catch {
      // JSON-LD invalido es frecuente. Se ignora y se sigue con el DOM.
    }
  });

  if (ldArticle) {
    result.title = ldString(ldArticle, "headline", "name");
    const body = ldBody(ldArticle);
    if (body) {
      result.body = tidy(body);
      result.method = "jsonld";
    }
    // `description` en JSON-LD es el resumen corto; el cuerpo va aparte. Se
    // guardan los dos porque el resumen completo puede ser util como respaldo
    // si el cuerpo no se ha podido extraer.
    result.excerpt = ldString(ldArticle, "description");
    result.summary = ldString(ldArticle, "description");
    result.author = ldString(ldArticle, "author", "creator");
    result.section = ldString(ldArticle, "articleSection");
    result.publishedAt = ldDate(ldArticle, "datePublished", "dateCreated", "uploadDate");
    result.modifiedAt = ldDate(ldArticle, "dateModified");

    const image = ldString(ldArticle, "image");
    if (image) {
      // image puede ser un objeto { url, width, height } o un array.
      const raw = ldArticle["image"];
      if (Array.isArray(raw) && typeof raw[0] === "object") {
        const u = (raw[0] as JsonLdNode)["url"];
        if (typeof u === "string") result.imageUrl = u;
      } else if (typeof raw === "object" && raw !== null) {
        const u = (raw as JsonLdNode)["url"] ?? (raw as JsonLdNode)["@id"];
        if (typeof u === "string") result.imageUrl = u;
      } else if (typeof image === "string" && /^https?:/i.test(image)) {
        result.imageUrl = image;
      }
    }
  }

  // --- 2. Open Graph y meta: rellenan lo que falte ---
  const metaContent = (selector: string): string | null => {
    const v = $(selector).attr("content");
    return v && v.trim() ? v.trim() : null;
  };

  result.title = result.title ?? metaContent('meta[property="og:title"]') ?? cleanTitle($("title").text());
  const description =
    metaContent('meta[name="description"]') ?? metaContent('meta[property="og:description"]');
  result.excerpt = result.excerpt ?? description;
  result.summary = result.summary ?? description;
  result.imageUrl = result.imageUrl ?? metaContent('meta[property="og:image"]') ?? metaContent('meta[name="twitter:image"]');
  result.section = result.section ?? metaContent('meta[property="article:section"]');
  result.author = result.author ?? metaContent('meta[name="author"]');

  const canonicalHref = $('link[rel="canonical"]').attr("href");
  if (canonicalHref) {
    try {
      result.canonical = new URL(canonicalHref, baseUrl).toString();
    } catch {
      /* href invalido: se ignora */
    }
  }

  // Fecha: JSON-LD > meta de article > <time datetime>. En ese orden, porque
  // el <time> a veces es la fecha de actualizacion y no la de publicacion.
  if (!result.publishedAt) {
    const candidates = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[name="date"]',
      'meta[name="publish-date"]',
      'meta[name="DC.date"]',
      'meta[itemprop="datePublished"]',
    ];
    for (const sel of candidates) {
      const v = metaContent(sel);
      if (!v) continue;
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) {
        result.publishedAt = d;
        break;
      }
    }
  }
  if (!result.publishedAt) {
    const timeEl = $("time[datetime]").first();
    const datetime = timeEl.attr("datetime");
    if (datetime) {
      const d = new Date(datetime);
      if (!Number.isNaN(d.getTime())) result.publishedAt = d;
    }
  }
  const modifiedRaw = metaContent('meta[property="article:modified_time"]');
  if (modifiedRaw) {
    const d = new Date(modifiedRaw);
    if (!Number.isNaN(d.getTime())) result.modifiedAt = d;
  }

  // --- 3. Cuerpo por densidad, si JSON-LD no lo dio ---
  if (!result.body) {
    const clone = cheerio.load(html);
    for (const sel of STRIP_SELECTORS) clone(sel).remove();

    // a) <article> explicito
    let bestNode: unknown = null;
    let bestScore = 0;

    clone("article").each((_, el) => {
      const s = scoreContainer(clone, el);
      if (s > bestScore) {
        bestScore = s;
        bestNode = el;
      }
    });

    // b) divs y sections, que es donde la mayoria mete el texto
    if (bestScore < 200) {
      clone("div, section, main").each((_, el) => {
        const s = scoreContainer(clone, el);
        if (s > bestScore) {
          bestScore = s;
          bestNode = el;
        }
      });
    }

    if (bestNode && bestScore > 200) {
      const node = clone(bestNode as never);
      // Solo se conservan parrafos: las listas y las citas se pierden, pero se
      // evita arrastrar menus y migas de pan.
      const paragraphs: string[] = [];
      node.find("p").each((_, p) => {
        const t = clone(p).text().replace(/\s+/g, " ").trim();
        if (t.length >= 40) paragraphs.push(t);
      });
      if (paragraphs.length > 0) {
        result.body = tidy(paragraphs.join("\n\n"));
        result.method = "dom";
      }
    }

    // c) Rescate final: todo el <body>.
    if (!result.body) {
      const paragraphs: string[] = [];
      clone("p").each((_, p) => {
        const t = clone(p).text().replace(/\s+/g, " ").trim();
        if (t.length >= 60) paragraphs.push(t);
      });
      if (paragraphs.length >= 2) {
        result.body = tidy(paragraphs.join("\n\n"));
        result.method = "body";
      }
    }
  }

  // --- Ajustes finales ---
  if (result.body.length > 20000) {
    // 20 000 caracteres es de sobra para una noticia y evita gastar tokens de
    // la IA en un articulo mal extraido que se repite.
    result.body = truncate(result.body, 20000);
  }

  if (!result.imageUrl) {
    // Ultimo recurso: la primera <img> grande del contenido.
    const img = $("img").filter((_, el) => {
      const w = Number($(el).attr("width") ?? 0);
      const h = Number($(el).attr("height") ?? 0);
      return w >= 400 || h >= 300;
    }).first();
    const src = img.attr("src") ?? img.attr("data-src") ?? img.attr("data-lazy-src");
    if (src && /^https?:|^\//.test(src)) result.imageUrl = src;
    result.imageAlt = img.attr("alt") ?? null;
  }

  if (!result.imageAlt) {
    const img = $("img").first();
    result.imageAlt = img.attr("alt") ?? null;
  }

  // Sin cuerpo pero con pagina: probablemente sea un muro de cookies, una
  // pagina de error o un articulo tras muro de registro.
  if (result.body.length < 200) result.suspicious = true;

  return result;
}

/** Quita el sufijo del medio: "Titular - La Voz de Lanzarote" -> "Titular". */
function cleanTitle(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  // Separadores tipicos entre titular y nombre del medio.
  const parts = trimmed.split(/\s+[|\u2013\u2014\u00b7-]\s+/);
  if (parts.length > 1) {
    const shortest = parts.reduce((a, b) => (b.length < a.length ? b : a));
    // El titular suele ser la parte mas larga; el nombre del medio, la corta.
    return parts.reduce((a, b) => (b.length > a.length ? b : a)).trim() || trimmed;
  }
  return trimmed;
}
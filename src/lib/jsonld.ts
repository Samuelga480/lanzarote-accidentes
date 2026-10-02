import { SITE } from "@/lib/constants";
import { siteUrl } from "@/lib/env";
import { truncate } from "@/lib/text";

/**
 * JSON-LD reutilizable.
 *
 * centralizarlo evita el error tipico: poner la misma NewsArticle en cada pagina
 * con el dateModified siempre igual, o duplicar el bloque y que se desincronice
 * una copia.
 */

// El canonical y la pagina del feed se enlazan desde el <head> del layout: una
// Route Handler no puede exportar `metadata`, y Next lo rechaza al compilar.
export const FEED_PATH = "/feed.xml";

// Los identificadores de Schema.org tienen que ser URLs estables. Se usan con
// fragmento para no crear paginas que no existen.
const ORG_ID = `${siteUrl()}/#organizacion`;
export const SITE_ID = `${siteUrl()}/#sitio`;

/** Datos de la organizacion, iguales en todas las paginas. */
export function organizationSchema() {
  return {
    "@type": "NewsMediaOrganization",
    "@id": ORG_ID,
    name: SITE.name,
    url: siteUrl(),
    description: SITE.description,
    areaServed: {
      "@type": "State",
      name: "Lanzarote",
    },
  };
}

/** WebSite con barra de busqueda, para el Sitelinks Search Box. */
export function webSiteSchema() {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE.name,
    url: siteUrl(),
    inLanguage: "es-ES",
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl()}/buscar?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Noticia concreta. `dateModified` se toma de updatedAt de verdad: si el sistema
 * lo fija siempre a la fecha de publicacion, Google deja de fiarse de el.
 */
export function newsArticleSchema(params: {
  slug: string;
  title: string;
  description: string;
  excerpt?: string | null;
  body: string;
  imageUrl: string | null;
  occurredAt: Date;
  publishedAt: Date | null;
  updatedAt: Date;
  authorName?: string;
  municipalityName: string;
  road?: string | null;
  severity: string;
  fatalities: number;
  injuries: number;
}) {
  const url = `${siteUrl()}/noticias/${params.slug}`;
  const image = params.imageUrl
    ? params.imageUrl.startsWith("http")
      ? params.imageUrl
      : `${siteUrl()}${params.imageUrl}`
    : null;

  const published = (params.publishedAt ?? params.occurredAt).toISOString();

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${url}#noticia`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    headline: truncate(params.title, 110),
    description: truncate(params.description, 300),
    ...(params.excerpt ? { alternativeHeadline: truncate(params.excerpt, 110) } : {}),
    articleSection: "Sucesos",
    // La imagen debe ser de al menos 1200x630 para que las tarjetas sociales no
    // salgan recortadas. Si falta, se omite el campo: una URL pequena es peor
    // que ninguna imagen.
    ...(image ? { image: { "@type": "ImageObject", url: image } } : {}),
    datePublished: published,
    dateModified: params.updatedAt.toISOString(),
    author: {
      "@type": "Organization",
      name: params.authorName ?? SITE.organization,
    },
    publisher: { "@id": ORG_ID },
    // El lugar se declara a nivel de isla, nunca como punto exacto: publicar la
    // coordenada exacta de un accidente identifica a las personas implicadas.
    contentLocation: {
      "@type": "Place",
      name: params.municipalityName,
      address: {
        "@type": "PostalAddress",
        addressRegion: "Canarias",
        addressCountry: "ES",
      },
    },
    about: params.road ? { "@type": "Thing", name: `Carretera ${params.road}` } : undefined,
    keywords: [
      "accidentes",
      "trafico",
      "Lanzarote",
      params.municipalityName,
      ...(params.road ? [`${params.road}`] : []),
    ].join(", "),
    inLanguage: "es-ES",
    isAccessibleForFree: true,
  };
}

/** Migas de pan. El ultimo elemento no lleva posicion ni URL. */
export function breadcrumbSchema(items: Array<{ name: string; url?: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url && index < items.length - 1 ? { item: item.url } : {}),
    })),
  };
}

/** Envuelve varios nodos en un unico @graph, con el contexto una sola vez. */
export function graphSchema(nodes: unknown[]) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter(Boolean),
  };
}
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/constants";
import { siteUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Escapa los caracteres que rompen un documento XML. */
function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Los caracteres de control son invalidos en XML 1.0 y hacen que los
    // lectores de feed rechacen el documento entero.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/**
 * GET /feed.xml
 *
 * RSS 2.0 con los ultimos articulos publicados.
 *
 * Solo entra lo PUBLISHED, por la misma regla que el resto del sitio: el feed
 * es una via publica mas y no puede filtrar borradores.
 */
export async function GET(): Promise<Response> {
  const base = siteUrl();

  const articles = await prisma.accident.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 50,
    include: {
      municipality: { select: { name: true } },
      sources: { select: { url: true, outlet: true }, take: 3 },
      images: { where: { kind: "HERO" }, take: 1, select: { ogPath: true, localPath: true } },
    },
  });

  const lastBuildDate = articles[0]?.publishedAt ?? new Date();

  const items = articles
    .map((a) => {
      const url = `${base}/noticias/${a.slug}`;
      const image = a.images[0];
      const imageUrl = image?.ogPath ?? image?.localPath ?? null;
      const fullImage = imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `${base}${imageUrl}`) : null;

      // El enclosure debe llevar el content-type real de la imagen.
      const enclosure = fullImage
        ? `\n      <enclosure url="${escapeXml(fullImage)}" type="image/webp" length="0"/>`
        : "";

      return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${a.publishedAt?.toUTCString() ?? a.createdAt.toUTCString()}</pubDate>
      <description>${escapeXml(a.excerpt ?? a.summary)}</description>
      <category>${escapeXml(a.municipality.name)}</category>${enclosure}
      <source url="${escapeXml(a.sources[0]?.url ?? base)}">${escapeXml(a.sources[0]?.outlet ?? SITE.name)}</source>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(`${SITE.name} · ${SITE.tagline}`)}</title>
    <link>${escapeXml(base)}</link>
    <atom:link href="${escapeXml(`${base}/feed.xml`)}" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(SITE.description)}</description>
    <language>es-ES</language>
    <copyright>${escapeXml(SITE.organization)}</copyright>
    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>
    <generator>Next.js</generator>
    <ttl>15</ttl>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // 15 minutos: un feed de noticias no necesita actualizarse al segundo, y
      // este valor lo consume directamente el atributo <ttl> de algunos lectores.
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
    },
  });
}
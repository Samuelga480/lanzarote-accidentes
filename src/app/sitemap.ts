import type { MetadataRoute } from "next";
import { getPublishedSlugs } from "@/lib/queries";
import { MUNICIPALITIES, SITE, VEHICLE_LIST, ZONES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/accidentes`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/mapa`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${base}/resumen`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: `${base}/resumen-anual`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: `${base}/municipios`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/zonas`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/buscar`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${base}/privacidad`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const municipalityRoutes: MetadataRoute.Sitemap = MUNICIPALITIES.map((m) => ({
    url: `${base}/municipios/${m.slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const vehicleRoutes: MetadataRoute.Sitemap = VEHICLE_LIST.map((v) => ({
    url: `${base}/vehiculos/${v.value.toLowerCase()}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  // Las zonas tienen pagina aunque no tengan noticias: es lo que evita que
  // /zonas/puerto-del-carmen devuelva un 404 mientras la isla sigue sin datos.
  const zoneRoutes: MetadataRoute.Sitemap = ZONES.map((z) => ({
    url: `${base}/zonas/${z.slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  // Solo noticias publicadas: los borradores nunca se envian a un buscador.
  const articles = await getPublishedSlugs();

  const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${base}/accidentes/${a.slug}`,
    lastModified: a.updatedAt,
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...municipalityRoutes, ...zoneRoutes, ...vehicleRoutes, ...articleRoutes];
}

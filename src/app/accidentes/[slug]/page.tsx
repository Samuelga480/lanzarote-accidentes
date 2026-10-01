import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AccidentImage } from "@/components/AccidentImage";
import { AccidentCard } from "@/components/AccidentCard";
import { SeverityBadge, VehicleBadge } from "@/components/Badges";
import { getPublishedAccidentBySlug, getRelatedAccidents, listAccidents } from "@/lib/queries";
import { formatDate, formatDateTime, formatRelative, formatTime } from "@/lib/format";
import { SEVERITY_LABEL, SITE, VEHICLE_LABEL } from "@/lib/constants";
import { newsArticleSchema, breadcrumbSchema, graphSchema, organizationSchema, webSiteSchema } from "@/lib/jsonld";
import { siteUrl as getSiteUrl } from "@/lib/env";
import { truncate } from "@/lib/text";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const accident = await getPublishedAccidentBySlug(slug);

  // Un borrador (no publicado) devuelve 404 aqui, tambien para los buscadores.
  if (!accident) {
    return { title: "Noticia no encontrada", robots: { index: false, follow: false } };
  }

  // Los campos SEO generados por la IA tienen prioridad sobre el texto libre:
  // estan escritos para el buscador, y el titulo se recorta al limite real de
  // la etiqueta <title> (~60 caracteres) en lugar de al de un titulo visible.
  const title = accident.seoTitle ?? accident.title;
  const desc = accident.metaDescription ?? accident.excerpt ?? accident.summary;

  const canonical = `/accidentes/${accident.slug}`;

  return {
    title,
    description: desc,
    alternates: {
      canonical,
      // RSS y la version imprimible, para que los buscadores las graduen bien.
      types: { "application/rss+xml": "/feed.xml" },
    },
    openGraph: {
      type: "article",
      title,
      description: desc,
      url: canonical,
      // publishedTime es la fecha del suceso; modifiedTime, la última vez que se
      // toco el registro. Confundirlas hace que Google considere la noticia vieja.
      publishedTime: (accident.publishedAt ?? accident.occurredAt).toISOString(),
      modifiedTime: accident.updatedAt.toISOString(),
      section: "Sucesos",
      locale: SITE.locale,
      authors: [SITE.organization],
      images: accident.imageUrl
        ? [
            {
              url: accident.imageUrl.startsWith("http")
                ? accident.imageUrl
                : `${getSiteUrl()}${accident.imageUrl}`,
              width: 1200,
              height: 630,
              alt: accident.imageAlt ?? accident.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: accident.imageUrl
        ? [
            accident.imageUrl.startsWith("http")
              ? accident.imageUrl
              : `${getSiteUrl()}${accident.imageUrl}`,
          ]
        : undefined,
    },
    other: {
      "article:published_time": (accident.publishedAt ?? accident.occurredAt).toISOString(),
      "article:modified_time": accident.updatedAt.toISOString(),
      "article:section": "Sucesos",
    },
  };
}

export default async function AccidentPage({ params }: Props) {
  const { slug } = await params;
  const accident = await getPublishedAccidentBySlug(slug);
  if (!accident) notFound();

  const [related, recent] = await Promise.all([
    getRelatedAccidents(accident, 4),
    listAccidents({ take: 4 }),
  ]);

  const articleUrl = `${getSiteUrl()}/accidentes/${accident.slug}`;

  // Datos estructurados. Se agrupan en un unico @graph para no repetir el
  // @context en cada bloque, y se anaden las migas de pan, que faltaban.
  const jsonLd = graphSchema([
    newsArticleSchema({
      slug: accident.slug,
      title: accident.seoTitle ?? accident.title,
      description: accident.metaDescription ?? accident.excerpt ?? accident.summary,
      excerpt: accident.excerpt,
      body: accident.body,
      imageUrl: accident.imageUrl,
      occurredAt: accident.occurredAt,
      publishedAt: accident.publishedAt,
      updatedAt: accident.updatedAt,
      municipalityName: accident.municipality.name,
      road: accident.road,
      severity: accident.severity,
      fatalities: accident.fatalities,
      injuries: accident.injuries,
    }),
    breadcrumbSchema([
      { name: "Inicio", url: getSiteUrl() },
      { name: accident.municipality.name, url: `${getSiteUrl()}/municipios/${accident.municipality.slug}` },
      { name: "Accidentes", url: `${getSiteUrl()}/accidentes` },
      { name: truncate(accident.title, 60) },
    ]),
    webSiteSchema(),
    organizationSchema(),
  ]);

  const paragraphs = accident.body.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  return (
    <article className="container-page py-6 max-w-4xl">
      {/*
        JSON-LD en un <script>. El contenido se serializa con un reemplazo
        adicional de "<": sin el, un titulo que contenga "</script>" cerraria la
        etiqueta y ejecutaria lo que venga despues. Es un XSS real cuando la
        noticia la escribe una IA a partir de texto de terceros.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/" className="hover:text-alert">
          Inicio
        </Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <Link href={`/municipios/${accident.municipality.slug}`} className="hover:text-alert">
          {accident.municipality.name}
        </Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">Noticia</span>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap gap-1.5 mb-3">
          <VehicleBadge type={accident.vehicleType} />
          <SeverityBadge severity={accident.severity} />
          <Link
            href={`/municipios/${accident.municipality.slug}`}
            className="chip bg-ink-soft/10 text-ink-soft hover:bg-ink-soft/20 transition-colors"
          >
            {accident.municipality.name}
          </Link>
        </div>

        <h1 className="font-serif text-3xl md:text-[40px] font-bold leading-[1.1] mb-4">
          {accident.title}
        </h1>

        <p className="text-lg text-ink-soft leading-relaxed font-serif italic">
          {accident.summary}
        </p>

        <div className="mt-5 pt-4 border-t border-rule flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-mute">
          <time dateTime={accident.occurredAt.toISOString()} className="font-semibold text-ink-soft">
            {formatDateTime(accident.occurredAt)}
          </time>
          <span aria-hidden="true">·</span>
          <span>{formatRelative(accident.occurredAt)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {VEHICLE_LABEL[accident.vehicleType]} · Gravedad: {SEVERITY_LABEL[accident.severity]}
          </span>
        </div>
      </header>

      <AccidentImage
        seed={accident.slug}
        alt={`Ilustración del accidente en ${accident.municipality.name}`}
        imageUrl={accident.imageUrl}
        municipality={accident.municipality.name}
        ratio="aspect-[16/9]"
        className="card rounded-sm mb-6"
      />

      {/* ------------------------- Ficha de datos ------------------------- */}
      <dl className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Municipio", value: accident.municipality.name },
          { label: "Fecha", value: formatDate(accident.occurredAt) },
          { label: "Hora", value: `${formatTime(accident.occurredAt)} h` },
          { label: "Personas heridas", value: String(accident.injuries) },
        ].map((d) => (
          <div key={d.label}>
            <dt className="text-[10px] uppercase tracking-wide text-ink-mute font-semibold">{d.label}</dt>
            <dd className="font-semibold text-ink mt-0.5 text-sm">{d.value}</dd>
          </div>
        ))}
        {accident.locationDescription ? (
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-[10px] uppercase tracking-wide text-ink-mute font-semibold">Zona</dt>
            <dd className="font-semibold text-ink mt-0.5 text-sm">
              {accident.locationDescription}{" "}
              <span className="font-normal text-ink-mute text-xs">(ubicación aproximada)</span>
            </dd>
          </div>
        ) : null}
      </dl>

      {/* ------------------------- Cuerpo ------------------------- */}
      <div className="prose-news mb-8">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {/* ------------------------- Fuentes ------------------------- */}
      {accident.sources.length > 0 ? (
        <section aria-labelledby="titulo-fuentes" className="card p-4 mb-8">
          <h2 id="titulo-fuentes" className="text-sm font-bold uppercase tracking-wide text-ink-soft mb-3">
            Fuentes
          </h2>
          <ul className="space-y-2">
            {accident.sources.map((s) => (
              <li key={s.id} className="text-sm flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-ink-soft">{s.outlet}</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-alert hover:underline break-all"
                >
                  {s.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------- Aviso de privacidad ------------------------- */}
      <aside className="border-l-4 border-alert bg-alert-soft/40 p-4 mb-8">
        <h2 className="text-sm font-bold text-alert-dark mb-1.5">Protección de datos</h2>
        <p className="text-xs text-ink-soft leading-relaxed">
          Esta noticia no incluye matrículas, teléfonos, documentos de identidad ni direcciones particulares.
          El lugar se describe de forma aproximada y no permite localizar el punto exacto del accidente. Si
          consideras que se ha publicado algún dato que no debería figurar, escríbenos y lo revisaremos.
        </p>
      </aside>

      {/* ------------------------- Relacionados ------------------------- */}
      {related.length > 0 ? (
        <section aria-labelledby="titulo-relacionados" className="mb-10">
          <h2 id="titulo-relacionados" className="section-title rule-red pt-3 mb-4">
            También en {accident.municipality.name}
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((a) => (
              <AccidentCard key={a.id} accident={a} />
            ))}
          </div>
        </section>
      ) : null}

      {recent.items.length > 0 ? (
        <section aria-labelledby="titulo-ultimas" className="mb-6">
          <h2 id="titulo-ultimas" className="section-title rule-red pt-3 mb-4">
            Últimas noticias
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.items
              .filter((a) => a.id !== accident.id)
              .slice(0, 4)
              .map((a) => (
                <AccidentCard key={a.id} accident={a} variant="compacto" />
              ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

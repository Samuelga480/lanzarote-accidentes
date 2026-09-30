import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AccidentImage } from "@/components/AccidentImage";
import { AccidentCard } from "@/components/AccidentCard";
import { SeverityBadge, VehicleBadge } from "@/components/Badges";
import { getPublishedAccidentBySlug, getRelatedAccidents, listAccidents } from "@/lib/queries";
import { formatDate, formatDateTime, formatRelative, formatTime } from "@/lib/format";
import { SEVERITY_LABEL, SITE, VEHICLE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const accident = await getPublishedAccidentBySlug(slug);

  // Un borrador (no publicado) devuelve 404 aqui, tambien para los buscadores.
  if (!accident) {
    return { title: "Noticia no encontrada", robots: { index: false, follow: false } };
  }

  const title = accident.title;
  const desc = accident.summary.slice(0, 180);

  return {
    title,
    description: desc,
    alternates: { canonical: `/accidentes/${accident.slug}` },
    openGraph: {
      type: "article",
      title,
      description: desc,
      url: `/accidentes/${accident.slug}`,
      publishedTime: accident.occurredAt.toISOString(),
      modifiedTime: accident.updatedAt.toISOString(),
      section: accident.municipality.name,
      images: accident.imageUrl ? [{ url: accident.imageUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
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

  const articleUrl = `${siteUrl}/accidentes/${accident.slug}`;

  // Datos estructurados: los buscadores los usan para las noticias enrichidas.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: accident.title,
    description: accident.summary,
    datePublished: accident.occurredAt.toISOString(),
    dateModified: accident.updatedAt.toISOString(),
    mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
    articleSection: "Accidentes de tráfico",
    inLanguage: "es-ES",
    url: articleUrl,
    ...(accident.imageUrl ? { image: [accident.imageUrl] } : {}),
    author: { "@type": "Organization", name: SITE.organization },
    publisher: { "@type": "Organization", name: SITE.organization },
    contentLocation: {
      "@type": "Place",
      name: accident.municipality.name,
      address: { "@type": "PostalAddress", addressRegion: "Canarias", addressCountry: "ES" },
    },
  };

  const paragraphs = accident.body.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  return (
    <article className="container-page py-6 max-w-4xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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

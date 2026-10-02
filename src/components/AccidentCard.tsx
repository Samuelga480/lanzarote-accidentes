import Link from "next/link";
import type { AccidentWithMunicipality } from "@/lib/queries";
import { AccidentImage } from "@/components/AccidentImage";
import { CategoryBadge, SeverityBadge } from "@/components/Badges";
import { formatDateShort, formatTime } from "@/lib/format";
import { ZONE_BY_SLUG } from "@/lib/constants";

/**
 * Tarjeta de noticia.
 *
 * Reproduce la del diseno original: borde de 1px, radio de 6px, imagen arriba,
 * y dentro una fila de metadatos (fecha, municipio como pastilla, tipo de
 * incidente), el titular en 1.05rem en negrita y el resumen en gris.
 *
 * El titulo va en la tipografia de texto y en negrita, no en serif: es como
 * estaba en el original, donde Merriweather se reservaba para el hero y los
 * titulos de seccion.
 */
type Props = {
  accident: AccidentWithMunicipality;
  /** "normal" | "compacto" */
  variant?: "normal" | "compacto";
  priority?: boolean;
};

export function AccidentCard({ accident, variant = "normal" }: Props) {
  const { municipality, occurredAt, severity, category } = accident;
  const href = `/noticias/${accident.slug}`;

  // La zona solo aparece si el medio la nombro. Un null en la base de datos es
  // lo normal, no un dato que haya que rellenar con el nombre del municipio.
  const zona = accident.zone ? ZONE_BY_SLUG.get(accident.zone) : undefined;

  if (variant === "compacto") {
    return (
      <article className="card p-3 flex gap-3 hover:border-rule-strong transition-colors">
        <div className="w-24 shrink-0">
          <AccidentImage
            seed={accident.slug}
            alt=""
            ratio="aspect-square"
            className="rounded-sm"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-sm font-bold leading-snug">
            <Link href={href} className="hover:text-alert transition-colors">
              {accident.title}
            </Link>
          </h3>
          <p className="text-[11px] text-ink-mute mt-1">
            {municipality.name} · {formatDateShort(occurredAt)} · {formatTime(occurredAt)} h
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="news-card">
      {accident.imageUrl ? (
        <Link href={href} tabIndex={-1} aria-hidden="true" className="news-image">
          <AccidentImage
            seed={accident.slug}
            alt=""
            imageUrl={accident.imageUrl}
            municipality={municipality.name}
            ratio="aspect-video"
          />
        </Link>
      ) : null}

      <div className="news-content">
        {/* Fecha + municipio + tipo, en una sola fila */}
        <div className="news-meta">
          <span className="news-date">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <time dateTime={occurredAt.toISOString()}>
              {formatDateShort(occurredAt)} · {formatTime(occurredAt)}
            </time>
          </span>

          <Link href={`/municipios/${municipality.slug}`} className="news-zone">
            {zona ? (
              <>
                {zona.name}
                <span className="text-ink-mute"> · {municipality.name}</span>
              </>
            ) : (
              municipality.name
            )}
          </Link>

          <CategoryBadge category={category} />
          <SeverityBadge severity={severity} />
        </div>

        <h3 className="news-title">
          <Link href={href}>{accident.title}</Link>
        </h3>

        <p className="news-description">{accident.summary}</p>

        <Link href={href} className="news-more">
          Leer más →
        </Link>
      </div>
    </article>
  );
}
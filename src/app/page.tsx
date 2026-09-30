import Link from "next/link";
import type { Metadata } from "next";
import { FeaturedAccident } from "@/components/FeaturedAccident";
import { AccidentCard } from "@/components/AccidentCard";
import { FilterBar } from "@/components/FilterBar";
import { MapLanzarote } from "@/components/MapLanzarote";
import {
  getAccidentsForMap,
  getFeaturedAccident,
  getPublicStats,
  listAccidents,
  countByMunicipality,
} from "@/lib/queries";
import { parseFilters, type RawSearchParams } from "@/lib/filters";
import { MUNICIPALITIES, SITE, VEHICLE_LIST } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${SITE.name} · ${SITE.tagline}`,
  description: SITE.description,
  alternates: { canonical: "/" },
};

// El contenido cambia con frecuencia: se regenera en cada visita.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<RawSearchParams> };

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [featured, stats, list, byMunicipality, mapAccidents] = await Promise.all([
    getFeaturedAccident(),
    getPublicStats(),
    listAccidents({ ...filters, take: 9 }),
    countByMunicipality(),
    getAccidentsForMap(60),
  ]);

  // El destacado no se repite en la lista de recientes.
  const latest = featured ? list.items.filter((a) => a.id !== featured.id) : list.items;

  const mapPoints = mapAccidents.map((a) => ({ ...a, occurredAt: a.occurredAt.toISOString() }));

  return (
    <div className="container-page py-6">
      {/* ------------------------- Cabecera ------------------------- */}
      <section className="mb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-alert mb-2">
          Actualidad · Isla de Lanzarote
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-[1.1] max-w-3xl">
          Accidentes de coches y motos en Lanzarote
        </h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm md:text-base leading-relaxed">
          Información por municipio, fecha y tipo de vehículo. Cada noticia ha sido revisada por un editor
          antes de publicarse; las ubicaciones se muestran de forma aproximada.
        </p>

        <dl className="flex flex-wrap gap-x-8 gap-y-3 mt-5 pt-5 border-t border-rule">
          {[
            { label: "Noticias publicadas", value: stats.total },
            { label: "Últimas 24 horas", value: stats.last24h },
            { label: "Municipios con noticias", value: stats.municipalities },
          ].map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold">{s.label}</dt>
              <dd className="font-serif text-2xl font-bold text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ------------------------- Destacado ------------------------- */}
      {featured ? (
        <div className="mb-10">
          <FeaturedAccident accident={featured} />
        </div>
      ) : null}

      {/* ------------------------- Recientes + filtros ------------------------- */}
      <section aria-labelledby="titulo-recientes" className="mb-12">
        <div className="flex items-end justify-between gap-4 mb-4">
          <h2 id="titulo-recientes" className="section-title rule-red pt-3">
            Accidentes más recientes
          </h2>
          <Link href="/accidentes" className="text-xs font-semibold text-alert hover:underline whitespace-nowrap pb-3">
            Ver todos →
          </Link>
        </div>

        <FilterBar />

        {latest.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((a) => (
              <AccidentCard key={a.id} accident={a} />
            ))}
          </div>
        ) : (
          <p className="card p-8 text-center text-sm text-ink-mute">
            No hay noticias publicadas que coincidan con estos filtros.
          </p>
        )}
      </section>

      {/* ------------------------- Municipios ------------------------- */}
      <section aria-labelledby="titulo-municipios" className="mb-12">
        <h2 id="titulo-municipios" className="section-title rule-red pt-3 mb-4">
          Por municipio
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {MUNICIPALITIES.map((m) => {
            const count = byMunicipality.find((x) => x.slug === m.slug)?.count ?? 0;
            return (
              <Link
                key={m.slug}
                href={`/municipios/${m.slug}`}
                className="card p-3.5 hover:border-alert transition-colors group"
              >
                <span className="block font-semibold text-sm text-ink group-hover:text-alert transition-colors">
                  {m.name}
                </span>
                <span className="block text-xs text-ink-mute mt-1 tabular-nums">
                  {count} {count === 1 ? "noticia" : "noticias"}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------------------------- Por vehículo ------------------------- */}
      <section aria-labelledby="titulo-vehiculos" className="mb-12">
        <h2 id="titulo-vehiculos" className="section-title rule-red pt-3 mb-4">
          Por tipo de vehículo
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {VEHICLE_LIST.map((v) => (
            <Link
              key={v.value}
              href={`/vehiculos/${v.value.toLowerCase()}`}
              className="card p-3.5 text-center hover:border-alert transition-colors"
            >
              <span className="block font-semibold text-sm text-ink">{v.plural}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------- Mapa ------------------------- */}
      <section aria-labelledby="titulo-mapa">
        <div className="flex items-end justify-between gap-4 mb-4">
          <h2 id="titulo-mapa" className="section-title rule-red pt-3">
            Mapa de la isla
          </h2>
          <Link href="/mapa" className="text-xs font-semibold text-alert hover:underline whitespace-nowrap pb-3">
            Mapa a pantalla completa →
          </Link>
        </div>
        <MapLanzarote accidents={mapPoints} />
      </section>
    </div>
  );
}

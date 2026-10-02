import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Fragment } from "react";
import { AccidentCard } from "@/components/AccidentCard";
import { AdSlot } from "@/components/AdSlot";
import { FilterBar } from "@/components/FilterBar";
import { Pagination } from "@/components/Pagination";
import { getMunicipalityBySlug, listAccidents } from "@/lib/queries";
import { parseFilters, type RawSearchParams } from "@/lib/filters";
import { MUNICIPALITIES } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const municipality = MUNICIPALITIES.find((m) => m.slug === slug);
  if (!municipality) return { title: "Municipio no encontrado" };

  return {
    title: `Noticias en ${municipality.name}`,
    description: `Listado de noticias publicadas en ${municipality.name}, Lanzarote. Filtra por tipo de noticia y por fecha.`,
    alternates: { canonical: `/municipios/${slug}` },
  };
}

export default async function MunicipalityPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const municipality = await getMunicipalityBySlug(slug);
  // No depende de la base de datos: un municipio desconocido da 404.
  if (!municipality || !MUNICIPALITIES.some((m) => m.slug === slug)) notFound();

  const filters = parseFilters({ ...sp, municipio: slug });
  const page = Math.floor((filters.skip ?? 0) / (filters.take ?? 12)) + 1;
  const { items, total } = await listAccidents(filters);

  const others = MUNICIPALITIES.filter((m) => m.slug !== slug);

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/" className="hover:text-alert">Inicio</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <Link href="/municipios" className="hover:text-alert">Municipios</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">{municipality.name}</span>
      </nav>

      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-alert mb-2">
          Municipio de Lanzarote
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight mb-2">
          Noticias en {municipality.name}
        </h1>
        <p className="text-ink-mute text-sm">
          {total} {total === 1 ? "noticia publicada" : "noticias publicadas"} en este municipio.
        </p>
      </header>

      <FilterBar showSearch={false} />

      {items.length > 0 ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a, i) => (
              <Fragment key={a.id}>
                <AccidentCard accident={a} />
                {/* Ritmo de publicidad: 2 de cada 3 noticias llevan hueco. */}
                <AdSlot indice={i} position={`municipio-${i}`} formato="rectangular" />
              </Fragment>
            ))}
          </div>
          <Pagination base={`/municipios/${slug}`} sp={sp} page={page} total={total} take={filters.take ?? 12} />
        </>
      ) : (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-soft font-semibold mb-2">
            No hay noticias con estos filtros
          </p>
          <p className="text-xs text-ink-mute">
            Prueba a ampliar el rango de fechas o quita el filtro de vehículo.
          </p>
        </div>
      )}

      <section aria-labelledby="otros-municipios" className="mt-12">
        <h2 id="otros-municipios" className="section-title rule-red pt-3 mb-4">
          Otros municipios
        </h2>
        <div className="flex flex-wrap gap-2">
          {others.map((m) => (
            <Link
              key={m.slug}
              href={`/municipios/${m.slug}`}
              className="chip bg-paper border border-rule text-ink-soft hover:border-alert hover:text-alert transition-colors"
            >
              {m.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

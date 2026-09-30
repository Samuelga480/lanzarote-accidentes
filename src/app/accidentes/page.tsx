import Link from "next/link";
import type { Metadata } from "next";
import { AccidentCard } from "@/components/AccidentCard";
import { FilterBar } from "@/components/FilterBar";
import { Pagination } from "@/components/Pagination";
import { listAccidents } from "@/lib/queries";
import { describeFilters, parseFilters, type RawSearchParams } from "@/lib/filters";
import { SITE } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const f = parseFilters(sp);
  const { title } = describeFilters(f);
  const desc = f.q
    ? `Resultados de la búsqueda "${f.q}" en ${SITE.name}. Accidentes de tráfico en Lanzarote filtrados por municipio, fecha y vehículo.`
    : `${title} en ${SITE.name}. Listado de accidentes de tráfico en Lanzarote con filtros por municipio, fecha y tipo de vehículo.`;

  return {
    title,
    description: desc.slice(0, 180),
    alternates: { canonical: "/accidentes" },
    // Las paginas de resultados no aportan contenido unico al buscador.
    robots: { index: false, follow: true },
  };
}

export default async function AccidentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const page = Math.floor((filters.skip ?? 0) / (filters.take ?? 12)) + 1;
  const { title, parts } = describeFilters(filters);

  const { items, total } = await listAccidents(filters);

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/" className="hover:text-alert">
          Inicio
        </Link>
        <span aria-hidden="true" className="mx-1.5">
          /
        </span>
        <span className="text-ink-soft">Accidentes</span>
      </nav>

      <header className="mb-6">
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight">{title}</h1>
        <p className="text-ink-mute text-sm mt-2">
          {total === 0
            ? "Sin resultados."
            : `${total} ${total === 1 ? "noticia publicada" : "noticias publicadas"}`}
          {parts.length ? " con los filtros aplicados" : " en la isla"}
        </p>
      </header>

      <FilterBar />

      {items.length > 0 ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => (
              <AccidentCard key={a.id} accident={a} />
            ))}
          </div>
          <Pagination base="/accidentes" sp={sp} page={page} total={total} take={filters.take ?? 12} />
        </>
      ) : (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-soft font-semibold mb-2">No hay noticias con estos filtros</p>
          <p className="text-xs text-ink-mute mb-5">
            Prueba a ampliar el rango de fechas o a quitar el filtro de municipio.
          </p>
          <Link href="/accidentes" className="btn btn-ghost">
            Ver todos los accidentes
          </Link>
        </div>
      )}
    </div>
  );
}

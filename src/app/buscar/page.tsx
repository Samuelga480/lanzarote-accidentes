import Link from "next/link";
import type { Metadata } from "next";
import { AccidentCard } from "@/components/AccidentCard";
import { FilterBar } from "@/components/FilterBar";
import { Pagination } from "@/components/Pagination";
import { listAccidents } from "@/lib/queries";
import { parseFilters, type RawSearchParams } from "@/lib/filters";
import { MUNICIPALITIES, VEHICLE_LIST } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const q = (sp.q ?? "").toString().trim();
  return {
    title: q ? `Buscar: ${q}` : "Buscador de accidentes",
    description: "Busca accidentes de tráfico en Lanzarote por palabra clave, vía, municipio o zona.",
    // Las paginas de resultados no se indexan.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").toString().trim();
  const filters = parseFilters(sp);
  const page = Math.floor((filters.skip ?? 0) / (filters.take ?? 12)) + 1;

  // Solo consulta la base de datos si hay alguna condicion que aplicar.
  const searching = Boolean(filters.q || filters.municipality || filters.vehicle || filters.from);
  const { items, total } = searching
    ? await listAccidents(filters)
    : { items: [], total: 0 };

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/" className="hover:text-alert">Inicio</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">Buscar</span>
      </nav>

      <header className="mb-6">
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight mb-2">
          Buscar accidentes
        </h1>
        <p className="text-ink-soft text-sm max-w-2xl leading-relaxed">
          Busca por palabra clave (una vía, una calle, un municipio) y combínalo con los filtros de fecha y
          tipo de vehículo.
        </p>
      </header>

      <FilterBar />

      {/* Atajos: utiles cuando el usuario no busca texto libre. */}
      <div className="grid gap-6 sm:grid-cols-2 mb-8">
        <section aria-labelledby="atajos-municipio">
          <h2 id="atajos-municipio" className="text-xs font-bold uppercase tracking-wider text-ink-mute mb-3">
            Buscar por municipio
          </h2>
          <div className="flex flex-wrap gap-2">
            {MUNICIPALITIES.map((m) => (
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

        <section aria-labelledby="atajos-vehiculo">
          <h2 id="atajos-vehiculo" className="text-xs font-bold uppercase tracking-wider text-ink-mute mb-3">
            Buscar por vehículo
          </h2>
          <div className="flex flex-wrap gap-2">
            {VEHICLE_LIST.map((v) => (
              <Link
                key={v.value}
                href={`/vehiculos/${v.value.toLowerCase()}`}
                className="chip bg-paper border border-rule text-ink-soft hover:border-alert hover:text-alert transition-colors"
              >
                {v.plural}
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Resultados */}
      {searching ? (
        items.length > 0 ? (
          <>
            <h2 className="section-title rule-red pt-3 mb-4">
              {total} {total === 1 ? "resultado" : "resultados"}
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <AccidentCard key={a.id} accident={a} />
              ))}
            </div>
            <Pagination base="/buscar" sp={sp} page={page} total={total} take={filters.take ?? 12} />
          </>
        ) : (
          <div className="card p-10 text-center">
            <p className="text-sm text-ink-soft font-semibold mb-2">Sin resultados</p>
            <p className="text-xs text-ink-mute mb-5">
              No hay noticias publicadas que coincidan con{ q ? ` «${q}»` : " estos filtros"}.
            </p>
            <Link href="/accidentes" className="btn btn-ghost">
              Ver todos los accidentes
            </Link>
          </div>
        )
      ) : (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-soft font-semibold mb-1">Escribe algo para empezar</p>
          <p className="text-xs text-ink-mute">
            Por ejemplo: <em>Playa Blanca</em>, <em>moto</em>, <em>curva</em> o el nombre de una carretera.
          </p>
        </div>
      )}
    </div>
  );
}

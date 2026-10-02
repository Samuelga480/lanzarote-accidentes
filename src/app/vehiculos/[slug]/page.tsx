import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { VehicleType } from "@/lib/types";
import { Fragment } from "react";
import { AccidentCard } from "@/components/AccidentCard";
import { AdSlot } from "@/components/AdSlot";
import { Pagination } from "@/components/Pagination";
import { listAccidents } from "@/lib/queries";
import { parseFilters, type RawSearchParams } from "@/lib/filters";
import { VEHICLE_LABEL, VEHICLE_LIST } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
};

/** El slug de la URL es el enum en minusculas: /vehiculos/coche -> COCHE. */
function toVehicle(slug: string): VehicleType | null {
  const upper = slug.toUpperCase();
  return VEHICLE_LIST.some((v) => v.value === upper) ? (upper as VehicleType) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const vehicle = toVehicle(slug);
  if (!vehicle) return { title: "Categoría no encontrada" };

  const label = VEHICLE_LABEL[vehicle].toLowerCase();
  return {
    title: `Accidentes de ${label}`,
    description: `Noticias de accidentes de ${label} en Lanzarote. Listado por municipio y fecha, con la ubicación aproximada de cada siniestro.`,
    alternates: { canonical: `/vehiculos/${slug}` },
  };
}

export default async function VehiclePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const vehicle = toVehicle(slug);
  if (!vehicle) notFound();

  const filters = parseFilters({ ...sp, vehicle });
  const page = Math.floor((filters.skip ?? 0) / (filters.take ?? 12)) + 1;
  const { items, total } = await listAccidents(filters);

  const label = VEHICLE_LABEL[vehicle];
  const others = VEHICLE_LIST.filter((v) => v.value !== vehicle);

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/" className="hover:text-alert">Inicio</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">{label}</span>
      </nav>

      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-alert mb-2">
          Tipo de vehículo
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight mb-2">
          Accidentes de {label.toLowerCase()} en Lanzarote
        </h1>
        <p className="text-ink-mute text-sm">
          {total} {total === 1 ? "noticia publicada" : "noticias publicadas"}.
        </p>
      </header>

      {items.length > 0 ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a, i) => (
              <Fragment key={a.id}>
                <AccidentCard accident={a} />
                {/* Ritmo de publicidad: 2 de cada 3 noticias llevan hueco. */}
                <AdSlot indice={i} position={`vehiculo-${i}`} formato="rectangular" />
              </Fragment>
            ))}
          </div>
          <Pagination base={`/vehiculos/${slug}`} sp={sp} page={page} total={total} take={filters.take ?? 12} />
        </>
      ) : (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-soft font-semibold mb-2">
            No hay noticias con estos filtros
          </p>
          <p className="text-xs text-ink-mute">Prueba a ampliar el rango de fechas.</p>
        </div>
      )}

      <section aria-labelledby="otros-vehiculos" className="mt-12">
        <h2 id="otros-vehiculos" className="section-title rule-red pt-3 mb-4">
          Otros vehículos
        </h2>
        <div className="flex flex-wrap gap-2">
          {others.map((v) => (
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
  );
}

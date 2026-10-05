import Link from "next/link";
import type { Metadata } from "next";
import { FilterBar } from "@/components/FilterBar";
import { MapLanzarote } from "@/components/MapLanzarote";
import { Fragment } from "react";
import { AccidentCard } from "@/components/AccidentCard";
import { AdSlot } from "@/components/AdSlot";
import { getAccidentsForMap, getPublicStats, listAccidents } from "@/lib/queries";
import { parseFilters, type RawSearchParams } from "@/lib/filters";
import { SITE } from "@/lib/constants";
import { CATEGORIAS_SUCESO } from "@/lib/categorias";

export const metadata: Metadata = {
  title: "Mapa de la isla",
  description:
    "Mapa de los accidentes de tráfico registrados en Lanzarote. Las ubicaciones se muestran de forma aproximada.",
  alternates: { canonical: "/mapa" },
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<RawSearchParams> };

export default async function MapaPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [stats, list, mapAccidents] = await Promise.all([
    getPublicStats(),
    // Solo sucesos. El mapa enseña donde han pasado accidentes, asi que una
    // lista con una nota del Cabildo debajo era una contradiccion. Antes esta
    // consulta no llevaba filtro y salian las dos familias mezcladas.
    listAccidents({ ...filters, take: 9, category: [...CATEGORIAS_SUCESO] }),
    getAccidentsForMap(200),
  ]);

  const plotted = mapAccidents.filter((a) => a.approxLat !== null && a.approxLon !== null);
  const mapPoints = mapAccidents.map((a) => ({ ...a, occurredAt: a.occurredAt.toISOString() }));

  return (
    <>
      {/* Barra de buscador y filtros, igual que en la portada. */}
      <FilterBar />

      <main>
        <section className="site-section map-section" aria-labelledby="titulo-mapa">
          <div className="section-header">
            <h1 id="titulo-mapa">Mapa de accidentes</h1>
            <p>Ubicación de los accidentes señalados en la isla</p>
          </div>

          <div className="map-container">
            <MapLanzarote accidents={mapPoints} height="600px" />
          </div>
        </section>

        <section className="site-section" aria-labelledby="titulo-mapa-lista">
          <div className="section-header">
            <h2 id="titulo-mapa-lista">Sobre el mapa</h2>
            <p>
              {plotted.length} de {stats.total} noticias publicadas tienen ubicación en el mapa
            </p>
          </div>

          {list.items.length > 0 ? (
            <div className="news-grid">
              {list.items.map((a, i) => (
                <Fragment key={a.id}>
                  <AccidentCard accident={a} />
                  {/* Ritmo de publicidad: 2 de cada 3 noticias llevan hueco. */}
                  <AdSlot indice={i} position={`mapa-${i}`} formato="rectangular" />
                </Fragment>
              ))}
            </div>
          ) : (
            <p className="news-description">
              Todavía no hay noticias publicadas. Ninguna se publica sin que un editor la revise antes.
            </p>
          )}

          <p className="mt-8">
            <Link href="/" className="section-more">
              ← Volver a la portada
            </Link>
            <span className="sr-only"> · {SITE.name}</span>
          </p>
        </section>
      </main>
    </>
  );
}

/**
 * El mapa se monta en el cliente porque Leaflet necesita el DOM. Se envuelve en
 * Suspense para que el resto de la pagina pueda renderizarse en el servidor.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { AccidentCard } from "@/components/AccidentCard";
import { AdSlot } from "@/components/AdSlot";
import { FilterBar } from "@/components/FilterBar";
import { MapLanzarote } from "@/components/MapLanzarote";
import {
  getAccidentsForMap,
  getPublicStats,
  listAccidents,
  countByMunicipality,
} from "@/lib/queries";
import { parseFilters, type RawSearchParams } from "@/lib/filters";
import { MUNICIPALITIES, SITE } from "@/lib/constants";

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

  const [stats, list, byMunicipality, mapAccidents] = await Promise.all([
    getPublicStats(),
    listAccidents({ ...filters, take: 9 }),
    countByMunicipality(),
    getAccidentsForMap(60),
  ]);

  const mapPoints = mapAccidents.map((a) => ({ ...a, occurredAt: a.occurredAt.toISOString() }));

  return (
    <>
      {/* ---------------------------- Hero ---------------------------- */}
      {/* Bloque con fondo gris claro, centrado y con el titular en Merriweather
          peso 900, tal como estaba en el diseño original. */}
      <section className="hero">
        <div className="hero-content">
          <h1>Toda la actualidad de Lanzarote, a cualquier hora</h1>
          <p>
            Accidentes, incendios, rescates y toda la noticia de la isla. Cada
            publicación está revisada antes de salir.
          </p>

          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-number">{stats.total}</div>
              <div className="hero-stat-label">Noticias</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-number">{stats.last24h}</div>
              <div className="hero-stat-label">Últimas 24 h</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-number">{stats.municipalities}</div>
              <div className="hero-stat-label">Municipios</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------- Buscador y filtros ---------------------- */}
      {/* Se queda pegado bajo la cabecera de 60px. */}
      <FilterBar />

      <main>
        {/* ---------------------------- Mapa ---------------------------- */}
        <section className="site-section map-section" aria-labelledby="titulo-mapa">
          <div className="section-header">
            <h2 id="titulo-mapa">Mapa de accidentes</h2>
            <p>Ubicación de los accidentes señalados en la isla</p>
          </div>
          <div className="map-container">
            <MapLanzarote accidents={mapPoints} />
          </div>
        </section>

        {/* -------------------------- Noticias -------------------------- */}
        <section className="site-section" aria-labelledby="titulo-noticias">
          <div className="section-header">
            <h2 id="titulo-noticias">Noticias recientes</h2>
            <p>Últimos accidentes reportados en Lanzarote</p>
          </div>

          {/* Un solo hueco en la portada, como pidio el editor. */}
          <AdSlot position="portada" />

          {list.items.length > 0 ? (
            <div className="news-grid">
              {list.items.map((a) => (
                <AccidentCard key={a.id} accident={a} />
              ))}
            </div>
          ) : (
            <p className="news-description">
              Todavía no hay noticias publicadas. Ninguna se publica sin que un editor la revise antes.
            </p>
          )}

          {list.total > list.items.length ? (
            <p style={{ marginTop: 28, textAlign: "center" }}>
              <Link href="/noticias" className="nav-admin" style={{ display: "inline-block" }}>
                Ver todas las noticias
              </Link>
            </p>
          ) : null}
        </section>

        {/* ------------------------- Municipios ------------------------- */}
        <section className="site-section stats-section" aria-labelledby="titulo-municipios">
          <div className="section-header">
            <h2 id="titulo-municipios">Por municipio</h2>
            <p>Accidentes registrados en cada municipio de la isla</p>
          </div>

          <div className="stats-grid">
            {MUNICIPALITIES.map((m) => {
              const count = byMunicipality.find((x) => x.slug === m.slug)?.count ?? 0;
              return (
                <Link
                  key={m.slug}
                  href={`/municipios/${m.slug}`}
                  className="stat-card"
                  style={{ display: "block", textDecoration: "none" }}
                >
                  <div className="stat-number">{count}</div>
                  <div className="stat-label">{m.name}</div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
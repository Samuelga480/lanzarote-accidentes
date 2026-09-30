import type { Metadata } from "next";
import { MapLanzarote } from "@/components/MapLanzarote";
import { getAccidentsForMap } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mapa de accidentes en Lanzarote",
  description:
    "Mapa de la isla de Lanzarote con la ubicación aproximada de los accidentes de tráfico publicados. Las posiciones están desplazadas de forma deliberada para proteger la privacidad.",
  alternates: { canonical: "/mapa" },
};

export default async function MapPage() {
  const accidents = await getAccidentsForMap(200);
  const points = accidents.map((a) => ({ ...a, occurredAt: a.occurredAt.toISOString() }));

  return (
    <div className="container-page py-6">
      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-alert mb-2">
          Cartografía
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight mb-2">
          Mapa de accidentes en Lanzarote
        </h1>
        <p className="text-ink-soft text-sm md:text-base max-w-2xl leading-relaxed">
          <span className="font-semibold text-ink-soft">{points.length}</span> siniestros publicados, situados en
          su <strong className="text-ink-soft">ubicación aproximada</strong>. El color del marcador indica la
          gravedad estimada.
        </p>
      </header>

      {points.length > 0 ? (
        <MapLanzarote accidents={points} />
      ) : (
        <p className="card p-10 text-center text-sm text-ink-mute">
          Todavía no hay noticias publicadas con coordenadas.
        </p>
      )}
    </div>
  );
}

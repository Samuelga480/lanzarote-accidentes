import Link from "next/link";
import type { Metadata } from "next";
import { countByMunicipality } from "@/lib/queries";
import { MUNICIPALITIES, SITE, ZONES, zonesByMunicipality } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accidentes por municipio",
  description:
    "Accidentes de tráfico registrados en cada uno de los siete municipios de Lanzarote: Arrecife, San Bartolomé, Teguise, Tinajo, Tías, Yaiza y Haría.",
  alternates: { canonical: "/municipios" },
};

export default async function MunicipalitiesPage() {
  const byMunicipality = await countByMunicipality();
  const total = byMunicipality.reduce((sum, m) => sum + m.count, 0);

  // Los municipios sin noticias cargadas siguen apareciendo, con contador 0.
  const ordered = MUNICIPALITIES.map((m) => ({
    ...m,
    count: byMunicipality.find((x) => x.slug === m.slug)?.count ?? 0,
  })).sort((a, b) => b.count - a.count);

  const max = Math.max(1, ...ordered.map((m) => m.count));

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/" className="hover:text-alert">
          Inicio
        </Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">Municipios</span>
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight">
          Accidentes por municipio
        </h1>
        <p className="text-ink-soft mt-2 text-sm md:text-base max-w-2xl leading-relaxed">
          Los {MUNICIPALITIES.length} municipios de la isla de Lanzarote. En total, {total}{" "}
          noticias publicadas en {SITE.name}.
        </p>
      </header>

      <p className="text-sm text-ink-soft mb-6">
        Los municipios no cubren toda la isla: la prensa escribe de localidades concretas como
        Puerto del Carmen o Playa Blanca. Hay{" "}
        <Link href="/zonas" className="text-alert font-semibold hover:underline">
          {ZONES.length} zonas
        </Link>{" "}
        con su propio listado.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((m) => (
          <Link
            key={m.slug}
            href={`/municipios/${m.slug}`}
            className="card p-5 hover:border-alert transition-colors group flex flex-col"
          >
            <h2 className="font-serif text-xl font-bold mb-1 group-hover:text-alert transition-colors">
              {m.name}
            </h2>
            <p className="text-xs text-ink-mute mb-4">
              {m.count} {m.count === 1 ? "noticia publicada" : "noticias publicadas"}
            </p>

            {/* Barra proporcional al total */}
            <div className="mt-auto">
              <div className="h-1.5 bg-ink-soft/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-alert rounded-full transition-all"
                  style={{ width: `${Math.max(3, (m.count / max) * 100)}%` }}
                  role="presentation"
                />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

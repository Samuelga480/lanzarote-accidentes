import Link from "next/link";
import type { Metadata } from "next";
import { countByZone } from "@/lib/queries";
import { SITE, zonesByMunicipality } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Noticias por zona",
  description:
    "Todas las zonas y localidades de Lanzarote con las noticias publicadas en cada una: Puerto del Carmen, Costa Teguise, Playa Blanca, Órzola, Famara, La Geria y el resto.",
  alternates: { canonical: "/zonas" },
};

export default async function ZonesPage() {
  const grupos = zonesByMunicipality();
  const counts = await countByZone();

  // El total sale de los municipios, no de la suma por zona: hay noticias que
  // nombran un municipio sin nombrar ninguna localidad, y si se sumara solo las
  // zonas el total del sitio pareciera menor de lo que es.
  const total = counts.reduce((suma, z) => suma + z.count, 0);

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/" className="hover:text-alert">
          Inicio
        </Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">Zonas</span>
      </nav>

      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight">
          Noticias por zona
        </h1>
        <p className="text-ink-soft mt-2 text-sm md:text-base max-w-2xl leading-relaxed">
          Las {grupos.reduce((s, g) => s + g.zones.length, 0)} localidades y zonas de los{" "}
          {grupos.length} municipios de Lanzarote. {total}{" "}
          {total === 1 ? "noticia publicada" : "noticias publicadas"} en las que se ha podido
          determinar la zona en {SITE.name}.
        </p>
      </header>

      <div className="space-y-10">
        {grupos.map(({ municipality, zones }) => {
          const conCuenta = zones
            .map((z) => ({ ...z, count: counts.find((c) => c.slug === z.slug)?.count ?? 0 }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
          const totalMunicipio = conCuenta.reduce((s, z) => s + z.count, 0);

          return (
            <section key={municipality.slug} aria-labelledby={`mun-${municipality.slug}`}>
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <h2
                  id={`mun-${municipality.slug}`}
                  className="font-serif text-xl md:text-2xl font-bold"
                >
                  <Link href={`/municipios/${municipality.slug}`} className="hover:text-alert">
                    {municipality.name}
                  </Link>
                </h2>
                <span className="text-xs text-ink-mute whitespace-nowrap">
                  {totalMunicipio}{" "}
                  {totalMunicipio === 1 ? "noticia" : "noticias"}
                </span>
              </div>

              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {conCuenta.map((z) => (
                  <li key={z.slug}>
                    <Link
                      href={`/zonas/${z.slug}`}
                      className="card px-4 py-3 flex items-center justify-between gap-3 hover:border-alert transition-colors"
                    >
                      <span className="font-serif font-bold">{z.name}</span>
                      <span
                        className={`text-xs tabular-nums ${z.count === 0 ? "text-ink-mute" : "text-alert font-semibold"}`}
                      >
                        {z.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
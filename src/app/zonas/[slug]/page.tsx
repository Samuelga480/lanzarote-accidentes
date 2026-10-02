import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listByZone } from "@/lib/queries";
import { MUNICIPALITY_BY_SLUG, ZONES } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * La zona se busca en ZONES y no en la base de datos: son datos fijos del
 * proyecto. Así una zona sin noticias sigue teniendo pagina, con el contador a
 * cero, en lugar de dar un 404 que parece que el sitio está roto.
 */
function zonaDe(slug: string) {
  return ZONES.find((z) => z.slug === slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const zona = zonaDe(slug);
  if (!zona) return { title: "Zona no encontrada" };

  const municipio = MUNICIPALITY_BY_SLUG.get(zona.municipalitySlug);
  return {
    title: `Noticias en ${zona.name}`,
    description: `Listado de noticias publicadas en ${zona.name}${municipio ? `, ${municipio.name}` : ""}, Lanzarote.`,
    alternates: { canonical: `/zonas/${slug}` },
  };
}

export default async function ZonePage({ params }: Props) {
  const { slug } = await params;
  const zona = zonaDe(slug);
  if (!zona) notFound();

  const municipio = MUNICIPALITY_BY_SLUG.get(zona.municipalitySlug);
  const otras = ZONES.filter(
    (z) => z.municipalitySlug === zona.municipalitySlug && z.slug !== zona.slug,
  );
  const accidents = await listByZone(slug);

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/" className="hover:text-alert">Inicio</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <Link href="/zonas" className="hover:text-alert">Zonas</Link>
        {municipio ? (
          <>
            <span aria-hidden="true" className="mx-1.5">/</span>
            <Link href={`/municipios/${municipio.slug}`} className="hover:text-alert">
              {municipio.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">{zona.name}</span>
      </nav>

      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-alert mb-2">
          {municipio ? `Zona de ${municipio.name}` : "Zona de Lanzarote"}
        </p>
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight mb-2">
          Noticias en {zona.name}
        </h1>
        <p className="text-ink-mute text-sm">
          {accidents.length}{" "}
          {accidents.length === 1 ? "noticia publicada" : "noticias publicadas"} en esta zona.
        </p>
      </header>

      {accidents.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {accidents.map((a) => (
            <article key={a.id} className="card p-5">
              <Link href={`/noticias/${a.slug}`} className="block hover:text-alert">
                <h2 className="font-serif text-lg font-bold leading-snug mb-1">{a.title}</h2>
              </Link>
              <p className="text-xs text-ink-mute">
                {municipio?.name ?? zona.municipalitySlug} ·{" "}
                {a.occurredAt.toISOString().slice(0, 10)}
                {a.injuries > 0 ? ` · ${a.injuries} heridos` : ""}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-soft font-semibold mb-2">
            Todavía no hay noticias publicadas en {zona.name}
          </p>
          <p className="text-xs text-ink-mute">
            La zona se detecta automáticamente en cuanto un medio publique un accidente en ella.
          </p>
        </div>
      )}

      {otras.length > 0 ? (
        <section aria-labelledby="otras-zonas" className="mt-12">
          <h2 id="otras-zonas" className="section-title rule-red pt-3 mb-4">
            Otras zonas de {municipio?.name ?? "Lanzarote"}
          </h2>
          <div className="flex flex-wrap gap-2">
            {otras.map((z) => (
              <Link
                key={z.slug}
                href={`/zonas/${z.slug}`}
                className="chip bg-paper border border-rule text-ink-soft hover:border-alert hover:text-alert transition-colors"
              >
                {z.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
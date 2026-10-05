import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { AccidentCard } from "@/components/AccidentCard";
import { AdSlot } from "@/components/AdSlot";
import { Pagination } from "@/components/Pagination";
import { CATEGORIAS_INFORMACION, etiquetaDe } from "@/lib/categorias";
import { SITE } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

/** Los temas con al menos una noticia publicada. Los vacios no salen en el menu. */
async function temasConNoticias() {
  const filas = await prisma.accident.groupBy({
    by: ["category"],
    where: { status: "PUBLISHED", category: { in: [...CATEGORIAS_INFORMACION] } },
    _count: true,
  });
  const cuenta = new Map(filas.map((f) => [f.category, f._count]));
  return CATEGORIAS_INFORMACION.filter((c) => (cuenta.get(c) ?? 0) > 0).map((c) => ({
    slug: c,
    label: etiquetaDe(c),
    total: cuenta.get(c) ?? 0,
  }));
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const tema = (sp.tema ?? "").trim();
  const valido = tema && CATEGORIAS_INFORMACION.includes(tema as never) ? tema : null;

  return {
    title: valido ? etiquetaDe(valido) : "Información",
    description: valido
      ? `Noticias de ${etiquetaDe(valido).toLowerCase()} en Lanzarote. Toda la actualidad de la isla, filtrada por municipio y fecha.`
      : `Actualidad de Lanzarote: política, servicios, economía, cultura, deportes y más. Sin anuncios ni headlines copiados.`,
    alternates: { canonical: valido ? `/informacion?tema=${valido}` : "/informacion" },
  };
}

export default async function InformacionPage({ searchParams }: Props) {
  const sp = await searchParams;
  const tema = (sp.tema ?? "").trim();
  const esValido = tema && CATEGORIAS_INFORMACION.includes(tema as never) ? tema : null;
  const pagina = Math.max(1, Number(sp.page) || 1);
  const porPagina = 12;

  const where = {
    status: "PUBLISHED" as const,
    ...(esValido ? { category: esValido as never } : { category: { in: [...CATEGORIAS_INFORMACION] } }),
  };

  const [filas, total, temas] = await Promise.all([
    prisma.accident.findMany({
      where,
      include: { municipality: true },
      orderBy: { occurredAt: "desc" },
      take: porPagina,
      skip: (pagina - 1) * porPagina,
    }),
    prisma.accident.count({ where }),
    temasConNoticias(),
  ]);

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/" className="hover:text-alert">
          Inicio
        </Link>
        <span aria-hidden="true" className="mx-1.5">
          /
        </span>
        <span className="text-ink-soft">Información</span>
      </nav>

      <header className="mb-6">
        <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight">
          {esValido ? etiquetaDe(esValido) : "Información"}
        </h1>
        <p className="text-ink-mute text-sm mt-2">
          {total === 0
            ? "Sin noticias."
            : `${total} ${total === 1 ? "noticia publicada" : "noticias publicadas"}`}
          {!esValido ? " sobre la actualidad de la isla." : " de este tema."}
        </p>
      </header>

      {/* Los temas que tienen noticias. Los que no tienen, no se enseñan. */}
      {temas.length > 0 ? (
        <nav aria-label="Temas de información" className="mb-8 flex flex-wrap gap-2">
          <Link
            href="/informacion"
            className={`btn btn-small ${esValido ? "btn-ghost" : "btn-primary"}`}
            aria-current={esValido ? undefined : "page"}
          >
            Todos
          </Link>
          {temas.map((t) => (
            <Link
              key={t.slug}
              href={`/informacion?tema=${t.slug}`}
              className={`btn btn-small ${esValido === t.slug ? "btn-primary" : "btn-ghost"}`}
              aria-current={esValido === t.slug ? "page" : undefined}
            >
              {t.label}
              <span className="ml-1 opacity-60">{t.total}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {filas.length > 0 ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filas.map((a, i) => (
              <Fragment key={a.id}>
                <AccidentCard accident={a as never} />
                <AdSlot indice={i} position={`informacion-${i}`} formato="rectangular" />
              </Fragment>
            ))}
          </div>
          <Pagination
            base="/informacion"
            sp={sp}
            page={pagina}
            total={total}
            take={porPagina}
          />
        </>
      ) : (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-soft font-semibold mb-2">
            No hay noticias de este tema todavía
          </p>
          <p className="text-xs text-ink-mute mb-5">
            Cada noticia se publica después de que un editor la revise.
          </p>
          <Link href="/informacion" className="btn btn-ghost">
            Ver todos los temas
          </Link>
        </div>
      )}

      <p className="mt-8 text-xs text-ink-mute">
        Los accidents de la isla están aparte, en{" "}
        <Link href="/noticias?categoria=ACCIDENTE_TRAFICO" className="underline hover:text-alert">
          el apartado de sucesos
        </Link>
        . Esta página es para el resto: política, servicios, cultura, deporte.
      </p>
    </div>
  );
}
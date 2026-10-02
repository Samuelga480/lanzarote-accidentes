import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWeeklySummary, listWeeksWithAccidents } from "@/lib/queries";
import { WeekSelect } from "@/components/WeekSelect";
import { AdSlot } from "@/components/AdSlot";
import { formatDate } from "@/lib/format";
import { SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Resumen semanal",
  description:
    "Resumen de los accidentes de tráfico registrados en Lanzarote cada semana: totales, reparto por tipo de incidente y por municipio.",
  alternates: { canonical: "/resumen" },
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ semana?: string }> };

/**
 * Rango de la semana que se muestra, en texto.
 * La semana va de lunes a domingo.
 */
function weekLabel(start: Date): string {
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** Etiqueta del desplegable, con el año para no confundir semanas de años. */
function optionLabel(start: Date): string {
  return `${formatDate(start)} (semana ${start.getUTCDate()}/${start.getUTCMonth() + 1})`;
}

export default async function ResumenPage({ searchParams }: Props) {
  const sp = await searchParams;
  const weeks = await listWeeksWithAccidents();

  // La semana llega como yyyy-mm-dd. Si no es valida se usa la actual: una URL
  // manipulada no debe romper la pagina con un error 500.
  let selected: Date | undefined;
  if (sp.semana && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana)) {
    const d = new Date(`${sp.semana}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) selected = d;
  }

  const summary = await getWeeklySummary(selected);

  const maxType = Math.max(1, ...summary.byType.map((t) => t.count));
  const maxMuni = Math.max(1, ...summary.byMunicipality.map((m) => m.count));

  return (
    <main className="resumen-main">
      <div className="resumen-container">
        <div className="resumen-header">
          <h2>Resumen de accidentes semanal</h2>
          <p>Consulta el resumen de accidentes de tráfico en Lanzarote por semana</p>
        </div>

        {/*
          El desplegable es un componente de cliente porque necesita onChange
          para navegar. El resto de la pagina se renderiza en el servidor, y la
          semana queda en la URL para que el enlace sea compartible.
        */}
        <WeekSelect
          weeks={weeks.map((w) => ({
            value: w.toISOString().slice(0, 10),
            label: optionLabel(w),
          }))}
          current={summary.weekStart.toISOString().slice(0, 10)}
        />

        {summary.total === 0 ? (
          <p className="resumen-vacio">
            No hay noticias publicadas en la semana del {weekLabel(summary.weekStart)}.
          </p>
        ) : (
          <>
            {/* Cifras de la semana */}
            <section className="resumen-stats" aria-label="Totales de la semana">
              {[
                { label: "Accidentes", value: summary.total },
                { label: "Personas heridas", value: summary.injuries },
                { label: "Fallecidos", value: summary.fatalities },
                { label: "Municipios", value: summary.byMunicipality.length },
              ].map((s) => (
                <div key={s.label} className="resumen-stat-card">
                  <div className="resumen-stat-number">{s.value}</div>
                  <div className="resumen-stat-label">{s.label}</div>
                </div>
              ))}
            </section>

            {/* Accidentes por tipo */}
            <section className="resumen-chart" aria-labelledby="titulo-tipos">
              <h3 id="titulo-tipos">Accidentes por tipo</h3>
              <div className="chart-container">
                {summary.byType.map((t) => (
                  <div key={t.label} className="chart-bar">
                    <span className="chart-bar-label">{t.label}</span>
                    <span className="chart-bar-track">
                      {/*
                        El ancho va en porcentaje del maximo de la semana, no del
                        total: asi la barra mas larga siempre ocupa el carril
                        entero y las cortas se comparan entre si.
                      */}
                      <span
                        className="chart-bar-fill"
                        style={{ width: `${Math.round((t.count / maxType) * 100)}%`, display: "block" }}
                      />
                    </span>
                    <span className="chart-bar-value">{t.count}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Accidentes por zona */}
            <section className="resumen-chart" aria-labelledby="titulo-zonas">
              <h3 id="titulo-zonas">Accidentes por zona</h3>
              <div className="chart-container">
                {summary.byMunicipality.map((m) => (
                  <div key={m.label} className="chart-bar">
                    <span className="chart-bar-label">{m.label}</span>
                    <span className="chart-bar-track">
                      <span
                        className="chart-bar-fill"
                        style={{ width: `${Math.round((m.count / maxMuni) * 100)}%`, display: "block" }}
                      />
                    </span>
                    <span className="chart-bar-value">{m.count}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Listado de la semana */}
            <section className="resumen-accidentes" aria-labelledby="titulo-lista">
              <h3 id="titulo-lista">Accidentes de la semana</h3>
              <div>
                {summary.accidents.map((a) => (
                  <Link
                    key={a.id}
                    href={`/accidentes/${a.slug}`}
                    className="resumen-accidente-item"
                  >
                    <div className="resumen-accidente-title">{a.title}</div>
                    <div className="resumen-accidente-meta">
                      <span>{a.municipality.name}</span>
                      <span>{formatDate(a.occurredAt)}</span>
                      {a.injuries > 0 ? <span>{a.injuries} heridos</span> : null}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}

        <AdSlot position="resumen" />

        <p className="mt-8">
          <Link href="/resumen-anual" className="section-more">
            Ver el resumen anual
          </Link>
          <span className="resumen-sep"> · </span>
          <Link href="/" className="section-more">
            ← Volver a la portada
          </Link>
          <span className="sr-only"> · {SITE.name}</span>
        </p>
      </div>
    </main>
  );
}
import Link from "next/link";
import type { Metadata } from "next";
import { getAnnualSummary, listYearsWithAccidents } from "@/lib/queries";
import { YearSelect } from "@/components/YearSelect";
import { AdSlot } from "@/components/AdSlot";
import { formatDate } from "@/lib/format";
import { canaryYearOf, countdownToYearEnd, isYearClosed } from "@/lib/calendar-year";
import { SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Resumen anual",
  description:
    "Resumen anual de los accidentes de tráfico registrados en Lanzarote: totales del año, reparto por mes, por tipo de incidente y por municipio.",
  alternates: { canonical: "/resumen-anual" },
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ ano?: string }> };

/**
 * Ventana del año, escrita como la entiende cualquiera.
 *
 * El texto es fijo a proposito: la ventana no cambia, y su calculo real (con el
 * horario de verano resuelto) vive en calendar-year.ts. Aqui solo se describe.
 */
function windowLabel(year: number): string {
  return `Del 1 de enero de ${year} a las 00:00 al 31 de diciembre de ${year} a las 23:59`;
}

export default async function ResumenAnualPage({ searchParams }: Props) {
  const sp = await searchParams;
  const now = new Date();

  // El ano llega como texto. Una URL manipulada no debe romper la pagina con un
  // error 500: si no es un ano valido se muestra el que esta en curso.
  const pedido = sp.ano && /^\d{4}$/.test(sp.ano) ? Number(sp.ano) : undefined;
  const summary = await getAnnualSummary(pedido);
  const years = await listYearsWithAccidents();

  // El ano en curso tiene que estar en el desplegable aunque todavia no tenga
  // noticias, o el valor seleccionado no existiria entre las opciones y el
  // desplegable mostraria otra cosa.
  const opciones = [...new Set([summary.year, ...years])]
    .sort((a, b) => b - a)
    .map((y) => ({
      value: y,
      label: y === canaryYearOf(now) ? `${y} (año en curso)` : `${y}`,
    }));

  const maxMonth = Math.max(1, ...summary.byMonth.map((m) => m.count));
  const maxType = Math.max(1, ...summary.byType.map((t) => t.count));
  const maxMuni = Math.max(1, ...summary.byMunicipality.map((m) => m.count));

  const cuenta = countdownToYearEnd(summary.year, now);
  const cerrado = isYearClosed(summary.year, now);

  // El mes con mas accidents de todo el ano, o null si no hay ninguno.
  const mesMas = summary.byMonth.reduce<{ label: string; count: number } | null>(
    (top, m) => (m.count > 0 && (!top || m.count > top.count) ? m : top),
    null,
  );

  const recortado = summary.totalListed - summary.accidents.length;

  return (
    <main className="resumen-main">
      <div className="resumen-container">
        <div className="resumen-header">
          <h1>Resumen anual de accidentes</h1>
          <p>Las cifras del año completo en Lanzarote, mes a mes</p>
        </div>

        <p className="resumen-ventana">
          {windowLabel(summary.year)} (hora de Canarias)
        </p>

        {/*
          El desplegable es un componente de cliente porque necesita onChange
          para navegar. El resto de la pagina se renderiza en el servidor, y el
          ano queda en la URL para que el enlace sea compartible.
        */}
        <YearSelect years={opciones} current={summary.year} />

        {cuenta ? (
          <p className="resumen-cuenta">
            Quedan <strong>{cuenta.days}</strong> días, <strong>{cuenta.hours}</strong> horas y{" "}
            <strong>{cuenta.minutes}</strong> minutos para que cierre el año.
          </p>
        ) : cerrado ? (
          <p className="resumen-cuenta">
            El año {summary.year} cerró el 31 de diciembre a las 23:59.
          </p>
        ) : null}

        {summary.total === 0 ? (
          <p className="resumen-vacio">
            No hay noticias publicadas en el año {summary.year}.
          </p>
        ) : (
          <>
            {/* Cifras del ano */}
            <section className="resumen-stats" aria-label="Totales del año">
              {[
                { label: "Accidentes", value: summary.total },
                { label: "Personas heridas", value: summary.injuries },
                { label: "Fallecidos", value: summary.fatalities },
                { label: "Municipios", value: summary.byMunicipality.length },
                {
                  label: "Mes más activo",
                  value: mesMas ? mesMas.label : "—",
                },
              ].map((s) => (
                <div key={s.label} className="resumen-stat-card">
                  <div className="resumen-stat-number">{s.value}</div>
                  <div className="resumen-stat-label">{s.label}</div>
                </div>
              ))}
            </section>

            {/* Accidentes por mes: los doce, con los vacios a cero */}
            <section className="resumen-chart" aria-labelledby="titulo-meses">
              <h3 id="titulo-meses">Accidentes por mes</h3>
              <div className="chart-container">
                {summary.byMonth.map((m) => (
                  <div key={m.month} className="chart-bar">
                    <span className="chart-bar-label">{m.label}</span>
                    <span className="chart-bar-track">
                      <span
                        className="chart-bar-fill"
                        style={{ width: `${Math.round((m.count / maxMonth) * 100)}%`, display: "block" }}
                      />
                    </span>
                    <span className="chart-bar-value">{m.count}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Accidentes por tipo */}
            <section className="resumen-chart" aria-labelledby="titulo-tipos">
              <h3 id="titulo-tipos">Accidentes por tipo</h3>
              <div className="chart-container">
                {summary.byType.map((t) => (
                  <div key={t.label} className="chart-bar">
                    <span className="chart-bar-label">{t.label}</span>
                    <span className="chart-bar-track">
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

            {/* Listado del ano */}
            <section className="resumen-accidentes" aria-labelledby="titulo-lista">
              <h3 id="titulo-lista">Accidentes de {summary.year}</h3>
              <div>
                {summary.accidents.map((a) => (
                  <Link
                    key={a.id}
                    href={`/noticias/${a.slug}`}
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

              {recortado > 0 ? (
                <p className="resumen-nota">
                  Se muestran las {summary.accidents.length} más recientes. Quedan{" "}
                  {recortado} más en la{" "}
                  <Link href="/noticias">portada de accidentes</Link>.
                </p>
              ) : null}
            </section>
          </>
        )}

        <AdSlot position="resumen" />

        <p className="mt-8">
          <Link href="/resumen" className="section-more">
            ← Volver al resumen semanal
          </Link>
          <span className="resumen-sep"> · </span>
          <Link href="/" className="section-more">
            Volver a la portada
          </Link>
          <span className="sr-only"> · {SITE.name}</span>
        </p>
      </div>
    </main>
  );
}
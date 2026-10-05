import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { formatDate } from "@/lib/format";
import { CATEGORY_LABEL, STATUS_LABEL, VEHICLE_LABEL, SEVERITY_LABEL } from "@/lib/constants";
import {
  CATEGORIAS_SUCESO,
  CATEGORIAS_INFORMACION,
  etiquetaDe,
} from "@/lib/categorias";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { VehicleType } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Revisar noticia",
  robots: { index: false, follow: false },
};

/**
 * Ficha de UNA noticia pendiente, para revisarla desde el correo.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE EXISTE
 * ---------------------------------------------------------------------------
 *
 * Cuando llega una noticia nueva, el sistema avisa por correo con un enlace
 * "Revisar y aprobar". Ese enlace apunta a `/admin/<id>`, y esa ruta no existia: el
 * aviso llevaba a un 404 y el receptor no tenia forma de aprobar nada desde alli.
 * La unica forma era entrar en `/admin` y buscar la noticia en la lista.
 *
 * Esta pagina es ese destino. Es deliberadamente una sola noticia y con los
 * botones delante: el enlace llega desde el movil, en el momento en que se acaba
 * de detectar el accidente, y lo que se quiere es mirar y decidir sin menus de
 * por medio.
 *
 * ---------------------------------------------------------------------------
 *  LO QUE MUESTRA
 * ---------------------------------------------------------------------------
 *
 * El texto tal como se va a publicar, que es lo que hay que juzgar. Tambien lo
 * que el sistema detecto por su cuenta (municipio, zona, carretera, vehiculo,
 * gravedad) y de donde salio, para poder contrastarlo. Un aviso de que la
 * deteccion no cuadra con el titular va en pantalla, porque es exactamente el
 * fallo que hay que cazar antes de aprobar.
 */
export default async function RevisarNoticia({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAuth();
  const { id } = await params;
  const sp = await searchParams;

  const a = await prisma.accident.findUnique({
    where: { id },
    include: {
      municipality: { select: { name: true } },
      sources: { orderBy: { id: "asc" } },
    },
  });

  if (!a) notFound();

  const sp1 = sp.ok ? "Noticia aprobada y publicada." : null;
  const sp2 = sp.rechazada ? "Noticia rechazada. Se queda en el historial." : null;
  const sp3 = sp.eliminada ? "Noticia eliminada." : null;
  const sp4 = sp.categoria ? "Tipo de noticia corregido." : null;
  const sp5 = sp.categoria === "igual" ? "El tipo ya era ese, no se ha cambiado nada." : null;
  const sp6 = sp.categoria === "error" ? "Ese tipo no existe." : null;
  const avisos = [sp1, sp2, sp3, sp4, sp5, sp6].filter(Boolean) as string[];

  // Comprobaciones de coherencia entre lo detectado y lo escrito.
  const resumenCuerpo = `${a.title} ${a.summary ?? ""} ${a.body ?? ""}`;
  const avisosCoherencia: string[] = [];

  if (!resumenCuerpo.toLowerCase().includes(a.municipality.name.toLowerCase())) {
    avisosCoherencia.push(
      `El texto no menciona "${a.municipality.name}", que es el municipio asignado.`,
    );
  }
  if (a.road && !resumenCuerpo.toUpperCase().includes(a.road.toUpperCase())) {
    avisosCoherencia.push(`El texto no menciona la carretera ${a.road}.`);
  }
  if (a.summary && a.summary.trim() === a.title.trim()) {
    avisosCoherencia.push("El resumen es igual que el titular.");
  }

  const parrafos = (a.body ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="admin-body">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="logo">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <h1>Revisar noticia</h1>
          </div>

          <nav className="admin-nav">
            <ThemeToggle />
            <Link href="/admin" className="admin-nav-link">
              Volver al panel
            </Link>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn btn-secondary">
                Cerrar Sesion
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="admin-main">
        {avisos.map((m) => (
          <p
            key={m}
            role="status"
            className="admin-stat-card"
            style={{ padding: "12px 20px", marginBottom: 24, borderColor: "var(--success)" }}
          >
            {m}
          </p>
        ))}

        {/* ---------------- Avisos de coherencia ---------------- */}
        {avisosCoherencia.length > 0 ? (
          <div
            className="admin-stat-card"
            style={{ padding: "14px 20px", marginBottom: 24, borderColor: "var(--warning)" }}
          >
            <strong>Antes de aprobar, mira esto:</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: "20px", fontSize: "0.9rem" }}>
              {avisosCoherencia.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ---------------- Lo que se va a publicar ---------------- */}
        <article className="admin-stat-card" style={{ padding: "24px", marginBottom: 24 }}>
          <p style={{ margin: "0 0 4px", fontSize: "0.8rem", color: "var(--ink-mute)" }}>
            {STATUS_LABEL[a.status as keyof typeof STATUS_LABEL] ?? a.status}
            {" · "}
            {a.occurredAt ? formatDate(a.occurredAt) : "sin fecha"}
          </p>

          <h1 style={{ margin: "0 0 12px", fontSize: "1.5rem", lineHeight: 1.25 }}>{a.title}</h1>

          {a.summary ? (
            <p style={{ margin: "0 0 18px", color: "var(--ink-soft)" }}>{a.summary}</p>
          ) : null}

          {a.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.imageUrl}
              alt={a.imageAlt ?? a.title}
              style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 18 }}
            />
          ) : null}

          <div className="prose-news">
            {parrafos.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </article>

        {/* ---------------- Lo que detecto el sistema ---------------- */}
        <section className="admin-stat-card" style={{ padding: "20px", marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Lo que detecto el sistema</h2>
          <dl style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "6px 12px", margin: 0, fontSize: "0.9rem" }}>
            <dt className="resumen-stat-label">Municipio</dt>
            <dd style={{ margin: 0 }}>{a.municipality.name}</dd>

            {a.zone ? (
              <>
                <dt className="resumen-stat-label">Zona</dt>
                <dd style={{ margin: 0 }}>{a.zone}</dd>
              </>
            ) : null}

            {a.road ? (
              <>
                <dt className="resumen-stat-label">Carretera</dt>
                <dd style={{ margin: 0 }}>{a.road}</dd>
              </>
            ) : null}

            <dt className="resumen-stat-label">Categoria</dt>
            <dd style={{ margin: 0 }}>
              {CATEGORY_LABEL[a.category ?? ""] ?? a.category ?? "-"}
              {a.category && CATEGORIAS_SUCESO.includes(a.category as never) ? (
                <span style={{ color: "var(--ink-mute)" }}> · va al mapa</span>
              ) : (
                <span style={{ color: "var(--ink-mute)" }}> · no va al mapa</span>
              )}
            </dd>

            <dt className="resumen-stat-label">Vehiculo</dt>
            <dd style={{ margin: 0 }}>
              {VEHICLE_LABEL[a.vehicleType as VehicleType] ?? a.vehicleType}
            </dd>

            <dt className="resumen-stat-label">Gravedad</dt>
            <dd style={{ margin: 0 }}>
              {SEVERITY_LABEL[a.severity as keyof typeof SEVERITY_LABEL] ?? a.severity}
            </dd>

            {a.fatalities ? (
              <>
                <dt className="resumen-stat-label">Fallecidos</dt>
                <dd style={{ margin: 0 }}>{a.fatalities}</dd>
              </>
            ) : null}

            {a.injuries ? (
              <>
                <dt className="resumen-stat-label">Heridos</dt>
                <dd style={{ margin: 0 }}>{a.injuries}</dd>
              </>
            ) : null}

            <dt className="resumen-stat-label">Direccion</dt>
            <dd style={{ margin: 0, wordBreak: "break-all" }}>{`/accidentes/${a.slug}`}</dd>
          </dl>
        </section>

        {/* ---------------- De donde salio ---------------- */}
        {a.sources.length > 0 ? (
          <section className="admin-stat-card" style={{ padding: "20px", marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1rem" }}>De donde salio</h2>
            <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "0.9rem" }}>
              {a.sources.map((s) => (
                <li key={s.id} style={{ marginBottom: 8 }}>
                  <strong>{s.outlet}</strong>
                  <br />
                  <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>
                    {s.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---------------- Corregir el tipo ---------------- */}
        <section className="admin-stat-card" style={{ padding: "20px", marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "1rem" }}>Tipo de noticia</h2>
          <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "var(--ink-mute)" }}>
            El sistema lo decidio solo y puede equivocarse. Los sucesos van al mapa y a los
            resumenes de accidentes; la informacion no. Elegir aqui es lo que decide donde
            aparece la noticia.
          </p>

          <form action="/admin/categoria" method="post" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input type="hidden" name="id" value={a.id} />
            <select
              name="categoria"
              defaultValue={a.category ?? "OTRO"}
              style={{ padding: "8px 10px", fontSize: "0.9rem", borderRadius: 6, border: "1px solid var(--ink-line)" }}
            >
              <optgroup label="Sucesos (van al mapa)">
                {CATEGORIAS_SUCESO.map((c) => (
                  <option key={c} value={c}>
                    {etiquetaDe(c)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Informacion (no van al mapa)">
                {CATEGORIAS_INFORMACION.map((c) => (
                  <option key={c} value={c}>
                    {etiquetaDe(c)}
                  </option>
                ))}
                <option value="OTRO">Sin clasificar</option>
              </optgroup>
            </select>
            <button type="submit" className="btn btn-secondary">
              Guardar tipo
            </button>
          </form>
        </section>

        {/* ---------------- Decidir ---------------- */}
        <section className="admin-stat-card" style={{ padding: "20px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: "1rem" }}>Decidir</h2>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <form action="/admin/aprobar" method="post">
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="estado" value="PUBLISHED" />
              <input type="hidden" name="volver" value={`/admin/${a.id}`} />
              <button type="submit" className="btn btn-success">
                Aprobar y publicar
              </button>
            </form>

            <form action="/admin/aprobar" method="post">
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="estado" value="REJECTED" />
              <input type="hidden" name="volver" value={`/admin/${a.id}`} />
              <button type="submit" className="btn btn-warning">
                Rechazar
              </button>
            </form>

            {a.status === "PUBLISHED" ? (
              <a href={`/accidentes/${a.slug}`} className="btn btn-secondary">
                Ver en la web
              </a>
            ) : null}

            <Link href="/admin" className="btn btn-secondary">
              Volver al panel
            </Link>
          </div>

          <p style={{ margin: "16px 0 0", fontSize: "0.8rem", color: "var(--ink-mute)" }}>
            Rechazar deja la noticia en el historial. No la borra. Aprobar la publica en el sitio
            y la mete en el mapa, el RSS y la portada.
          </p>
        </section>
      </main>
    </div>
  );
}
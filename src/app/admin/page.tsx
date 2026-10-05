import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSession } from "@/lib/auth-guard";
import { formatDate } from "@/lib/format";
import { CATEGORY_LABEL, STATUS_LABEL } from "@/lib/constants";
import { duplicateFilter } from "@/lib/dedupe";
import { RunCycleButton } from "@/components/admin/RunCycleButton";
import { NewsRow, type AdminRow } from "@/components/admin/NewsRow";
import { AdminPasswordForm } from "@/components/admin/AdminPasswordForm";
import { cerrarSesionAdminAction } from "@/app/sesion/actions";
import { ThemeToggle } from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel de Administracion",
  robots: { index: false, follow: false },
};

/**
 * Traduce el estado interno a la palabra que usaba el panel original.
 *
 * PUBLISHED -> aprobada, PENDING_REVIEW -> pendiente, el resto -> rechazada.
 * Es solo para la interfaz: en la base de datos los estados son otros.
 */
function estadoParaPanel(status: string): AdminRow["status"] {
  if (status === "PUBLISHED") return "aprobada";
  if (status === "PENDING_REVIEW") return "pendiente";
  return "rechazada";
}

/** Filtros del buscador del panel, por GET. */
function filtro(sp: Record<string, string | undefined>, clave: string): string {
  return (sp[clave] ?? "").trim();
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Sin sesion se ofrece la entrada del panel. La via normal es /entrar con la
  // cuenta de administrador; esta es la de emergencia con ADMIN_PASSWORD.
  const sesion = await getSession();
  if (!sesion) {
    return (
      <div className="admin-body">
        <AdminPasswordForm />
      </div>
    );
  }

  const sp = await searchParams;

  const q = filtro(sp, "q");
  const estado = filtro(sp, "estado");
  const zona = filtro(sp, "zona");

  // Se cuentan las tres cifras del panel antes de aplicar filtros: las cifras
  // son del total, no de lo que hay en pantalla.
  const [totales, porEstado, zonas, filas] = await Promise.all([
    // Las cifras se cuentan con el mismo filtro que la lista: si una duplicada
    // salia en el listado pero no en "Pendientes", el editor ve un numero que
    // no corresponde a lo que tiene delante.
    prisma.accident.count({ where: duplicateFilter() }),
    prisma.accident.groupBy({
      by: ["status"],
      where: duplicateFilter(),
      _count: { _all: true },
    }),
    prisma.municipality.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.accident.findMany({
      where: {
        // Las duplicadas que aun no estan publicadas no salen: su texto ya esta en
        // la canonica y aprobarlas republicaba el mismo suceso.
        ...duplicateFilter(),
        ...(estado && estado in STATUS_LABEL ? { status: estado } : {}),
        ...(zona ? { municipalityId: zona } : {}),
        ...(q ? { title: { contains: q } } : {}),
      },
      include: {
        municipality: { select: { name: true } },
        sources: { take: 1, select: { outlet: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
  ]);

  const cuenta = (s: string) => porEstado.find((r) => r.status === s)?._count._all ?? 0;

  const rows: AdminRow[] = filas.map((a) => ({
    id: a.id,
    title: a.title,
    occurredAt: formatDate(a.occurredAt),
    municipality: a.municipality.name,
    category: CATEGORY_LABEL[a.category] ?? "Otro",
    status: estadoParaPanel(a.status),
    resumenIA: a.originalSummary ?? a.summary,
    fuentes: a.sources[0]?.outlet ?? "sin fuente",
    slug: a.slug,
  }));

  /*
    Los errores llegan en `?error=` con el motivo ya escrito. El caso de
    "falta-id" es el unico con texto propio; el resto lo pone `changeStatus` o
    `removeAccident`, que lanzan con un mensaje que el editor necesita leer (por
    ejemplo, que la noticia ya esta fusionada en otra).
  */
  const avisos = [
    sp.publicada ? "Noticia aprobada y publicada." : null,
    sp.rechazada ? "Noticia rechazada." : null,
    sp.borrada ? "Noticia eliminada." : null,
    sp.error === "falta-id" ? "Falta el identificador de la noticia." : null,
    sp.error && sp.error !== "falta-id" ? `No se pudo hacer: ${sp.error}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="admin-body">
      {/* Cabecera fija del panel */}
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
            <h1>Panel de Administracion</h1>
          </div>

          <nav className="admin-nav">
            <ThemeToggle />
            <Link href="/" className="admin-nav-link">
              Ver Web
            </Link>
            <form action={cerrarSesionAdminAction}>
              <button type="submit" className="btn btn-secondary">
                Cerrar Sesion
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="admin-main">
        {/* Pestanas */}
        <div className="admin-nav-tabs">
          <Link href="/admin" className="admin-nav-tab active">
            Noticias
          </Link>
          <Link href="/usuarios" className="admin-nav-tab">
            Usuarios registrados
          </Link>
        </div>

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

        {/* Cifras */}
        <section className="admin-stats" aria-label="Totales de noticias">
          <div className="admin-stat-card">
            <div className="admin-stat-number">{totales}</div>
            <div className="admin-stat-label">Total</div>
          </div>
          <div className="admin-stat-card pendiente">
            <div className="admin-stat-number">{cuenta("PENDING_REVIEW")}</div>
            <div className="admin-stat-label">Pendientes</div>
          </div>
          <div className="admin-stat-card aprobada">
            <div className="admin-stat-number">{cuenta("PUBLISHED")}</div>
            <div className="admin-stat-label">Aprobadas</div>
          </div>
        </section>

        {/* Recopilar */}
        <section style={{ marginBottom: 24 }}>
          <RunCycleButton />
        </section>

        {/* Filtros */}
        <form method="get" className="admin-filters">
          <div className="admin-filters-inner">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Buscar noticias..."
              className="admin-input"
              aria-label="Buscar noticias"
            />

            <select name="estado" defaultValue={estado} className="admin-select" aria-label="Estado">
              <option value="">Todos los estados</option>
              <option value="PENDING_REVIEW">Pendiente</option>
              <option value="PUBLISHED">Aprobada</option>
              <option value="REJECTED">Rechazada</option>
              <option value="ARCHIVED">Archivada</option>
            </select>

            <select name="zona" defaultValue={zona} className="admin-select" aria-label="Zona">
              <option value="">Todas las zonas</option>
              {zonas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            <button type="submit" className="btn btn-secondary">
              Filtrar
            </button>
          </div>
        </form>

        {/* Lista */}
        {rows.length > 0 ? (
          <section className="admin-news-list">
            {rows.map((r) => (
              <NewsRow key={r.id} row={r} />
            ))}
          </section>
        ) : (
          <p className="admin-vacio">
            {q || estado || zona
              ? "Ninguna noticia coincide con esos filtros."
              : "No hay noticias para mostrar."}
          </p>
        )}
      </main>
    </div>
  );
}
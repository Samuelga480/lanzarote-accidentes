import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Auditoría",
  robots: { index: false, follow: false },
};

const ACTION_LABEL: Record<string, string> = {
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
  LOGIN_FAILED: "Intento fallido",
  APPROVE: "Aprobada",
  REJECT: "Descartada",
  UPDATE: "Editada",
  CREATE: "Creada",
  DELETE: "Eliminada",
  FEATURE: "Destacada",
  INGEST: "Ingesta",
  MERGE: "Fusión de duplicados",
  NOTIFY: "Notificación",
  CRON: "Ciclo de monitorización",
};

const ACTOR_STYLE: Record<string, string> = {
  SCRAPER: "bg-[#ede9fe] text-[#5b21b6]",
  IA: "bg-[#ede9fe] text-[#5b21b6]",
  SISTEMA: "bg-ink-soft/10 text-ink-soft",
};

export default async function AdminAuditPage() {
  await requireAdminPage();

  const [entries, actionStats] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    prisma.auditLog.groupBy({
      by: ["action"],
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
      take: 10,
    }),
  ]);

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/admin" className="hover:text-alert">Panel</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">Auditoría</span>
      </nav>

      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold leading-tight">Auditoría de acciones</h1>
        <p className="text-sm text-ink-mute mt-1">
          Quién hizo qué, cuándo y sobre qué noticia. Últimos 150 registros.
        </p>
      </header>

      {/* ---------------- Resumen por acción ---------------- */}
      <section className="flex flex-wrap gap-2 mb-6">
        {actionStats.map((s) => (
          <span key={s.action} className="chip bg-ink-soft/10 text-ink-soft">
            {ACTION_LABEL[s.action] ?? s.action}: {s._count._all}
          </span>
        ))}
        {actionStats.length === 0 ? (
          <p className="text-sm text-ink-mute">Sin registros todavía.</p>
        ) : null}
      </section>

      {/* ---------------- Detalle ---------------- */}
      <section className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-canvas border-b border-rule">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-ink-mute">Cuándo</th>
              <th className="text-left px-3 py-2 font-semibold text-ink-mute">Actor</th>
              <th className="text-left px-3 py-2 font-semibold text-ink-mute">Acción</th>
              <th className="text-left px-3 py-2 font-semibold text-ink-mute">Entidad</th>
              <th className="text-left px-3 py-2 font-semibold text-ink-mute">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {entries.map((e) => {
              let detail = e.detail ?? "";
              try {
                if (detail) detail = JSON.stringify(JSON.parse(detail));
              } catch {
                /* se muestra tal cual */
              }
              const actorClass = ACTOR_STYLE[e.actor] ?? "bg-ink-soft/10 text-ink-mute";
              return (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-ink-mute whitespace-nowrap" title={formatDateTime(e.createdAt)}>
                    {formatRelative(e.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`chip ${actorClass}`}>{e.actor}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="px-3 py-2 text-ink-mute">{e.entity}</td>
                  <td className="px-3 py-2 text-ink-mute font-mono text-[11px] max-w-[320px] truncate" title={detail}>
                    {detail || "—"}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-ink-mute">
                  Todavía no hay acciones registradas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
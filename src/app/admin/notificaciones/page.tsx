import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Historial de notificaciones",
  robots: { index: false, follow: false },
};

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: "Email",
  TELEGRAM: "Telegram",
  DISCORD: "Discord",
  WEBHOOK: "Webhook",
};

const STATUS_STYLE: Record<string, string> = {
  SENT: "bg-ok-soft text-ok",
  FAILED: "bg-alert-soft text-alert",
  PENDING: "bg-warn-soft text-warn",
  SKIPPED: "bg-ink-soft/10 text-ink-mute",
};

export default async function AdminNotificationsPage() {
  await requireAdminPage();

  const [logs, stats] = await Promise.all([
    // Se consulta por separado en lugar de con `include`: NotificationLog no
    // tiene clave foranea hacia Accident (una alerta de fuente caida no tiene
    // noticia asociada), asi que Prisma no puede deducir la relacion.
    prisma.notificationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notificationLog.groupBy({
      by: ["channel", "status"],
      _count: { _all: true },
    }),
  ]);

  const failed = logs.filter((l) => l.status === "FAILED").length;

  // Como NotificationLog no tiene relacion con Accident, los titulares se
  // resuelven aparte en una sola consulta en lugar de uno por fila.
  const accidentIds = [...new Set(logs.map((l) => l.accidentId).filter((id): id is string => Boolean(id)))];
  const accidents = accidentIds.length > 0
    ? await prisma.accident.findMany({
        where: { id: { in: accidentIds } },
        select: { id: true, title: true },
      })
    : [];
  const accidentById = new Map(accidents.map((a) => [a.id, a]));

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/admin" className="hover:text-alert">Panel</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">Notificaciones</span>
      </nav>

      <header className="mb-6">
        <h1 className="font-serif text-3xl font-bold leading-tight">Notificaciones enviadas</h1>
        <p className="text-sm text-ink-mute mt-1">
          Últimos 100 avisos. El registro permite saber por qué una notificación no llegó.
        </p>
      </header>

      {failed > 0 ? (
        <div className="border-l-4 border-alert bg-alert-soft p-4 mb-6" role="alert">
          <p className="text-sm text-ink-soft">
            <strong className="text-alert">{failed}</strong> de los últimos 100 avisos fallaron. Revisa
            las credenciales del canal en el entorno.
          </p>
        </div>
      ) : null}

      {/* ---------------- Resumen ---------------- */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {(["EMAIL", "TELEGRAM", "DISCORD", "WEBHOOK"] as const).map((channel) => {
          const sent = stats
            .filter((s) => s.channel === channel && s.status === "SENT")
            .reduce((a, s) => a + s._count._all, 0);
          const err = stats
            .filter((s) => s.channel === channel && s.status === "FAILED")
            .reduce((a, s) => a + s._count._all, 0);
          return (
            <div key={channel} className="card p-4">
              <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold">
                {CHANNEL_LABEL[channel]}
              </p>
              <p className="font-serif text-2xl font-bold mt-1">{sent}</p>
              {err > 0 ? <p className="text-[11px] text-alert mt-0.5">{err} fallidos</p> : null}
            </div>
          );
        })}
      </section>

      {/* ---------------- Detalle ---------------- */}
      {/* Titulares de las noticias asociadas, resueltos en una sola consulta. */}
      <section className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-canvas border-b border-rule">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-ink-mute">Cuándo</th>
              <th className="text-left px-3 py-2 font-semibold text-ink-mute">Canal</th>
              <th className="text-left px-3 py-2 font-semibold text-ink-mute">Estado</th>
              <th className="text-left px-3 py-2 font-semibold text-ink-mute">Noticia</th>
              <th className="text-left px-3 py-2 font-semibold text-ink-mute">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 text-ink-mute whitespace-nowrap" title={formatDateTime(l.createdAt)}>
                  {formatRelative(l.createdAt)}
                </td>
                <td className="px-3 py-2 text-ink-soft">{CHANNEL_LABEL[l.channel] ?? l.channel}</td>
                <td className="px-3 py-2">
                  <span className={`chip ${STATUS_STYLE[l.status] ?? ""}`}>{l.status}</span>
                </td>
                <td className="px-3 py-2 text-ink-soft max-w-[240px] truncate">
                  {l.accidentId && accidentById.get(l.accidentId) ? (
                    <Link href={`/admin/${l.accidentId}`} className="hover:text-alert">
                      {accidentById.get(l.accidentId)!.title}
                    </Link>
                  ) : (
                    l.preview ?? "—"
                  )}
                </td>
                <td className="px-3 py-2 text-ink-mute max-w-[220px] truncate" title={l.error ?? l.target ?? ""}>
                  {l.error ?? l.target ?? "—"}
                </td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-ink-mute">
                  Todavía no se ha enviado ninguna notificación.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
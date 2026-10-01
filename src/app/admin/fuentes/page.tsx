import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatRelative } from "@/lib/format";
import { RunCycleButton } from "@/components/admin/RunCycleButton";
import { notifyConfig, monitorConfig } from "@/lib/env";
import { FUENTES_CANDIDATAS } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fuentes de noticias",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  OK: "Operativa",
  DEGRADED: "Inestable",
  FAILING: "Caída",
  DISABLED: "Desactivada",
};

const STATUS_STYLE: Record<string, string> = {
  OK: "bg-ok-soft text-ok",
  DEGRADED: "bg-warn-soft text-warn",
  FAILING: "bg-alert-soft text-alert",
  DISABLED: "bg-ink-soft/10 text-ink-mute",
};

export default async function AdminSourcesPage() {
  await requireAdminPage();

  const [feeds, recentRuns] = await Promise.all([
    prisma.feedSource.findMany({
      orderBy: [{ enabled: "desc" }, { status: "asc" }, { name: "asc" }],
      include: { _count: { select: { seen: true } } },
    }),
    prisma.scrapeRun.findMany({
      where: { feedSourceId: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 25,
      include: { feedSource: { select: { name: true } } },
    }),
  ]);

  const cycles = await prisma.scrapeRun.findMany({
    where: { feedSourceId: null },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  const channels = [
    { name: "Email", on: notifyConfig.email.enabled, detail: notifyConfig.email.to() ?? "ADMIN_EMAIL sin definir" },
    { name: "Telegram", on: notifyConfig.telegram.enabled, detail: notifyConfig.telegram.enabled ? `chat ${notifyConfig.telegram.chatId()}` : "sin configurar" },
    { name: "Discord", on: notifyConfig.discord.enabled, detail: notifyConfig.discord.enabled ? "webhook definido" : "sin configurar" },
    { name: "Webhook", on: notifyConfig.webhook.enabled, detail: notifyConfig.webhook.enabled ? "URL definida" : "sin configurar" },
  ];

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/admin" className="hover:text-alert">Panel</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">Fuentes</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-3xl font-bold leading-tight">Fuentes y monitorización</h1>
          <p className="text-sm text-ink-mute mt-1">
            Estado de cada medio, historial de lecturas y canales de aviso.
          </p>
        </div>
        <RunCycleButton />
      </header>

      {/* ---------------- Cron ---------------- */}
      <section className="card p-5 mb-6">
        <h2 className="font-serif text-lg font-bold mb-3">Cómo se programa el ciclo</h2>
        <div className="text-sm text-ink-soft space-y-2">
          <p>
            El sistema <strong>no</strong> se programa solo. Un cron externo llama a{" "}
            <code className="text-xs bg-ink-soft/10 px-1.5 py-0.5 rounded">
              GET /api/cron/monitor
            </code>{" "}
            cada minuto, con la cabecera{" "}
            <code className="text-xs bg-ink-soft/10 px-1.5 py-0.5 rounded">
              Authorization: Bearer &lt;CRON_SECRET&gt;
            </code>
            .
          </p>
          <p className="text-xs text-ink-mute">
            Motivo: las instancias gratuitas de Render se duermen tras 15 minutos sin tráfico, y el
            cron nativo de Render solo existe en planes de pago. Un cron externo funciona en los dos
            casos. Si{" "}
            <code className="text-xs">CRON_SECRET</code> no está definido, el endpoint devuelve 503 y
            no hace nada.
          </p>
          {monitorConfig.cronSecret() ? (
            <p className="text-xs text-ok">CRON_SECRET configurado: el endpoint está activo.</p>
          ) : (
            <p className="text-xs text-alert">
              CRON_SECRET sin definir: el endpoint de monitorización está desactivado.
            </p>
          )}
        </div>
      </section>

      {/* ---------------- Canales ---------------- */}
      <section className="card p-5 mb-6">
        <h2 className="font-serif text-lg font-bold mb-3">Canales de notificación</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {channels.map((c) => (
            <div key={c.name} className="border border-rule rounded-sm p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-ink">{c.name}</span>
                <span className={`chip ${c.on ? "bg-ok-soft text-ok" : "bg-ink-soft/10 text-ink-mute"}`}>
                  {c.on ? "Activo" : "Inactivo"}
                </span>
              </div>
              <p className="text-[11px] text-ink-mute break-all">{c.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Fuentes ---------------- */}
      <section className="mb-6">
        <h2 className="font-serif text-lg font-bold mb-3">Fuentes configuradas</h2>
        <div className="card overflow-hidden">
          <ul className="divide-y divide-rule">
            {feeds.map((f) => (
              <li key={f.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className={`chip ${STATUS_STYLE[f.status] ?? ""}`}>
                        {STATUS_LABEL[f.status] ?? f.status}
                      </span>
                      <span className="chip bg-ink-soft/10 text-ink-mute">{f.region}</span>
                      <span className="chip bg-ink-soft/10 text-ink-mute">
                        fiabilidad {Math.round(f.baseScore * 100)} %
                      </span>
                      {!f.enabled ? (
                        <span className="chip bg-ink-soft/10 text-ink-mute">desactivada</span>
                      ) : null}
                    </div>

                    <h3 className="font-bold text-sm text-ink">{f.name}</h3>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-alert hover:underline break-all"
                    >
                      {f.url}
                    </a>

                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2.5 text-xs">
                      <div>
                        <dt className="text-ink-mute">Última lectura OK</dt>
                        <dd className="text-ink-soft">
                          {f.lastOkAt ? formatRelative(f.lastOkAt) : "nunca"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink-mute">Fallos seguidos</dt>
                        <dd className={f.consecutiveFailures > 0 ? "text-alert" : "text-ink-soft"}>
                          {f.consecutiveFailures}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-ink-mute">Latencia</dt>
                        <dd className="text-ink-soft">{f.latencyMs} ms</dd>
                      </div>
                      <div>
                        <dt className="text-ink-mute">Items medios</dt>
                        <dd className="text-ink-soft">{Math.round(f.avgItemsFound)}</dd>
                      </div>
                    </dl>

                    {f.lastError ? (
                      <p className="text-xs text-alert bg-alert-soft border border-alert/20 rounded-sm px-2.5 py-1.5 mt-2">
                        {f.lastError}
                      </p>
                    ) : null}

                    {f.notes ? (
                      <p className="text-xs text-ink-mute mt-2 italic">{f.notes}</p>
                    ) : null}
                  </div>

                  <div className="text-right shrink-0 text-xs text-ink-mute">
                    <p className="font-semibold text-ink">{f._count.seen}</p>
                    <p>URLs vistas</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- Candidatas ---------------- */}
      <section className="card p-5 mb-6">
        <h2 className="font-serif text-lg font-bold mb-1">Fuentes por verificar</h2>
        <p className="text-xs text-ink-mute mb-4">
          Estas URLs no están activas. Se listan porque la cobertura actual depende de una sola fuente
          operativa: con una fuente, la detección de duplicados nunca llega a probarse de verdad. Para
          añadir una, se comprueba primero con <code>npm run monitor:once</code> y, si devuelve XML con
          items, se registra en <code>src/lib/feeds.ts</code>.
        </p>
        <ul className="space-y-3">
          {FUENTES_CANDIDATAS.map((c) => (
            <li key={c.name}>
              <p className="text-sm font-semibold text-ink">{c.name}</p>
              <ul className="mt-1 space-y-0.5">
                {c.candidates.map((u) => (
                  <li key={u} className="text-xs">
                    <code className="text-ink-mute">{u}</code>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-mute mt-4 pt-3 border-t border-rule">
          Criterio al añadir una fuente: la respuesta debe ser <code>text/xml</code> o{" "}
          <code>application/rss+xml</code>, con al menos 5 items y fechas recientes. Un{" "}
          <code>200 text/html</code> no vale: el sistema lo detectará como error, pero conviene no
          añadirla.
        </p>
      </section>

      {/* ---------------- Historial de ciclos ---------------- */}
      <section className="mb-6">
        <h2 className="font-serif text-lg font-bold mb-3">Últimos ciclos globales</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-canvas border-b border-rule">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-ink-mute">Inicio</th>
                <th className="text-left px-3 py-2 font-semibold text-ink-mute">Estado</th>
                <th className="text-right px-3 py-2 font-semibold text-ink-mute">Duración</th>
                <th className="text-right px-3 py-2 font-semibold text-ink-mute">Leídos</th>
                <th className="text-right px-3 py-2 font-semibold text-ink-mute">Nuevos</th>
                <th className="text-right px-3 py-2 font-semibold text-ink-mute">Duplicados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {cycles.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 text-ink-soft whitespace-nowrap">
                    {formatDateTime(c.startedAt)}
                  </td>
                  <td className="px-3 py-2">
                    {c.ok ? (
                      <span className="text-ok">Correcto</span>
                    ) : (
                      <span className="text-alert" title={c.error ?? undefined}>
                        Error
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-soft">{Math.round(c.durationMs / 1000)} s</td>
                  <td className="px-3 py-2 text-right text-ink-soft">{c.itemsFound}</td>
                  <td className="px-3 py-2 text-right text-ink">{c.itemsNew}</td>
                  <td className="px-3 py-2 text-right text-ink-mute">{c.itemsDuplicate}</td>
                </tr>
              ))}
              {cycles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-ink-mute">
                    Todavía no se ha ejecutado ningún ciclo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Lecturas por fuente ---------------- */}
      <section>
        <h2 className="font-serif text-lg font-bold mb-3">Últimas lecturas por fuente</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-canvas border-b border-rule">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-ink-mute">Fuente</th>
                <th className="text-left px-3 py-2 font-semibold text-ink-mute">Inicio</th>
                <th className="text-left px-3 py-2 font-semibold text-ink-mute">Resultado</th>
                <th className="text-right px-3 py-2 font-semibold text-ink-mute">Items</th>
                <th className="text-right px-3 py-2 font-semibold text-ink-mute">Nuevos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {recentRuns.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-ink-soft">{r.feedSource?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-mute whitespace-nowrap">
                    {formatDateTime(r.startedAt)}
                  </td>
                  <td className="px-3 py-2">
                    {r.ok ? (
                      <span className="text-ok">OK</span>
                    ) : (
                      <span className="text-alert" title={r.error ?? undefined}>
                        {r.error?.slice(0, 60) ?? "Error"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-soft">{r.itemsFound}</td>
                  <td className="px-3 py-2 text-right text-ink">{r.itemsNew}</td>
                </tr>
              ))}
              {recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-mute">
                    Todavía no se ha leído ninguna fuente.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import { countByStatus, listForAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { STATUS_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { localDayKey } from "@/lib/dates";
import { formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel de administración",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  await requireAdminPage();

  // --- Contadores editoriales ---
  const [counts, pendingList, featured] = await Promise.all([
    countByStatus(),
    listForAdmin({ status: "PENDING_REVIEW", take: 8 }),
    prisma.accident.findFirst({
      where: { isFeatured: true },
      select: { title: true, slug: true },
    }),
  ]);

  const totalNews = Object.values(counts).reduce((a, b) => a + b, 0);

  // --- Salud de fuentes ---
  const feeds = await prisma.feedSource.findMany({
    select: {
      name: true, status: true, enabled: true, lastOkAt: true,
      consecutiveFailures: true, lastError: true, avgItemsFound: true, successCount: true,
    },
    orderBy: { status: "asc" },
  });

  const failingFeeds = feeds.filter((f) => f.status === "FAILING" || f.status === "DEGRADED");

  // --- Ultimo ciclo ---
  const lastCycle = await prisma.scrapeRun.findFirst({
    where: { feedSourceId: null },
    orderBy: { startedAt: "desc" },
    select: {
      startedAt: true, ok: true, durationMs: true,
      itemsFound: true, itemsNew: true, itemsDuplicate: true, error: true,
    },
  });

  // --- Metricas de las ultimas 24 h ---
  const since24h = new Date(Date.now() - 24 * 3_600_000);
  const since7d = new Date(Date.now() - 7 * 86_400_000);

  const [detected24h, published24h, runs24h, avgDuration] = await Promise.all([
    prisma.accident.count({ where: { detectedAt: { gte: since24h } } }),
    prisma.accident.count({ where: { publishedAt: { gte: since24h } } }),
    prisma.scrapeRun.findMany({
      where: { startedAt: { gte: since24h }, feedSourceId: null },
      select: { durationMs: true, finishedAt: true, startedAt: true },
      orderBy: { startedAt: "desc" },
    }),
    prisma.scrapeRun.aggregate({
      where: { startedAt: { gte: since7d }, feedSourceId: null, finishedAt: { not: null } },
      _avg: { durationMs: true },
    }),
  ]);

  // Tiempo medio de procesamiento por noticia: desde que se detecto hasta que
  // se aprobo. Solo cuenta las ya publicadas.
  const approvedWithBothTimes = await prisma.accident.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { not: null },
      detectedAt: { gte: since7d },
    },
    select: { detectedAt: true, publishedAt: true },
    take: 200,
  });

  const approvalTimes = approvedWithBothTimes
    .filter((a) => a.publishedAt && a.detectedAt)
    .map((a) => (a.publishedAt!.getTime() - a.detectedAt!.getTime()) / 3_600_000)
    .filter((h) => h >= 0);

  const avgApprovalHours =
    approvalTimes.length > 0
      ? approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length
      : null;

  // --- Estado de verificacion de los pendientes ---
  const pendingVerification = await prisma.accident.groupBy({
    by: ["verificationStatus"],
    where: { status: "PENDING_REVIEW" },
    _count: { _all: true },
  });

  const verificationCounts = pendingVerification.reduce<Record<string, number>>((acc, r) => {
    acc[r.verificationStatus] = r._count._all;
    return acc;
  }, {});

  return (
    <div className="container-page py-8">
      {/* ---------------- Cabecera ---------------- */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-alert mb-2">
            Panel editorial
          </p>
          <h1 className="font-serif text-3xl md:text-4xl font-bold leading-tight">
            Noticias de tráfico
          </h1>
        </div>
        <nav className="flex flex-wrap gap-2">
          <Link href="/admin/noticias" className="btn btn-ghost">Todas las noticias</Link>
          <Link href="/admin/fuentes" className="btn btn-ghost">Fuentes</Link>
          <Link href="/admin/notificaciones" className="btn btn-ghost">Notificaciones</Link>
          <Link href="/admin/auditoria" className="btn btn-ghost">Auditoría</Link>
          <Link href="/admin/nuevo" className="btn btn-primary">+ Nueva noticia</Link>
        </nav>
      </header>

      {/* ---------------- Aviso de fuente caida ---------------- */}
      {failingFeeds.length > 0 ? (
        <div className="border-l-4 border-alert bg-alert-soft p-4 mb-8" role="alert">
          <h2 className="text-sm font-bold text-alert mb-2">
            {failingFeeds.length === 1 ? "Una fuente está fallando" : `${failingFeeds.length} fuentes están fallando`}
          </h2>
          <ul className="space-y-1 text-sm text-ink-soft">
            {failingFeeds.map((f) => (
              <li key={f.name}>
                <strong className="text-ink">{f.name}</strong> — {f.consecutiveFailures} fallo(s) seguidos.
                {f.lastError ? <> {f.lastError}</> : null}
              </li>
            ))}
          </ul>
          <Link href="/admin/fuentes" className="text-xs text-alert underline mt-2 inline-block">
            Ver detalle de las fuentes →
          </Link>
        </div>
      ) : null}

      {/* ---------------- Tarjetas de estado ---------------- */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8" aria-label="Estado editorial">
        {(
          [
            { status: "PENDING_REVIEW", label: STATUS_LABEL.PENDING_REVIEW, to: "/admin?estado=PENDING_REVIEW", alert: counts.PENDING_REVIEW > 0 },
            { status: "PUBLISHED", label: STATUS_LABEL.PUBLISHED, to: "/admin?estado=PUBLISHED", alert: false },
            { status: "REJECTED", label: STATUS_LABEL.REJECTED, to: "/admin?estado=REJECTED", alert: false },
            { status: "ARCHIVED", label: STATUS_LABEL.ARCHIVED, to: "/admin?estado=ARCHIVED", alert: false },
          ] as const
        ).map((card) => (
          <Link key={card.status} href={card.to} className="card p-4 transition-colors hover:border-alert">
            <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold">
              {card.label}
            </p>
            <p className="font-serif text-3xl font-bold mt-1">{counts[card.status] ?? 0}</p>
            {card.alert && counts.PENDING_REVIEW > 0 ? (
              <p className="text-[11px] text-warn mt-1">Requieren tu revisión</p>
            ) : null}
          </Link>
        ))}
      </section>

      {/* ---------------- Métricas ---------------- */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8" aria-label="Actividad">
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold">
            Detectadas (24 h)
          </p>
          <p className="font-serif text-2xl font-bold mt-1">{detected24h}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold">
            Publicadas (24 h)
          </p>
          <p className="font-serif text-2xl font-bold mt-1">{published24h}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold">
            Ciclos (24 h)
          </p>
          <p className="font-serif text-2xl font-bold mt-1">{runs24h.length}</p>
          {avgDuration._avg.durationMs ? (
            <p className="text-[11px] text-ink-mute mt-1">
              Media {Math.round(avgDuration._avg.durationMs / 1000)} s
            </p>
          ) : null}
        </div>
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold">
            Aprobación media
          </p>
          <p className="font-serif text-2xl font-bold mt-1">
            {avgApprovalHours === null
              ? "—"
              : avgApprovalHours < 24
                ? `${Math.round(avgApprovalHours)} h`
                : `${Math.round(avgApprovalHours / 24)} d`}
          </p>
          {avgApprovalHours === null ? (
            <p className="text-[11px] text-ink-mute mt-1">Sin datos todavía</p>
          ) : (
            <p className="text-[11px] text-ink-mute mt-1">De detección a publicación</p>
          )}
        </div>
      </section>

      {/* ---------------- Estado del scraping ---------------- */}
      <section className="card p-5 mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <h2 className="font-serif text-lg font-bold">Monitorización</h2>
          <Link href="/admin/fuentes" className="text-xs text-alert hover:underline">
            Gestionar fuentes →
          </Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold mb-1">
              Último ciclo
            </p>
            {lastCycle ? (
              <>
                <p className={lastCycle.ok ? "text-ok font-semibold" : "text-alert font-semibold"}>
                  {lastCycle.ok ? "Correcto" : "Con errores"}
                </p>
                <p className="text-xs text-ink-mute mt-0.5">
                  {formatRelative(lastCycle.startedAt)} · {Math.round(lastCycle.durationMs / 1000)} s
                </p>
              </>
            ) : (
              <p className="text-warn font-semibold">Nunca ejecutado</p>
            )}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold mb-1">
              Resultado
            </p>
            {lastCycle ? (
              <p className="text-xs text-ink-soft">
                {lastCycle.itemsFound} leídos ·{" "}
                <strong className="text-ink">{lastCycle.itemsNew}</strong> nuevos ·{" "}
                {lastCycle.itemsDuplicate} duplicados
              </p>
            ) : (
              <p className="text-xs text-ink-mute">—</p>
            )}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold mb-1">
              Fuentes activas
            </p>
            <p className="text-sm">
              <strong className="font-serif text-xl">{feeds.filter((f) => f.enabled).length}</strong>
              <span className="text-ink-mute text-xs"> de {feeds.length}</span>
            </p>
          </div>
        </div>

        {lastCycle?.error ? (
          <p className="text-xs text-alert bg-alert-soft border border-alert/20 rounded-sm px-3 py-2 mt-4">
            {lastCycle.error}
          </p>
        ) : null}
      </section>

      {/* ---------------- Verificación de pendientes ---------------- */}
      {counts.PENDING_REVIEW > 0 ? (
        <section className="card p-5 mb-8">
          <h2 className="font-serif text-lg font-bold mb-1">Verificación de pendientes</h2>
          <p className="text-xs text-ink-mute mb-4">
            Clasificación automática. Ninguna se publica por estar verificada.
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "VERIFIED", label: "Verificadas", color: "bg-ok-soft text-ok" },
                { key: "PENDING_REVIEW", label: "Sin decidir", color: "bg-warn-soft text-warn" },
                { key: "SUSPICIOUS", label: "Sospechosas", color: "bg-alert-soft text-alert" },
                { key: "REJECTED", label: "Descartadas", color: "bg-ink-soft/10 text-ink-mute" },
              ] as const
            ).map((v) => (
              <span key={v.key} className={`chip ${v.color}`}>
                {v.label}: {verificationCounts[v.key] ?? 0}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------------- Pendientes ---------------- */}
      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-serif text-lg font-bold">
            Pendientes de revisión
            {counts.PENDING_REVIEW > 0 ? (
              <span className="ml-2 text-ink-mute font-normal text-sm">({counts.PENDING_REVIEW})</span>
            ) : null}
          </h2>
          {counts.PENDING_REVIEW > 8 ? (
            <Link href="/admin/noticias?estado=PENDING_REVIEW" className="text-xs text-alert hover:underline">
              Ver todas →
            </Link>
          ) : null}
        </div>

        {pendingList.items.length > 0 ? (
          <ul className="card divide-y divide-rule overflow-hidden">
            {pendingList.items.map((item) => (
              <li key={item.id} className="p-4 hover:bg-canvas transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span
                        className={`chip ${
                          item.verificationStatus === "VERIFIED"
                            ? "bg-ok-soft text-ok"
                            : item.verificationStatus === "SUSPICIOUS"
                              ? "bg-alert-soft text-alert"
                              : "bg-warn-soft text-warn"
                        }`}
                      >
                        {item.verificationStatus}
                      </span>
                      <span className="chip bg-ink-soft/10 text-ink-soft">
                        confianza {Math.round(item.confidenceScore * 100)} %
                      </span>
                      <span className="chip bg-ink-soft/10 text-ink-mute">
                        {item.municipality.name}
                      </span>
                      {item.road ? (
                        <span className="chip bg-ink-soft/10 text-ink-mute">{item.road}</span>
                      ) : null}
                    </div>

                    <h3 className="font-serif text-base font-bold leading-snug mb-1">
                      <Link href={`/admin/${item.id}`} className="hover:text-alert transition-colors">
                        {item.title}
                      </Link>
                    </h3>

                    <p className="text-xs text-ink-mute">
                      Detectada {formatRelative(item.createdAt)} ·{" "}
                      {localDayKey(item.occurredAt)} ·{" "}
                      {item._count.sources} {item._count.sources === 1 ? "fuente" : "fuentes"}
                    </p>
                  </div>

                  <Link href={`/admin/${item.id}`} className="btn btn-primary shrink-0">
                    Revisar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card p-8 text-center">
            <p className="text-sm text-ink-soft font-semibold mb-1">
              No hay noticias pendientes
            </p>
            <p className="text-xs text-ink-mute">
              Cuando el sistema detecte una noticia nueva aparecerá aquí.
            </p>
          </div>
        )}
      </section>

      {/* ---------------- Pie ---------------- */}
      <footer className="card p-5 text-xs text-ink-mute">
        <p>
          <strong className="text-ink-soft">{totalNews}</strong> noticia(s) en total ·{" "}
          {counts.PUBLISHED} publicada(s)
          {featured ? (
            <>
              {" "}· Destacada:{" "}
              <Link href={`/accidentes/${featured.slug}`} className="text-alert hover:underline">
                {featured.title}
              </Link>
            </>
          ) : null}
        </p>
        <p className="mt-2 pt-2 border-t border-rule">
          Última comprobación de salud:{" "}
          <Link href="/api/health" className="text-alert hover:underline">
            /api/health
          </Link>{" "}
          · Último ciclo: {lastCycle ? formatDateTime(lastCycle.startedAt) : "nunca"}
        </p>
      </footer>
    </div>
  );
}
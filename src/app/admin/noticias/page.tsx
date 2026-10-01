import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import { countByStatus, listForAdmin } from "@/lib/admin";
import { STATUS_LABEL, ORIGIN_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { Pagination } from "@/components/Pagination";
import { logoutAction } from "@/app/admin/actions";
import type { AccidentStatus, Origin } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Noticias",
  robots: { index: false, follow: false },
};

const STATUSES: AccidentStatus[] = ["PENDING_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED"];

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminListPage({ searchParams }: Props) {
  await requireAdminPage();

  const sp = await searchParams;
  const statusParam = one(sp.estado);
  const originParam = one(sp.origen);
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(one(sp.page) ?? "1") || 1);
  const take = 20;

  const status = STATUSES.includes(statusParam as AccidentStatus)
    ? (statusParam as AccidentStatus)
    : undefined;
  const origin = originParam === "MANUAL" || originParam === "AI" ? (originParam as Origin) : undefined;

  const [counts, { items, total }] = await Promise.all([
    countByStatus(),
    listForAdmin({ status, origin, q: q || undefined, take, skip: (page - 1) * take }),
  ]);

  const filterHref = (params: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { estado: status, origen: origin, q: q || undefined, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const qs = next.toString();
    return qs ? `/admin/noticias?${qs}` : "/admin/noticias";
  };

  return (
    <div className="container-page py-6">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/admin" className="hover:text-alert">Panel</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">Noticias</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-3xl font-bold leading-tight">Todas las noticias</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/nuevo" className="btn btn-primary">+ Nueva noticia</Link>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost">Salir</button>
          </form>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Link href="/admin/noticias" className={`card p-4 transition-colors ${!status ? "border-alert" : "hover:border-alert"}`}>
          <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold">Todas</p>
          <p className="font-serif text-2xl font-bold">
            {Object.values(counts).reduce((a, b) => a + b, 0)}
          </p>
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={filterHref({ estado: s })}
            className={`card p-4 transition-colors ${status === s ? "border-alert" : "hover:border-alert"}`}
          >
            <p className="text-[11px] uppercase tracking-wide text-ink-mute font-semibold">
              {STATUS_LABEL[s]}
            </p>
            <p className="font-serif text-2xl font-bold">{counts[s] ?? 0}</p>
          </Link>
        ))}
      </div>

      <form method="get" action="/admin/noticias" className="card p-4 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="label" htmlFor="q">Buscar por titular</label>
          <input id="q" name="q" type="search" className="field" defaultValue={q} placeholder="Palabra clave…" />
        </div>
        <div>
          <label className="label" htmlFor="estado">Estado</label>
          <select id="estado" name="estado" className="field" defaultValue={status ?? ""}>
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="origen">Origen</label>
          <select id="origen" name="origen" className="field" defaultValue={origin ?? ""}>
            <option value="">Todos</option>
            <option value="MANUAL">{ORIGIN_LABEL.MANUAL}</option>
            <option value="AI">{ORIGIN_LABEL.AI}</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">Filtrar</button>
        <Link href="/admin/noticias" className="btn btn-ghost">Limpiar</Link>
      </form>

      {items.length > 0 ? (
        <>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-rule">
              {items.map((a) => (
                <li key={a.id} className="p-4 hover:bg-canvas transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span
                          className={`chip ${
                            a.status === "PUBLISHED"
                              ? "bg-ok-soft text-ok"
                              : a.status === "PENDING_REVIEW"
                                ? "bg-warn-soft text-warn"
                                : "bg-ink-soft/10 text-ink-mute"
                          }`}
                        >
                          {STATUS_LABEL[a.status]}
                        </span>
                        {a.origin === "AI" ? (
                          <span className="chip bg-[#ede9fe] text-[#5b21b6]">{ORIGIN_LABEL.AI}</span>
                        ) : null}
                        {a.isFeatured ? <span className="chip bg-alert text-white">Destacada</span> : null}
                        <span className="chip bg-ink-soft/10 text-ink-soft">{a.municipality.name}</span>
                        {a.verificationStatus !== "PENDING_REVIEW" ? (
                          <span className="chip bg-ink-soft/10 text-ink-mute">{a.verificationStatus}</span>
                        ) : null}
                        <span className="chip bg-ink-soft/10 text-ink-mute">
                          {Math.round(a.confidenceScore * 100)} %
                        </span>
                      </div>

                      <h2 className="font-serif text-base font-bold leading-snug mb-1">
                        <Link href={`/admin/${a.id}`} className="hover:text-alert transition-colors">
                          {a.title}
                        </Link>
                      </h2>

                      <p className="text-xs text-ink-mute">
                        {formatDateTime(a.occurredAt)} · {a._count.sources}{" "}
                        {a._count.sources === 1 ? "fuente" : "fuentes"} ·{" "}
                        {a._count.revisions} {a._count.revisions === 1 ? "cambio" : "cambios"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {a.status === "PUBLISHED" ? (
                        <Link href={`/accidentes/${a.slug}`} className="text-xs text-ink-mute hover:text-alert" target="_blank">
                          Ver ↗
                        </Link>
                      ) : null}
                      <Link href={`/admin/${a.id}`} className="btn btn-ghost">
                        {a.status === "PENDING_REVIEW" ? "Revisar" : "Editar"}
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <Pagination base="/admin/noticias" sp={sp} page={page} total={total} take={take} />
        </>
      ) : (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-soft font-semibold mb-2">No hay noticias con estos filtros</p>
          <Link href="/admin/nuevo" className="btn btn-primary mt-2">Crear la primera noticia</Link>
        </div>
      )}
    </div>
  );
}

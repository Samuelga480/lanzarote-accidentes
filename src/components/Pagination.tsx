import Link from "next/link";
import { pageHref, type RawSearchParams } from "@/lib/filters";

type Props = {
  base: string;
  sp: RawSearchParams;
  page: number;
  total: number;
  take: number;
};

export function Pagination({ base, sp, page, total, take }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / take));
  if (totalPages <= 1) return null;

  const from = (page - 1) * take + 1;
  const to = Math.min(page * take, total);

  // Ventana de 5 páginas alrededor de la actual.
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  const linkCls =
    "px-3 py-2 text-sm font-semibold border border-rule rounded-sm transition-colors";
  const idleCls = `${linkCls} text-ink-soft hover:border-ink hover:text-ink`;
  const activeCls = `${linkCls} bg-alert text-white border-alert`;
  const offCls = `${linkCls} text-ink-faint pointer-events-none opacity-50`;

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-8 pt-6 border-t border-rule"
    >
      <p className="text-xs text-ink-mute">
        Mostrando <span className="font-semibold text-ink-soft">{from}</span>–
        <span className="font-semibold text-ink-soft">{to}</span> de{" "}
        <span className="font-semibold text-ink-soft">{total}</span>
      </p>

      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={pageHref(base, sp, page - 1)} className={idleCls} rel="prev">
            ← Anterior
          </Link>
        ) : (
          <span className={offCls} aria-disabled="true">
            ← Anterior
          </span>
        )}

        {pages.map((p) =>
          p === page ? (
            <span key={p} className={activeCls} aria-current="page">
              {p}
            </span>
          ) : (
            <Link key={p} href={pageHref(base, sp, p)} className={idleCls}>
              {p}
            </Link>
          ),
        )}

        {page < totalPages ? (
          <Link href={pageHref(base, sp, page + 1)} className={idleCls} rel="next">
            Siguiente →
          </Link>
        ) : (
          <span className={offCls} aria-disabled="true">
            Siguiente →
          </span>
        )}
      </div>
    </nav>
  );
}

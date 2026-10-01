import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getForAdmin } from "@/lib/admin";
import type { Prisma } from "@prisma/client";
import { requireAdminPage } from "@/lib/admin-guard";
import { AccidentForm } from "@/components/admin/AccidentForm";
import { formatDateTime, toInputDateTime } from "@/lib/format";
import { ORIGIN_LABEL, STATUS_LABEL } from "@/lib/constants";
import { StatusBadge } from "@/components/Badges";
import { isAccidentStatus, parseSnapshot } from "@/lib/types";
import {
  approveAiDraftAction,
  deleteAccidentAction,
  setStatusAction,
  toggleFeaturedAction,
  updateAccidentAction,
} from "@/app/admin/actions";
import { findSimilar } from "@/lib/dedupe";
import { prisma } from "@/lib/prisma";

/**
 * Candidatos a duplicado de esta noticia, para que el editor decida si fusiona.
 * El sistema ya los ha detectado; esto solo los muestra.
 */
async function getDuplicateSuggestions(id: string) {
  const similar = await findSimilar(id);
  if (similar.length === 0) return [];

  const rows = await prisma.accident.findMany({
    where: { id: { in: similar.map((s) => s.id) } },
    select: { id: true, title: true, status: true, _count: { select: { sources: true } } },
  });

  const byId = new Map(rows.map((r) => [r.id, r]));
  return similar
    .map((s) => ({ ...s, row: byId.get(s.id) }))
    .filter((s): s is typeof s & { row: NonNullable<typeof s.row> } => s.row !== undefined);
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Revisar noticia",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminAccidentPage({ params, searchParams }: Props) {
  await requireAdminPage();

  const { id } = await params;
  const sp = await searchParams;

  const accident = await getForAdmin(id);
  if (!accident) notFound();

  const duplicates = await getDuplicateSuggestions(id);

  const isAi = accident.origin === "AI";
  const isPublished = accident.status === "PUBLISHED";

  return (
    <div className="container-page py-6 max-w-4xl">
      <nav aria-label="Miga de pan" className="text-xs text-ink-mute mb-4">
        <Link href="/admin" className="hover:text-alert">Panel</Link>
        <span aria-hidden="true" className="mx-1.5">/</span>
        <span className="text-ink-soft">Revisar noticia</span>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusBadge status={accident.status} />
          {isAi ? (
            <span className="chip bg-[#ede9fe] text-[#5b21b6]">{ORIGIN_LABEL.AI}</span>
          ) : (
            <span className="chip bg-ink-soft/10 text-ink-soft">{ORIGIN_LABEL.MANUAL}</span>
          )}
          {accident.isFeatured ? <span className="chip bg-alert text-white">Destacada</span> : null}
        </div>
        <h1 className="font-serif text-2xl md:text-3xl font-bold leading-tight">{accident.title}</h1>
        <p className="text-xs text-ink-mute mt-2">
          Creada el {formatDateTime(accident.createdAt)} ·{" "}
          <code className="text-ink-soft">/accidentes/{accident.slug}</code>
          {accident.publishedAt ? (
            <>
              {" "}· Publicada el {formatDateTime(accident.publishedAt)}
              {accident.reviewedBy ? ` por ${accident.reviewedBy}` : ""}
            </>
          ) : null}
        </p>
      </header>

      {one(sp.creado) ? (
        <p className="text-sm text-ok bg-ok-soft border border-ok/30 rounded-sm px-3 py-2 mb-5">
          Noticia creada. Revísala antes de publicarla.
        </p>
      ) : null}

      {one(sp.error) === "confirmacion" ? (
        <p className="text-sm text-alert bg-alert-soft border border-alert/30 rounded-sm px-3 py-2 mb-5">
          Para publicar un borrador generado por IA debes marcar la casilla de confirmación de que has
          verificado las fuentes.
        </p>
      ) : null}

      {/* ------------------- Aviso de borrador de IA ------------------- */}
      {isAi && !isPublished ? (
        <section className="border-l-4 border-[#5b21b6] bg-[#f5f3ff] p-4 mb-6">
          <h2 className="text-sm font-bold text-[#5b21b6] mb-1.5">Borrador generado automáticamente</h2>
          <p className="text-xs text-ink-soft leading-relaxed">
            Esta noticia la redactó una IA a partir de las fuentes que se listan abajo. El sistema la creó
            directamente en estado «pendiente de revisión» y <strong>no puede publicarse sola</strong>. Antes
            de aprobarla, contrasta los datos con las fuentes oficiales y corrige el texto si hace falta.
          </p>
        </section>
      ) : null}

      {/* ------------------- Aviso de privacidad aplicada ------------------- */}
      {accident.reviewNotes && accident.reviewNotes.includes("Datos personales eliminados") ? (
        <p className="text-xs text-warn bg-warn-soft border border-warn/30 rounded-sm px-3 py-2 mb-6">
          Se detectaron y eliminaron datos personales de este texto al guardarlo. Revisa que el resultado sea
          correcto.
        </p>
      ) : null}

      {/* ------------------- Verificacion automatica ------------------- */}
      {accident.verificationStatus !== "PENDING_REVIEW" ? (
        <section className="card p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft">
              Verificación automática
            </h2>
            <div className="flex flex-wrap gap-1.5">
              <span
                className={`chip ${
                  accident.verificationStatus === "VERIFIED"
                    ? "bg-ok-soft text-ok"
                    : accident.verificationStatus === "SUSPICIOUS"
                      ? "bg-alert-soft text-alert"
                      : "bg-warn-soft text-warn"
                }`}
              >
                {accident.verificationStatus}
              </span>
              <span className="chip bg-ink-soft/10 text-ink-soft">
                confianza {Math.round(accident.confidenceScore * 100)} %
              </span>
              <span className="chip bg-ink-soft/10 text-ink-soft">
                fuente {Math.round(accident.sourceScore * 100)} %
              </span>
            </div>
          </div>

          <p className="text-xs text-ink-mute mb-3">
            La verificación automática filtra, no publica. Aunque diga <code>VERIFIED</code>, la
            noticia sigue necesitando tu aprobación.
          </p>

          {accident.verificationNotes ? (
            <ul className="text-xs text-ink-soft space-y-1">
              {accident.verificationNotes.split(". ").filter(Boolean).map((note, i) => (
                <li key={i} className="border-l-2 border-rule pl-2">
                  {note.trim()}.
                </li>
              ))}
            </ul>
          ) : null}

          {accident.road ? (
            <p className="text-xs text-ink-mute mt-3">
              Carretera detectada: <strong className="text-ink">{accident.road}</strong>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ------------------- Texto original vs reescrito ------------------- */}
      {accident.originalBody && accident.originalBody !== accident.body ? (
        <details className="card p-4 mb-6">
          <summary className="text-sm font-bold uppercase tracking-wider text-ink-soft cursor-pointer">
            Comparar original y reescritura
          </summary>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-mute mb-1.5">
                Texto original de {accident.sources[0]?.outlet ?? "la fuente"}
              </p>
              <p className="text-xs text-ink-soft mb-3 break-all">
                <a
                  href={accident.originalUrl ?? accident.sources[0]?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-alert hover:underline"
                >
                  {accident.originalUrl ?? accident.sources[0]?.url} ↗
                </a>
              </p>
              <div className="text-xs text-ink-soft bg-canvas border border-rule rounded-sm p-3 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                {accident.originalTitle ? (
                  <p className="font-bold mb-2 text-ink">{accident.originalTitle}</p>
                ) : null}
                {accident.originalBody}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#5b21b6] mb-1.5">
                Versión reescrita por IA
              </p>
              <p className="text-xs text-ink-soft mb-3">
                {accident.aiModel ? (
                  <>
                    Modelo: <code className="text-ink-mute">{accident.aiModel}</code>
                    {accident.rewrittenAt ? ` · ${formatDateTime(accident.rewrittenAt)}` : ""}
                  </>
                ) : (
                  "Sin modelo registrado"
                )}
              </p>
              <div className="text-xs text-ink-soft bg-[#f5f3ff] border border-[#ddd6fe] rounded-sm p-3 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                <p className="font-bold mb-2 text-ink">{accident.title}</p>
                {accident.body}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-ink-mute mt-3 pt-3 border-t border-rule">
            El texto original se conserva íntegro para que puedas contrastar. La versión publicada es
            siempre la reescrita, editada por ti.
          </p>
        </details>
      ) : null}

      {/* ------------------- Duplicados ------------------- */}
      {(duplicates.length > 0 || accident.duplicates.length > 0) ? (
        <section className="card p-4 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft mb-1">
            Posibles duplicados
          </h2>
          <p className="text-xs text-ink-mute mb-3">
            El sistema ha detectado noticias que cuentan este mismo suceso. Revísalas antes de
            publicar: publicar dos veces el mismo accidente es el error más visible en un medio.
          </p>

          {duplicates.length > 0 ? (
            <ul className="space-y-2 mb-4">
              {duplicates.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-warn pl-3 py-1">
                  <div className="min-w-0">
                    <Link href={`/admin/${d.id}`} className="text-sm font-semibold text-ink hover:text-alert">
                      {d.title}
                    </Link>
                    <p className="text-[11px] text-ink-mute">
                      Similaridad {Math.round(d.similarity * 100)} % · detectado por {d.reason} ·{" "}
                      {d.row?._count.sources ?? 0} fuente(s)
                    </p>
                  </div>
                  <Link href={`/admin/${d.id}`} className="btn btn-ghost shrink-0">Abrir</Link>
                </li>
              ))}
            </ul>
          ) : null}

          {accident.duplicates.length > 0 ? (
            <>
              <p className="text-xs font-semibold text-ink-soft mb-2">
                Ya fusionadas en esta noticia ({accident.duplicates.length}):
              </p>
              <ul className="space-y-1">
                {accident.duplicates.map((d) => (
                  <li key={d.id} className="text-xs text-ink-soft border-l-2 border-ok pl-2 py-1">
                    <Link href={`/admin/${d.id}`} className="hover:text-alert">{d.title}</Link>
                    <span className="text-ink-mute"> ({d.status})</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {/* ------------------- Fuentes ------------------- */}
      <section className="card p-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft mb-1">
          Fuentes registradas ({accident.sources.length})
        </h2>
        {accident.sources.length > 1 ? (
          <p className="text-xs text-ink-mute mb-3">
            Esta noticia procede de {accident.sources.length} medios distintos. El sistema las ha
            fusionado por detectar que contaban el mismo suceso.
          </p>
        ) : (
          <p className="text-xs text-ink-mute mb-3">
            Una sola fuente. Con una única fuente, la detección de duplicados no puede comprobarse.
          </p>
        )}
        {accident.sources.length > 0 ? (
          <ul className="space-y-3">
            {accident.sources.map((s) => (
              <li key={s.id} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-ink">{s.outlet}</span>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-alert hover:underline break-all"
                  >
                    {s.url}
                  </a>
                </div>
                {s.publishedAt ? (
                  <p className="text-[11px] text-ink-mute mt-0.5">
                    Publicado el {formatDateTime(s.publishedAt)}
                  </p>
                ) : null}
                {s.excerpt ? (
                  <p className="text-xs text-ink-soft mt-1 italic border-l-2 border-rule pl-2">{s.excerpt}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-alert">
            Esta noticia no tiene ninguna fuente registrada. Añade al menos una antes de publicarla.
          </p>
        )}
      </section>

      {/* ------------------- Historial ------------------- */}
      {accident.revisions.length > 0 ? (
        <details className="card p-4 mb-6">
          <summary className="text-sm font-bold uppercase tracking-wider text-ink-soft cursor-pointer">
            Historial de cambios ({accident.revisions.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {accident.revisions.map((r) => {
              // La instantanea se guarda como texto JSON; ver parseSnapshot.
              const s = parseSnapshot(r.snapshot);
              return (
                <li key={r.id} className="text-xs border-l-2 border-rule pl-3">
                  <p className="font-semibold text-ink-soft">{r.note ?? "Cambio"}</p>
                  <p className="text-ink-mute">
                    {formatDateTime(r.createdAt)} · {r.editor}
                    {s.status && isAccidentStatus(s.status)
                      ? ` · estado: ${STATUS_LABEL[s.status]}`
                      : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {/* ------------------- Acciones de estado ------------------- */}
      <section className="card p-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft mb-3">
          Acciones editoriales
        </h2>

        {isPublished ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/accidentes/${accident.slug}`} target="_blank" className="btn btn-ghost">
              Ver publicada ↗
            </Link>
            <form action={setStatusAction}>
              <input type="hidden" name="id" value={accident.id} />
              <input type="hidden" name="status" value="ARCHIVED" />
              <input type="hidden" name="note" value="Retirada de la portada por el editor" />
              <button type="submit" className="btn btn-danger">
                Despublicar
              </button>
            </form>
            <form action={toggleFeaturedAction}>
              <input type="hidden" name="id" value={accident.id} />
              <button type="submit" className="btn btn-ghost">
                {accident.isFeatured ? "Quitar de destacada" : "Marcar como destacada"}
              </button>
            </form>
          </div>
        ) : isAi ? (
          <div className="space-y-3">
            <form action={setStatusAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={accident.id} />
              <input type="hidden" name="status" value="REJECTED" />
              <input type="hidden" name="note" value="Descartada durante la revisión" />
              <button type="submit" className="btn btn-danger">
                Descartar
              </button>
            </form>

            <form action={approveAiDraftAction} className="border-t border-rule pt-3">
              <input type="hidden" name="id" value={accident.id} />
              <label className="flex items-start gap-2.5 text-sm mb-3 cursor-pointer">
                <input type="checkbox" name="confirmado" value="si" className="mt-0.5" required />
                <span className="text-ink-soft">
                  He contrastado la información con las fuentes y confirmo que es correcta y publicable.
                </span>
              </label>
              <button type="submit" className="btn btn-ok">
                Aprobar y publicar
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <form action={setStatusAction}>
              <input type="hidden" name="id" value={accident.id} />
              <input type="hidden" name="status" value="PUBLISHED" />
              <input type="hidden" name="note" value="Publicada desde la revisión" />
              <button type="submit" className="btn btn-ok">
                Publicar
              </button>
            </form>
            <form action={setStatusAction}>
              <input type="hidden" name="id" value={accident.id} />
              <input type="hidden" name="status" value="REJECTED" />
              <input type="hidden" name="note" value="Descartada durante la revisión" />
              <button type="submit" className="btn btn-danger">
                Descartar
              </button>
            </form>
            <form action={setStatusAction}>
              <input type="hidden" name="id" value={accident.id} />
              <input type="hidden" name="status" value="PENDING_REVIEW" />
              <button type="submit" className="btn btn-ghost">
                Volver a pendiente
              </button>
            </form>
          </div>
        )}
      </section>

      {/* ------------------- Formulario ------------------- */}
      <h2 className="font-serif text-xl font-bold mb-4">Editar contenido</h2>

      <AccidentForm
        action={updateAccidentAction}
        accidentId={accident.id}
        lockStatus={isAi}
        cancelHref="/admin"
        sources={accident.sources.map((s) => ({
          outlet: s.outlet,
          url: s.url,
          excerpt: s.excerpt ?? "",
        }))}
        defaults={{
          title: accident.title,
          summary: accident.summary,
          body: accident.body,
          municipalitySlug: accident.municipality.slug,
          vehicleType: accident.vehicleType,
          severity: accident.severity,
          occurredAt: toInputDateTime(accident.occurredAt),
          fatalities: accident.fatalities,
          injuries: accident.injuries,
          locationDescription: accident.locationDescription ?? "",
          imageUrl: accident.imageUrl ?? "",
          imageAlt: accident.imageAlt ?? "",
          status: accident.status,
          reviewNotes: accident.reviewNotes ?? "",
        }}
      />

      {/* ------------------- Zona de eliminación ------------------- */}
      <section className="card p-4 mt-8 border-alert/40">
        <h2 className="text-sm font-bold uppercase tracking-wider text-alert mb-2">Zona peligrosa</h2>
        <p className="text-xs text-ink-soft mb-3 leading-relaxed">
          Eliminar la noticia borra también sus fuentes y su historial de revisiones. Esta acción no se puede
          deshacer. Solo se permite si la noticia tiene al menos una fuente registrada.
        </p>
        <form action={deleteAccidentAction}>
          <input type="hidden" name="id" value={accident.id} />
          <button type="submit" className="btn btn-danger">
            Eliminar noticia
          </button>
        </form>
      </section>
    </div>
  );
}

import type { AccidentSeverity, AccidentStatus, Origin, VehicleType } from "@/lib/types";
import {
  CATEGORY_LABEL,
  CATEGORY_PILL,
  ORIGIN_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  VEHICLE_LABEL,
} from "@/lib/constants";

/* --------------------------- Categoría ---------------------------- */

/**
 * Pastilla de tipo de incidente, con los colores del diseño original.
 * Los valores que no estén en el mapa caen en gris en vez de romperse.
 */
export function CategoryBadge({ category, className = "" }: { category: string; className?: string }) {
  const label = CATEGORY_LABEL[category] ?? "Otro";
  const pill = CATEGORY_PILL[category] ?? "neutral";
  return <span className={`news-type ${pill} ${className}`}>{label}</span>;
}

/* ------------------------------ Vehículo ------------------------------ */

const VEHICLE_PILL: Record<VehicleType, string> = {
  COCHE: "neutral",
  MOTO: "moto",
  CAMION: "vuelco",
  BICICLETA: "moto",
  PEATON: "atropello",
  OTROS: "neutral",
};

export function VehicleBadge({ type, className = "" }: { type: VehicleType; className?: string }) {
  return <span className={`news-type ${VEHICLE_PILL[type]} ${className}`}>{VEHICLE_LABEL[type]}</span>;
}

/* ------------------------------ Gravedad ------------------------------ */

const SEVERITY_STYLE: Record<AccidentSeverity, { pill: string; mark: string }> = {
  LEVE: { pill: "moto", mark: "●" },
  MODERADO: { pill: "atropello", mark: "◆" },
  GRAVE: { pill: "colision", mark: "▲" },
};

export function SeverityBadge({
  severity,
  className = "",
}: {
  severity: AccidentSeverity;
  className?: string;
}) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span className={`news-type ${s.pill} ${className}`}>
      <span aria-hidden="true">{s.mark}</span>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/* ------------------------------- Estado ------------------------------- */

const STATUS_STYLE: Record<AccidentStatus, string> = {
  PENDING_REVIEW: "bg-warn-soft text-warn",
  PUBLISHED: "bg-ok-soft text-ok",
  REJECTED: "bg-ink-soft/10 text-ink-mute",
  ARCHIVED: "bg-ink-soft/10 text-ink-mute",
};

export function StatusBadge({ status, className = "" }: { status: AccidentStatus; className?: string }) {
  return <span className={`chip ${STATUS_STYLE[status]} ${className}`}>{STATUS_LABEL[status]}</span>;
}

export function OriginBadge({ origin }: { origin: Origin }) {
  if (origin === "MANUAL") return null;
  return <span className="chip bg-[#ede9fe] text-[#5b21b6]">IA</span>;
}

/* ----------------------------- Datos clave ---------------------------- */

export function MetaRow({
  municipality,
  date,
  time,
}: {
  municipality: string;
  date: string;
  time: string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-mute">
      <span className="font-semibold text-ink-soft">{municipality}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={`${date}`}>{date}</time>
      <span aria-hidden="true">·</span>
      <span>{time} h</span>
    </p>
  );
}

import type { AccidentSeverity, AccidentStatus, Origin, VehicleType } from "@/lib/types";
import {
  ORIGIN_LABEL,
  SEVERITY_LABEL,
  STATUS_LABEL,
  VEHICLE_LABEL,
} from "@/lib/constants";

/* ------------------------------ Vehículo ------------------------------ */

const VEHICLE_STYLE: Record<VehicleType, string> = {
  COCHE: "bg-ink-soft/10 text-ink-soft",
  MOTO: "bg-alert-soft text-alert-dark",
  CAMION: "bg-warn-soft text-warn",
  BICICLETA: "bg-ok-soft text-ok",
  PEATON: "bg-alert-soft text-alert-dark",
  OTROS: "bg-ink-soft/10 text-ink-soft",
};

export function VehicleBadge({ type, className = "" }: { type: VehicleType; className?: string }) {
  return <span className={`chip ${VEHICLE_STYLE[type]} ${className}`}>{VEHICLE_LABEL[type]}</span>;
}

/* ------------------------------ Gravedad ------------------------------ */

const SEVERITY_STYLE: Record<AccidentSeverity, { cls: string; mark: string }> = {
  LEVE: { cls: "bg-ok-soft text-ok", mark: "●" },
  MODERADO: { cls: "bg-warn-soft text-warn", mark: "◆" },
  GRAVE: { cls: "bg-alert text-white", mark: "▲" },
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
    <span className={`chip ${s.cls} ${className}`}>
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

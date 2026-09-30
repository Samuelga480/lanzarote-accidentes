import Link from "next/link";
import type { AccidentWithMunicipality } from "@/lib/queries";
import { AccidentImage } from "@/components/AccidentImage";
import { SeverityBadge, VehicleBadge } from "@/components/Badges";
import { formatDateShort, formatTime } from "@/lib/format";

type Props = {
  accident: AccidentWithMunicipality;
  /** "destacado" | "normal" | "compacto" */
  variant?: "normal" | "compacto";
  priority?: boolean;
};

export function AccidentCard({ accident, variant = "normal" }: Props) {
  const { municipality, occurredAt, severity, vehicleType } = accident;
  const href = `/accidentes/${accident.slug}`;

  if (variant === "compacto") {
    return (
      <article className="card p-3 flex gap-3 hover:border-rule-strong transition-colors">
        <div className="w-24 shrink-0">
          <AccidentImage
            seed={accident.slug}
            alt=""
            ratio="aspect-square"
            className="rounded-sm"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-sm font-bold leading-snug">
            <Link href={href} className="hover:text-alert transition-colors">
              <span className="absolute inset-0" aria-hidden="true" />
              {accident.title}
            </Link>
          </h3>
          <p className="text-[11px] text-ink-mute mt-1">
            {municipality.name} · {formatDateShort(occurredAt)} · {formatTime(occurredAt)} h
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="card overflow-hidden flex flex-col hover:border-rule-strong transition-colors group">
      <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
        <AccidentImage
          seed={accident.slug}
          alt=""
          imageUrl={accident.imageUrl}
          municipality={municipality.name}
          className="border-b border-rule"
        />
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          <VehicleBadge type={vehicleType} />
          <SeverityBadge severity={severity} />
        </div>

        <h3 className="font-serif text-[17px] font-bold leading-snug mb-2">
          <Link href={href} className="hover:text-alert transition-colors">
            {accident.title}
          </Link>
        </h3>

        <p className="text-[13px] text-ink-soft leading-relaxed line-clamp-3 mb-3">{accident.summary}</p>

        <div className="mt-auto pt-3 border-t border-rule flex items-center justify-between gap-3">
          <p className="text-[11px] text-ink-mute">
            <span className="font-semibold text-ink-soft">{municipality.name}</span>
            <br />
            <time dateTime={occurredAt.toISOString()}>
              {formatDateShort(occurredAt)} · {formatTime(occurredAt)} h
            </time>
          </p>
          <Link href={href} className="text-xs font-semibold text-alert hover:underline whitespace-nowrap">
            Leer más →
          </Link>
        </div>
      </div>
    </article>
  );
}

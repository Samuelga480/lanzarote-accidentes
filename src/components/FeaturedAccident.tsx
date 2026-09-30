import Link from "next/link";
import type { AccidentWithMunicipality } from "@/lib/queries";
import { AccidentImage } from "@/components/AccidentImage";
import { SeverityBadge, VehicleBadge } from "@/components/Badges";
import { formatDate, formatTime } from "@/lib/format";

type Props = { accident: AccidentWithMunicipality };

export function FeaturedAccident({ accident }: Props) {
  const { municipality, occurredAt, severity, vehicleType, fatalities, injuries } = accident;
  const href = `/accidentes/${accident.slug}`;

  return (
    <section aria-labelledby="titulo-destacado" className="card overflow-hidden">
      <div className="px-4 pt-4 rule-red">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-alert">
          Accidente destacado
        </p>
        <h2 id="titulo-destacado" className="sr-only">
          Accidente destacado
        </h2>
      </div>

      <div className="grid md:grid-cols-2">
        <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
          <AccidentImage
            seed={accident.slug}
            alt=""
            imageUrl={accident.imageUrl}
            municipality={municipality.name}
            ratio="aspect-[4/3] md:aspect-auto md:h-full md:min-h-[280px]"
            className="md:border-r border-rule"
          />
        </Link>

        <div className="p-5 md:p-6 flex flex-col">
          <div className="flex flex-wrap gap-1.5 mb-3">
            <VehicleBadge type={vehicleType} />
            <SeverityBadge severity={severity} />
            <span className="chip bg-ink-soft/10 text-ink-soft">{municipality.name}</span>
          </div>

          <h3 className="font-serif text-2xl md:text-[28px] font-bold leading-[1.15] mb-3">
            <Link href={href} className="hover:text-alert transition-colors">
              {accident.title}
            </Link>
          </h3>

          <p className="text-sm text-ink-soft leading-relaxed mb-4">{accident.summary}</p>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-y border-rule py-3 mb-4">
            <div>
              <dt className="text-ink-mute uppercase tracking-wide text-[10px] font-semibold">Fecha</dt>
              <dd className="font-semibold text-ink mt-0.5">{formatDate(occurredAt)}</dd>
            </div>
            <div>
              <dt className="text-ink-mute uppercase tracking-wide text-[10px] font-semibold">Hora</dt>
              <dd className="font-semibold text-ink mt-0.5">{formatTime(occurredAt)} h</dd>
            </div>
            <div>
              <dt className="text-ink-mute uppercase tracking-wide text-[10px] font-semibold">Heridos</dt>
              <dd className="font-semibold text-ink mt-0.5">{injuries}</dd>
            </div>
            <div>
              <dt className="text-ink-mute uppercase tracking-wide text-[10px] font-semibold">Fallecidos</dt>
              <dd className="font-semibold text-ink mt-0.5">{fatalities}</dd>
            </div>
          </dl>

          <Link href={href} className="btn btn-primary mt-auto self-start">
            Leer noticia
          </Link>
        </div>
      </div>
    </section>
  );
}

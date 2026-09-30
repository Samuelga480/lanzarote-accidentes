"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LA_GRACIOSA_OUTLINE,
  LANZAROTE_OUTLINE,
  MAP_LABELS,
  MAP_VIEWBOX,
  project,
  toPoints,
} from "@/lib/map-geometry";
import { VEHICLE_LABEL } from "@/lib/constants";
import { formatDateShort } from "@/lib/format";
import type { VehicleType } from "@/lib/types";

export type MapAccident = {
  id: string;
  slug: string;
  title: string;
  occurredAt: string;
  vehicleType: VehicleType;
  severity: string;
  municipalitySlug: string;
  municipalityName: string;
  approxLat: number | null;
  approxLon: number | null;
  locationDescription: string | null;
};

/** Color del marcador por gravedad del accidente. */
function pinColor(severity: string): string {
  if (severity === "GRAVE") return "#a81b25";
  if (severity === "MODERADO") return "#d3232f";
  return "#4a5158";
}

export function MapLanzarote({ accidents }: { accidents: MapAccident[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const island = useMemo(() => toPoints(LANZAROTE_OUTLINE), []);
  const graciosa = useMemo(() => toPoints(LA_GRACIOSA_OUTLINE), []);

  // Solo los que tienen coordenada aproximada
  const plotted = useMemo(
    () => accidents.filter((a) => a.approxLat !== null && a.approxLon !== null),
    [accidents],
  );

  const selected = plotted.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
      {/* ------------------------- Mapa ------------------------- */}
      <div className="card p-4">
        <svg
          viewBox={`${MAP_VIEWBOX.x} ${MAP_VIEWBOX.y} ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
          className="w-full h-auto max-h-[70vh] mx-auto"
          role="img"
          aria-label={`Mapa de Lanzarote con ${plotted.length} accidentes registrados en ubicaciones aproximadas`}
        >
          <defs>
            <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#eaf1f5" />
              <stop offset="100%" stopColor="#dde8ee" />
            </linearGradient>
          </defs>

          <rect {...MAP_VIEWBOX} fill="url(#sea)" />

          {/* Isla principal */}
          <polygon points={island} fill="#f4f1e9" stroke="#c2b8a4" strokeWidth="1.5" />
          {/* La Graciosa */}
          <polygon points={graciosa} fill="#f4f1e9" stroke="#c2b8a4" strokeWidth="1.2" />

          {/* Rótulos geográficos */}
          {MAP_LABELS.map((l) => {
            const { x, y } = project(l.lat, l.lon);
            return (
              <text
                key={l.name}
                x={x}
                y={y}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="#8a8577"
                fontFamily="system-ui, sans-serif"
              >
                {l.name}
              </text>
            );
          })}

          {/* Marcadores */}
          {plotted.map((a) => {
            const { x, y } = project(a.approxLat as number, a.approxLon as number);
            const isSel = a.id === selectedId;
            const color = pinColor(a.severity);
            return (
              <g
                key={a.id}
                onClick={() => setSelectedId(isSel ? null : a.id)}
                style={{ cursor: "pointer" }}
                tabIndex={0}
                role="button"
                aria-label={`${a.title}, en ${a.municipalityName}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(isSel ? null : a.id);
                  }
                }}
              >
                {/* Área de pulsación más amplia que el punto visible */}
                <circle cx={x} cy={y} r={11} fill="transparent" />
                {isSel ? <circle cx={x} cy={y} r={9} fill={color} opacity="0.22" /> : null}
                <circle
                  cx={x}
                  cy={y}
                  r={isSel ? 5.5 : 4}
                  fill={color}
                  stroke="#fff"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}
        </svg>

        <p className="text-[11px] text-ink-mute mt-3 leading-relaxed border-t border-rule pt-3">
          Las ubicaciones se muestran de forma <strong className="text-ink-soft">aproximada</strong> (radio de
          entre 400 y 900 metros) para no identificar el punto exacto de ningún accidente. Pulsa un marcador para
          ver el resumen.
        </p>
      </div>

      {/* ------------------------- Panel lateral ------------------------- */}
      <aside className="card p-4 lg:max-h-[70vh] lg:overflow-y-auto">
        {selected ? (
          <>
            <button
              onClick={() => setSelectedId(null)}
              className="text-xs text-ink-mute hover:text-alert mb-2"
            >
              ← Volver al listado
            </button>
            <div className="chip bg-alert-soft text-alert-dark mb-2">
              {VEHICLE_LABEL[selected.vehicleType]}
            </div>
            <h3 className="font-serif text-lg font-bold leading-snug mb-2">{selected.title}</h3>
            <dl className="text-xs space-y-1.5 border-y border-rule py-3 mb-3">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-mute">Municipio</dt>
                <dd className="font-semibold text-right">{selected.municipalityName}</dd>
              </div>
              {selected.locationDescription ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-mute">Zona</dt>
                  <dd className="font-semibold text-right">{selected.locationDescription}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-ink-mute">Fecha</dt>
                <dd className="font-semibold text-right">{formatDateShort(selected.occurredAt)}</dd>
              </div>
            </dl>
            <Link href={`/accidentes/${selected.slug}`} className="btn btn-primary w-full">
              Leer noticia
            </Link>
          </>
        ) : (
          <>
            <h3 className="font-serif text-base font-bold mb-1">
              Accidentes recientes ({plotted.length})
            </h3>
            <p className="text-[11px] text-ink-mute mb-3">Pulsa un punto del mapa para ver el detalle.</p>
            <ul className="space-y-2">
              {plotted.slice(0, 40).map((a) => {
                const { x, y } = project(a.approxLat as number, a.approxLon as number);
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => setSelectedId(a.id)}
                      className="w-full text-left p-2.5 rounded hover:bg-canvas transition-colors flex gap-2.5 items-start"
                    >
                      <span
                        className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: pinColor(a.severity) }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold leading-snug text-ink">
                          {a.title}
                        </span>
                        <span className="block text-[11px] text-ink-mute mt-0.5">
                          {a.municipalityName} · {formatDateShort(a.occurredAt)}
                        </span>
                      </span>
                      <span className="sr-only">{a.municipalityName}</span>
                      <span className="text-[10px] text-ink-faint tabular-nums" aria-hidden="true">
                        {Math.round(x)},{Math.round(y)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

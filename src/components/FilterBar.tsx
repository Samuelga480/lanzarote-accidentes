"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MUNICIPALITIES, VEHICLE_LIST, DATE_RANGE_OPTIONS } from "@/lib/constants";

/**
 * Barra de filtros. Trabaja sobre la URL (searchParams), de modo que cualquier
 * combinacion de filtros es compartible y el listado se renderiza en el
 * servidor.
 */
export function FilterBar({ showSearch = true }: { showSearch?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");

  // Sincroniza el campo de texto si cambia la URL (p. ej. boton atras)
  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page"); // cualquier filtro vuelve a la pagina 1
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update("q", q.trim());
  };

  const active = params.get("municipio") ?? params.get("vehicle") ?? params.get("q");
  const hasFilters = Boolean(
    params.get("municipio") || params.get("vehicle") || params.get("desde") || params.get("q"),
  );

  return (
    <form
      onSubmit={onSubmit}
      className="card p-4 mb-6"
      role="search"
      aria-label="Filtrar accidentes"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showSearch ? (
          <div className="lg:col-span-2">
            <label className="label" htmlFor="f-q">
              Buscar
            </label>
            <div className="flex gap-2">
              <input
                id="f-q"
                type="search"
                className="field"
                placeholder="Palabra clave, vía, municipio…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button type="submit" className="btn btn-primary shrink-0">
                Buscar
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="f-mun">
            Municipio
          </label>
          <select
            id="f-mun"
            className="field"
            value={params.get("municipio") ?? ""}
            onChange={(e) => update("municipio", e.target.value)}
          >
            <option value="">Todos los municipios</option>
            {MUNICIPALITIES.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="f-veh">
            Tipo de vehículo
          </label>
          <select
            id="f-veh"
            className="field"
            value={params.get("vehicle") ?? ""}
            onChange={(e) => update("vehicle", e.target.value)}
          >
            <option value="">Todos los vehículos</option>
            {VEHICLE_LIST.map((v) => (
              <option key={v.value} value={v.value}>
                {v.plural}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="f-date">
            Fecha
          </label>
          <select
            id="f-date"
            className="field"
            value={params.get("desde") ?? ""}
            onChange={(e) => update("desde", e.target.value)}
          >
            <option value="">Cualquier fecha</option>
            {DATE_RANGE_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasFilters ? (
        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-rule">
          <p className="text-xs text-ink-mute">Hay filtros aplicados a esta búsqueda.</p>
          <button
            type="button"
            onClick={() => router.push(pathname, { scroll: false })}
            className="text-xs font-semibold text-alert hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      ) : null}
    </form>
  );
}

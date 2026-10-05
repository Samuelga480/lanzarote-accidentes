"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MUNICIPALITIES, DATE_RANGE_OPTIONS } from "@/lib/constants";
import { CATEGORIAS_SUCESO as CATEGORIAS_SUCESO_LISTA, CATEGORIAS_INFORMACION_MENU, etiquetaDe } from "@/lib/categorias";

/**
 * Buscador y filtros.
 *
 * Reproduce la barra del diseno original: se queda pegada bajo la cabecera de
 * 60px, con el buscador a la izquierda ocupando el hueco que sobra (minimo
 * 280px) y la lupa metida dentro del campo, y los tres desplegables a la
 * derecha con un minimo de 150px cada uno.
 *
 * Trabaja sobre la URL, de modo que cualquier combinacion de filtros es
 * compartible y el listado se renderiza en el servidor.
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

  const hasFilters = Boolean(
    params.get("municipio") || params.get("categoria") || params.get("desde") || params.get("q"),
  );

  return (
    <section className="controls">
      <form action="/noticias" method="get" onSubmit={onSubmit} role="search" aria-label="Filtrar noticias">
        <div className="controls-inner">
          {showSearch ? (
            <div className="search-box">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <label htmlFor="f-q" className="sr-only">
                Buscar
              </label>
              <input
                id="f-q"
                name="q"
                type="search"
                placeholder="Buscar por zona, tipo o descripción..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          ) : null}

          <div className="filters">
            <label htmlFor="f-mun" className="sr-only">
              Municipio
            </label>
            <select
              id="f-mun"
              name="municipio"
              value={params.get("municipio") ?? ""}
              onChange={(e) => update("municipio", e.target.value)}
            >
              <option value="">Todas las zonas</option>
              {MUNICIPALITIES.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}
                </option>
              ))}
            </select>

            <label htmlFor="f-cat" className="sr-only">
              Tipo de noticia
            </label>
            <select
              id="f-cat"
              name="categoria"
              value={params.get("categoria") ?? ""}
              onChange={(e) => update("categoria", e.target.value)}
            >
              <option value="">Todos los tipos</option>
<optgroup label="Sucesos">
              {CATEGORIAS_SUCESO_LISTA.map((c) => (
                <option key={c} value={c}>
                  {etiquetaDe(c)}
                </option>
              ))}
</optgroup>
<optgroup label="Informacion">
              {CATEGORIAS_INFORMACION_MENU.map((c) => (
                <option key={c} value={c}>
                  {etiquetaDe(c)}
                </option>
              ))}
</optgroup>
            </select>

            <label htmlFor="f-date" className="sr-only">
              Fecha
            </label>
            <select
              id="f-date"
              name="desde"
              value={params.get("desde") ?? ""}
              onChange={(e) => update("desde", e.target.value)}
            >
              <option value="">Todas las fechas</option>
              {DATE_RANGE_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/*
            Boton de enviar. Con JavaScript no hace falta: cada select navega al
            cambiar. Sin JavaScript, sin este boton el formulario no se envia
            nunca, porque cambiar un desplegable no envia nada por si solo. Es
            tambien la tecla Intro del campo de buscar.
          */}
          <noscript>
            <button type="submit" className="filters-submit">
              Filtrar
            </button>
          </noscript>
        </div>

        {hasFilters ? (
          <div className="filters-active">
            <p>Hay filtros aplicados a esta búsqueda.</p>
            <button
              type="button"
              onClick={() => router.push(pathname, { scroll: false })}
              className="filters-clear"
            >
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
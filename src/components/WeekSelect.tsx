"use client";

import { useRouter } from "next/navigation";

/**
 * Selector de semana del resumen.
 *
 * Va en un componente de cliente porque necesita `onChange`: la pagina se
 * renderiza en el servidor y el desplegable dispara la navegacion al cambiar.
 * Asi la semana seleccionada queda en la URL y es compartible.
 */
export function WeekSelect({
  weeks,
  current,
}: {
  /** Lunes de cada semana con noticias, ya en formato yyyy-mm-dd. */
  weeks: Array<{ value: string; label: string }>;
  current: string;
}) {
  const router = useRouter();

  return (
    <div className="resumen-filters">
      <label htmlFor="resumen-semana" className="sr-only">
        Selecciona una semana
      </label>
      <select
        id="resumen-semana"
        name="semana"
        className="resumen-select"
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v ? `/resumen?semana=${v}` : "/resumen");
        }}
      >
        {weeks.length > 0 ? (
          weeks.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))
        ) : (
          <option value="">Semana actual</option>
        )}
      </select>
    </div>
  );
}
"use client";

import { useRouter } from "next/navigation";

/**
 * Selector de ano del resumen anual.
 *
 * Va en un componente de cliente porque necesita `onChange`: la pagina se
 * renderiza en el servidor y el desplegable dispara la navegacion al cambiar.
 * Asi el ano seleccionado queda en la URL y es compartible.
 */
export function YearSelect({
  years,
  current,
}: {
  /** Anos con noticias, del mas reciente al mas antiguo. */
  years: Array<{ value: number; label: string }>;
  current: number;
}) {
  const router = useRouter();

  return (
    <div className="resumen-filters">
      <label htmlFor="resumen-ano" className="sr-only">
        Selecciona un año
      </label>
      <select
        id="resumen-ano"
        name="ano"
        className="resumen-select"
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v ? `/resumen-anual?ano=${v}` : "/resumen-anual");
        }}
      >
        {years.map((y) => (
          <option key={y.value} value={y.value}>
            {y.label}
          </option>
        ))}
      </select>
    </div>
  );
}
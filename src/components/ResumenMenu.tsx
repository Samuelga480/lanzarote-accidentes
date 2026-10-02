"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Selector de resumen en la cabecera.
 *
 * En lugar de dos entradas en la barra, hay una sola, "Resumen", que al
 * pulsarla abre el desplegable con la semanal y la anual. Asi la barra no crece
 * con cada pagina de resumen nueva.
 *
 * Reutiliza las clases del desplegable de perfil (`.nav-profile`,
 * `.profile-dropdown`, `.profile-dropdown-item`) a proposito: el boton y el menu
 * tienen que verse exactamente igual que el del perfil, y duplicar el CSS
 * haria que los dos se separen en cuanto se tocara uno.
 */
export function ResumenMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();

  // Cierra al pulsar fuera y al pulsar Escape, igual que el menu de perfil.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Al navegar a otra pagina el componente se vuelve a montar y el desplegable
  // se queda abierto si no se cierra aqui.
  useEffect(() => setOpen(false), [path]);

  // El boton se marca como activo cuando ya se esta en uno de los dos
  // resúmenes, para que se sepa en que apartado se está.
  const activo = path === "/resumen" || path === "/resumen-anual";

  return (
    <div className="nav-profile" ref={ref}>
      <button
        type="button"
        className="nav-link nav-profile-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-activo={activo ? "true" : undefined}
      >
        Resumen
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div
        className={`profile-dropdown resumen-dropdown${open ? " active" : ""}`}
        role="menu"
      >
        <Link
          href="/resumen"
          className="profile-dropdown-item"
          role="menuitem"
          onClick={() => setOpen(false)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Resumen semanal
        </Link>

        <Link
          href="/resumen-anual"
          className="profile-dropdown-item"
          role="menuitem"
          onClick={() => setOpen(false)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="4 19 9 14 13 18 20 8" />
            <line x1="20" y1="13" x2="20" y2="8" />
            <line x1="20" y1="8" x2="15" y2="8" />
          </svg>
          Resumen anual
        </Link>
      </div>
    </div>
  );
}
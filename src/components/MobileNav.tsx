"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Menu desplegable para movil.
 *
 * El diseno original ocultaba la navegacion por completo por debajo de 768px
 * (`.nav { display: none }`). Eso dejaba la cabecera sin ninguna salida en
 * moviles, asi que se mantiene la ocultacion pero se añade este boton para
 * poder llegar a las secciones.
 */
export function MobileNav({
  links,
  group,
}: {
  links: Array<{ href: string; label: string }>;
  /**
   * Grupo con titulo que se dibuja aparte. En escritorio son entradas del
   * desplegable "Resumen"; en movil no cabe un desplegable dentro de otro
   * desplegable, asi que se listan planas bajo un encabezado.
   */
  group?: { title: string; links: Array<{ href: string; label: string }> };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cierra al pulsar fuera y al pulsar Escape.
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="nav-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Cerrar menu" : "Abrir menu"}
        aria-controls="menu-movil"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
        </svg>
      </button>

      <nav
        id="menu-movil"
        className={`nav-drawer absolute right-0 z-50 w-56 rounded-b-md shadow-lg ${open ? "open" : ""}`}
        aria-label="Menú principal"
      >
        {links.map((l) => (
          <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </Link>
        ))}

        {group ? (
          <>
            <p className="nav-drawer-title">{group.title}</p>
            {group.links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </>
        ) : null}

        <Link href="/admin" onClick={() => setOpen(false)} className="nav-admin">
          Acceder
        </Link>
      </nav>
    </div>
  );
}
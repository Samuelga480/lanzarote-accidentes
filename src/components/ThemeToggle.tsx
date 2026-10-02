"use client";

import { useEffect, useState } from "react";

/**
 * Boton de claro/oscuro.
 *
 * Igual que en el diseno original: sin borde y sin fondo, solo el icono con
 * 8px de relleno. Las dos imagenes (sol y luna) estan siempre montadas y el CSS
 * oculta la que no corresponde al tema activo, de modo que no hay parpadeo al
 * cambiar: es el mismo mecanismo que usaba theme.js.
 *
 * El script del <head> ya aplica el tema guardado antes de pintar nada. Este
 * componente solo refleja el estado en el DOM y lo cambia al pulsar.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Se lee del atributo, no de localStorage: el atributo es lo que el script
    // del head ha puesto, y asi no hay dos fuentes de verdad.
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
    setMounted(true);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);

    try {
      localStorage.setItem("theme", next);
    } catch {
      /* modo privado sin localStorage: el tema dura lo que la pagina */
    }
  }

  // Antes de hidratar no se sabe el tema real. Se reserva el hueco para que la
  // cabecera no salte al montarse.
  if (!mounted) return <span className="theme-toggle-placeholder" aria-hidden="true" />;

  return (
    <button
      type="button"
      onClick={toggle}
      className="theme-toggle"
      aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
    >
      <svg
        className="icon-sun"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      <svg
        className="icon-moon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
"use client";

import { useEffect, useState } from "react";

/**
 * Boton de claro/oscuro.
 *
 * Replica el del diseno original (legacy-site/theme.js), que usaba el atributo
 * `data-theme` en <html> y guardaba la preferencia en localStorage. Se mantiene
 * el mismo mecanismo a proposito: asi el sitio se comporta como siempre.
 *
 * El script del <head> ya aplica el tema guardado antes de pintar. Este
 * componente solo tiene que reflejar el estado actual en el icono y cambiarlo
 * al pulsar.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // El atributo ya lo ha puesto el script del head. Se lee de ahi en lugar
    // de localStorage para no tener dos fuentes de verdad.
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
    setMounted(true);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";

    // Clase temporal: activa la transicion solo al cambiar, no en la carga.
    document.documentElement.classList.add("theme-switching");
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);

    try {
      localStorage.setItem("theme", next);
    } catch {
      /* modo privado sin localStorage: el tema dura lo que la pagina */
    }

    window.setTimeout(() => {
      document.documentElement.classList.remove("theme-switching");
    }, 250);
  }

  // Antes de montar no se sabe el tema real: se pinta un hueco del mismo tamano
  // para que la cabecera no salte al hidratarse.
  if (!mounted) {
    return <span className="theme-toggle-placeholder" aria-hidden="true" />;
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      className="theme-toggle"
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={isDark ? "Tema claro" : "Tema oscuro"}
    >
      {isDark ? (
        // Sol: en modo oscuro se ofrece pasar a claro.
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      ) : (
        // Luna: en modo claro se ofrece pasar a oscuro.
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
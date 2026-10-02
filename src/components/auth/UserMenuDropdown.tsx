"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/user-auth";

/**
 * Desplegable de la cuenta, para cuando ya hay sesion.
 *
 * Es la mitad interactiva de UserMenu: abre y cierra, y cierra sesion. Todo lo
 * demas (saber si hay sesion, de quien es y si es ADMIN) lo decide el servidor
 * en UserMenu.tsx y llega aqui como prop, asi que este archivo no tiene por que
 * volver a preguntar por la cookie.
 *
 * Los enlaces de redaccion solo se muestran si la cuenta es ADMIN.
 */
export function UserMenuDropdown({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const isAdmin = user.role === "ADMIN";
  const label = user.name ?? user.email;

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    setBusy(false);
    /*
      Igual que en LoginForm: la cabecera se dibuja en el servidor leyendo la
      cookie, asi que cerrar sesion obliga a pedir la pagina de nuevo. Con
      `router.refresh()` el desplegable se queda en pantalla con un usuario que ya
      no tiene sesion.
    */
    window.location.assign("/");
  }

  return (
    <div className="nav-profile" ref={ref}>
      <button
        type="button"
        className="nav-link nav-profile-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="max-w-[9rem] truncate">{label}</span>
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

      <div className={`profile-dropdown${open ? " active" : ""}`} role="menu">
        <div className="profile-dropdown-header">
          <div className="profile-avatar" aria-hidden="true">
            {label.charAt(0).toUpperCase()}
          </div>
          <div className="profile-info">
            <div className="profile-name">{label}</div>
            <div className="profile-email">{user.email}</div>
          </div>
        </div>

        <div className="profile-dropdown-divider" />

        <Link href="/perfil" className="profile-dropdown-item" role="menuitem" onClick={() => setOpen(false)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Ver perfil completo
        </Link>

        {isAdmin ? (
          <>
            <Link href="/admin" className="profile-dropdown-item" role="menuitem" onClick={() => setOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Peticiones de noticias
            </Link>

            <Link href="/usuarios" className="profile-dropdown-item" role="menuitem" onClick={() => setOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Usuarios registrados
            </Link>
          </>
        ) : null}

        <button
          type="button"
          className="profile-dropdown-item"
          role="menuitem"
          onClick={logout}
          disabled={busy}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {busy ? "Cerrando sesion..." : "Cerrar sesion"}
        </button>
      </div>
    </div>
  );
}
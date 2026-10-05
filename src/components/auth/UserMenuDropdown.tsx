"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { cerrarSesionAction } from "@/app/sesion/actions";
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
 *
 * ---------------------------------------------------------------------------
 *  SIN PETICIONES DESDE EL NAVEGADOR
 * ---------------------------------------------------------------------------
 *
 * Cerrar sesion no es un `fetch` a `POST /api/auth/logout` seguido de un
 * `window.location.assign("/")`. Es un `<form action={cerrarSesionAction}>`: la
 * Server Action borra las dos cookies y redirige en el servidor, asi que la
 * cabecera se vuelve a pintar con la sesion ya cerrada. El boton queda
 * deshabilitado mientras dura la accion (`pending`) para que no se pulse dos veces.
 */
export function UserMenuDropdown({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
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

        {/*
          El boton va dentro de un formulario porque el cierre de sesion es una
          accion de servidor. Sin JavaScript sigue funcionando: Next la convierte
          en un POST normal a la propia pagina.

          El formulario lleva `display: contents` para no alterar la maquetacion:
          asi su unico hijo se comporta como si fuera un hijo directo del
          desplegable, que es una lista vertical.
        */}
        <form action={cerrarSesionAction} style={{ display: "contents" }}>
          <BotonCerrarSesion />
        </form>
      </div>
    </div>
  );
}

/**
 * Boton de cerrar sesion.
 *
 * Va en su propio componente porque `useFormStatus` solo lee el estado del
 * formulario que lo envuelve, no el del padre.
 */
function BotonCerrarSesion() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="profile-dropdown-item" role="menuitem" disabled={pending}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {pending ? "Cerrando sesion..." : "Cerrar sesion"}
    </button>
  );
}
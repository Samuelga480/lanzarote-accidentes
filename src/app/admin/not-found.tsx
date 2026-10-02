import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel de Administracion",
  robots: { index: false, follow: false },
};

/**
 * Marcador del logo del panel.
 *
 * Va aqui y no en un componente suelto porque es el unico sitio del proyecto
 * que dibuja el icono de capas dentro de una cabecera oscura: el del sitio
 * publico usa el color del texto y este lleva la cabecera con fondo casi negro.
 */
export function AdminLogo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

export default function AdminNotFound() {
  return (
    <main className="admin-main">
      <div className="admin-stat-card" style={{ textAlign: "center" }}>
        <div className="admin-stat-label">Esta pantalla ya no existe.</div>
        <p style={{ marginTop: 12 }}>
          <Link href="/admin" className="btn btn-primary btn-small">
            Volver al panel
          </Link>
        </p>
      </div>
    </main>
  );
}
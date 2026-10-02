import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "No encontrado",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="resumen-main">
      <div className="resumen-container text-center">
        <h1 className="resumen-header h2">Página no encontrada</h1>
        <p className="login-header p mb-6">La página que buscas no existe o ha cambiado de dirección.</p>
        <a href="/" className="nav-link nav-admin">
          Volver a la portada
        </a>
      </div>
    </main>
  );
}
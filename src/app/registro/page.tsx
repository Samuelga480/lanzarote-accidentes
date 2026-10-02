import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getSessionUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear cuenta",
  robots: { index: false, follow: false },
};

/**
 * Alta de cuenta de invitado.
 *
 * Es la register.html del sitio original, con la misma tarjeta y los mismos
 * campos, mas la confirmacion de contrasena que ya estaba ahi.
 */
export default async function RegistroPage() {
  if (await getSessionUser()) redirect("/perfil");

  return (
    <div className="login-body">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="logo">
              <svg
                width="32"
                height="32"
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
              <h1>
                Noticias <span>24/7</span>
              </h1>
            </div>
            <p>Crear cuenta de invitado</p>
          </div>

          <RegisterForm />

          <div className="login-footer">
            <p>
              Ya tienes cuenta? <Link href="/entrar">Inicia sesion</Link>
            </p>
            <Link href="/">Volver a la web</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
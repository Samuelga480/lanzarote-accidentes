import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SITE } from "@/lib/constants";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Iniciar sesion",
  robots: { index: false, follow: false },
};

/**
 * Pagina de acceso.
 *
 * Es la login.html del sitio original: tarjeta de 420px, marca con la palabra
 * accentuada en rojo, correo y contrasena con el boton para verla, y al pie los
 * enlaces al registro y de vuelta a la portada.
 *
 * Los avisos de la URL se interpretan aqui y no en el componente: el formulario
 * solo los pinta. Asi el componente no necesita `useSearchParams`.
 */
export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Con sesion abierta no tiene sentido mostrar el formulario.
  if (await getSessionUser()) redirect("/perfil");

  const sp = await searchParams;

  let avisoInicial = "";
  if (sp.confirmado) {
    avisoInicial =
      "Te hemos enviado un correo para confirmar la direccion. Confirma y ya podras entrar.";
  } else if (sp.reenviar) {
    avisoInicial = "Escribe tu correo y te lo enviamos otra vez.";
  } else if (sp.reenviado) {
    avisoInicial = "Correo de confirmacion enviado. Revisa tambien la carpeta de spam.";
  }

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
            <p>Iniciar sesion</p>
          </div>

          <LoginForm avisoInicial={avisoInicial} />

          <div className="login-footer">
            <p>
              No tienes cuenta? <Link href="/registro">Registrate</Link>
            </p>
            <Link href="/">Volver a la web</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
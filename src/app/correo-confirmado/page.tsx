import Link from "next/link";
import type { Metadata } from "next";
import { SITE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmar correo",
  robots: { index: false, follow: false },
};

/**
 * A donde llega la persona que pulsa el enlace del correo de confirmacion.
 *
 * Se llega aqui con un parametro `estado` que decide el texto. Es una pagina y
 * no un error: si el enlace era bueno, la cuenta ya esta confirmada y lo que
 * hay que decir es "ya esta", no un error 404.
 */
export default async function CorreoConfirmadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const estado = sp.estado ?? "invalido";

  const textos: Record<string, { titulo: string; cuerpo: string; accion: boolean }> = {
    ok: {
      titulo: "Correo confirmado",
      cuerpo: `Ya puedes entrar en ${SITE.name} con ese correo y tu contraseña.`,
      accion: true,
    },
    caducado: {
      titulo: "El enlace ha caducado",
      cuerpo:
        "El enlace de confirmación solo vale unas horas. Vuelve a la pantalla de acceso y pide que te lo enviemos otra vez.",
      accion: false,
    },
    invalido: {
      titulo: "El enlace no vale",
      cuerpo:
        "Puede que el correo esté incompleto o que se haya usado ya. Vuelve a la pantalla de acceso y pide que te lo enviemos otra vez.",
      accion: false,
    },
  };

  const t = textos[estado] ?? textos.invalido;

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
            <p>{t.titulo}</p>
          </div>

          <p className="login-footer" style={{ marginBottom: 24 }}>
            {t.cuerpo}
          </p>

          <div className="login-footer">
            <p>
              <Link href={t.accion ? "/entrar" : "/entrar?reenviar=1"}>
                {t.accion ? "Iniciar sesión" : "Reenviar el correo"}
              </Link>
            </p>
            <Link href="/">Volver a la web</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
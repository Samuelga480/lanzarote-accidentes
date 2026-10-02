import Link from "next/link";
import { MUNICIPALITIES, SITE } from "@/lib/constants";
import { CookiesLink } from "@/components/CookiesLink";

/**
 * Pie del sitio.
 *
 * El diseno original era deliberadamente sobrio: una linea centrada en gris
 * sobre fondo claro, con los enlaces sueltos y, al lado, la advertencia de
 * llamar al 112 en caso de emergencia. No hay columnas ni bloques de texto.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-links">
        {MUNICIPALITIES.slice(0, 5).map((m) => (
          <Link key={m.slug} href={`/municipios/${m.slug}`}>
            {m.name}
          </Link>
        ))}
        <Link href="/privacidad">Aviso legal y privacidad</Link>
        <Link href="/admin">Acceder</Link>

        {/* En su propio componente de cliente: necesita onClick. */}
        <CookiesLink />
      </div>

      <p>
        &copy; {year} {SITE.organization}. Información publicada con fines informativos. En caso de emergencia,{" "}
        <strong>llama al 112</strong>.
      </p>
    </footer>
  );
}
import Link from "next/link";
import { SITE } from "@/lib/constants";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileNav } from "@/components/MobileNav";

/**
 * Cabecera del sitio.
 *
 * Reproduce la del diseno original: 60px de alto, marca con el icono de capas
 * junto al nombre en Merriweather, navegacion a la derecha con enlaces de 8px
 * de relleno, boton de tema e "Acceder" en bloque oscuro.
 */
const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/accidentes", label: "Noticias" },
  { href: "/mapa", label: "Mapa" },
  { href: "/municipios", label: "Municipios" },
  { href: "/buscar", label: "Buscar" },
  { href: "/privacidad", label: "Aviso legal" },
];

export function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        {/* Marca */}
        <Link href="/" className="logo" aria-label={`${SITE.name}, ir a inicio`}>
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
          <h1>{SITE.name}</h1>
        </Link>

        {/* Navegacion. En movil se oculta y la sustituye MobileNav. */}
        <nav className="nav" aria-label="Principal">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="nav-link">
              {n.label}
            </Link>
          ))}

          <ThemeToggle />

          <Link href="/admin" className="nav-link nav-admin">
            Acceder
          </Link>
        </nav>

        {/* En movil: boton de menu + acceso al panel */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <MobileNav links={NAV} />
        </div>
      </div>
    </header>
  );
}
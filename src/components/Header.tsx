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
 *
 * El boton de tema va DENTRO de .nav a proposito: .nav se oculta por debajo de
 * 768px, asi que en movil aparece el que hay en MobileNav y no se ven dos.
 */

/**
 * Navegacion principal.
 *
 * La del sitio original era: Noticias, Mapa, Resumen Semanal, tema y Acceder.
 * Se mantienen esos enlaces y se anaden los que la version con base de datos
 * necesita (municipios, buscador, aviso legal), que no existian entonces.
 */
const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/accidentes", label: "Noticias" },
  { href: "/resumen", label: "Resumen Semanal" },
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

        {/* Solo en movil: boton de menu. El boton de tema ya va dentro de .nav. */}
        <MobileNav links={NAV} />
      </div>
    </header>
  );
}
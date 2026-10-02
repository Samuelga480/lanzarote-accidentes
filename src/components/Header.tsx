import Link from "next/link";
import { SITE } from "@/lib/constants";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileNav } from "@/components/MobileNav";
import { UserMenu } from "@/components/auth/UserMenu";
import { getSessionUser } from "@/lib/user-auth";

/**
 * Cabecera del sitio.
 *
 * Reproduce la del diseno original: 60px de alto, marca con el icono de capas
 * junto al nombre en Merriweather, y a la derecha Inicio, Mapa, Resumen
 * Semanal, el boton de tema y Acceder. Nada mas.
 *
 * El boton de tema va DENTRO de .nav a proposito: .nav se oculta por debajo de
 * 768px, asi que en movil aparece el de MobileNav y no se ven los dos.
 */
const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/mapa", label: "Mapa" },
  { href: "/resumen", label: "Resumen Semanal" },
];

export async function Header() {
  // Se lee en el servidor: si hay sesion, "Acceder" es el boton de perfil con
  // su desplegable; si no, es un enlace a la pagina de acceso. La cabecera se
  // vuelve a renderizar con cada navegacion, asi que el cambio se ve al momento.
  const user = await getSessionUser();

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

        <nav className="nav" aria-label="Principal">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="nav-link">
              {n.label}
            </Link>
          ))}

          <ThemeToggle />

          <UserMenu user={user} />
        </nav>

        {/* Solo en movil: boton de menu */}
        <MobileNav links={NAV} />
      </div>
    </header>
  );
}
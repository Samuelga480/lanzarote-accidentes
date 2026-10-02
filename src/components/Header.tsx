import Link from "next/link";
import { SITE } from "@/lib/constants";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileNav } from "@/components/MobileNav";
import { ResumenMenu } from "@/components/ResumenMenu";
import { UserMenu } from "@/components/auth/UserMenu";
import { getSessionUser } from "@/lib/user-auth";

/**
 * Cabecera del sitio.
 *
 * Reproduce la del diseno original: 60px de alto, marca con el icono de capas
 * junto al nombre en Merriweather, y a la derecha Inicio, Mapa, Resumen, el
 * boton de tema y Acceder. Nada mas.
 *
 * "Resumen" es una sola entrada con desplegable: al pulsarla se elige entre la
 * semanal y la anual. Dos entradas fijas en la barra se multiplicarian cada vez
 * que se anadiera un periodo nuevo.
 *
 * El boton de tema va DENTRO de .nav a proposito: .nav se oculta por debajo de
 * 768px, asi que en movil aparece el de MobileNav y no se ven los dos.
 */
const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/mapa", label: "Mapa" },
];

/** Los dos periodos de resumen, que en escritorio viven dentro del desplegable. */
const RESUMEN = [
  { href: "/resumen", label: "Resumen semanal" },
  { href: "/resumen-anual", label: "Resumen anual" },
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
          {/*
            El nombre del sitio NO es un h1. Lo era, y era un error en las dos
            direcciones: en las paginas que tienen titulo propio salian dos h1 en
            la misma pagina, y en las que no lo tienen (portada, mapa, resumenes)
            el unico h1 era el logo, de modo que la pagina no tenia ninguno. Un
            h1 debe ser el titulo de lo que se esta leyendo.
          */}
          <span className="logo-name">{SITE.name}</span>
        </Link>

        <nav className="nav" aria-label="Principal">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="nav-link">
              {n.label}
            </Link>
          ))}

          <ResumenMenu />

          <ThemeToggle />

          <UserMenu user={user} />
        </nav>

        {/* Solo en movil: boton de menu */}
        <MobileNav links={NAV} group={{ title: "Resúmenes", links: RESUMEN }} />
      </div>
    </header>
  );
}
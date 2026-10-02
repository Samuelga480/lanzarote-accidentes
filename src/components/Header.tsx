import Link from "next/link";
import { SITE } from "@/lib/constants";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/accidentes", label: "Últimos accidentes" },
  { href: "/vehiculos/coche", label: "Coches" },
  { href: "/vehiculos/moto", label: "Motos" },
  { href: "/municipios", label: "Municipios" },
  { href: "/mapa", label: "Mapa" },
  { href: "/buscar", label: "Buscar" },
];

export function Header() {
  return (
    <header className="bg-paper border-b border-rule sticky top-0 z-40">
      <div className="container-page">
        {/* Franja superior fina */}
        <div className="hidden md:flex items-center justify-between py-1.5 text-[11px] text-ink-mute border-b border-rule">
          <span>{SITE.tagline}</span>
          <span className="flex items-center gap-4">
            <Link href="/mapa" className="hover:text-alert transition-colors">
              Mapa de la isla
            </Link>
            <Link href="/privacidad" className="hover:text-alert transition-colors">
              Aviso legal y privacidad
            </Link>
          </span>
        </div>

        {/* Marca + navegacion */}
        <div className="flex items-center justify-between gap-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label={`${SITE.name}, ir a inicio`}>
            <span
              className="w-9 h-9 bg-alert rounded-sm flex items-center justify-center"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#fff" strokeWidth="2.2">
                <path d="M12 2 2 22h20L12 2Z" strokeLinejoin="round" />
                <path d="M12 9v5" strokeLinecap="round" />
                <circle cx="12" cy="17.5" r="0.8" fill="#fff" stroke="none" />
              </svg>
            </span>
            <span className="leading-none">
              <span className="block font-serif text-xl font-bold tracking-tight text-ink">
                {SITE.name}
              </span>
              <span className="block text-[10px] uppercase tracking-[0.14em] text-ink-mute mt-0.5">
                Accidentes de tráfico
              </span>
            </span>
          </Link>

          <nav aria-label="Principal" className="flex items-center gap-4 overflow-x-auto">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="nav-link">
                {n.label}
              </Link>
            ))}
          </nav>

          {/* Boton de tema claro/oscuro, como en el diseno original. */}
          <ThemeToggle />

          <Link
            href="/admin"
            className="btn btn-primary shrink-0 hidden sm:inline-flex"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="hidden md:inline">Panel</span>
          </Link>
        </div>

        {/* Navegacion secundaria en movil */}
        <nav
          aria-label="Secciones"
          className="sm:hidden -mx-4 px-4 pb-2 flex gap-3 overflow-x-auto border-t border-rule pt-2"
        >
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-xs font-semibold text-ink-soft whitespace-nowrap">
              {n.label}
            </Link>
          ))}
          <Link href="/admin" className="text-xs font-semibold text-alert whitespace-nowrap">
            Panel
          </Link>
        </nav>
      </div>
    </header>
  );
}

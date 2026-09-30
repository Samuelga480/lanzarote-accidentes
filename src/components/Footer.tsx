import Link from "next/link";
import { MUNICIPALITIES, SITE } from "@/lib/constants";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-white/70 mt-16">
      <div className="container-page py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-serif text-lg font-bold text-white">{SITE.name}</p>
            <p className="text-sm mt-2 leading-relaxed">{SITE.description}</p>
          </div>

          <nav aria-label="Secciones del pie">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3">Secciones</p>
            <ul className="space-y-1.5 text-sm">
              {[
                { href: "/accidentes", label: "Últimos accidentes" },
                { href: "/municipios", label: "Municipios" },
                { href: "/mapa", label: "Mapa de la isla" },
                { href: "/buscar", label: "Buscador" },
                { href: "/privacidad", label: "Aviso legal y privacidad" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Municipios del pie">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3">Municipios</p>
            <ul className="space-y-1.5 text-sm grid grid-cols-2 gap-x-3">
              {MUNICIPALITIES.map((m) => (
                <li key={m.slug}>
                  <Link href={`/municipios/${m.slug}`} className="hover:text-white transition-colors">
                    {m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3">Cómo tratamos los datos</p>
            <p className="text-sm leading-relaxed">
              No publicamos matrículas, teléfonos, documentos de identidad ni direcciones particulares. Las
              ubicaciones se muestran de forma aproximada y toda noticia publicada ha sido revisada por un editor.
            </p>
          </div>
        </div>

        <div className="border-t border-white/10 mt-8 pt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <p>
            © {year} {SITE.organization}
          </p>
          <p>
            Información publicada con fines informativos. En caso de emergencia, llama al{" "}
            <span className="text-white font-semibold">112</span>.
          </p>
        </div>
      </div>
    </footer>
  );
}

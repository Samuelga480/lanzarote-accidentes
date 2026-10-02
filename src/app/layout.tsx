import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/constants";
import { FEED_PATH, webSiteSchema, organizationSchema, graphSchema } from "@/lib/jsonld";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";
// site.css va DESPUES a proposito: es el diseño original del sitio y, al no
// estar dentro de @layer, gana a las utilidades de Tailwind de globals.css.
import "./site.css";

// Merriweather para los titulares y Source Sans 3 para el texto: son las dos
// tipografias del diseno original del sitio (legacy-site/styles.css).
//
// Este script va en el <head> y NO puede esperar a React: si el atributo
// data-theme se pusiera despues, la pagina entera se pintaria en claro y luego
// saltaria a oscuro en el sitio, que es justo el parpadeo que el diseno
// original evitaba. El sitio viejo lo hacia con theme.js en el head; aqui se
// replica el mismo comportamiento.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE.name} · ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [
    "accidentes Lanzarote",
    "accidentes de coches Lanzarote",
    "accidentes de motos Lanzarote",
    "tráfico Lanzarote",
    "noticias Arrecife",
    "siniestros Canarias",
  ],
  authors: [{ name: SITE.organization }],
  openGraph: {
    type: "website",
    locale: SITE.locale,
    siteName: SITE.name,
    url: siteUrl,
    title: `${SITE.name} · ${SITE.tagline}`,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    site: SITE.twitter,
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
  canonical: "/",
    // Enlaza el feed desde el head de todas las paginas. Los lectores de RSS
    // solo lo detectan si aparece aqui o en un <link> del HTML.
    types: { "application/rss+xml": FEED_PATH },
  },
  other: {
    "geo.region": "ES-CN",
    "geo.placename": "Lanzarote",
  },
};

export const viewport: Viewport = {
  themeColor: "#d3232f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/*
          Se aplica el tema ANTES de que se pinte nada. Va como script suelto y
          no como componente porque tiene que ejecutarse de forma sincrona
          durante el parseo del HTML: cualquier otra cosa produce un parpadeo.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />

        {/*
          Merriweather para los titulares y Source Sans 3 para el texto.
          selfFonts con display swap: la pagina se pinta de inmediato con la
          tipografia de sistema y la buena sustituye al cargar.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;0,900;1,400&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap"
        />
        {/*
          JSON-LD de la organizacion y del sitio, en el layout para que esten en
          todas las paginas. El <title> de la pagina anade el sufijo del sitio
          mediante el `template` de metadata.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // El "<" se escapa como \u003c: sin esto, un texto con "</script>"
            // cerraria la etiqueta y ejecutaria lo que venga despues.
            __html: JSON.stringify(graphSchema([organizationSchema(), webSiteSchema()])).replace(
              /</g,
              "\\u003c",
            ),
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-ink focus:text-white focus:px-4 focus:py-2 focus:rounded"
        >
          Saltar al contenido
        </a>
        <Header />
        <main id="contenido" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}

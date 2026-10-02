import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Next infiere la raiz del workspace buscando lockfiles hacia arriba. Como el
  // proyecto esta en "Documentos/Proyecto predeterminado/" y existe otro
  // package-lock.json en el directorio personal, Next elegia una raiz
  // equivocada y lo avisaba en cada build. Fijarla aqui elimina el aviso y
  // hace que el trazado de ficheros de `next build` sea correcto dentro de
  // Docker, donde solo existe una copia del proyecto.
  outputFileTracingRoot: path.join(__dirname),

  images: {
    // Las imagenes ya se descargan y optimizan a WebP en el pipeline
    // (src/lib/images.ts), asi que Next no necesita descargar remotos. Se
    // permite cualquier host porque el componente de imagen recibe rutas
    // locales /media/... y solo de forma excepcional cae a una URL externa.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    // Sirve cada formato moderno con la ruta /_next/image.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [400, 800, 1200, 1600, 1920],
    imageSizes: [96, 128, 256, 384],
  },

  async redirects() {
    return [
      {
        /*
          Todo el sitio tiene que ir por HTTPS, y no solo por buena costumbre: las
          redes de anuncios rechazan los sitios que sirven contenido en HTTP. El
          usuario que llega por http:// esvisitor de la red, y si recibe una
          pagina sin cifrar la revision se queda en el camino.

          Se manda a la variante con www, que es la que devuelve el certificado.
          El canonical del sitio ya apunta a https:// sin www, asi que de ahi se
          quita la www en una regla aparte para no dejar dos rutas al mismo sitio.
        */
        source: "/:path*",
        has: [{ type: "host", value: "(www\\.)?accidenteslanzarote\\.com" }],
        destination: "https://accidenteslanzarote.com/:path*",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // La web no usa camara, micro, geolocalizacion ni pagos. Declararlo
            // reduce la superficie expuesta.
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            // Evita que un HTML de otro origen se incruste aqui.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next inyecta scripts con nonce/hash; se permite 'unsafe-inline'
              // solo para estilos, que es lo unico que genera Tailwind.
              //
              // Los dominios que se anaden son los que el sitio carga de fuera y
              // que NECESITAN cargar para funcionar. Antes de anadirlos, la
              // pagina pedia las tipografias a Google Fonts y la CMP de
              // consentimiento a la red de anuncios, y las dos estaban
              // bloqueadas por esta misma politica: el aviso de cookies no salia
              // nunca y las tipografias caian a las del sistema.
              //
              //   cmp.inmobi.com         la CMP (gestor de consentimiento)
              //   *.themoneytizer.com    la red de anuncios
              //   fonts.googleapis/gstatic  las dos tipografias del diseno
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cmp.inmobi.com https://*.themoneytizer.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https:",
              // Las tipografias vienen de Google.
              "font-src 'self' data: https://fonts.gstatic.com",
              // El mapa usa Leaflet y sus teselas; la CMP y los anuncios hacen
              // peticiones de medicion a servidores propios de la red.
              "connect-src 'self' https:",
              // La CMP y los anuncios van dentro de marcos de otros origenes, que
              // es donde se sirven los creativos. frame-ancestors sigue en
              // 'none': eso impide que METAN este sitio dentro de un marco, que
              // es distinto de meter marcos aqui.
              "frame-src https://cmp.inmobi.com https://*.themoneytizer.com https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
      {
        // Las imagenes procesadas llevan un hash en el nombre: se pueden cachear
        // para siempre. Si el nombre cambia, es una imagen distinta.
        source: "/media/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // El panel nunca debe quedar en cache de ningun intermediario.
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },

  experimental: {
    // La IA puede enviar campos grandes en los borradores; se mantiene margen.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
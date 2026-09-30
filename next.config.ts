import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // El proyecto usa imagenes locales generadas (/img/[id]) y/o CDN externos.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    // La IA puede enviar campos grandes en los borradores; mantenemos margen.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;

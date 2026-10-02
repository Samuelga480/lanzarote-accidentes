/**
 * Sondeo de los medios que han pedido en concreto.
 *
 *   npx tsx scripts/probe-medios.ts
 *
 * No escribe nada en la base de datos. Solo comprueba, medio a medio, tres
 * cosas y las dice con claridad:
 *
 *   1. Si hay un RSS que sirva de verdad (no una pagina HTML con codigo 200).
 *   2. Si hay un sitemap con indice, que es lo que permite recuperar articulos
 *      viejos. Un RSS solo trae los ultimos dias.
 *   3. Si hay API de WordPress, que es la unica forma de pedir articulos por
 *      rango de fechas sin recorrer la web a pelo.
 */

import { safeFetch } from "@/lib/net";
import { parseFeed } from "@/lib/rss";
import { contentTypeLooksXml } from "@/lib/feeds";

type Candidato = { url: string; tipo: "rss" | "sitemap" | "wp-api" };

const MEDIOS: Array<{ nombre: string; candidatos: Candidato[] }> = [
  {
    nombre: "La Voz de Lanzarote",
    candidatos: [
      { url: "https://www.lavozdelanzarote.com/rss", tipo: "rss" },
      { url: "https://www.lavozdelanzarote.com/sitemap_index.xml", tipo: "sitemap" },
      { url: "https://www.lavozdelanzarote.com/wp-sitemap.xml", tipo: "sitemap" },
      { url: "https://www.lavozdelanzarote.com/wp-json/wp/v2/posts?per_page=1", tipo: "wp-api" },
    ],
  },
  {
    nombre: "Diario de Lanzarote",
    candidatos: [
      { url: "https://diariodelanzarote.com/rss", tipo: "rss" },
      { url: "https://diariodelanzarote.com/feed", tipo: "rss" },
      { url: "https://www.diariodelanzarote.com/rss", tipo: "rss" },
      { url: "https://diariodelanzarote.com/sitemap_index.xml", tipo: "sitemap" },
      { url: "https://diariodelanzarote.com/", tipo: "rss" },
    ],
  },
  {
    nombre: "Cronicas de Lanzarote",
    candidatos: [
      { url: "https://www.cronicasdelanzarote.com/rss", tipo: "rss" },
      { url: "https://www.cronicasdelanzarote.com/feed", tipo: "rss" },
      { url: "https://www.cronicasdelanzarote.com/sitemap_index.xml", tipo: "sitemap" },
      { url: "https://www.cronicasdelanzarote.com/wp-json/wp/v2/posts?per_page=1", tipo: "wp-api" },
      { url: "https://www.cronicasdelanzarote.com/", tipo: "rss" },
    ],
  },
  {
    nombre: "Lancelot Medios",
    candidatos: [
      { url: "https://www.lancelotmedios.com/rss", tipo: "rss" },
      { url: "https://www.lancelotmedios.com/feed", tipo: "rss" },
      { url: "https://www.lancelotmedios.com/sitemap_index.xml", tipo: "sitemap" },
      { url: "https://www.lancelotmedios.com/wp-json/wp/v2/posts?per_page=1", tipo: "wp-api" },
      { url: "https://www.lancelotmedios.com/", tipo: "rss" },
    ],
  },
  {
    nombre: "112 Canarias",
    candidatos: [
      { url: "https://www.112canarias.es/rss", tipo: "rss" },
      { url: "https://www.112canarias.es/rss.xml", tipo: "rss" },
      { url: "https://www.112canarias.es/feed", tipo: "rss" },
      { url: "https://www.112canarias.es/sitemap.xml", tipo: "sitemap" },
      { url: "https://www.112canarias.es/", tipo: "rss" },
    ],
  },
  {
    nombre: "Consorcio de Seguridad y Emergencias de Lanzarote",
    candidatos: [
      { url: "https://www.consorciolanzarote.com/rss", tipo: "rss" },
      { url: "https://consorciolanzarote.com/rss", tipo: "rss" },
      { url: "https://www.consorciolanzarote.com/feed", tipo: "rss" },
      { url: "https://www.consorciolanzarote.com/sitemap.xml", tipo: "sitemap" },
      { url: "https://www.consorciolanzarote.com/", tipo: "rss" },
    ],
  },
  {
    nombre: "SER Lanzarote",
    candidatos: [
      { url: "https://cadenaser.com/rss/las-palmas/", tipo: "rss" },
      { url: "https://cadenaser.com/emisores/las-palmas/rss/", tipo: "rss" },
      { url: "https://cadenaser.com/rss/lanzarote/", tipo: "rss" },
      { url: "https://cadenaser.com/emisores/lanzarote/rss/", tipo: "rss" },
      { url: "https://cadenaser.com/rss/", tipo: "rss" },
      { url: "https://cadenaser.com/sitemap.xml", tipo: "sitemap" },
    ],
  },
  {
    nombre: "RTVC",
    candidatos: [
      { url: "https://www.rtvc.es/rss/", tipo: "rss" },
      { url: "https://www.rtvc.es/noticias/rss/", tipo: "rss" },
      { url: "https://www.rtvc.es/rss/canarias.xml", tipo: "rss" },
      { url: "https://www.rtvc.es/sitemap.xml", tipo: "sitemap" },
      { url: "https://www.rtvc.es/", tipo: "rss" },
    ],
  },
  {
    nombre: "Europa Press Canarias",
    candidatos: [
      { url: "https://e00-efe.uecdn.es/efe/amanecer/canarias/rss.xml", tipo: "rss" },
      { url: "https://www.europapress.es/rss/canarias/1.xml", tipo: "rss" },
      { url: "https://efe.com/canarias/rss.xml", tipo: "rss" },
      { url: "https://efe.com/sitemap.xml", tipo: "sitemap" },
      { url: "https://www.europapress.es/sitemap.xml", tipo: "sitemap" },
    ],
  },
];

/** Cuentas <loc> o <url> de un sitemap, sin cargar el documento entero. */
function cuentaUrls(xml: string): number {
  return (xml.match(/<loc>/g) ?? []).length;
}

async function main() {
  console.log("Sondeo de medios. Solo lectura.\n");

  for (const { nombre, candidatos } of MEDIOS) {
    console.log("=".repeat(72));
    console.log(nombre);
    console.log("=".repeat(72));

    for (const { url, tipo } of candidatos) {
      const res = await safeFetch(url, {
        accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5",
      });

      if (!res.ok) {
        console.log(`  x ${(res.error ?? String(res.status)).padEnd(28)} ${url}`);
        continue;
      }

      const ct = res.contentType ?? "";

      if (tipo === "wp-api") {
        try {
          const j = JSON.parse(res.body);
          if (Array.isArray(j)) {
            console.log(`  + API WordPress viva (${j.length} item)  ${url}`);
          } else {
            console.log(`  ? API responde pero no es un array  ${url}`);
          }
        } catch {
          console.log(`  ? La API no devolvio JSON  ${url}`);
        }
        continue;
      }

      if (tipo === "sitemap") {
        const n = cuentaUrls(res.body);
        if (res.body.includes("<urlset") || res.body.includes("<sitemapindex")) {
          console.log(`  + sitemap con ${n} url(s)  ${url}`);
        } else {
          console.log(`  x no parece un sitemap  ${url}`);
        }
        continue;
      }

      if (!contentTypeLooksXml(res.contentType)) {
        console.log(`  x ${res.status} ${ct.padEnd(22)} ${url}`);
        continue;
      }

      const parsed = parseFeed(res.body, nombre);
      if (!parsed.valid) {
        console.log(`  x XML invalido: ${parsed.error}  ${url}`);
        continue;
      }

      const conFecha = parsed.items.filter((i) => i.publishedAt).length;
      const recientes = parsed.items
        .map((i) => i.publishedAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime());
      const viejo = recientes[recientes.length - 1];
      const antiguedad = recientes[0]
        ? Math.round((Date.now() - recientes[0].getTime()) / 86_400_000)
        : null;
      const alcance = viejo ? Math.round((Date.now() - viejo.getTime()) / 86_400_000) : null;

      console.log(
        `  + RSS OK ${String(parsed.items.length).padStart(4)} items | con fecha ${String(conFecha).padStart(4)}` +
          (antiguedad !== null ? ` | mas nuevo hace ${antiguedad} d` : "") +
          (alcance !== null ? ` | cubre ${alcance} d` : ""),
      );
      console.log(`      ${url}`);
      for (const item of parsed.items.slice(0, 2)) {
        console.log(`      - ${item.title.slice(0, 72)}`);
      }
    }
    console.log("");
  }
}

main().catch((e) => {
  console.error("Error en el sondeo:", e);
  process.exit(1);
});
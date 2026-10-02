/**
 * Sonda: como se comporta el titular de los partes del CECOES (que es donde se
 * cuelan las noticias de otras islas) y que给出了 el HTML crudo relevante.
 *
 *   npx tsx scripts/tmp-og.ts
 *
 * NO ESCRIBE NADA.
 */

import * as cheerio from "cheerio";
import { safeFetch } from "@/lib/net";

const URLS = [
  "https://www3.gobiernodecanarias.org/noticias/herido-en-el-choque-de-un-automovil-contra-un-muro-en-tenerife",
  "https://www3.gobiernodecanarias.org/noticias/un-ciclista-herido-de-caracter-moderado-en-una-colision-en-tenerife",
  "https://www3.gobiernodecanarias.org/noticias/un-motorista-resulta-herido-en-un-accidente-de-trafico-en-tenerife-4",
];

async function main() {
  for (const url of URLS) {
    const res = await safeFetch(url, { accept: "text/html" });
    if (!res.ok) {
      console.log(`\n[fallo] ${url} ${res.error ?? res.status}`);
      continue;
    }
    const $ = cheerio.load(res.body);

    let ld: unknown = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (ld) return;
      try {
        const parsed: unknown = JSON.parse($(el).contents().text().trim());
        const walk = (n: unknown): Record<string, unknown> | null => {
          if (Array.isArray(n)) {
            for (const x of n) {
              const f = walk(x);
              if (f) return f;
            }
            return null;
          }
          if (typeof n !== "object" || n === null) return null;
          const o = n as Record<string, unknown>;
          const t = o["@type"];
          const types = Array.isArray(t) ? t : [t];
          if (types.some((x) => typeof x === "string" && x.includes("Article"))) return o;
          if (Array.isArray(o["@graph"])) return walk(o["@graph"]);
          return null;
        };
        ld = walk(parsed);
      } catch {
        /* ignorar */
      }
    });

    const headline = (ld as Record<string, unknown> | null)?.["headline"];
    console.log(`\n=== ${url}`);
    console.log(`  ld headline    : ${JSON.stringify(headline)}`);
    console.log(`  ld description : ${JSON.stringify((ld as Record<string, unknown> | null)?.["description"])}`);
    console.log(`  og:title       : ${JSON.stringify($('meta[property="og:title"]').attr("content"))}`);
    console.log(`  <title>        : ${JSON.stringify($("title").text().trim())}`);
    console.log(`  meta descr     : ${JSON.stringify($('meta[name="description"]').attr("content"))}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
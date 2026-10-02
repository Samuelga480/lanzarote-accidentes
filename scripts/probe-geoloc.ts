/**
 * Sonda: replica EXACTAMENTE los filtros de src/lib/ingest.ts para ver que
 * acabaria en pendientes ahora mismo. No escribe nada.
 *
 *   npx tsx scripts/probe-geoloc.ts [medio]
 */

import { safeFetch } from "@/lib/net";
import { parseFeed } from "@/lib/rss";
import { contentTypeLooksXml, FEEDS } from "@/lib/feeds";
import { extractArticle } from "@/lib/extract";
import { extractFacts, relevanceScore } from "@/lib/facts";
import { evaluaAccidenteTrafico, evaluaIsla } from "@/lib/traffic-gate";

const MAX_POR_MEDIO = 40;

function solo(t: string, n = 100): string {
  const l = t.replace(/\s+/g, " ").trim();
  return l.length > n ? l.slice(0, n) + "..." : l;
}

async function main() {
  const filtro = process.argv[2] ? process.argv[2].toLowerCase() : null;
  const medios = filtro
    ? FEEDS.filter((f) => f.name.toLowerCase().includes(filtro) && f.enabled)
    : FEEDS.filter((f) => f.enabled);

  let coladas = 0;
  let fuera = 0;

  for (const medio of medios) {
    const res = await safeFetch(medio.url, {
      accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5",
    });
    if (!res.ok) {
      console.log("\n" + medio.name + ": no se pudo leer (" + (res.error ?? res.status) + ")");
      continue;
    }
    const parsed = parseFeed(res.body, medio.name);
    if (!parsed.valid) {
      console.log("\n" + medio.name + ": feed no valido (" + parsed.error + ")");
      continue;
    }

    console.log("\n" + "=".repeat(74) + "\n  " + medio.name + " [" + medio.region + "]\n" + "=".repeat(74));

    for (const item of parsed.items.slice(0, MAX_POR_MEDIO)) {
      const tituloFeed = item.title.trim();
      const veredicto = evaluaAccidenteTrafico(tituloFeed, item.summary ?? "");
      if (!veredicto.esAccidente) continue;

      const pagina = await safeFetch(item.url, { accept: "text/html,application/xhtml+xml" });
      if (!pagina.ok) continue;

      const art = extractArticle(pagina.body, pagina.url);
      const body = art.body.trim();
      const summary = art.summary ? art.summary.trim() : item.summary ? item.summary : "";
      const fullText = body.length >= 200 ? body : summary;
      const title = art.title && art.title.trim() ? art.title.trim() : tituloFeed;

      const rel = relevanceScore(title, fullText);
      if (rel < 0.25) continue;

      const facts = extractFacts(title, fullText);
      const isla = evaluaIsla(title, fullText);

      const entra = isla.deLanzarote && !facts.outsideLanzarote;
      if (!entra) {
        fuera++;
        continue;
      }

      coladas++;
      const slug = facts.municipalitySlug ? facts.municipalitySlug : "arrecife (INVENTADO)";
      console.log("\n  + " + solo(tituloFeed));
      console.log("      titulo usado : " + solo(title, 70));
      console.log("      municipio    : " + slug + "  |  isla: " + isla.motivo);
      if (!facts.municipalitySlug) {
        console.log("      *** SIN MUNICIPIO: el mapa lo pincha en " + slug);
      }
    }
  }

  console.log("\n\nTOTAL: " + coladas + " a pendientes, " + fuera + " descartados");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
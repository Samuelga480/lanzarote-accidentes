/**
 * Vista previa: que entraria en pendientes ahora mismo.
 *
 *   npx tsx scripts/vista-previa.ts [medio]
 *
 * ---------------------------------------------------------------------------
 *  ESTE SCRIPT NO ESCRIBE NADA
 * ---------------------------------------------------------------------------
 *
 * Lee los feeds, pasa cada articulo por la puerta de trafico, extrae los hechos
 * y lo redacta por reglas. Imprime el resultado y punto. No toca la base de
 * datos, asi que se puede usar para ver lo que haria el cron sin que aparezca
 * nada en el panel.
 *
 * Lo unico que descarga son los feeds y, para los que pasan la puerta, la
 * pagina del articulo. Son peticiones normales, con las mismas protecciones que
 * usa el pipeline.
 */

import { safeFetch } from "@/lib/net";
import { parseFeed } from "@/lib/rss";
import { contentTypeLooksXml } from "@/lib/feeds";
import { FEEDS } from "@/lib/feeds";
import { extractFacts, relevanceScore } from "@/lib/facts";
import { evaluaAccidenteTrafico } from "@/lib/traffic-gate";
import { rewriteByRules } from "@/lib/ai/rewrite-rules";
import { MUNICIPALITY_BY_SLUG } from "@/lib/constants";
import { extractArticle } from "@/lib/extract";

/** Cuantos articulos se descargan como mucho por medio, para no abusar. */
const MAX_POR_MEDIO = 40;

function solo(texto: string, n = 120): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > n ? `${limpio.slice(0, n)}…` : limpio;
}

async function main() {
  const filtro = process.argv[2]?.toLowerCase();

  const medios = filtro
    ? FEEDS.filter((f) => f.name.toLowerCase().includes(filtro) && f.enabled)
    : FEEDS.filter((f) => f.enabled);

  if (medios.length === 0) {
    console.log(`\n  Ningun medio activo coincide con "${filtro}".`);
    return;
  }

  const resumenGlobal = { leidos: 0, pasan: 0, fuera: 0 };

  for (const medio of medios) {
    console.log("=".repeat(74));
    console.log(`  ${medio.name}`);
    console.log(`  ${medio.url}`);
    console.log("=".repeat(74));

    const res = await safeFetch(medio.url, {
      accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5",
    });

    if (!res.ok) {
      console.log(`  x No se pudo leer: ${res.error ?? res.status}\n`);
      continue;
    }
    if (!contentTypeLooksXml(res.contentType)) {
      console.log(`  x Responde ${res.contentType}, no es XML.\n`);
      continue;
    }

    const parsed = parseFeed(res.body, medio.name);
    if (!parsed.valid) {
      console.log(`  x ${parsed.error}\n`);
      continue;
    }

    console.log(`  ${parsed.items.length} entradas en el feed\n`);

    let fuera = 0;
    let pasan = 0;

    for (const item of parsed.items.slice(0, MAX_POR_MEDIO)) {
      resumenGlobal.leidos++;
      const titulo = item.title.trim();

      // El feed solo trae titular ySometimes resumen. La puerta se aplica al
      // titular para no descargar 75 paginas solo para descartarlas.
      const veredicto = evaluaAccidenteTrafico(titulo, item.summary ?? "");
      if (!veredicto.esAccidente) {
        fuera++;
        resumenGlobal.fuera++;
        console.log(`  x ${solo(titulo, 88)}`);
        console.log(`      ${veredicto.motivo}`);
        continue;
      }

      // Pasa la puerta: ahora si se descarga la pagina, igual que haria el ciclo.
      const pagina = await safeFetch(item.url, { accept: "text/html,application/xhtml+xml" });
      if (!pagina.ok) {
        console.log(`  ? ${solo(titulo, 88)}`);
        console.log(`      No se pudo descargar: ${pagina.error ?? pagina.status}`);
        continue;
      }

      // El mismo extractor que usa el pipeline, para que la vista previa no
      // vea un texto distinto del que vera el cron.
      const articulo = extractArticle(pagina.body, pagina.url);
      const cuerpo = articulo.body || item.summary || "";
      const facts = extractFacts(articulo.title || titulo, cuerpo);
      const rel = relevanceScore(articulo.title || titulo, cuerpo);

      if (facts.outsideLanzarote) {
        fuera++;
        resumenGlobal.fuera++;
        console.log(`  x ${solo(titulo, 88)}`);
        console.log(`      menciona otra isla`);
        continue;
      }

      if (rel < 0.25) {
        fuera++;
        resumenGlobal.fuera++;
        console.log(`  x ${solo(titulo, 88)}`);
        console.log(`      relevancia ${Math.round(rel * 100)} % (minimo 25 %)`);
        continue;
      }

      const municipio = facts.municipalitySlug
        ? (MUNICIPALITY_BY_SLUG.get(facts.municipalitySlug)?.name ?? "?")
        : "Lanzarote";

      const redactado = rewriteByRules({
        title: titulo,
        body: cuerpo,
        summary: item.summary ?? "",
        facts,
        municipalityName: municipio,
        occurredAtIso: item.publishedAt
          ? new Date(item.publishedAt).toISOString()
          : new Date().toISOString(),
        outlet: medio.name,
        sourceUrl: item.url,
      });

      pasan++;
      resumenGlobal.pasan++;

      console.log(`  + ${solo(titulo, 88)}`);
      console.log(`      PUBLICA  ${municipio}${facts.areaLabel ? ` / ${facts.areaLabel}` : ""} |-road: ${facts.road ?? "-"} | ${facts.category ?? "-"}`);
      if (redactado.ok) {
        console.log(`      REDACTADO ${redactado.title}`);
        console.log(`      CUERPO    ${solo(redactado.body.replace(/\n+/g, " "), 150)}`);
      } else {
        console.log(`      REDACTADO (fallo: ${redactado.error}) -> se guardaria el original`);
      }
    }

    console.log(`\n  --> ${pasan} a pendientes, ${fuera} descartados de ${Math.min(parsed.items.length, MAX_POR_MEDIO)} revisados\n`);
  }

  console.log("=".repeat(74));
  console.log(`  TOTAL: ${resumenGlobal.pasan} a pendientes, ${resumenGlobal.fuera} descartados de ${resumenGlobal.leidos} revisados`);
  console.log("  Nada se ha escrito en la base de datos.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  });
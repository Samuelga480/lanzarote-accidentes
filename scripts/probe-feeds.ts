/**
 * Comprueba que fuentes RSS/Atom existen de verdad y traen articulos.
 *
 *   npx tsx scripts/probe-feeds.ts
 *
 * No escribe nada. Solo dice quais responden, cuantas entradas traen y de que
 * fecha son, para no anadir al catalogo direcciones que en realidad no existen.
 */

const CANDIDATOS: Array<{ nombre: string; url: string }> = [
  // --- medios de Lanzarote ---
  { nombre: "La Voz de Lanzarote (rss)", url: "https://www.lavozdelanzarote.com/rss" },
  { nombre: "La Voz de Lanzarote (feed)", url: "https://www.lavozdelanzarote.com/rss.xml" },
  { nombre: "La Voz de Lanzarote (rss2)", url: "https://www.lavozdelanzarote.com/rss2" },
  { nombre: "La Voz de Lanzarote (wordpress)", url: "https://www.lavozdelanzarote.com/feed/" },
  { nombre: "Lanzarote Diario", url: "https://lanzarotediario.com/feed/" },
  { nombre: "El Corresponsal", url: "https://www.elcorresponsal.com/feed/" },
  { nombre: "El Día de Canarias", url: "https://www.eldia.es/feed/" },
  { nombre: "Diario de Avisos (Canarias)", url: "https://www.diariodeavisosdelanzarote.es/feed/" },
  { nombre: "Lanzarote.info", url: "https://lanzarote.info/feed/" },
  { nombre: "El Guanche", url: "https://www.elguanche.com/feed/" },
  { nombre: "El Digital de Lanzarote", url: "https://eldigitallanzarote.com/feed/" },

  // --- autonómicos y regionales, con sección de Canarias ---
  { nombre: "eldiario.es /canarias", url: "https://www.eldiario.es/lanzarote/rss" },
  { nombre: "eldiario.es /canarias", url: "https://www.eldiario.es/canarias/rss" },
  { nombre: "ABC Canarias", url: "https://www.abc.es/rss/2.2/canarias/" },
  { nombre: "ABC Canarias (efe)", url: "https://www.abc.es/rss/2.2/canarias/portada/" },
  { nombre: "La Provincia Canarias", url: "https://www.laprovincia.es/rss/canarias/" },
  { nombre: "La Provincia (portada)", url: "https://www.laprovincia.es/rss/" },
  { nombre: "El Dia Regional", url: "https://www.diariocanario.com/rss/" },
  { nombre: "Canarias Ahora", url: "https://www.canariasahora.es/rss/" },
  { nombre: "Canarias7", url: "https://www.canarias7.es/rss/" },
  { nombre: "Ef News Canarias", url: "https://efe.com/canarias/feed/" },
  { nombre: "Europa Press Canarias", url: "https://e00-efe.uecdn.es/efe/canarias/rss" },
  { nombre: "EFE (general)", url: "https://efe.com/rss" },
  { nombre: "Europa Press (general)", url: "https://e00-ue.uecdn.es/ue/rss" },
  { nombre: "elMundo Canarias", url: "https://www.elmundo.es/rss/" },
  { nombre: "El Pais Canarias", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/canarias/portada.xml" },
  { nombre: "El Pais (portada)", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais/portada.xml" },
  { nombre: "Libertad Digital", url: "https://www.libertaddigital.com/rss/" },
  { nombre: "El Confidencial", url: "https://www.elconfidencial.com/rss/" },
  { nombre: "20 minutos", url: "https://www.20minutos.es/rss/" },
  { nombre: "Huffington Post Espana", url: "https://www.huffingtonpost.es/rss" },
  { nombre: "Publico", url: "https://www.publico.es/rss" },
  { nombre: "Expansion", url: "https://rss.expansion.com/rss" },
];

const TIMEOUT = 9000;

/** Cuenta las entradas del feed, tanto si es RSS (<item>) como Atom (<entry>). */
function countEntries(body: unknown): string {
  const m = String(body).match(/<(?:item|entry)\b/g);
  return m ? String(m.length) : "0";
}

async function probar({ nombre, url }: { nombre: string; url: string }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        // Sin user-agent de navegador, muchos medios devuelven 403.
        "User-Agent": "AccidentesLanzaroteBot/2.0 (+https://accidenteslanzarote.com)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    const tipo = res.headers.get("content-type") ?? "";
    const cuerpo = await res.text();

    const esXml = /<(rss|feed|rdf:RDF)\b/i.test(cuerpo);
    const total = countEntries(cuerpo);
    const fechas = [...cuerpo.matchAll(/<(?:pubDate|published|updated|dc:date)>([^<]+)</g)]
      .map((m) => m[1].trim())
      .filter(Boolean)
      .slice(0, 2);

    return {
      nombre,
      url,
      http: res.status,
      tipo: tipo.split(";")[0],
      xml: esXml,
      total,
      fechas,
    };
  } catch (e) {
    return { nombre, url, http: 0, tipo: String((e as Error).name), xml: false, total: "0", fechas: [] as string[] };
  } finally {
    clearTimeout(t);
  }
}

Promise.all(CANDIDATOS.map(probar)).then(main);

function main(res: Awaited<ReturnType<typeof probar>>[]) {
  const ok = res.filter((r) => r.http === 200 && r.xml && r.total !== "0");
const raros = res.filter((r) => r.http === 200 && (!r.xml || r.total === "0"));
const caidos = res.filter((r) => r.http !== 200 || r.xml === false);

console.log(`\n=== FUNCIONAN (${ok.length}) ===`);
for (const r of ok) {
  console.log(`  ${r.nombre}\n    ${r.url}\n    ${r.total} entradas | ${r.fechas.join(" , ")}`);
}

console.log(`\n=== RESPONDEN PERO NO SON FEED (${raros.length}) ===`);
for (const r of raros) console.log(`  ${r.http} ${r.nombre} -> ${r.url} (${r.tipo})`);

console.log(`\n=== NO RESPONDEN (${caidos.length}) ===`);
for (const r of caidos) console.log(`  ${r.http || "-"} ${r.nombre} -> ${r.url} [${r.tipo}]`);
}

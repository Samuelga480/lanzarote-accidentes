/**
 * Carga el historico desde el 1 de enero hasta hoy.
 *
 *   npx tsx scripts/backfill.ts [desde] [hasta]
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ESTO HACE FALTA
 * ---------------------------------------------------------------------------
 *
 * Los RSS no guardan historico. El de La Voz de Lanzarote trae 75 entradas y
 * cubren unos tres dias; el de Cronicas, 20 y dos dias. Ninguno llega al 1 de
 * enero. Por eso el ciclo horario nunca encontrara el pasado: solo el presente
 * reciente.
 *
 * Para el historico hay dos puertas, y se usan segun el medio:
 *
 *   - API de WordPress: acepta ?after= y ?before=, y pagina de 100 en 100.
 *     112 Canarias y el Consorcio la tienen. Es la via buena: devuelve fecha y
 *     texto en la misma peticion.
 *   - Sitemap por mes: Cronicas publica uno comprimido por mes, con la fecha
 *     dentro. Hay que descomprimir y sacar las direcciones.
 *
 * ---------------------------------------------------------------------------
 *  NADA SE PUBLICA
 * ---------------------------------------------------------------------------
 *
 * Todo entra por `ingestArticle`, que es el pipeline de verdad: misma puerta de
 * trafico, misma deduplicacion, misma redaccion y, sobre todo, mismo destino
 * final: PENDING_REVIEW. Este script no puede publicar nada aunque se le pase un
 * parametro, porque no tiene forma de llamar a la funcion que aprueba.
 *
 * Lo que decide si algo entra es el texto, no la fecha: una noticia del 3 de
 * marzo solo se guarda si es de verdad un accidente de trafico.
 */

import { safeFetch } from "@/lib/net";
import { gunzipSync } from "node:zlib";
import { ingestArticle, type IngestOutcome } from "@/lib/ingest";
import { prisma } from "@/lib/prisma";

/* -------------------------------------------------------------------------- */
/*  Fuentes con historico                                                      */
/* -------------------------------------------------------------------------- */

type Hallazgo = { url: string; publicado: Date | null; titulo: string };

/**
 * Cada medio declara como se le pide el historico. `peso` es la fiabilidad de
 * partida: se pasa tal cual a la ingesta para que la verificacion la use.
 */
const MEDIOS: Array<{
  nombre: string;
  url: string;
  baseScore: number;
  /** Cuantas peticiones se hacen como maximo. */
  tope: number;
  buscar(desde: Date, hasta: Date): Promise<Hallazgo[]>;
}> = [
  {
    nombre: "112 Canarias",
    url: "https://www.112canarias.com/112/feed/",
    baseScore: 0.9,
    tope: 60,
    buscar: (desde, hasta) => buscarWordPress("https://www.112canarias.com/112/wp-json/wp/v2/posts", desde, hasta),
  },
  {
    nombre: "Consorcio de Seguridad y Emergencias de Lanzarote",
    url: "https://emergenciaslanzarote.com/feed/",
    baseScore: 0.95,
    tope: 40,
    buscar: (desde, hasta) => buscarWordPress("https://emergenciaslanzarote.com/wp-json/wp/v2/posts", desde, hasta),
  },
  {
    nombre: "Cronicas de Lanzarote",
    url: "https://www.cronicasdelanzarote.es/rss",
    baseScore: 0.8,
    tope: 60,
    buscar: (desde, hasta) => buscarSitemapMensual(desde, hasta),
  },
  {
    nombre: "Gobierno de Canarias - incidentes 112",
    url: "https://www3.gobiernodecanarias.org/noticias/category/consejeria-seguridad-y-emergencias/incidente-112/feed/",
    baseScore: 0.95,
    tope: 25,
    buscar: (desde, hasta) => buscarRss("https://www3.gobiernodecanarias.org/noticias/category/consejeria-seguridad-y-emergencias/incidente-112/feed/", desde, hasta),
  },
  {
    nombre: "La Voz de Lanzarote",
    url: "https://www.lavozdelanzarote.com/rss",
    baseScore: 0.85,
    tope: 20,
    buscar: (desde, hasta) => buscarRss("https://www.lavozdelanzarote.com/rss", desde, hasta),
  },
];

/* -------------------------------------------------------------------------- */
/*  Tres formas de buscar                                                      */
/* -------------------------------------------------------------------------- */

const DELEY = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Pagina la API de WordPress por rango de fechas. */
async function buscarWordPress(base: string, desde: Date, hasta: Date): Promise<Hallazgo[]> {
  const out: Hallazgo[] = [];

  for (let pagina = 1; pagina <= 40; pagina++) {
    const url =
      `${base}?per_page=100&page=${pagina}` +
      `&after=${encodeURIComponent(desde.toISOString())}` +
      `&before=${encodeURIComponent(hasta.toISOString())}`;

    const res = await safeFetch(url, { accept: "application/json" });
    if (!res.ok) break;

    let json: Array<{ date?: string; link?: string; title?: { rendered?: string } }>;
    try {
      json = JSON.parse(res.body);
    } catch {
      break;
    }
    if (!Array.isArray(json) || json.length === 0) break;

    for (const p of json) {
      if (!p.link) continue;
      out.push({
        url: p.link,
        publicado: p.date ? new Date(p.date) : null,
        titulo: (p.title?.rendered ?? "").replace(/<[^>]+>/g, "").trim(),
      });
    }
  }

  return out;
}

/**
 * Los sitemaps mensuales comprimidos de Cronicas.
 *
 * El patron es sitemap.contents.AAAA.MM.N.xml.gz, y el indice los publica todos.
 * Se recorre el indice, se eligen los meses que tocan la ventana y se
 * descomprimen.
 */
async function buscarSitemapMensual(desde: Date, hasta: Date): Promise<Hallazgo[]> {
  const indice = await safeFetch("https://www.cronicasdelanzarote.es/sitemap.xml", {
    accept: "application/xml",
  });
  if (!indice.ok) return [];

  const meses = [...indice.body.matchAll(/<loc>([^<]*sitemap\.contents\.(\d{4})\.(\d{2})\.\d+\.xml\.gz)<\/loc>/g)]
    .map((m) => ({ url: m[1], anio: Number(m[2]), mes: Number(m[3]) }))
    .filter((m) => {
      const desdeMes = desde.getUTCFullYear() * 12 + desde.getUTCMonth();
      const hastaMes = hasta.getUTCFullYear() * 12 + hasta.getUTCMonth();
      const mes = m.anio * 12 + m.mes;
      return mes >= desdeMes && mes <= hastaMes;
    })
    .sort((a, b) => a.anio * 12 + a.mes - (b.anio * 12 + b.mes));

  const out: Hallazgo[] = [];

  for (const m of meses) {
    /*
      `binary: true` es obligatorio. Un `.gz` no es un documento de texto: si el
      cuerpo se decodifica como UTF-8, los bytes invalidos se convierten en
      U+FFFD, la cabecera gzip deja de ser `1f 8b` y `gunzipSync` falla con
      "incorrect header check". Con `binary: true` llega crudo y se descomprime
      bien.
    */
    const res = await safeFetch(m.url, {
      accept: "application/xml, application/gzip",
      binary: true,
    });
    if (!res.ok || !res.bytes) continue;

    let xml: string;
    try {
      xml = gunzipSync(res.bytes).toString("utf8");
    } catch {
      continue;
    }

    for (const bloque of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
      const url = /<loc>([^<]+)<\/loc>/.exec(bloque)?.[1];
      if (!url) continue;

      const mod = /<lastmod>([^<]+)<\/lastmod>/.exec(bloque)?.[1] ?? null;
      const publicado = mod ? new Date(mod) : null;

      if (publicado && (publicado < desde || publicado > hasta)) continue;
      out.push({ url, publicado, titulo: "" });
    }
  }

  return out;
}

/** Lee el RSS y se queda con lo que cae dentro de la ventana. */
async function buscarRss(url: string, desde: Date, hasta: Date): Promise<Hallazgo[]> {
  const res = await safeFetch(url, {
    accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5",
  });
  if (!res.ok) return [];

  const out: Hallazgo[] = [];

  for (const bloque of res.body.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const enlace = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/.exec(bloque)?.[1]?.trim();
    if (!enlace) continue;

    const titulo = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(bloque)?.[1]?.trim() ?? "";
    const fechaTxt = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(bloque)?.[1]?.trim() ?? "";
    const publicado = fechaTxt ? new Date(fechaTxt) : null;

    if (publicado && (publicado < desde || publicado > hasta)) continue;
    out.push({ url: enlace, publicado: Number.isNaN(publicado?.getTime() ?? NaN) ? null : publicado, titulo });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  Programa principal                                                        */
/* -------------------------------------------------------------------------- */

async function main() {
  const hoy = new Date();

  // El 1 de enero del ano en curso, a las 00:00 en Canarias.
  const desde = process.argv[2]
    ? new Date(process.argv[2])
    : new Date(Date.UTC(hoy.getUTCFullYear(), 0, 1, 0, 0, 0));
  const hasta = process.argv[3] ? new Date(process.argv[3]) : hoy;

  console.log(`\n  Ventana: ${desde.toISOString().slice(0, 10)} -> ${hasta.toISOString().slice(0, 10)}`);
  console.log("  Todo lo que pase el filtro queda como PENDING_REVIEW. Nada se publica.\n");

  const totales = { leidos: 0, borradores: 0, duplicados: 0, descartados: 0, errores: 0 };

  for (const medio of MEDIOS) {
    console.log("=".repeat(72));
    console.log(`  ${medio.nombre}`);
    console.log("=".repeat(72));

    const encontrados = await medio.buscar(desde, hasta);
    console.log(`  ${encontrados.length} direcciones en la ventana`);

    let n = 0;
    for (const h of encontrados.slice(0, medio.tope)) {
      n++;
      totales.leidos++;

      let r: IngestOutcome;
      try {
        r = await ingestArticle({
          url: h.url,
          source: {
            name: medio.nombre,
            url: medio.url,
            baseScore: medio.baseScore,
            consecutiveFailures: 0,
            successRate: 0.8,
          },
          feedPublishedAt: h.publicado,
          feedSummary: "",
          feedImageUrl: null,
        });
      } catch (e) {
        totales.errores++;
        console.log(`  ! ${n}/${encontrados.length} fallo: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      if (r.kind === "draft") {
        totales.borradores++;
        console.log(`  + [${h.publicado?.toISOString().slice(0, 10) ?? "?"}] ${r.title}`);
      } else if (r.kind === "duplicate") {
        totales.duplicados++;
        console.log(`  = ya estaba (fusionada en ${r.reason})`);
      } else if (r.kind === "rejected") {
        totales.descartados++;
        console.log(`  x ${r.reason}`);
      } else {
        totales.descartados++;
        console.log(`  - ${r.reason}`);
      }
    }

    if (encontrados.length > medio.tope) {
      console.log(`\n  (se procesaron ${medio.tope} de ${encontrados.length}; el resto, en otra pasada)`);
    }
    console.log("");
  }

  const pendientes = await prisma.accident.count({ where: { status: "PENDING_REVIEW" } });
  const publicadas = await prisma.accident.count({ where: { status: "PUBLISHED" } });

  console.log("=".repeat(72));
  console.log(`  Revisados      : ${totales.leidos}`);
  console.log(`  Borradores     : ${totales.borradores}`);
  console.log(`  Duplicados     : ${totales.duplicados}`);
  console.log(`  Descartados    : ${totales.descartados}`);
  console.log(`  Errores        : ${totales.errores}`);
  console.log(`\n  Ahora mismo hay ${pendientes} pendiente(s) de revisar y ${publicadas} publicada(s).`);
  console.log("  Los pendientes se aprueban en /admin. Ahi se publica.");

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
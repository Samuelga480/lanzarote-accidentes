import dotenv from "dotenv";

// Next.js carga .env.local automáticamente, pero un script con tsx no. Sin esto,
// `npm run monitor:once` fallaría con "Falta DATABASE_URL" aunque el .env
// exista. Se cargan en este orden: .env.local gana sobre .env, igual que en
// Next, porque el primero es el que se usa en desarrollo.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { runCycle, syncFeeds } from "@/lib/monitor";
import { validateEnvironment, configSummary, siteUrl } from "@/lib/env";
import { FEEDS, contentTypeLooksXml } from "@/lib/feeds";
import { safeFetch } from "@/lib/net";
import { parseFeed } from "@/lib/rss";
import { prisma } from "@/lib/prisma";

/**
 * Ejecuta UN ciclo de monitorizacion y termina.
 *
 * Es el comando para probar el sistema desde la consola antes de montar el
 * cron:
 *
 *   npm run monitor:once
 *
 * Con `--check-feeds` solo comprueba las URLs de las fuentes y no crea nada.
 * Es lo que hay que ejecutar al anadir una fuente nueva.
 *
 * En produccion esto NO se usa: el ciclo lo dispara el cron externo llamando a
 * GET /api/cron/monitor.
 *
 * TODO va dentro de main() porque `tsx` compila este proyecto como CommonJS
 * (package.json no declara "type": "module"), y el CommonJS no admite `await`
 * en el nivel superior. Con el codigo suelto aqui, el comando fallaba con
 * "Top-level await is currently not supported with the cjs output format".
 */

type Mode = "cycle" | "check-feeds" | "stats";
const mode: Mode = process.argv.includes("--check-feeds")
  ? "check-feeds"
  : process.argv.includes("--stats")
    ? "stats"
    : "cycle";

function header(title: string): void {
  process.stdout.write(`\n${"=".repeat(66)}\n${title}\n${"=".repeat(66)}\n`);
}

function write(text: string): void {
  process.stdout.write(text);
}

/* -------------------------------------------------------------------------- */
/*  Comprobacion de fuentes                                                    */
/* -------------------------------------------------------------------------- */

async function checkFeeds(): Promise<number> {
  header("Comprobación de fuentes");

  let anyOk = 0;

  for (const feed of FEEDS) {
    write(`\n${feed.name}\n  ${feed.url}\n`);

    const response = await safeFetch(feed.url, {
      accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.5",
    });

    if (!response.ok) {
      write(`  ✗ Descarga fallida: ${response.error}\n`);
      continue;
    }

    write(`  HTTP ${response.status} · ${response.durationMs} ms\n`);
    write(`  Content-Type: ${response.contentType ?? "(ninguno)"}\n`);

    if (!contentTypeLooksXml(response.contentType)) {
      write(
        `  ✗ NO es un feed XML. La URL responde HTML. Una pagina HTML con codigo 200\n` +
          `    es el fallo mas dificil de detectar: el sistema cree que no hay noticias.\n`,
      );
      continue;
    }

    const parsed = parseFeed(response.body, feed.name);
    if (!parsed.valid) {
      write(`  ✗ ${parsed.error}\n`);
      continue;
    }

    const withDate = parsed.items.filter((i) => i.publishedAt).length;
    const newest = parsed.items
      .map((i) => i.publishedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    write(`  ✓ Feed válido: ${parsed.items.length} items\n`);
    write(`    Con fecha: ${withDate}\n`);
    if (newest) {
      const ageHours = (Date.now() - newest.getTime()) / 3_600_000;
      write(
        `    Más reciente: hace ${Math.round(ageHours)} h` +
          (ageHours > 72 ? "  <- AVISO: mas de 3 dias, el feed puede estar parado\n" : "\n"),
      );
    }
    if (parsed.items.length === 0) {
      write(`  ! Feed válido pero sin items\n`);
    }

    const sample = parsed.items.slice(0, 3);
    if (sample.length > 0) {
      write(`  Ejemplos:\n`);
      for (const item of sample) {
        write(`    · ${item.title.slice(0, 70)}\n`);
        write(`      ${item.url.slice(0, 80)}\n`);
        write(
          `      fecha: ${item.publishedAt?.toISOString() ?? "sin fecha"} · imagen: ${item.imageUrl ? "si" : "no"}\n`,
        );
      }
    }

    anyOk++;
  }

  write(
    anyOk > 0
      ? `\n${anyOk} de ${FEEDS.length} fuentes operativas.\n\n`
      : `\nNinguna fuente responde correctamente.\n\n`,
  );
  return anyOk > 0 ? 0 : 1;
}

/* -------------------------------------------------------------------------- */
/*  Estado del sistema                                                         */
/* -------------------------------------------------------------------------- */

async function showStats(): Promise<number> {
  header("Estado del sistema");

  const [feeds, pending, published, rejected, cycles] = await Promise.all([
    prisma.feedSource.findMany({
      select: {
        name: true, status: true, enabled: true, lastOkAt: true,
        lastError: true, consecutiveFailures: true,
      },
    }),
    prisma.accident.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.accident.count({ where: { status: "PUBLISHED" } }),
    prisma.accident.count({ where: { status: "REJECTED" } }),
    prisma.scrapeRun.findMany({
      where: { feedSourceId: null },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
  ]);

  write(`\nFuentes:\n`);
  for (const f of feeds) {
    const mark = f.status === "OK" ? "v" : f.status === "FAILING" ? "x" : "!";
    write(`  ${mark} ${f.name} [${f.status}]`);
    if (f.consecutiveFailures > 0) write(` (${f.consecutiveFailures} fallos)`);
    write("\n");
    if (f.lastError) write(`      ${f.lastError.slice(0, 80)}\n`);
  }

  write(`\nNoticias:\n`);
  write(`  Pendientes:  ${pending}\n`);
  write(`  Publicadas:  ${published}\n`);
  write(`  Descartadas: ${rejected}\n`);

  write(`\nUltimos ciclos:\n`);
  for (const c of cycles) {
    write(
      `  ${c.startedAt.toISOString()}  ${c.ok ? "OK " : "ERR"}  ` +
        `${Math.round(c.durationMs / 1000)}s  leidos=${c.itemsFound} nuevos=${c.itemsNew} dup=${c.itemsDuplicate}\n`,
    );
  }
  if (cycles.length === 0) write(`  (ninguno)\n`);

  write("\n");
  return 0;
}

/* -------------------------------------------------------------------------- */
/*  Ciclo completo                                                            */
/* -------------------------------------------------------------------------- */

async function runFullCycle(): Promise<number> {
  header("Ciclo de monitorización");

  const synced = await syncFeeds();
  if (synced > 0) {
    write(`\n${synced} fuente(s) sincronizada(s) con la base de datos.\n`);
  }

  const result = await runCycle("MANUAL");

  write("\n-- Resultado --\n");
  write(`  Fuentes revisadas:     ${result.feedsChecked}\n`);
  write(`  Fuentes con error:     ${result.feedsFailed}\n`);
  write(`  Items leidos:          ${result.itemsFound}\n`);
  write(`  Borradores nuevos:     ${result.draftsCreated}\n`);
  write(`  Duplicados fusionados: ${result.duplicatesMerged}\n`);
  write(`  Descartados:           ${result.rejected}\n`);
  write(`  Omitidos:              ${result.skipped}\n`);
  write(`  Duracion:              ${Math.round(result.durationMs / 1000)} s\n`);

  if (result.errors.length > 0) {
    write(`\n-- Errores --\n`);
    for (const e of result.errors) write(`  x ${e}\n`);
  }

  if (result.draftsCreated > 0) {
    write(`\n${result.draftsCreated} noticia(s) esperando revision en ${siteUrl()}/admin\n`);
  }
  write("\n");

  return result.ok ? 0 : 1;
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const env = validateEnvironment();

  header("Configuración");

  // Solo se detiene si falta algo imprescindible para ARRANCAR. Que falte
  // CRON_SECRET no impide que la web funcione: solo deja la monitorizacion
  // desactivada, y eso ya se avisa como advertencia.
  const fatal = env.errors.filter((e) => !/CRON_SECRET|OPENROUTER|NOTIFY/i.test(e));

  if (fatal.length > 0) {
    write("\nERRORES DE CONFIGURACIÓN:\n");
    for (const e of fatal) write(`  x ${e}\n`);
    write("\nRevisa el fichero .env. Nada se ha ejecutado.\n\n");
    process.exit(1);
  }

  if (fatal.length === 0 && env.errors.length > 0) {
    write("\nAvisos:\n");
    for (const e of env.errors) write(`  ! ${e}\n`);
  }
  for (const w of env.warnings) {
    write(`  ! ${w}\n`);
  }

  write(`\n  Sitio:  ${siteUrl()}\n`);
  write(`  Config: ${JSON.stringify(configSummary())}\n\n`);

  switch (mode) {
    case "check-feeds":
      process.exit(await checkFeeds());
      break;
    case "stats":
      process.exit(await showStats());
      break;
    default:
      process.exit(await runFullCycle());
  }
}

main()
  .catch(async (err) => {
    console.error("\nEl comando ha fallado:", err);
    // El mensaje mas util casi siempre es la causa raiz: "no such table",
    // "connection refused", "password authentication failed".
    if (err instanceof Error && err.cause) {
      console.error("Causa:", err.cause);
    }
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect().catch(() => {});
  });
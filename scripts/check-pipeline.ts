import { prisma } from "@/lib/prisma";

/**
 * Estado de la cadena de deteccion.
 *
 * Comprueba, uno a uno, los eslabones que tienen que funcionar para que una
 * noticia llegue a la lista de pendientes: fuentes dadas de alta, noticias en
 * distintos estados, ejecuciones del monitor y borradores de IA.
 */
async function main() {
  const [fuentes, porEstado, porOrigen, runs, conFoto, conHash] = await Promise.all([
    prisma.feedSource.findMany({
      select: {
        name: true,
        url: true,
        kind: true,
        enabled: true,
        status: true,
        failureCount: true,
        lastRunAt: true,
        lastOkAt: true,
        lastError: true,
      },
    }),
    prisma.accident.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.accident.groupBy({ by: ["origin"], _count: { _all: true } }),
    prisma.scrapeRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        trigger: true,
        startedAt: true,
        ok: true,
        error: true,
        itemsFound: true,
        itemsNew: true,
        itemsDuplicate: true,
        draftsCreated: true,
      },
    }),
    prisma.accident.count({ where: { imageUrl: { not: null } } }),
    prisma.accident.count({ where: { contentHash: { not: null } } }),
  ]);

  console.log("\n=== 1. FUENTES RSS DADAS DE ALTA ===");
  if (fuentes.length === 0) {
    console.log("  NINGUNA. Sin fuentes no se detecta nada.");
  } else {
    for (const f of fuentes) {
      console.log(`  ${f.enabled ? "activa " : "apagada"} | ${f.name} (${f.kind})`);
      console.log(`    estado: ${f.status} | fallos seguidos: ${f.failureCount}`);
      console.log(`    ${f.url}`);
      console.log(`    ultima pasada: ${f.lastRunAt?.toISOString() ?? "nunca"}`);
      console.log(`    ultima buena: ${f.lastOkAt?.toISOString() ?? "nunca"}`);
      if (f.lastError) console.log(`    ultimo error: ${f.lastError}`);
    }
  }

  console.log("\n=== 2. NOTICIAS POR ESTADO ===");
  if (porEstado.length === 0) console.log("  ninguna");
  for (const e of porEstado) console.log(`  ${e.status}: ${e._count._all}`);

  console.log("\n=== 3. ORIGEN ===");
  for (const e of porOrigen) console.log(`  ${e.origin}: ${e._count._all}`);

  console.log("\n=== 4. ULTIMAS EJECUCIONES DEL MONITOR ===");
  if (runs.length === 0) console.log("  NINGUNA. El cron nunca ha corrido.");
  for (const r of runs) {
    console.log(`  ${r.startedAt.toISOString()} (${r.trigger}) ok=${r.ok}`);
    console.log(
      `    encontradas ${r.itemsFound} | nuevas ${r.itemsNew} | duplicadas ${r.itemsDuplicate} | borradores ${r.draftsCreated}`,
    );
    if (r.error) console.log(`    error: ${r.error}`);
  }

  console.log("\n=== 5. TRABAJO DE LA CADENA ===");
  console.log(`  noticias con hash de contenido: ${conHash}`);
  console.log(`  noticias con foto:              ${conFoto}`);

  console.log("\n=== 6. LLAVES QUE FALTAN EN EL ENTORNO ===");
  const clave = (n: string) => (process.env[n] ? "puesta" : "FALTA");
  console.log(`  OPENROUTER_API_KEY (reescritura): ${clave("OPENROUTER_API_KEY")}`);
  console.log(`  CRON_SECRET        (cron):        ${clave("CRON_SECRET")}`);
  console.log(`  IMAGE_STORAGE_DIR  (fotos):       ${clave("IMAGE_STORAGE_DIR")}`);
  console.log(`  ADMIN_PASSWORD     (panel):       ${clave("ADMIN_PASSWORD")}`);
  console.log("");
}

main()
  .catch((e) => {
    console.error("Error:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
/**
 * Diagnostico de la conexion: comprueba que variable DATABASE_URL se esta
 * usando de verdad, sin imprimirla entera.
 *
 *   npx tsx scripts/db-check.ts
 */

import dotenv from "dotenv";

// .env.production tiene prioridad. El segundo no sobreescribe el primero, asi
// que el orden importa: si se cargara al reves, ganaria el .env local con la
// URL de localhost.
dotenv.config({ path: ".env.production" });
dotenv.config({ path: ".env" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Muestra solo la parte que no es secreta: host y base de datos. */
function describe(url: string | undefined): string {
  if (!url) return "(vacia)";
  try {
    const u = new URL(url.replace(/^postgres(ql)?:\/\//, "https://"));
    return `host=${u.hostname}  base=${u.pathname.replace(/^\//, "") || "(ninguna)"}  longitud=${url.length}`;
  } catch {
    return `(no se puede analizar, longitud=${url.length})`;
  }
}

async function main() {
  console.log(`  DATABASE_URL en el entorno: ${describe(process.env.DATABASE_URL)}`);
  console.log(`  sslmode presente: ${process.env.DATABASE_URL?.includes("sslmode") ?? false}`);
  console.log(`  PGHOST alternativo:   ${describe(process.env.PGHOST)}`);

  try {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    console.log(`\n  Tablas en el esquema public: ${tables.length}`);
    for (const t of tables) console.log(`    - ${t.table_name}`);

    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null }>>(
        'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at',
      );
      console.log(`\n  Migraciones registradas: ${rows.length}`);
      for (const r of rows) {
        console.log(`    - ${r.migration_name}  ${r.finished_at ? "aplicada" : "SIN TERMINAR"}`);
      }
    } catch {
      console.log("\n  (no existe la tabla _prisma_migrations)");
    }
  } catch (err) {
    console.error("\n  error al consultar:", err instanceof Error ? err.message : String(err));
  }
}

main()
  .catch((err) => console.error(err))
  .finally(() => prisma.$disconnect());
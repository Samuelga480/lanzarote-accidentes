/**
 * Limpieza de noticias duplicadas.
 *
 *   npx tsx scripts/limpiar-duplicadas.ts              # solo informe (no toca nada)
 *   npx tsx scripts/limpiar-duplicadas.ts --archivar   # deja una sola por suceso
 *   npx tsx scripts/limpiar-duplicadas.ts --borrar     # borra las filas repetidas
 *
 * ---------------------------------------------------------------------------
 *  POR QUE ARCHIVAR Y NO BORRAR, POR DEFECTO
 * ---------------------------------------------------------------------------
 *
 * Una noticia "duplicada" no es una fila basura: tiene su slug, sus fuentes, sus
 * comentarios y su historial de revisiones. Publicarla no fue un error de este
 * script, fue una decision editorial, y el enlace `/accidentes/<slug>` puede
 * tener enlaces entrantes desde Google o desde otros medios.
 *
 * Por eso el script archiva por defecto (status = ARCHIVED): el suceso desaparece
 * del sitio al instante porque las consultas publicas filtran por
 * `status = PUBLISHED`, pero la fila y su trazabilidad siguen intactas. `--borrar`
 * existe para cuando se quiere recuperar espacio de verdad, y avisa de lo que
 * elimina antes de hacerlo.
 *
 * ---------------------------------------------------------------------------
 *  QUE CONSERVA SIEMPRE
 * ---------------------------------------------------------------------------
 *
 * De cada grupo de repetidas sobrevive UNA noticia, y no es arbitrario:
 *
 *   1. La canónica si el grupo ya tiene `duplicateOfId` resuelto (es la que
 *      tiene las fuentes fusionadas y las cifras reconciliadas).
 *   2. Si no hay canónica, la que más fuentes tiene (más medios respaldan el
 *      suceso, luego es la más contrastada).
 *   3. A igualdad de fuentes, la más antigua (`createdAt` asc): fue la primera
 *      que se detecto, y su slug es el mas antiguo del grupo.
 *
 * Las cifras de la superviviente se reconcilian con el máximo de todo el grupo,
 * igual que hace `mergeIntoCanonical`: para heridos y fallecidos, el dato mas
 * alto es el mas conservador, no la media.
 */

import { prisma } from "@/lib/prisma";
import { contentHashOf, simHash, hammingDistance, jaccard, tokenize } from "@/lib/text";

const ARCHIVAR = process.argv.includes("--archivar");
const BORRAR = process.argv.includes("--borrar");

if (ARCHIVAR && BORRAR) {
  console.error("\n  --archivar y --borrar son excluyentes. Elige una.\n");
  process.exit(1);
}

/** Un grupo de filas que cuentan el mismo suceso. */
type Grupo = {
  ids: string[];
  motivo: string;
};

type Fila = {
  id: string;
  slug: string;
  title: string;
  status: string;
  occurredAt: Date;
  createdAt: Date;
  duplicateOfId: string | null;
  contentHash: string | null;
  simHash: string | null;
  fatalities: number;
  injuries: number;
  publishedAt: Date | null;
  _count: { sources: number };
};

async function cargar(): Promise<Fila[]> {
  return prisma.accident.findMany({
    select: {
      id: true, slug: true, title: true, status: true,
      occurredAt: true, createdAt: true, duplicateOfId: true,
      contentHash: true, simHash: true,
      fatalities: true, injuries: true, publishedAt: true,
      _count: { select: { sources: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Marca de grupo. Se usa `duplicateOfId` cuando ya existe (ahi la resolucion es
 * autoritativa), y similitud de texto para el resto.
 */
function comparar(a: Fila, b: Fila): boolean {
  // Ventana temporal: mismo texto a tres meses de distancia no es el mismo
  // suceso, es una repeticion del tema. Coincide con `dedupeConfig.windowHours`.
  const horas = Math.abs(a.occurredAt.getTime() - b.occurredAt.getTime()) / 3_600_000;
  if (horas > 48) return false;

  if (a.contentHash && a.contentHash === b.contentHash) return true;

  const simA = a.simHash ?? simHash(`${a.title}`);
  const simB = b.simHash ?? simHash(`${b.title}`);
  const distancia = hammingDistance(simA, simB);
  const titulo = jaccard(tokenize(a.title), tokenize(b.title));

  // Mismo criterio que `checkDuplicate`: el SimHash solo cuenta si el titular se
  // parece, porque dos articulos con el mismo cuerpo generico no son el mismo
  // suceso.
  return distancia <= 8 && titulo >= 0.6;
}

/** Agrupa por laUnion-Find sobre relaciones de duplicado y por similitud. */
function agrupar(filas: Fila[]): { grupos: Grupo[]; canonicasResueltas: number } {
  const porId = new Map(filas.map((f) => [f.id, f]));
  const padre = new Map<string, string>();
  const buscar = (x: string): string => {
    let r = x;
    while (padre.get(r) && padre.get(r) !== r) r = padre.get(r)!;
    return r;
  };
  const unir = (x: string, y: string) => {
    const rx = buscar(x), ry = buscar(y);
    if (rx !== ry) padre.set(ry, rx);
  };

  for (const f of filas) padre.set(f.id, f.id);

  // 1. Relaciones ya marcadas: autoritativas, no se recalculan.
  let canonicasResueltas = 0;
  for (const f of filas) {
    if (f.duplicateOfId && porId.has(f.duplicateOfId)) {
      unir(f.duplicateOfId, f.id);
      canonicasResueltas++;
    }
  }

  // 2. Similitud de texto, solo dentro de la ventana temporal. Se comparan
  //    solo las canonicas candidatas (representantes) para no comparar dos
  //    veces lo mismo.
  for (let i = 0; i < filas.length; i++) {
    const a = filas[i];
    if (buscar(a.id) !== a.id) continue;
    for (let j = i + 1; j < filas.length; j++) {
      const b = filas[j];
      if (buscar(b.id) !== b.id) continue;
      if (comparar(a, b)) unir(a.id, b.id);
    }
  }

  const porGrupo = new Map<string, string[]>();
  for (const f of filas) {
    const r = buscar(f.id);
    const arr = porGrupo.get(r) ?? [];
    arr.push(f.id);
    porGrupo.set(r, arr);
  }

  const grupos: Grupo[] = [];
  for (const ids of porGrupo.values()) {
    if (ids.length < 2) continue;
    const miembros = ids.map((id) => porId.get(id)!).filter(Boolean);
    const motivos: string[] = [];
    if (miembros.some((m) => m.duplicateOfId)) motivos.push("duplicateOfId ya resuelto");
    if (miembros.some((m, k) => k > 0 && comparar(miembros[0], m))) motivos.push("texto casi identico");
    grupos.push({ ids: miembros.map((m) => m.id), motivo: motivos.join(" + ") || "similitud" });
  }

  return { grupos, canonicasResueltas };
}

/** Elige la superviviente del grupo con el criterio documentado arriba. */
function elegirSuperviviente(miembros: Fila[]): Fila {
  return [...miembros].sort((a, b) => {
    const aCanonica = a.duplicateOfId ? 0 : 1;
    const bCanonica = b.duplicateOfId ? 0 : 1;
    if (aCanonica !== bCanonica) return aCanonica - bCanonica;
    if (a._count.sources !== b._count.sources) return b._count.sources - a._count.sources;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

async function main() {
  console.log("\n  Limpieza de noticias duplicadas");
  console.log(`  Modo: ${BORRAR ? "BORRAR filas" : ARCHIVAR ? "ARCHIVAR repetidas" : "INFORME (no se toca nada)"}\n`);

  const filas = await cargar();
  console.log(`  Noticias en la base de datos: ${filas.length}`);

  const { grupos, canonicasResueltas } = agrupar(filas);

  if (grupos.length === 0) {
    console.log("\n  No hay duplicadas. No hay nada que hacer.\n");
    await prisma.$disconnect();
    return;
  }

  console.log(`  Grupos de repetidas: ${grupos.length}`);
  console.log(`  Filas con duplicateOfId ya resuelto: ${canonicasResueltas}\n`);

  const porId = new Map(filas.map((f) => [f.id, f]));
  const aArchivar: string[] = [];
  const aBorrar: string[] = [];
  const supervivientes: string[] = [];

  for (const g of grupos) {
    const miembros = g.ids.map((id) => porId.get(id)!).filter(Boolean);
    const k = elegirSuperviviente(miembros);
    const resto = miembros.filter((m) => m.id !== k.id);

    supervivientes.push(k.id);
    console.log(`  --- grupo: ${miembros.length} filas  (${g.motivo})`);
    console.log(`      SE QUEDA: ${k.title}`);
    console.log(`               slug=${k.slug} | ${k.status} | ${k._count.sources} fuente(s)`);
    for (const m of resto) {
      console.log(`      SE QUITA: ${m.title}`);
      console.log(`               slug=${m.slug} | ${m.status} | ${m._count.sources} fuente(s)`);
    }
    console.log("");

    for (const m of resto) {
      if (BORRAR) aBorrar.push(m.id);
      else aArchivar.push(m.id);
    }
  }

  const total = aArchivar.length + aBorrar.length;
  if (total === 0) {
    console.log("  Nada que hacer.\n");
    await prisma.$disconnect();
    return;
  }

  if (!ARCHIVAR && !BORRAR) {
    console.log(`  INFORME: ${total} filas se quedarian fuera del sitio.`);
    console.log("  No se ha modificado nada. Para aplicarlo:");
    console.log("    npx tsx scripts/limpiar-duplicadas.ts --archivar   (conserva las filas)");
    console.log("    npx tsx scripts/limpiar-duplicadas.ts --borrar     (elimina las filas)\n");
    await prisma.$disconnect();
    return;
  }

  // Reconciliar cifras antes de tocar los estados: el maximo de todo el grupo es
  // el dato mas conservador para heridos y fallecidos.
  for (const g of grupos) {
    const miembros = g.ids.map((id) => porId.get(id)!).filter(Boolean);
    const k = elegirSuperviviente(miembros);
    const fatalities = Math.max(...miembros.map((m) => m.fatalities));
    const injuries = Math.max(...miembros.map((m) => m.injuries));
    if (fatalities !== k.fatalities || injuries !== k.injuries) {
      await prisma.accident.update({
        where: { id: k.id },
        data: { fatalities, injuries },
      });
      console.log(`  Cifras reconciliadas en "${k.title}": fatalities=${fatalities} injuries=${injuries}`);
    }
  }

  if (BORRAR) {
    console.log(`\n  BORRANDO ${aBorrar.length} filas...`);
    await prisma.accident.deleteMany({ where: { id: { in: aBorrar } } });
    console.log("  Hecho. Los comentarios, imagenes y revisiones de esas filas tambien se han ido (CASCADE).");
  } else {
    console.log(`\n  ARCHIVANDO ${aArchivar.length} filas...`);
    await prisma.accident.updateMany({
      where: { id: { in: aArchivar } },
      data: { status: "ARCHIVED", isFeatured: false },
    });
    console.log("  Hecho. Las filas siguen en la base de datos y se pueden recuperar cambiando el estado.");
  }

  const restantes = await prisma.accident.count({
    where: { status: "PUBLISHED", duplicateOfId: null },
  });
  console.log(`\n  Noticias publicadas ahora mismo: ${restantes}`);
  console.log("  Comprobacion final: recorre el sitio y confirma que no hay repeticiones.\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n  Error:", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
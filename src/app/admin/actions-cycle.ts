/**
 * Ejecucion manual de un ciclo de monitorizacion, para el boton "Buscar ahora"
 * de /admin/fuentes.
 *
 * En produccion el ciclo lo dispara el cron externo. Este boton existe para no
 * tener que esperar hasta el siguiente minuto cuando se quiere comprobar si una
 * fuente nueva ya responde.
 */

"use server";

import { revalidatePath } from "next/cache";
import { runCycle } from "@/lib/monitor";
import { requireAuth } from "@/lib/auth-guard";
import { audit } from "@/lib/logger";

/** Estado que devuelve la accion y que el formulario muestra. */
export type CycleActionState = {
  ok: boolean;
  message: string;
  drafts?: number;
  duplicates?: number;
  feedsFailed?: number;
  locked?: boolean;
};

/**
 * Se usa `useActionState`, no `action`, porque la accion devuelve un estado
 * para mostrar en pantalla. `requireAuth()` sigue dentro de la accion: la
 * comprobacion de sesion no debe depender de quien la invoca.
 */
export async function runCycleAction(
  _prev: CycleActionState | null,
  _formData: FormData,
): Promise<CycleActionState> {
  const actor = await requireAuth();

  try {
    const result = await runCycle("MANUAL");

    await audit({
      actor,
      action: "INGEST",
      entity: "cycle",
      detail: {
        manual: true,
        drafts: result.draftsCreated,
        durationMs: result.durationMs,
      },
    });

    revalidatePath("/admin");
    revalidatePath("/admin/fuentes");

    if (result.locked) {
      return {
        ok: true,
        locked: true,
        message: "Ya hay un ciclo en marcha. Espera a que termine antes de lanzar otro.",
      };
    }

    const parts = [
      `${result.draftsCreated} borrador(es) nuevo(s)`,
      `${result.duplicatesMerged} duplicado(s) fusionado(s)`,
      `${result.itemsFound} item(s) leido(s)`,
    ];

    const message =
      result.errors.length > 0
        ? `Ciclo terminado con avisos: ${parts.join(", ")}. ${result.errors[0]}`
        : `Ciclo completado: ${parts.join(", ")}.`;

    return {
      ok: result.ok,
      message,
      drafts: result.draftsCreated,
      duplicates: result.duplicatesMerged,
      feedsFailed: result.feedsFailed,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "No se pudo ejecutar el ciclo.",
    };
  }
}
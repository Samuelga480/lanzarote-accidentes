import { NextResponse, type NextRequest } from "next/server";
import { runCycle, type CycleResult } from "@/lib/monitor";
import { monitorConfig } from "@/lib/env";
import { isAuthorized } from "@/lib/cron-auth";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * GET /api/cron/monitor
 *
 * Dispara UN ciclo de monitorizacion. Es lo que llama el cron externo cada
 * minuto.
 *
 * El requisito era "cada minuto". Un `* * * * *` en un Unix normal lo cumple,
 * pero Render tiene dos limitaciones que lo convierten en algo poco fiable:
 * las instancias gratuitas se duermen tras 15 minutos sin trafico (una
 * instancia dormida no ejecuta el cron) y el cron nativo de Render solo existe
 * en planes de pago. Un cron externo (cron-job.org, EasyCron, un GitHub Action
 * programado, un Upstash QStash) llama a esta URL y el problema desaparece.
 *
 * SEGURIDAD:
 *   - Sin CRON_SECRET en el entorno, devuelve 503 y no hace nada. Un despliegue
 *     mal configurado no deja el sistema abierto.
 *   - Con CRON_SECRET definido, acepta `Authorization: Bearer <secreto>` o
 *     `?secret=<secreto>` (los servicios de cron externos suelen permitir el
 *     segundo). La comparacion es en tiempo constante.
 *   - El ciclo tiene un cerrojo en la base de datos: si dos llamadas llegan a la
 *     vez, la segunda responde 200 con `locked: true` sin hacer nada.
 *
 * POST hace exactamente lo mismo, para los servicios que solo permiten POST.
 */

async function handle(request: NextRequest, trigger: "CRON" | "MANUAL"): Promise<NextResponse> {
  const secret = monitorConfig.cronSecret();

  if (!secret) {
    log.warn("Intento de monitorizacion sin CRON_SECRET configurado");
    return NextResponse.json(
      {
        error:
          "Monitorizacion deshabilitada. Define CRON_SECRET (minimo 24 caracteres) en el entorno para activarla.",
      },
      { status: 503 },
    );
  }

  const authorized = isAuthorized({
    authorization: request.headers.get("authorization"),
    searchSecret: request.nextUrl.searchParams.get("secret"),
    expected: secret,
  });

  if (!authorized) {
    log.warn("Intento de monitorizacion no autorizado", {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    });
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let result: CycleResult;
  try {
    result = await runCycle(trigger);
  } catch (err) {
    log.error("El ciclo lanzo una excepcion no controlada", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "El ciclo fallo de forma inesperada." }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: result.ok,
      locked: result.locked,
      startedAt: result.startedAt,
      durationMs: result.durationMs,
      feeds: { checked: result.feedsChecked, failed: result.feedsFailed },
      items: {
        found: result.itemsFound,
        newDrafts: result.draftsCreated,
        duplicatesMerged: result.duplicatesMerged,
        rejected: result.rejected,
        skipped: result.skipped,
      },
      errors: result.errors,
      notice: "Las noticias nuevas quedan como PENDING_REVIEW. Ninguna se publica sin aprobacion.",
    },
    { status: result.ok || result.locked ? 200 : 207 },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request, "CRON");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request, "MANUAL");
}
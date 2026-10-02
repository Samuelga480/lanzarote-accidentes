import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateEnvironment, aiConfig, notifyConfig, monitorConfig, siteUrl, emailVerifyConfig } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health
 *
 * Sonda de salud para Render, para un monitor externo y para comprobar el
 * despliegue a mano. Sin autenticacion: no revela ningun dato sensible, solo si
 * cada pieza responde.
 *
 * Devuelve 503 si la base de datos no contesta, porque en ese caso la web no
 * puede funcionar y Render debe reiniciar el servicio.
 */
export async function GET(): Promise<NextResponse> {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // --- Base de datos ---
  let dbOk = false;
  let dbDetail: string | undefined;
  let pendingCount = 0;
  let lastRunAt: string | null = null;

  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    dbDetail = `${Date.now() - started} ms`;

    pendingCount = await prisma.accident.count({ where: { status: "PENDING_REVIEW" } });

    const last = await prisma.scrapeRun.findFirst({
      where: { feedSourceId: null },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    lastRunAt = last?.startedAt.toISOString() ?? null;
  } catch (err) {
    dbDetail = err instanceof Error ? err.message : String(err);
  }

  checks.database = { ok: dbOk, detail: dbDetail };

  // --- Entorno ---
  const env = validateEnvironment();
  checks.environment = {
    ok: env.errors.length === 0,
    detail: env.errors.length > 0 ? env.errors.join(" | ") : "Configuracion correcta",
  };

  // --- IA ---
  let aiOk = false;
  let aiDetail = "OPENROUTER_API_KEY no definido: las noticias se crean sin reescribir";
  if (aiConfig.enabled()) {
    try {
      const modelos = aiConfig.models();
      aiOk = true;
      aiDetail = `Proveedor listo (${modelos.join(", ")})`;
    } catch {
      aiDetail = "OPENROUTER_API_KEY definido pero la configuracion es incompleta";
    }
  }
  checks.ai = { ok: aiOk, detail: aiDetail };

  // --- Notificaciones ---
  const activeChannels: string[] = [];
  if (notifyConfig.email.enabled) activeChannels.push("email");
  if (notifyConfig.telegram.enabled) activeChannels.push("telegram");
  if (notifyConfig.discord.enabled) activeChannels.push("discord");
  if (notifyConfig.webhook.enabled) activeChannels.push("webhook");

  checks.notifications = {
    ok: activeChannels.length > 0,
    detail:
      activeChannels.length > 0
        ? `Activos: ${activeChannels.join(", ")}`
        : "Ningun canal configurado: no se avisara de novedades",
  };

  // --- Monitorizacion ---
  const cronConfigured = Boolean(monitorConfig.cronSecret());
  let monitorOk = false;
  let monitorDetail = "CRON_SECRET no definido: el endpoint de monitorizacion esta deshabilitado";

  if (cronConfigured && lastRunAt) {
    const ageMinutes = (Date.now() - new Date(lastRunAt).getTime()) / 60_000;
    // Con un ciclo de un minuto, 5 minutos de margen detecta un cron caido.
    monitorOk = ageMinutes < 5;
    monitorDetail = `Ultimo ciclo hace ${Math.round(ageMinutes)} min`;
  } else if (cronConfigured) {
    monitorDetail = "CRON_SECRET configurado, pero todavia no se ha ejecutado ningun ciclo";
  }

  checks.monitor = { ok: monitorOk, detail: monitorDetail };

  // --- Estado global ---
  const critical = [checks.database.ok, checks.environment.ok];
  const allOk = critical.every(Boolean);

  return NextResponse.json(
    {
      status: allOk ? "ok" : "error",
      timestamp: new Date().toISOString(),
      site: siteUrl(),
      pendingNews: pendingCount,
      lastCycleAt: lastRunAt,
      /*
        Si esto es false, la verificacion del correo esta apagada: las cuentas
        nuevas nacen verificadas sin comprobar nada. No es un fallo del sitio,
        asi que va como dato y no dentro de `checks` (que decide el 503), pero
        tiene que verse para no creer que el correo se esta comprobando.
      */
      verificacionCorreo: emailVerifyConfig.exigeConfirmacion,
      checks,
      warnings: env.warnings,
    },
    {
      status: allOk ? 200 : 503,
      headers: {
        // Nunca cacheado: una sonda cacheada informa de un estado viejo.
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
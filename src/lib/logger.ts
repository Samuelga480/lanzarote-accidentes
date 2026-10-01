/**
 * Logs estructurados en JSON por stdout.
 *
 * Por que JSON y no texto: Render captura stdout linea a linea y lo indexa por
 * texto, pero un JSON se puede consultar por campo. Un scraper que falla genera
 * decenas de lineas; poder filtrar `level=error AND source=monitor` ahorra
 * mucho mas tiempo que leerlas todas.
 *
 * Regla: los secretos NUNCA se registran. Las funciones que reciben URLs o
 * cabeceras usan `redact()`.
 */

import { prisma } from "@/lib/prisma";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): LogLevel {
  const v = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return (["debug", "info", "warn", "error"] as const).includes(v as LogLevel)
    ? (v as LogLevel)
    : "info";
}

/**
 * En desarrollo se imprime color legible; en produccion, JSON de una linea.
 * El servidor de Next sustituye console, asi que se escribe directo en
 * process.stdout para no perder el formato.
 */
function emit(level: LogLevel, message: string, fields?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  };

  if (process.env.NODE_ENV === "production") {
    // stdout plano: una linea, sin formato de consola que ensucie los logs.
    process.stdout.write(JSON.stringify(payload) + "\n");
  } else {
    const { ts, level: _l, msg, ...rest } = payload;
    const tail = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
    const prefix =
      level === "error" ? "\x1b[31mERR \x1b[0m" : level === "warn" ? "\x1b[33mWARN\x1b[0m" : "\x1b[36mINFO \x1b[0m";
    process.stdout.write(`${prefix}${msg}${tail}\n`);
  }
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};

/** Convierte un error desconocido en algo serializable y legible. */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      // El stack solo aporta en depuracion; en produccion infla los logs.
      ...(process.env.NODE_ENV !== "production" && err.stack
        ? { stack: err.stack.split("\n").slice(0, 6).join("\n") }
        : {}),
    };
  }
  return { message: String(err) };
}

/**
 * Quita credenciales de una URL antes de registrarla o guardarla.
 * `https://user:pass@host/x` -> `https://host/x`, y tambien limpia los
 * parametros que suelen llevar token (?token=, ?key=, ?access_token=).
 */
export function redact(input: string): string {
  try {
    const u = new URL(input);
    u.username = "";
    u.password = "";
    const secretKeys = ["token", "key", "apikey", "api_key", "access_token", "secret", "password"];
    for (const k of secretKeys) {
      if (u.searchParams.has(k)) u.searchParams.set(k, "REDACTED");
    }
    return u.toString();
  } catch {
    return input;
  }
}

/* -------------------------------------------------------------------------- */
/*  Auditoria de acciones                                                      */
/* -------------------------------------------------------------------------- */

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "APPROVE"
  | "REJECT"
  | "UPDATE"
  | "CREATE"
  | "DELETE"
  | "FEATURE"
  | "INGEST"
  | "MERGE"
  | "NOTIFY"
  | "CRON";

/**
 * Escribe una entrada en AuditLog.
 *
 * Nunca lanza: un fallo al auditar no debe tumbar la accion que se queria
 * registrar. Se avisa por log y se sigue.
 */
export async function audit(params: {
  actor: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actor: params.actor,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        detail: params.detail ? JSON.stringify(params.detail) : null,
      },
    });
  } catch (err) {
    log.error("No se pudo escribir la entrada de auditoria", {
      action: params.action,
      ...serializeError(err),
    });
  }
}

/** Temporizador simple para medir duraciones en milisegundos. */
export function timer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
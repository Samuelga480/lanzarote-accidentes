/**
 * Cliente de OpenRouter.
 *
 * Se accede por HTTP directo en lugar de usar el SDK: son cuatro peticiones y
 * asi no se anade una dependencia que hay que mantener actualizada. Ademas deja
 * el control de reintentos y de tiempos de espera en este repositorio.
 *
 * Dos funciones: `chat` para redactar y `embed` para la similitud semantica.
 * Ambas devuelven un error tipado en lugar de lanzar, para que quien llama pueda
 * decidir si la noticia sigue adelante sin reescritura.
 */

import { aiConfig } from "@/lib/env";
import { log, serializeError, timer } from "@/lib/logger";

export type AiResult<T> =
  | { ok: true; data: T; durationMs: number }
  | { ok: false; error: string; durationMs: number };

const BASE_URL = "https://openrouter.ai/api/v1";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${aiConfig.apiKey()}`,
    "Content-Type": "application/json",
    // OpenRouter identifica la aplicacion en su panel de uso. Sin estas dos
    // cabeceras, las peticiones aparecen como anonimas.
    "HTTP-Referer": aiConfig.appUrl(),
    "X-Title": aiConfig.appTitle(),
  };
}

/**
 * Reintenta con espera exponencial. OpenRouter devuelve 429 con frecuencia
 * cuando hay varios workers redactando a la vez.
 */
async function withRetry<T>(
  attempt: number,
  fn: () => Promise<T>,
): Promise<T> {
  const maxRetries = aiConfig.maxRetries();
  let lastError: unknown;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === maxRetries) break;
      // 0.6 s, 1.2 s, 2.4 s...
      const waitMs = 600 * 2 ** i;
      log.warn("Reintento de llamada a la IA", {
        attempt: i + 1, of: maxRetries, waitMs, ...serializeError(err),
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

/* -------------------------------------------------------------------------- */
/*  Chat                                                                       */
/* -------------------------------------------------------------------------- */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function chat(params: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Fuerza salida JSON cuando el modelo lo soporta. */
  json?: boolean;
}): Promise<AiResult<string>> {
  const elapsed = timer();
  const model = params.model ?? aiConfig.model();

  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 2000,
  };
  if (params.json) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aiConfig.timeoutMs());

  try {
    const response = await withRetry(0, async () => {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        // 429 y 5xx son transitorios: merecen reintento. 400 y 401 no.
        const transient = res.status === 429 || res.status >= 500;
        const error = new Error(`OpenRouter ${res.status}: ${detail.slice(0, 300)}`);
        (error as Error & { transient?: boolean }).transient = transient;
        throw error;
      }

      return (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
    });

    clearTimeout(timeout);

    const content = response.choices?.[0]?.message?.content;
    if (!content || content.trim() === "") {
      return {
        ok: false,
        error: response.error?.message ?? "La IA devolvio una respuesta vacia.",
        durationMs: elapsed(),
      };
    }

    return { ok: true, data: content.trim(), durationMs: elapsed() };
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === "AbortError";
    const message = aborted
      ? `Tiempo de espera agotado (${aiConfig.timeoutMs()} ms)`
      : err instanceof Error
        ? err.message
        : String(err);
    return { ok: false, error: message, durationMs: elapsed() };
  }
}

/**
 * Extrae JSON de una respuesta de IA.
 * Los modelos a veces envuelven el JSON en ```json ... ``` o anaden una frase
 * antes; se recorta en lugar de rendirse.
 */
export function parseJsonLoose<T>(raw: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const candidate = (fenced ? fenced[1] : raw).trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Segundo intento: desde la primera llave hasta la ultima.
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Embeddings                                                                 */
/* -------------------------------------------------------------------------- */

export type EmbedResult =
  | { ok: true; data: number[]; durationMs: number }
  | { ok: false; error: string; durationMs: number };

export async function embed(text: string): Promise<EmbedResult> {
  const elapsed = timer();

  // Los modelos de embedding tienen limite de tokens. Recortar aqui evita un
  // 400 por texto largo.
  const input = text.slice(0, 8000);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aiConfig.timeoutMs());

  try {
    const response = await withRetry(0, async () => {
      const res = await fetch(`${BASE_URL}/embeddings`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          model: aiConfig.embeddingModel(),
          input,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenRouter embeddings ${res.status}: ${detail.slice(0, 200)}`);
      }
      return (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    });

    clearTimeout(timeout);

    const vector = response.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length === 0) {
      return { ok: false, error: "La IA no devolvio un vector de embedding.", durationMs: elapsed() };
    }

    return { ok: true, data: vector, durationMs: elapsed() };
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "Tiempo de espera agotado en embeddings" : err instanceof Error ? err.message : String(err),
      durationMs: elapsed(),
    };
  }
}
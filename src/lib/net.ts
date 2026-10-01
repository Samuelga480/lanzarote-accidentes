/**
 * Cliente HTTP saliente con proteccion contra SSRF.
 *
 * El monitor descarga URLs que aparecen en feeds de terceros. Sin control, un
 * feed podria apuntar a `http://169.254.169.254/latest/meta-data/` (credenciales
 * de la nube en Render) o a `http://127.0.0.1:5432`. Este modulo es la unica
 * puerta de salida y aplica, en orden:
 *
 *   1. Solo http y https.
 *   2. Sin credenciales embebidas en la URL.
 *   3. Resolucion DNS previa y rechazo de cualquier IP privada, de loopback,
 *      de enlace local o reservada. Se vuelve a comprobar en CADA redireccion,
 *      porque un host publico puede redirigir a uno interno.
 *   4. Limite de redirects.
 *   5. Timeout y limite de tamano de respuesta.
 *
 * El bloqueo por IP se hace sobre el resultado de la resolucion, no sobre el
 * texto del hostname: "localhost" y "127.0.0.1" apuntan al mismo sitio, y un
 * hostname como "spoofed.example" puede resolver a 10.0.0.5.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { log, redact, serializeError, timer } from "@/lib/logger";
import { httpConfig } from "@/lib/env";

export type FetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  accept?: string;
  headers?: Record<string, string>;
};

export type SafeResponse = {
  ok: boolean;
  status: number;
  url: string;
  body: string;
  contentType: string | null;
  /** false si se corto la lectura por superar maxBytes. */
  complete: boolean;
  durationMs: number;
  error?: string;
};

/* -------------------------------------------------------------------------- */
/*  Validacion de red                                                         */
/* -------------------------------------------------------------------------- */

/** Rangos que nunca deben alcanzarse desde un fetch de scraping. */
function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // privado 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // enlace local (metadatos de nube)
  if (a === 172 && b >= 16 && b <= 31) return true; // privado 172.16/12
  if (a === 192 && b === 168) return true; // privado 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0) return true; // 192.0.0/24 y 192.0.2/24 (documentacion)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224) return true; // multicast y reservado
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0];

  if (addr === "::" || addr === "::1") return true;
  // IPv4 mapeada o compatible: ::ffff:127.0.0.1
  const mapped = /^::(ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return isBlockedIPv4(mapped[2]);
  // fc00::/7 unicast local, fe80::/10 enlace local, ff00::/8 multicast
  if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(addr)) return true;
  if (/^ff[0-9a-f]{2}:/.test(addr)) return true;
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true; // no es una IP: no deberia llegar aqui
}

/** Nombres que apuntan a la maquina propia y que conviene cortar por si acaso. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback",
  "metadata", "metadata.google.internal", "instance-data",
]);

export type UrlCheck = { ok: true } | { ok: false; reason: string };

/**
 * Valida la URL y, si hace falta, su resolucion DNS.
 * Lanza excepcion para que el llamante no pueda ignorar el fallo por descuido.
 */
export async function assertFetchable(rawUrl: string): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL invalida" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Protocolo no permitido: ${url.protocol}` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "La URL contiene credenciales" };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, reason: "URL sin host" };
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: `Host bloqueado: ${host}` };
  }

  // En desarrollo puede hacer falta hablar con localhost (por ejemplo el
  // Postgres de Docker). Solo entonces se salta el filtro de IP.
  const allowPrivate = httpConfig.allowPrivateHosts();
  if (!allowPrivate && isIP(host) && isBlockedIp(host)) {
    return { ok: false, reason: `IP bloqueada: ${host}` };
  }

  if (!allowPrivate && !isIP(host)) {
    let addresses: Array<{ address: string }>;
    try {
      addresses = await lookup(host, { all: true });
    } catch {
      return { ok: false, reason: `No se pudo resolver el host: ${host}` };
    }
    if (addresses.length === 0) {
      return { ok: false, reason: `El host no resuelve a ninguna direccion: ${host}` };
    }
    for (const a of addresses) {
      if (isBlockedIp(a.address)) {
        return {
          ok: false,
          reason: `${host} resuelve a una direccion interna (${a.address})`,
        };
      }
    }
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Fetch                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Descarga una URL respetando la politica de seguridad. `redirect: manual` para
 * poder validar cada salto: con la redireccion automatica de fetch, el segundo
 * salto se resolveria sin volver a pasar por assertFetchable.
 */
export async function safeFetch(rawUrl: string, options: FetchOptions = {}): Promise<SafeResponse> {
  const elapsed = timer();
  const timeoutMs = options.timeoutMs ?? httpConfig.timeoutMs();
  const maxRedirects = options.maxRedirects ?? 3;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;

  const check = await assertFetchable(rawUrl);
  if (!check.ok) {
    return {
      ok: false, status: 0, url: rawUrl, body: "", contentType: null,
      complete: false, durationMs: elapsed(), error: check.reason,
    };
  }

  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timerHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": httpConfig.userAgent(),
          Accept: options.accept ?? "text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9",
          ...options.headers,
        },
      });

      // --- Redireccion: se valida el destino antes de seguirlo ---
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          clearTimeout(timerHandle);
          return {
            ok: false, status: response.status, url: currentUrl, body: "",
            contentType: null, complete: false, durationMs: elapsed(),
            error: "Redireccion sin cabecera Location",
          };
        }
        let next: string;
        try {
          next = new URL(location, currentUrl).toString();
        } catch {
          clearTimeout(timerHandle);
          return {
            ok: false, status: response.status, url: currentUrl, body: "",
            contentType: null, complete: false, durationMs: elapsed(),
            error: "Location no es una URL valida",
          };
        }
        clearTimeout(timerHandle);

        const nextCheck = await assertFetchable(next);
        if (!nextCheck.ok) {
          log.warn("Redireccion bloqueada por SSRF", {
            from: redact(currentUrl), to: redact(next), reason: nextCheck.reason,
          });
          return {
            ok: false, status: response.status, url: currentUrl, body: "",
            contentType: null, complete: false, durationMs: elapsed(),
            error: `Redireccion bloqueada: ${nextCheck.reason}`,
          };
        }
        currentUrl = next;
        continue;
      }

      // --- Respuesta final ---
      const contentType = response.headers.get("content-type");
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (declaredLength > maxBytes) {
        clearTimeout(timerHandle);
        return {
          ok: false, status: response.status, url: currentUrl, body: "",
          contentType, complete: false, durationMs: elapsed(),
          error: `Respuesta demasiado grande (${declaredLength} bytes)`,
        };
      }

      // Lectura por trozos para poder cortar en maxBytes sin cargar todo en RAM.
      const reader = response.body?.getReader();
      if (!reader) {
        clearTimeout(timerHandle);
        return {
          ok: false, status: response.status, url: currentUrl, body: "",
          contentType, complete: false, durationMs: elapsed(),
          error: "Respuesta sin cuerpo",
        };
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      let complete = true;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.length;
        if (total > maxBytes) {
          complete = false;
          chunks.push(value);
          await reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
      }
      clearTimeout(timerHandle);

      const body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");

      return {
        ok: response.ok,
        status: response.status,
        url: currentUrl,
        body,
        contentType,
        complete,
        durationMs: elapsed(),
      };
    } catch (err) {
      clearTimeout(timerHandle);
      const aborted = err instanceof Error && err.name === "AbortError";
      const message = aborted
        ? `Timeout de ${timeoutMs} ms`
        : err instanceof Error
          ? err.message
          : String(err);

      log.debug("Fallo de descarga", { url: redact(rawUrl), ...serializeError(err) });

      return {
        ok: false, status: 0, url: currentUrl, body: "", contentType: null,
        complete: false, durationMs: elapsed(), error: message,
      };
    }
  }

  return {
    ok: false, status: 0, url: currentUrl, body: "", contentType: null,
    complete: false, durationMs: elapsed(),
    error: `Demasiadas redirecciones (${maxRedirects})`,
  };
}

/** Descarga binario, para las imagenes. Mismas protecciones que safeFetch. */
export async function safeFetchBinary(
  rawUrl: string,
  options: FetchOptions = {},
): Promise<{ ok: boolean; status: number; url: string; bytes: Buffer | null; contentType: string | null; error?: string }> {
  const check = await assertFetchable(rawUrl);
  if (!check.ok) return { ok: false, status: 0, url: rawUrl, bytes: null, contentType: null, error: check.reason };

  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 12 * 1024 * 1024;
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(rawUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": httpConfig.userAgent(),
        Accept: options.accept ?? "image/avif,image/webp,image/*;q=0.8,*/*;q=0.5",
        ...options.headers,
      },
    });

    if (!response.ok) {
      return {
        ok: false, status: response.status, url: rawUrl, bytes: null,
        contentType: response.headers.get("content-type"),
        error: `HTTP ${response.status}`,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      return {
        ok: false, status: response.status, url: rawUrl, bytes: null,
        contentType: response.headers.get("content-type"),
        error: `Imagen demasiado grande (${buffer.length} bytes)`,
      };
    }

    return {
      ok: true, status: response.status, url: response.url,
      bytes: buffer, contentType: response.headers.get("content-type"),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false, status: 0, url: rawUrl, bytes: null, contentType: null,
      error: aborted ? `Timeout de ${timeoutMs} ms` : err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(handle);
  }
}
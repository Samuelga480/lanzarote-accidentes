/**
 * Configuracion de entorno, validada y en un solo sitio.
 *
 * Por que este fichero existe:
 *
 *  1. Falla pronto y con un mensaje util. Si falta CRON_SECRET, el sistema
 *     avisa al arrancar en vez de dejar el endpoint de monitorizacion abierto.
 *  2. Un unico punto donde leer secretos. Ningun modulo hace
 *     `process.env.X` suelto, de modo que la auditoria de secretos es
 *     `grep` sobre este fichero.
 *  3. Ningun valor por defecto inseguro. Para ADMIN_PASSWORD no existe valor
 *     por defecto: si falta, el panel no arranca.
 */

import { z } from "zod";
import { isWritable } from "@/lib/fs-probe";

/** Lee una variable demanded, con mensaje de error en castellano. */
function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env y define su valor.`,
    );
  }
  return v.trim();
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function int(name: string, fallback: number): number {
  const v = optional(name);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = optional(name);
  if (!v) return fallback;
  return ["1", "true", "yes", "on", "si", "sí"].includes(v.toLowerCase());
}

/** URL publica del sitio, sin barra final. Es la base de canonical y sitemap. */
export function siteUrl(): string {
  return (optional("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
}

/* -------------------------------------------------------------------------- */
/*  Panel de administracion                                                   */
/* -------------------------------------------------------------------------- */

export const adminConfig = {
  /**
   * Contrasena del panel. Sin valor por defecto a proposito: si no esta
   * definida, verifyPassword lanza y el panel no deja entrar. Asi es imposible
   * desplegar la web con una contrasena de ejemplo.
   */
  password(): string {
    return required("ADMIN_PASSWORD");
  },
  /** Secreto de firma de la cookie de sesion. Minimo 32 caracteres. */
  sessionSecret(): string {
    const v = required("ADMIN_SESSION_SECRET");
    if (v.length < 32) {
      throw new Error(
        "ADMIN_SESSION_SECRET debe tener al menos 32 caracteres. Genera uno con: " +
          "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    return v;
  },
};

/* -------------------------------------------------------------------------- */
/*  IA (OpenRouter)                                                           */
/* -------------------------------------------------------------------------- */

export const aiConfig = {
  apiKey(): string {
    return required("OPENROUTER_API_KEY");
  },
  /** Identificacion que OpenRouter muestra en su panel de uso. */
  appUrl(): string {
    return siteUrl();
  },
  appTitle(): string {
    return optional("OPENROUTER_APP_TITLE") ?? "Accidentes Lanzarote";
  },
  /**
   * Modelo de redaccion, ysuplente por si el principal falla.
   *
   * Los dos son gratuitos (los que acaban en ":free"). Se pone un segundo
   * porque los gratuitos tienen un limite de peticiones por minuto y son
   * efimeros: OpenRouter cambia la lista sin avisar y un dia disappears el
   * modelo que era el principal. Con suplente, un cambio asi no para el sitio.
   *
   * El suplente sale de OPENROUTER_MODEL_FALLBACK y, si no se define, no hay
   * ninguno: es opcional a proposito.
   */
  models(): string[] {
    const principal = optional("OPENROUTER_MODEL") ?? "google/gemma-4-31b-it:free";
    const suplente = optional("OPENROUTER_MODEL_FALLBACK");

    // Se filtra el principal para no repetirlo como suplente si estan iguales.
    return suplente && suplente !== principal ? [principal, suplente] : [principal];
  },
  /** Modelo de embeddings para la similitud semantica de duplicados. */
  embeddingModel(): string {
    return optional("OPENROUTER_EMBEDDING_MODEL") ?? "openai/text-embedding-3-small";
  },
  enabled(): boolean {
    return Boolean(optional("OPENROUTER_API_KEY"));
  },
  timeoutMs(): number {
    return int("AI_TIMEOUT_MS", 45_000);
  },
  maxRetries(): number {
    return int("AI_MAX_RETRIES", 2);
  },
};

/* -------------------------------------------------------------------------- */
/*  Endpoint de ingesta (IA externa o scripts)                                 */
/* -------------------------------------------------------------------------- */

export const ingestConfig = {
  secret(): string | undefined {
    return optional("INGEST_WEBHOOK_SECRET");
  },
};

/* -------------------------------------------------------------------------- */
/*  Monitorizacion y cron                                                     */
/* -------------------------------------------------------------------------- */

export const monitorConfig = {
  /**
   * Secreto del endpoint de monitorizacion. Si no esta definido, el endpoint
   * queda deshabilitado (503) en lugar de quedar abierto a internet.
   */
  cronSecret(): string | undefined {
    const v = optional("CRON_SECRET");
    if (v && v.length < 24) {
      throw new Error("CRON_SECRET debe tener al menos 24 caracteres.");
    }
    return v;
  },
  /** Periodo del ciclo de deteccion. El requisito es de un minuto. */
  intervalMs(): number {
    return int("MONITOR_INTERVAL_MS", 60_000);
  },
  /** Cuantas pasadas sin verse una URL hace falta para marcarla como baja. */
  missingThreshold(): number {
    return int("MONITOR_MISSING_THRESHOLD", 6);
  },
  /**
   * Minutos hacia atras que se consideran "noticia nueva" en cada pasada.
   *
   * 90 minutos, y no 60 a proposito: es MAYOR que la cadencia de una hora. Con
   * una ventana igual que la cadencia, el retraso de una pasada equivaldria a
   * perder para siempre lo que se publico durante ese retraso. Con media hora de
   * margen, la siguiente pasada sigue cubriéndolo.
   *
   * Se mide en minutos y no en horas porque hora y media no se expresa en horas
   * enteras, y redondear a "2 horas" seria 30 minutos de mas o media hora
   * de menos.
   */
  lookbackMinutes(): number {
    return int("MONITOR_LOOKBACK_MINUTES", 90);
  },
  /** Corte de antiguedad: nada de mas de N dias entra al sistema. */
  maxAgeDays(): number {
    return int("MONITOR_MAX_AGE_DAYS", 30);
  },
  /**
   * Ejecucion del ciclo dentro del propio servidor web. En Render lo normal es
   * un cron externo llamando a /api/cron/monitor; esto sirve para desarrollo y
   * para despliegues de un solo servicio.
   */
  embeddedScheduler(): boolean {
    return bool("ENABLE_EMBEDDED_SCHEDULER", false);
  },
  /** Maximo de articulos extraidos por pasada y fuente. Evita ráfagas. */
  maxArticlesPerFeed(): number {
    return int("MONITOR_MAX_ARTICLES_PER_FEED", 25);
  },
};

/* -------------------------------------------------------------------------- */
/*  Notificaciones                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Verificacion del correo en el alta de cuenta.
 *
 * Son dos cosas separadas y conviene no confundirlas:
 *
 *   1. `dominioAceptaCorreo`: mira en DNS si el dominio tiene servidor de
 *      correo. Es una comprobacion de verdad y no falla nunca con un correo
 *      bueno. Detecta el error tipografico, que es el caso frecuente.
 *
 *   2. `exigirConfirmacion`: si hay SMTP, la cuenta nace sin verificar y hasta
 *      que no pulse el enlace no puede entrar. Si no hay SMTP, nace verificada.
 *
 * Lo segundo es una degradacion deliberada. Si se exigiera confirmar sin poder
 * enviar el correo, nadie podria registrarse nunca y el sitio se quedaria sin
 * altas. Es peor que no verificar. El estado real se ve en /api/health, asi que
 * la falta de SMTP no queda oculta.
 */
export const emailVerifyConfig = {
  /** Cuanto se espera al servidor de DNS del dominio, en milisegundos. */
  dnsTimeoutMs(): number {
    return int("VERIFY_DNS_TIMEOUT_MS", 3000);
  },
  /** Cuanto puede tardar el envio del correo de confirmacion, en milisegundos. */
  envioTimeoutMs(): number {
    return int("VERIFY_ENVIO_TIMEOUT_MS", 8000);
  },
  /** Horas que sigue valido un enlace de confirmacion. */
  validoHoras(): number {
    return int("VERIFY_TOKEN_HORAS", 48);
  },
  /**
   * Minutos entre dos correos de confirmacion a la misma cuenta. Sin esto,
   * alguien puede pedir el reenvio en bucle y usar tu SMTP para mandar spam.
   */
  reenvioMinutos(): number {
    return int("VERIFY_REENVIO_MINUTOS", 10);
  },
  /**
   * Comprobar el dominio antes de dar de alta la cuenta. Se puede apagar
   * porque el DNS es una llamada a otro servidor: si falla, no debe tumbar el
   * registro entero.
   */
  comprobarDominio(): boolean {
    return optional("VERIFY_COMPROBAR_DOMINIO") !== "false";
  },
  /**
   * Hay SMTP y hay remitente, entonces se puede enviar correo. Exigir la
   * confirmacion depende de esto: sin correo no hay confirmacion posible.
   */
  puedeEnviar(): boolean {
    return Boolean(optional("SMTP_HOST") && (optional("SMTP_USER") || optional("NOTIFY_FROM")));
  },
  get exigeConfirmacion(): boolean {
    return emailVerifyConfig.puedeEnviar();
  },
};

/* -------------------------------------------------------------------------- */

export const notifyConfig = {
  email: {
    host(): string | undefined {
      return optional("SMTP_HOST");
    },
    port(): number {
      return int("SMTP_PORT", 587);
    },
    user(): string | undefined {
      return optional("SMTP_USER");
    },
    pass(): string | undefined {
      return optional("SMTP_PASS");
    },
    from(): string | undefined {
      return optional("NOTIFY_FROM") ?? optional("SMTP_USER");
    },
    to(): string | undefined {
      return optional("ADMIN_EMAIL");
    },
    get enabled(): boolean {
      return Boolean(optional("SMTP_HOST") && optional("ADMIN_EMAIL"));
    },
  },
  telegram: {
    token(): string | undefined {
      return optional("TELEGRAM_BOT_TOKEN");
    },
    chatId(): string | undefined {
      return optional("TELEGRAM_CHAT_ID");
    },
    get enabled(): boolean {
      return Boolean(optional("TELEGRAM_BOT_TOKEN") && optional("TELEGRAM_CHAT_ID"));
    },
  },
  discord: {
    webhookUrl(): string | undefined {
      return optional("DISCORD_WEBHOOK_URL");
    },
    get enabled(): boolean {
      return Boolean(optional("DISCORD_WEBHOOK_URL"));
    },
  },
  webhook: {
    url(): string | undefined {
      return optional("NOTIFY_WEBHOOK_URL");
    },
    /** Secreto firma el webhook con HMAC-SHA256 en la cabecera X-Signature. */
    secret(): string | undefined {
      return optional("NOTIFY_WEBHOOK_SECRET");
    },
    get enabled(): boolean {
      return Boolean(optional("NOTIFY_WEBHOOK_URL"));
    },
  },
  /** Si ningun canal esta activo, la app lo avisa al arrancar en vez de fallar. */
  anyEnabled(): boolean {
    return (
      notifyConfig.email.enabled ||
      notifyConfig.telegram.enabled ||
      notifyConfig.discord.enabled ||
      notifyConfig.webhook.enabled
    );
  },
};

/* -------------------------------------------------------------------------- */
/*  Alertas de fallo de fuentes                                               */
/* -------------------------------------------------------------------------- */

export const alertConfig = {
  /** Numero de fallos consecutivos antes de considerar la fuente caida. */
  failureThreshold(): number {
    return int("FEED_FAILURE_THRESHOLD", 3);
  },
};

/* -------------------------------------------------------------------------- */
/*  Imagenes                                                                   */
/* -------------------------------------------------------------------------- */

export const imageConfig = {
  enabled(): boolean {
    return bool("IMAGE_PIPELINE_ENABLED", true);
  },
  /**
   * Como se guardan las imagenes.
   *
   * "filesystem" -> se descargan, se convierten a WebP y se guardan en
   *                 public/media. Necesita un disco escribible: vale para
   *                 Docker, Render y cualquier servidor propio.
   *
   * "external"   -> no se guarda nada y se usa la URL del medio. Es lo unico
   *                 que funciona en Vercel, donde el disco es de solo lectura,
   *                 y tambien en los planes gratuitos de Render.
   *
   * Se detecta solo probando una escritura en el directorio de destino, con
   * lo que el mismo codigo funciona en las dos plataformas sin configuracion.
   * IMAGE_MODE fuerza uno de los dos valores si hace falta.
   */
  mode(): "filesystem" | "external" {
    const forced = optional("IMAGE_MODE");
    if (forced === "filesystem" || forced === "external") return forced;
    return isWritable(imageConfig.dir()) ? "filesystem" : "external";
  },
  /** Directorio donde se escriben los ficheros. Relativo a la raiz del proyecto. */
  dir(): string {
    return optional("IMAGE_STORAGE_DIR") ?? "public/media";
  },
  /** Ancho maximo del hero. Nada mas alla de esto no aporta en la practica. */
  maxWidth(): number {
    return int("IMAGE_MAX_WIDTH", 2000);
  },
  quality(): number {
    return int("IMAGE_WEBP_QUALITY", 78);
  },
  /** Descarta imagenes mas pequenas que esto: suelen ser sprites o iconos. */
  minDimension(): number {
    return int("IMAGE_MIN_DIMENSION", 320);
  },
  /** Segundos de espera maxima por imagen. */
  timeoutMs(): number {
    return int("IMAGE_TIMEOUT_MS", 15_000);
  },
};

/* -------------------------------------------------------------------------- */
/*  HTTP saliente (scraping)                                                  */
/* -------------------------------------------------------------------------- */

export const httpConfig = {
  timeoutMs(): number {
    return int("HTTP_TIMEOUT_MS", 15_000);
  },
  userAgent(): string {
    return (
      optional("HTTP_USER_AGENT") ??
      "TraficoLanzaroteBot/2.0 (+https://lanzarote-accidentes; contacto@ejemplo.com)"
    );
  },
  /** Peticiones simultaneas a una misma fuente. */
  concurrency(): number {
    return int("HTTP_CONCURRENCY", 4);
  },
  /**
   * Desactiva la proteccion SSRF. Existe solo para los tests locales. Nunca
   * debe activarse en produccion: permitiria que el monitorizador solicite
   * URLs internas (169.254.169.254, localhost, rangos privados).
   */
  allowPrivateHosts(): boolean {
    return bool("ALLOW_PRIVATE_FETCH", false);
  },
};

/* -------------------------------------------------------------------------- */
/*  Deduplicacion                                                             */
/* -------------------------------------------------------------------------- */

export const dedupeConfig = {
  /** Similitud de titulo normalizado por encima de la cual se considera dup. */
  titleThreshold(): number {
    return Number(optional("DEDUPE_TITLE_THRESHOLD") ?? "0.86");
  },
  /** Distancia maxima de SimHash (0-64). 12 es conservador para periodicos. */
  simHashDistance(): number {
    return int("DEDUPE_SIMHASH_DISTANCE", 12);
  },
  /** Coseno minimo de los embeddings para declarar el mismo suceso. */
  semanticThreshold(): number {
    return Number(optional("DEDUPE_SEMANTIC_THRESHOLD") ?? "0.93");
  },
  /** Ventana temporal en la que se buscan candidatos a duplicado. */
  windowHours(): number {
    return int("DEDUPE_WINDOW_HOURS", 72);
  },
};

/* -------------------------------------------------------------------------- */
/*  Verificacion                                                               */
/* -------------------------------------------------------------------------- */

export const verifyConfig = {
  /** Por debajo de este valor la noticia queda SUSPICIOUS. */
  minConfidence(): number {
    return Number(optional("VERIFY_MIN_CONFIDENCE") ?? "0.55");
  },
  /** A partir de este valor se considera VERIFIED. */
  goodConfidence(): number {
    return Number(optional("VERIFY_GOOD_CONFIDENCE") ?? "0.8");
  },
};

/** Resumen de la configuracion, seguro de imprimir en los logs. */
export function configSummary(): Record<string, unknown> {
  return {
    site: siteUrl(),
    // La lista entera, no solo el principal: cuando el monitor tenga que saltar
    // al suplente, el log tiene que decir desde el principio que lo hay.
    ai: aiConfig.enabled() ? aiConfig.models().join(" | ") : "deshabilitado",
    notifications: {
      email: notifyConfig.email.enabled,
      telegram: notifyConfig.telegram.enabled,
      discord: notifyConfig.discord.enabled,
      webhook: notifyConfig.webhook.enabled,
    },
    monitor: {
      intervalMs: monitorConfig.intervalMs(),
      embedded: monitorConfig.embeddedScheduler(),
    },
  };
}

/** Comprobacion de arranque. Devuelve los problemas en vez de lanzarlos. */
export function validateEnvironment(): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    adminConfig.sessionSecret();
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  try {
    adminConfig.password();
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  if (!optional("DATABASE_URL")) errors.push("Falta DATABASE_URL.");
  if (!optional("NEXT_PUBLIC_SITE_URL")) {
    warnings.push("NEXT_PUBLIC_SITE_URL no definido: se usara localhost.");
  }

  if (!monitorConfig.cronSecret()) {
    warnings.push(
      "CRON_SECRET no definido: el endpoint /api/cron/monitor quedara deshabilitado (503).",
    );
  }
  if (!notifyConfig.anyEnabled()) {
    warnings.push("Ningun canal de notificacion configurado: no se avisara de novedades.");
  }
  if (!aiConfig.enabled()) {
    warnings.push("OPENROUTER_API_KEY no definido: las noticias se crearan sin reescritura de IA.");
  }
  if (httpConfig.allowPrivateHosts()) {
    warnings.push("ALLOW_PRIVATE_FETCH activo: la proteccion SSRF esta desactivada.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Valida el entorno con zod. Util para el endpoint /api/health. */
export const healthSchema = z.object({
  database: z.boolean(),
  ai: z.boolean(),
  notifications: z.boolean(),
  scheduler: z.boolean(),
});

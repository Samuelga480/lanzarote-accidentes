/**
 * Normalizacion y validacion de fechas.
 *
 * El problema que resuelve:
 *
 *  1. Un feed puede traer la fecha en UTC (W3CDTF, `+0000`), en hora local del
 *     medio (que en el archipielago es Europe/Madrid) o en un formato ambiguo
 *     como `01/10/2026 14:30`, donde no se sabe si el dia va primero.
 *  2. Un articulo puede traer una fecha futura por un error del medio o por
 *     un error de zona horaria mal calculada.
 *  3. La aplicacion almacena SIEMPRE en UTC y muestra SIEMPRE en Europe/Madrid,
 *     de modo que un dia de verano y uno de invierno no se confundan.
 *
 * CANARIAS NO ES UTC+1 FIJO: en invierno es UTC+0 y en verano UTC+1. Sumar una
 * hora a todo daria una hora de error durante siete meses al ano.
 */

import { canaryLocalToUtc } from "@/lib/format";

export const SITE_TZ = "Atlantic/Canary";

/** Desplazamiento de la zona respecto a UTC, en ms, en ese instante. */
function tzOffsetMs(date: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SITE_TZ,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(map.hour) % 24, Number(map.minute), Number(map.second),
  );
  return asUTC - date.getTime();
}

/** Desplazamiento horario legible, p.ej. "+01:00". */
export function tzLabel(date: Date = new Date()): string {
  const minutes = Math.round(tzOffsetMs(date) / 60000);
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/*  Parseo                                                                    */
/* -------------------------------------------------------------------------- */

export type DateConfidence = "certain" | "likely" | "uncertain";

export type ParsedDate = {
  date: Date;
  confidence: DateConfidence;
  /** Explicacion para el panel, en caso de duda. */
  note?: string;
};

/**
 * Interpreta una fecha de feed o de metadatos.
 *
 * `assumeTimezone: "utc" | "local"` solo se aplica cuando la cadena NO trae
 * zona explicita. Es el unico momento donde hay ambiguedad real.
 */
export function parseSourceDate(raw: string | null | undefined, assumeTimezone: "utc" | "local" = "utc"): ParsedDate | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value === "") return null;

  // --- 1. RFC-822 / RFC-2822: "Tue, 01 Oct 2026 14:30:00 +0100" ---
  if (/^[A-Za-z]{3},\s/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return { date: d, confidence: "certain" };
  }

  // --- 2. W3CDTF / ISO: "2026-10-01T14:30:00+01:00" o con Z ---
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) {
    const hasZone = /(?:Z|[+\-]\d{2}:?\d{2})$/i.test(value.trim());
    const d = new Date(value.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) {
      // Sin zona: `new Date` lo interpretaria en la zona del servidor (UTC en
      // Render), lo que puede desplazar la hora una o dos horas.
      if (!hasZone && assumeTimezone === "local") {
        const local = canaryLocalToUtc(value.replace(" ", "T"));
        if (!Number.isNaN(local.getTime())) {
          return {
            date: local,
            confidence: "likely",
            note: "La fecha no traia zona horaria; se ha interpretado como hora de Canarias.",
          };
        }
      }
      return { date: d, confidence: hasZone ? "certain" : "likely" };
    }
  }

  // --- 3. "2026-10-01" (solo dia) ---
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (assumeTimezone === "local") {
      const local = canaryLocalToUtc(`${value}T00:00`);
      if (!Number.isNaN(local.getTime())) return { date: local, confidence: "likely" };
    }
    const d = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return { date: d, confidence: "likely" };
  }

  // --- 4. "01/10/2026" o "1-10-2026": ambiguo el orden dia/mes ---
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (slash) {
    const first = Number.parseInt(slash[1], 10);
    const second = Number.parseInt(slash[2], 10);
    const year = Number.parseInt(slash[3], 10);
    // Solo se puede desambiguar por rango: el dia nunca pasa de 31.
    const day = first > 12 ? first : second > 12 ? second : null;
    if (day !== null) {
      const month = first > 12 ? second : first;
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00Z`;
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        return { date: d, confidence: "certain", note: "Formato dd/mm/yyyy deducido por rango." };
      }
    }
    return null; // Ambos valores <= 12: ambiguedad irresoluble. No se inventa.
  }

  // --- 5. Ultimo recurso: el motor de JS ---
  const fallback = new Date(value);
  if (!Number.isNaN(fallback.getTime())) {
    return { date: fallback, confidence: "uncertain", note: `Formato no habitual: "${value}"` };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Validacion                                                                */
/* -------------------------------------------------------------------------- */

export type DateVerdict = {
  ok: boolean;
  /** Motivo por el que se rechaza, si no es valida. */
  problem?: "futura" | "muy-antigua" | "imposible" | "sin-fecha";
  /** Correccion aplicada, si la hubo. */
  corrected: Date | null;
  note?: string;
};

/**
 * Comprueba que una fecha tiene sentido y la corrige si puede.
 *
 * `maxAgeDays` descarta lo que es demasiado viejo para ser una noticia nueva.
 * `slackMinutes` tolera que el reloj del medio vaya atrasado unos minutos.
 */
export function validateDate(
  candidate: Date | null,
  opts: { maxAgeDays: number; now?: Date; slackMinutes?: number },
): DateVerdict {
  const now = opts.now ?? new Date();
  const slack = opts.slackMinutes ?? 90; // 1 h 30 min

  if (!candidate || Number.isNaN(candidate.getTime())) {
    return { ok: false, problem: "sin-fecha", corrected: null };
  }

  // Fecha imposible: JS hace rollover (32 de enero -> 1 de febrero).
  const year = candidate.getUTCFullYear();
  if (year < 2000 || year > now.getUTCFullYear() + 1) {
    return { ok: false, problem: "imposible", corrected: null };
  }

  // Futura con margen. Una noticia publicada 10 minutos en el futuro casi
  // siempre es un desfase de zona horaria, no un articulo del futuro: se corrige
  // asumiendo que la fecha local se publico sin convertir.
  const futureMs = candidate.getTime() - now.getTime();
  if (futureMs > slack * 60_000) {
    return {
      ok: false,
      problem: "futura",
      corrected: null,
      note: `La fecha esta ${Math.round(futureMs / 3_600_000)} h por delante de la actual.`,
    };
  }
  if (futureMs > 0) {
    // Dentro del margen: se ajusta para que no quede en el futuro.
    return { ok: true, corrected: new Date(now.getTime()), note: "Fecha ligeramente futura ajustada al momento actual." };
  }

  const ageDays = (now.getTime() - candidate.getTime()) / 86_400_000;
  if (ageDays > opts.maxAgeDays) {
    return {
      ok: false,
      problem: "muy-antigua",
      corrected: null,
      note: `La noticia tiene ${Math.round(ageDays)} dias (limite: ${opts.maxAgeDays}).`,
    };
  }

  return { ok: true, corrected: candidate };
}

/* -------------------------------------------------------------------------- */
/*  Construccion y formato                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Compone el instante del suceso a partir de lo que hay en el articulo.
 * Prioridad: fecha del propio articulo > fecha del feed > ahora.
 */
export function resolveOccurredAt(
  articleDate: Date | null,
  feedDate: Date | null,
  timeOfDay: string | null,
  fallback: Date,
): Date {
  const base = articleDate ?? feedDate;
  if (!base) return fallback;

  if (!timeOfDay) return base;

  // El texto dice "a las 14:30" pero la fecha del articulo es la de publicacion,
  // que puede ser posterior. Se combina la FECHA del articulo con la HORA del
  // suceso, que es lo que el texto afirma.
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const [h, min] = timeOfDay.split(":").map((n) => Number.parseInt(n, 10));

  // Se construye como si fuera hora de Canarias y se pasa a UTC, porque asi lo
  // afirma el medio.
  const naive = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  const utc = canaryLocalToUtc(naive);
  if (!Number.isNaN(utc.getTime())) return utc;

  return base;
}

/** Rango de fechas en hora local de Canarias para agrupar por dia. */
export function localDayKey(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SITE_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(date);
}

/** Fecha y hora legibles, siempre en hora de Canarias. */
export function formatLocal(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: SITE_TZ,
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}
/**
 * Formato de fechas en espanol con zona horaria fija (Atlantic/Canary).
 *
 * Fijar la zona horaria evita que el HTML del servidor y el del cliente
 * discrepen y provoke errores de hidratacion de React.
 */

const TZ = "Atlantic/Canary";

const dateFmt = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TZ,
});

const dateShortFmt = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: TZ,
});

const timeFmt = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});

const isoDateFmt = new Intl.DateTimeFormat("es-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TZ,
});

export function formatDate(d: Date | string): string {
  return dateFmt.format(new Date(d));
}

export function formatDateShort(d: Date | string): string {
  return dateShortFmt.format(new Date(d));
}

export function formatTime(d: Date | string): string {
  return timeFmt.format(new Date(d));
}

export function formatDateTime(d: Date | string): string {
  const date = new Date(d);
  return `${dateShortFmt.format(date)} · ${timeFmt.format(date)}`;
}

/** AAAA-MM-DD en hora de Canarias, para value="" de los inputs date. */
export function toInputDate(d: Date | string): string {
  return isoDateFmt.format(new Date(d));
}

/* -------------------------------------------------------------------------- */
/*  Conversión de fecha/hora local <-> UTC                                     */
/*                                                                             */
/*  Canarias cambia de UTC+0 a UTC+1 en horario de verano, asi que no vale con */
/*  sumar una hora fija. Estas dos funciones usan Intl para resolver el offset */
/*  real de cada instante.                                                    */
/* -------------------------------------------------------------------------- */

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Desplazamiento de la zona horaria respecto a UTC, en ms, en ese instante. */
function tzOffsetMs(date: Date): number {
  const map: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(date)) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - date.getTime();
}

/**
 * Convierte una fecha/hora naive de Canarias ("2026-09-30T14:30") en el
 * instante UTC correspondiente.
 *
 * Se itera dos veces porque el offset depende del propio instante: la primera
 * pasada puede caer en el lado equivocado de un cambio de horario.
 */
export function canaryLocalToUtc(naive: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(naive.trim());
  if (!m) return new Date(NaN);

  const [, Y, M, D, h, min] = m;
  const wall = Date.UTC(Number(Y), Number(M) - 1, Number(D), Number(h), Number(min), 0);

  let ts = wall - tzOffsetMs(new Date(wall));
  ts = wall - tzOffsetMs(new Date(ts));
  return new Date(ts);
}

/** Inverso de canaryLocalToUtc: instante UTC -> "2026-09-30T14:30" local. */
export function toInputDateTime(d: Date | string): string {
  const date = new Date(d);
  const map: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(date)) map[p.type] = p.value;
  const pad = (n: string) => n.padStart(2, "0");
  return (
    `${map.year}-${map.month}-${map.day}` +
    `T${pad(String(Number(map.hour) % 24))}:${pad(map.minute)}`
  );
}

/** "hace 3 horas", "ayer", "hace 2 dias". */
export function formatRelative(d: Date | string, now: Date = new Date()): string {
  const date = new Date(d);
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;

  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? "mes" : "meses"}`;

  const years = Math.floor(days / 365);
  return `hace ${years} ${years === 1 ? "año" : "años"}`;
}

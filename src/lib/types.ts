/**
 * Tipos del dominio, definidos aqui en lugar de importarlos de Prisma.
 *
 * Motivo: los enums de Prisma solo existen en PostgreSQL y MySQL. Al trabajar
 * con SQLite los campos se guardan como String, asi que el codigo de la
 * aplicacion necesita sus propios tipos y funciones de comprobacion.
 *
 * La ventaja es que se mantienen los tipos en tiempo de compilacion y, a la vez,
 * los valores se pueden validar en la frontera (formularios, API, IA). Si en el
 * futuro se migra a PostgreSQL, basta cambiar el esquema a enum nativo: este
 * archivo puede quedarse como esta, porque sigue siendo la unica fuente de
 * verdad para la aplicacion.
 */

export const ACCIDENT_STATUSES = [
  "PENDING_REVIEW",
  "PUBLISHED",
  "REJECTED",
  "ARCHIVED",
] as const;
export type AccidentStatus = (typeof ACCIDENT_STATUSES)[number];

export const VEHICLE_TYPES = [
  "COCHE",
  "MOTO",
  "CAMION",
  "BICICLETA",
  "PEATON",
  "OTROS",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const SEVERITIES = ["LEVE", "MODERADO", "GRAVE"] as const;
export type AccidentSeverity = (typeof SEVERITIES)[number];

export const ORIGINS = ["MANUAL", "AI"] as const;
export type Origin = (typeof ORIGINS)[number];

/* -------------------------------------------------------------------------- */
/*  Comprobaciones en la frontera                                             */
/* -------------------------------------------------------------------------- */

function oneOf<T extends string>(values: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (values as readonly string[]).includes(v);
}

export function isAccidentStatus(v: unknown): v is AccidentStatus {
  return oneOf(ACCIDENT_STATUSES, v);
}

export function isVehicleType(v: unknown): v is VehicleType {
  return oneOf(VEHICLE_TYPES, v);
}

export function isSeverity(v: unknown): v is AccidentSeverity {
  return oneOf(SEVERITIES, v);
}

export function isOrigin(v: unknown): v is Origin {
  return oneOf(ORIGINS, v);
}

/* -------------------------------------------------------------------------- */
/*  Coercion a la frontera de datos                                           */
/* -------------------------------------------------------------------------- */

/*
 * En el esquema los cuatro campos son String (SQLite no admite enums), asi que
 * Prisma los devuelve como `string` sin garantia. Estas funciones estrechan el
 * tipo en la frontera de la base de datos, de modo que el resto de la aplicacion
 * trabaja con unionesliterales y los Record<...> de etiquetas se pueden indexar
 * sin `any`.
 *
 * El valor por defecto es el mas conservador en cada caso: si un registro llega
 * con un valor desconocido, se trata como si fuera una noticia sin revisar.
 */

export function toVehicleType(v: string): VehicleType {
  return isVehicleType(v) ? v : "OTROS";
}

export function toSeverity(v: string): AccidentSeverity {
  return isSeverity(v) ? v : "MODERADO";
}

export function toStatus(v: string): AccidentStatus {
  return isAccidentStatus(v) ? v : "PENDING_REVIEW";
}

export function toOrigin(v: string): Origin {
  return isOrigin(v) ? v : "MANUAL";
}

/* -------------------------------------------------------------------------- */
/*  Instantaneas de revision                                                  */
/* -------------------------------------------------------------------------- */

/** Forma de la instantanea guardada en Revision.snapshot. */
export type RevisionSnapshot = {
  slug?: string;
  title?: string;
  summary?: string;
  body?: string;
  status?: string;
  origin?: string;
  severity?: string;
  vehicleType?: string;
  occurredAt?: string;
  municipality?: string;
  fatalities?: number;
  injuries?: number;
  isFeatured?: boolean;
  locationDescription?: string | null;
  imageUrl?: string | null;
  capturedAt?: string;
};

/** Normaliza lo que llega de la base de datos a una instantanea tipada. */
export function parseSnapshot(raw: unknown): RevisionSnapshot {
  if (typeof raw !== "string") {
    // Por si la base guardase el objeto ya deserializado.
    return (raw ?? {}) as RevisionSnapshot;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as RevisionSnapshot) : {};
  } catch {
    return {};
  }
}

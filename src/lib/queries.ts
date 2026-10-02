import { prisma } from "@/lib/prisma";
import type { Accident, Municipality, Prisma } from "@prisma/client";
import {
  toOrigin,
  toSeverity,
  toStatus,
  toVehicleType,
  type AccidentSeverity,
  type AccidentStatus,
  type Origin,
  type VehicleType,
} from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/constants";

/* -------------------------------------------------------------------------- */
/*  REGLA CENTRAL DEL PROYECTO                                                 */
/*                                                                             */
/*  Todo lo que se consulta desde el sitio publico pasa por aqui y se filtra  */
/*  SIEMPRE por status = PUBLISHED. Los borradores (PENDING_REVIEW), los       */
/*  descartados y los archivados no son accesibles desde ninguna pagina        */
/*  publica, ni por slug, ni por la API publica.                              */
/* -------------------------------------------------------------------------- */

const ONLY_PUBLISHED: Prisma.AccidentWhereInput = { status: "PUBLISHED" };

/**
 * Fila de la base de datos con los cuatro campos de dominio ya estrechados.
 * `status`, `origin`, `vehicleType` y `severity` son String en el esquema; aqui
 * se convierten a sus uniones literales para que el resto del codigo no tenga
 * queashedar `string` ni usar `any`.
 */
export type AccidentRow = Omit<
  Accident,
  "status" | "origin" | "vehicleType" | "severity"
> & {
  status: AccidentStatus;
  origin: Origin;
  vehicleType: VehicleType;
  severity: AccidentSeverity;
};

/** Normaliza una fila de Prisma al tipo de dominio. */
export function narrow<T extends {
  status: string;
  origin: string;
  vehicleType: string;
  severity: string;
}>(row: T): Narrowed<T> {
  return {
    ...row,
    status: toStatus(row.status),
    origin: toOrigin(row.origin),
    vehicleType: toVehicleType(row.vehicleType),
    severity: toSeverity(row.severity),
  };
}

/** Version generica de narrow: cambia cuatro string por sus uniones literales. */
export type Narrowed<T> = Omit<
  T,
  "status" | "origin" | "vehicleType" | "severity"
> & {
  status: AccidentStatus;
  origin: Origin;
  vehicleType: VehicleType;
  severity: AccidentSeverity;
};

export type AccidentWithMunicipality = AccidentRow & { municipality: Municipality };

export type AccidentFilters = {
  municipality?: string;
  vehicle?: VehicleType;
  /** Fecha minima (inclusive) */
  from?: Date;
  /** Fecha maxima (inclusive), se incrementa un dia para cubrir el entero */
  to?: Date;
  q?: string;
  take?: number;
  skip?: number;
};

function buildWhere(filters: AccidentFilters): Prisma.AccidentWhereInput {
  const and: Prisma.AccidentWhereInput[] = [ONLY_PUBLISHED];

  if (filters.municipality) {
    and.push({ municipality: { slug: filters.municipality } });
  }
  if (filters.vehicle) {
    and.push({ vehicleType: filters.vehicle });
  }
  if (filters.from || filters.to) {
    const occurredAt: Prisma.DateTimeFilter = {};
    if (filters.from) occurredAt.gte = filters.from;
    if (filters.to) {
      const end = new Date(filters.to);
      end.setHours(23, 59, 59, 999);
      occurredAt.lte = end;
    }
    and.push({ occurredAt });
  }
  if (filters.q && filters.q.trim().length > 0) {
    const term = filters.q.trim();
    // Sin `mode: "insensitive"`: SQLite no lo admite, y su LIKE ya ignora
    // mayusculas y minusculas en el rango ASCII, que es lo que se busca aqui.
    and.push({
      OR: [
        { title: { contains: term } },
        { summary: { contains: term } },
        { body: { contains: term } },
        { locationDescription: { contains: term } },
        { municipality: { name: { contains: term } } },
      ],
    });
  }

  return { AND: and };
}

export async function listAccidents(
  filters: AccidentFilters = {},
): Promise<{ items: AccidentWithMunicipality[]; total: number }> {
  const take = Math.min(filters.take ?? 12, 60);
  const skip = filters.skip ?? 0;
  const where = buildWhere(filters);

  const [rows, total] = await Promise.all([
    prisma.accident.findMany({
      where,
      include: { municipality: true },
      orderBy: { occurredAt: "desc" },
      take,
      skip,
    }),
    prisma.accident.count({ where }),
  ]);

  const items = rows.map(narrow);

  return { items, total };
}

/**
 * Accidente destacado. Si no hay ninguno marcado como destacado, se devuelve
 * el mas reciente para que la portada nunca quede vacia.
 */
export async function getFeaturedAccident(): Promise<AccidentWithMunicipality | null> {
  const flagged = await prisma.accident.findFirst({
    where: { AND: [ONLY_PUBLISHED, { isFeatured: true }] },
    include: { municipality: true },
    orderBy: { occurredAt: "desc" },
  });
  if (flagged) return narrow(flagged);

  const latest = await prisma.accident.findFirst({
    where: ONLY_PUBLISHED,
    include: { municipality: true },
    orderBy: { occurredAt: "desc" },
  });
  return latest ? narrow(latest) : null;
}

/** Excluye un accidente concreto (para el bloque "relacionados"). */
export async function getRelatedAccidents(
  accident: Pick<AccidentRow, "id" | "municipalityId" | "vehicleType">,
  limit = 4,
): Promise<AccidentWithMunicipality[]> {
  const rows = await prisma.accident.findMany({
    where: {
      AND: [
        ONLY_PUBLISHED,
        { id: { not: accident.id } },
        {
          OR: [
            { municipalityId: accident.municipalityId },
            { vehicleType: accident.vehicleType },
          ],
        },
      ],
    },
    include: { municipality: true },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });

  return rows.map(narrow);
}

/** Detalle publico de un accidente. Devuelve null si no existe o no esta publicado. */
export async function getPublishedAccidentBySlug(
  slug: string,
): Promise<
  | (AccidentWithMunicipality & {
      sources: { id: string; outlet: string; url: string; publishedAt: Date | null }[];
    })
  | null
> {
  const row = await prisma.accident.findFirst({
    where: { AND: [ONLY_PUBLISHED, { slug }] },
    include: {
      municipality: true,
      sources: { select: { id: true, outlet: true, url: true, publishedAt: true } },
    },
  });

  return row ? narrow(row) : null;
}

/** Numero de accidentes publicados por municipio. */
export async function countByMunicipality(): Promise<
  Array<{ slug: string; name: string; island: string; count: number; lat: number; lon: number }>
> {
  const grouped = await prisma.accident.groupBy({
    by: ["municipalityId"],
    where: ONLY_PUBLISHED,
    _count: { _all: true },
  });

  const municipalities = await prisma.municipality.findMany({
    include: { _count: { select: { accidents: { where: ONLY_PUBLISHED } } } },
  });

  const counts = new Map(grouped.map((g) => [g.municipalityId, g._count._all]));

  return municipalities
    .map((m) => ({
      slug: m.slug,
      name: m.name,
      island: m.island,
      lat: m.lat,
      lon: m.lon,
      count: counts.get(m.id) ?? m._count.accidents,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Accidentes recientes publicados, para el mapa. */
export async function getAccidentsForMap(limit = 200): Promise<
  Array<{
    id: string;
    slug: string;
    title: string;
    occurredAt: Date;
    vehicleType: VehicleType;
    severity: AccidentSeverity;
    municipalitySlug: string;
    municipalityName: string;
    approxLat: number | null;
    approxLon: number | null;
    locationDescription: string | null;
  }>
> {
  const rows = await prisma.accident.findMany({
    where: ONLY_PUBLISHED,
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: { municipality: { select: { slug: true, name: true } } },
  });

  return rows.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    occurredAt: a.occurredAt,
    vehicleType: toVehicleType(a.vehicleType),
    severity: toSeverity(a.severity),
    municipalitySlug: a.municipality.slug,
    municipalityName: a.municipality.name,
    approxLat: a.approxLat,
    approxLon: a.approxLon,
    locationDescription: a.locationDescription,
  }));
}

/** Contadores para la cabecera de la portada. */
export async function getPublicStats(): Promise<{ total: number; last24h: number; municipalities: number }> {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [total, last24h, municipalities] = await Promise.all([
    prisma.accident.count({ where: ONLY_PUBLISHED }),
    prisma.accident.count({ where: { AND: [ONLY_PUBLISHED, { occurredAt: { gte: since } }] } }),
    prisma.municipality.count({ where: { accidents: { some: ONLY_PUBLISHED } } }),
  ]);

  return { total, last24h, municipalities };
}

/* ==========================================================================
 *  Resumen semanal
 *
 *  Cubre la pagina /resumen del sitio original: los总数 de una semana,
 *  el reparto por tipo de incidente y por municipio, y la lista de
 *  accidentes de esa semana.
 * ======================================================================== */

export type WeeklySummary = {
  /** Lunes de la semana, a las 00:00 en hora de Canarias. */
  weekStart: Date;
  total: number;
  injuries: number;
  fatalities: number;
  byType: Array<{ label: string; count: number }>;
  byMunicipality: Array<{ label: string; count: number }>;
  accidents: AccidentWithMunicipality[];
};

/**
 * Devuelve el lunes de la semana que contiene `ref`.
 *
 * Las semanas empiezan en lunes, como en el sitio original (que usaba
 * `getDay()` y por tanto el domingo). Se devuelve en UTC porque las fechas se
 * guardan en UTC; al pintarlas se convierten a hora de Canarias.
 */
function mondayOf(ref: Date): Date {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  // getUTCDay(): 0 domingo, 1 lunes... La semana va de lunes a domingo, asi
  // que el domingo retrocede 6 dias y los demas retroceden (dia - 1).
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d;
}

/**
 * Resumen de la semana que contiene `weekStart`, o de la semana actual si no
 * se indica. Solo cuenta noticias publicadas, igual que el resto del sitio.
 */
export async function getWeeklySummary(weekStart?: Date): Promise<WeeklySummary> {
  const start = weekStart ? mondayOf(weekStart) : mondayOf(new Date());
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7); // intervalo [start, end)

  const rows = await prisma.accident.findMany({
    where: { AND: [ONLY_PUBLISHED, { occurredAt: { gte: start, lt: end } }] },
    include: { municipality: true },
    orderBy: { occurredAt: "desc" },
  });

  const accidents = rows.map(narrow);

  // Recuento por tipo de incidente y por municipio. Se usa un Map para mantener
  // el orden de aparicion y no el alfabetico del agrupado de SQL, que seria
  // menos util al leer una lista corta.
  const typeCounts = new Map<string, number>();
  const muniCounts = new Map<string, number>();
  let injuries = 0;
  let fatalities = 0;

  for (const a of accidents) {
    const t = CATEGORY_LABEL[a.category] ?? "Otro";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);

    const m = a.municipality.name;
    muniCounts.set(m, (muniCounts.get(m) ?? 0) + 1);

    injuries += a.injuries;
    fatalities += a.fatalities;
  }

  // De mayor a menor: el dato mas relevante primero.
  const byType = [...typeCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));

  const byMunicipality = [...muniCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));

  return { weekStart: start, total: accidents.length, injuries, fatalities, byType, byMunicipality, accidents };
}

/**
 * Semanas con noticias publicadas, de la mas reciente a la mas antigua.
 * Alimenta el desplegable de semanas de /resumen.
 */
export async function listWeeksWithAccidents(limit = 12): Promise<Date[]> {
  const rows = await prisma.accident.findMany({
    where: ONLY_PUBLISHED,
    select: { occurredAt: true },
    orderBy: { occurredAt: "desc" },
  });

  // mondayOf() ya normaliza a lunes, asi que dos Mondays seguidos detectan que
  // son la misma semana y no se repiten en el desplegable.
  const seen = new Set<number>();
  const weeks: Date[] = [];
  for (const r of rows) {
    const m = mondayOf(r.occurredAt);
    if (seen.has(m.getTime())) continue;
    seen.add(m.getTime());
    weeks.push(m);
    if (weeks.length >= limit) break;
  }
  return weeks;
}

/** Entradas publicadas para el sitemap SEO. */
export async function getPublishedSlugs(): Promise<
  Array<{ slug: string; updatedAt: Date; occurredAt: Date }>
> {
  return prisma.accident.findMany({
    where: ONLY_PUBLISHED,
    select: { slug: true, updatedAt: true, occurredAt: true },
    orderBy: { occurredAt: "desc" },
  });
}

/** Coincidencia exacta de un municipio por slug; null si no existe. */
export async function getMunicipalityBySlug(slug: string): Promise<Municipality | null> {
  return prisma.municipality.findUnique({ where: { slug } });
}

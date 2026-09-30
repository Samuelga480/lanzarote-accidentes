import type { VehicleType } from "@/lib/types";
import type { AccidentFilters } from "@/lib/queries";
import { MUNICIPALITIES } from "@/lib/constants";

/** Forma de los searchParams tal y como llegan desde Next.js (string | string[]). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

const VEHICLE_VALUES: VehicleType[] = ["COCHE", "MOTO", "CAMION", "BICICLETA", "PEATON", "OTROS"];

function isVehicle(v: string | undefined): v is VehicleType {
  return v !== undefined && (VEHICLE_VALUES as string[]).includes(v);
}

/**
 * Traduce los parametros de la URL en un filtro de base de datos.
 * Descarta cualquier valor que no sea valido, de modo que una URL manipulada
 * no puede producir una consulta inesperada.
 */
export function parseFilters(sp: RawSearchParams): AccidentFilters & { q: string } {
  const municipio = one(sp.municipio);
  const vehicle = one(sp.vehicle);
  const desde = one(sp.desde);
  const q = (one(sp.q) ?? "").trim().slice(0, 120);

  const validMunicipality = MUNICIPALITIES.some((m) => m.slug === municipio) ? municipio : undefined;
  const validVehicle = isVehicle(vehicle) ? vehicle : undefined;

  // "desde" es un numero de dias hacia atras.
  let from: Date | undefined;
  if (desde && /^\d{1,4}$/.test(desde)) {
    const days = Math.min(Number(desde), 3650);
    from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  const page = Math.max(1, Number(one(sp.page) ?? "1") || 1);
  const take = 12;

  return {
    municipality: validMunicipality,
    vehicle: validVehicle,
    from,
    q,
    take,
    skip: (page - 1) * take,
  };
}

/** Descripcion legible del filtro activo, para el titulo y el SEO. */
export function describeFilters(
  f: AccidentFilters & { q: string },
): { title: string; parts: string[] } {
  const parts: string[] = [];

  if (f.municipality) {
    const m = MUNICIPALITIES.find((x) => x.slug === f.municipality);
    if (m) parts.push(m.name);
  }
  if (f.q) parts.push(`"${f.q}"`);
  if (f.vehicle) parts.push(f.vehicle.toLowerCase());

  return {
    title: parts.length ? parts.join(" · ") : "Todos los accidentes",
    parts,
  };
}

/** Reconstruye la URL de un listado con una pagina concreta. */
export function pageHref(base: string, sp: RawSearchParams, page: number): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const s = one(v);
    if (s && k !== "page") next.set(k, s);
  }
  if (page > 1) next.set("page", String(page));
  const qs = next.toString();
  return qs ? `${base}?${qs}` : base;
}

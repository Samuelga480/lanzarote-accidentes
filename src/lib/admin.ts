/**
 * Servicio editorial del panel de administracion.
 *
 * Reglas que se aplican aqui y no en las acciones, para que cualquier via de
 * entrada (formulario, API, futuro script) cumpla las mismas normas:
 *
 *  1. Toda escritura pasa por sanitizeAccident: no se guardan matriculas,
 *     telefonos, documentos ni correos.
 *  2. Toda modificacion deja una instantanea en Revision (auditoria).
 *  3. Publicar es siempre una accion humana y explicita. El pipeline de IA no
 *     llama a ninguna de estas funciones.
 *  4. El slug no se puede cambiar en una edicion, para no romper URLs
 *     ya publicadas ni el sitemap.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { narrow } from "@/lib/queries";
import { sanitizeAccident, summarizeFindings } from "@/lib/privacy";
import { slugify, uniqueSlug } from "@/lib/slug";
import { canaryLocalToUtc } from "@/lib/format";
import { MUNICIPALITY_BY_SLUG } from "@/lib/constants";
import { z } from "zod";
import {
  isAccidentStatus,
  type AccidentSeverity,
  type AccidentStatus,
  type Origin,
  type VehicleType,
} from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Validacion del formulario                                                  */
/* -------------------------------------------------------------------------- */

export const sourceFormSchema = z.object({
  outlet: z.string().trim().min(1, "Indica el medio").max(120),
  url: z.string().trim().url("URL no válida").max(600),
  publishedAt: z.string().trim().optional(),
  excerpt: z.string().trim().max(2000).optional(),
});

export const accidentFormSchema = z.object({
  title: z.string().trim().min(10, "El titular debe tener al menos 10 caracteres").max(200),
  summary: z.string().trim().min(20, "El resumen debe tener al menos 20 caracteres").max(500),
  body: z.string().trim().min(50, "El cuerpo debe tener al menos 50 caracteres").max(20000),
  municipalitySlug: z.string().min(1, "Selecciona un municipio"),
  vehicleType: z.enum(["COCHE", "MOTO", "CAMION", "BICICLETA", "PEATON", "OTROS"]),
  severity: z.enum(["LEVE", "MODERADO", "GRAVE"]),
  /** Fecha/hora naive en hora de Canarias: "2026-09-30T14:30". */
  occurredAt: z.string().trim().min(1, "Indica fecha y hora"),
  fatalities: z.coerce.number().int().min(0).max(50).default(0),
  injuries: z.coerce.number().int().min(0).max(200).default(0),
  locationDescription: z.string().trim().max(200).optional().or(z.literal("")),
  imageUrl: z.union([z.literal(""), z.string().url("La URL de la imagen no es válida")]),
  imageAlt: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(["PENDING_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED"]),
  reviewNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  /** Lista de fuentes en JSON, gestionada por el componente del formulario. */
  sourcesJson: z.string().optional(),
});

export type AccidentFormInput = z.infer<typeof accidentFormSchema>;

/** Lee un FormData en el formato que espera accidentFormSchema. */
export function formDataToInput(fd: FormData): AccidentFormInput {
  return accidentFormSchema.parse({
    title: fd.get("title") ?? "",
    summary: fd.get("summary") ?? "",
    body: fd.get("body") ?? "",
    municipalitySlug: fd.get("municipalitySlug") ?? "",
    vehicleType: fd.get("vehicleType") ?? "",
    severity: fd.get("severity") ?? "MODERADO",
    occurredAt: fd.get("occurredAt") ?? "",
    fatalities: fd.get("fatalities") ?? "0",
    injuries: fd.get("injuries") ?? "0",
    locationDescription: fd.get("locationDescription") ?? "",
    imageUrl: fd.get("imageUrl") ?? "",
    imageAlt: fd.get("imageAlt") ?? "",
    status: fd.get("status") ?? "PENDING_REVIEW",
    reviewNotes: fd.get("reviewNotes") ?? "",
    sourcesJson: fd.get("sourcesJson") ?? "",
  });
}

/** Valida el array de fuentes que llega como JSON desde el formulario. */
export function parseSources(json: string | undefined): Array<z.infer<typeof sourceFormSchema>> {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("No se pudo leer la lista de fuentes.");
  }
  if (!Array.isArray(raw)) throw new Error("La lista de fuentes tiene un formato incorrecto.");
  // Descarta filas vacias: el editor puede haber dejado una en blanco.
  return raw
    .filter((r): r is Record<string, string> => !!r && typeof r === "object")
    .map((r) => sourceFormSchema.parse({ outlet: r.outlet ?? "", url: r.url ?? "", ...r }));
}

/* -------------------------------------------------------------------------- */
/*  Utilidades internas                                                        */
/* -------------------------------------------------------------------------- */

async function slugTaken(candidate: string, exceptId?: string): Promise<boolean> {
  const found = await prisma.accident.findUnique({ where: { slug: candidate }, select: { id: true } });
  return found !== null && found.id !== exceptId;
}

/** Instantanea del registro, para el historial de cambios. */
async function snapshot(accidentId: string, editor: string, note: string | null) {
  const acc = await prisma.accident.findUnique({
    where: { id: accidentId },
    include: { municipality: { select: { name: true } } },
  });
  if (!acc) return;

  await prisma.revision.create({
    data: {
      accidentId: acc.id,
      editor,
      note,
      // SQLite no tiene tipo Json: la instantanea se guarda como texto.
      snapshot: JSON.stringify({
        slug: acc.slug,
        title: acc.title,
        summary: acc.summary,
        body: acc.body,
        status: acc.status,
        origin: acc.origin,
        severity: acc.severity,
        vehicleType: acc.vehicleType,
        occurredAt: acc.occurredAt.toISOString(),
        municipality: acc.municipality.name,
        fatalities: acc.fatalities,
        injuries: acc.injuries,
        isFeatured: acc.isFeatured,
        locationDescription: acc.locationDescription,
        imageUrl: acc.imageUrl,
        capturedAt: new Date().toISOString(),
      }),
    },
  });
}

type PreparedData = {
  title: string;
  summary: string;
  body: string;
  occurredAt: Date;
  vehicleType: VehicleType;
  severity: AccidentSeverity;
  fatalities: number;
  injuries: number;
  locationDescription: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  status: AccidentStatus;
  reviewNotes: string | null;
};

/** Limpia los datos personales y añade la nota de privacidad. */
function prepare(input: AccidentFormInput, baseNotes: string | null): PreparedData {
  const { data: clean, findings } = sanitizeAccident({
    title: input.title,
    summary: input.summary,
    body: input.body,
    locationDescription: input.locationDescription || null,
  });

  const privacyNote = summarizeFindings(findings);
  const notes = [baseNotes?.trim() || null, privacyNote].filter(Boolean).join(" ") || null;

  // La fecha llega como "YYYY-MM-DDTHH:mm" en hora de Canarias y se guarda en UTC.
  const occurredAt = canaryLocalToUtc(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("La fecha y la hora del accidente no son válidas.");
  }

  return {
    title: clean.title,
    summary: clean.summary,
    body: clean.body,
    occurredAt,
    vehicleType: input.vehicleType,
    severity: input.severity,
    fatalities: input.fatalities,
    injuries: input.injuries,
    locationDescription: clean.locationDescription ?? null,
    imageUrl: input.imageUrl || null,
    imageAlt: input.imageAlt || null,
    status: input.status,
    reviewNotes: notes,
  };
}

/* -------------------------------------------------------------------------- */
/*  Operaciones                                                                */
/* -------------------------------------------------------------------------- */

export async function createAccident(input: AccidentFormInput, editor: string) {
  const municipality = MUNICIPALITY_BY_SLUG.get(input.municipalitySlug);
  if (!municipality) throw new Error(`Municipio desconocido: ${input.municipalitySlug}`);

  const data = prepare(input, input.reviewNotes || null);
  const sources = parseSources(input.sourcesJson);
  const slug = await uniqueSlug(slugify(data.title), (c) => slugTaken(c));

  const created = await prisma.accident.create({
    data: {
      slug,
      ...data,
      municipality: { connect: { slug: municipality.slug } },
      origin: "MANUAL",
      isFeatured: false,
      // Si se publica al crear, la revisión queda registrada desde el primer momento.
      reviewedAt: data.status === "PUBLISHED" ? new Date() : null,
      reviewedBy: data.status === "PUBLISHED" ? editor : null,
      sources: {
        create: sources.map((s) => ({
          outlet: s.outlet,
          url: s.url,
          publishedAt: s.publishedAt ? canaryLocalToUtc(s.publishedAt) : null,
          excerpt: s.excerpt || null,
        })),
      },
    },
  });

  await snapshot(created.id, editor, "Creación de la noticia");
  return created;
}

export async function updateAccident(id: string, input: AccidentFormInput, editor: string) {
  const existing = await prisma.accident.findUnique({ where: { id } });
  if (!existing) throw new Error("La noticia no existe");

  const municipality = MUNICIPALITY_BY_SLUG.get(input.municipalitySlug);
  if (!municipality) throw new Error(`Municipio desconocido: ${input.municipalitySlug}`);

  const data = prepare(input, input.reviewNotes || null);
  const sources = parseSources(input.sourcesJson);
  const isNowPublished = data.status === "PUBLISHED" && existing.status !== "PUBLISHED";

  const updated = await prisma.accident.update({
    where: { id },
    data: {
      ...data,
      municipality: { connect: { slug: municipality.slug } },
      reviewedAt: isNowPublished ? new Date() : data.status === "PUBLISHED" ? existing.reviewedAt : null,
      reviewedBy: isNowPublished ? editor : data.status === "PUBLISHED" ? existing.reviewedBy : null,
      // El slug y el origen no se tocan en una edicion.
      // Las fuentes se reemplazan por completo con la lista del formulario.
      sources: {
        deleteMany: {},
        create: sources.map((s) => ({
          outlet: s.outlet,
          url: s.url,
          publishedAt: s.publishedAt ? canaryLocalToUtc(s.publishedAt) : null,
          excerpt: s.excerpt || null,
        })),
      },
    },
  });

  await snapshot(id, editor, isNowPublished ? "Edición y aprobación" : "Edición");
  return updated;
}

/** Cambia el estado editorial. Es la unica via de publicación del sistema. */
export async function changeStatus(
  id: string,
  status: AccidentStatus,
  editor: string,
  note?: string | null,
) {
  const existing = await prisma.accident.findUnique({
    where: { id },
    select: { status: true, origin: true },
  });
  if (!existing) throw new Error("La noticia no existe");

  const published = status === "PUBLISHED";

  await prisma.accident.update({
    where: { id },
    data: {
      status,
      reviewedAt: published ? new Date() : null,
      reviewedBy: published ? editor : null,
      // Al dejar de estar publicada se quita tambien el destaque.
      isFeatured: published ? undefined : false,
    },
  });

  await snapshot(id, editor, note?.trim() || `Cambio de estado: ${existing.status} → ${status}`);
}

export async function toggleFeatured(id: string, editor: string) {
  const acc = await prisma.accident.findUnique({ where: { id }, select: { isFeatured: true } });
  if (!acc) throw new Error("La noticia no existe");

  const next = !acc.isFeatured;

  if (next) {
    // Solo puede haber un destacado: se retira el anterior en la misma transaccion.
    await prisma.$transaction([
      prisma.accident.updateMany({
        where: { isFeatured: true, id: { not: id } },
        data: { isFeatured: false },
      }),
      prisma.accident.update({ where: { id }, data: { isFeatured: true } }),
    ]);
  } else {
    await prisma.accident.update({ where: { id }, data: { isFeatured: false } });
  }

  await snapshot(id, editor, next ? "Marcada como destacada" : "Quitada de destacada");
}

export async function removeAccident(id: string, editor: string) {
  const existing = await prisma.accident.findUnique({ where: { id }, select: { title: true } });
  if (!existing) throw new Error("La noticia no existe");

  // Borrado en cascada: se llevan por delante las fuentes y el historial de
  // revisiones de esa noticia (ver onDelete: Cascade en el esquema). Se
  // comprueba antes que exista al menos una fuente verificable, porque una
  // noticia sin respaldo no deberia llegar a publicarse.
  const sources = await prisma.source.count({ where: { accidentId: id } });
  if (sources === 0) {
    throw new Error(
      `«${existing.title}» no tiene ninguna fuente registrada. Añade al menos una antes de eliminarla.`,
    );
  }

  await prisma.accident.delete({ where: { id } });
  void editor; // el parametro se mantiene por firma coherente y para futuros logs
}

/* -------------------------------------------------------------------------- */
/*  Lectura para el panel                                                      */
/* -------------------------------------------------------------------------- */

export async function listForAdmin(opts: {
  status?: AccidentStatus;
  origin?: Origin;
  q?: string;
  take?: number;
  skip?: number;
}) {
  const where: Prisma.AccidentWhereInput = {};
  if (opts.status) where.status = opts.status;
  if (opts.origin) where.origin = opts.origin;
  if (opts.q) {
    where.OR = [
      // SQLite no admite `mode`: su LIKE ya ignora mayusculas en ASCII.
      { title: { contains: opts.q } },
      { summary: { contains: opts.q } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.accident.findMany({
      where,
      include: {
        municipality: { select: { name: true, slug: true } },
        _count: { select: { sources: true, revisions: true } },
      },
      // `status` es texto, no enum: no se puede ordenar por el de forma fiable.
      // Se ordena por fecha, que es lo util en el listado del panel.
      orderBy: { occurredAt: "desc" },
      take: opts.take ?? 25,
      skip: opts.skip ?? 0,
    }),
    prisma.accident.count({ where }),
  ]);

  // Se estrechan status/origin para que el panel pueda indexar STATUS_LABEL.
  const items = rows.map(narrow);

  return { items, total };
}

export async function getForAdmin(id: string) {
  const row = await prisma.accident.findUnique({
    where: { id },
    include: {
      municipality: true,
      sources: { orderBy: { retrievedAt: "desc" } },
      revisions: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  return row ? narrow(row) : null;
}

export async function countByStatus(): Promise<Record<AccidentStatus, number>> {
  const rows = await prisma.accident.groupBy({ by: ["status"], _count: { _all: true } });
  const out: Record<AccidentStatus, number> = {
    PENDING_REVIEW: 0,
    PUBLISHED: 0,
    REJECTED: 0,
    ARCHIVED: 0,
  };
  for (const r of rows) {
    // status es texto en el esquema: se descarta cualquier valor inesperado.
    if (isAccidentStatus(r.status)) out[r.status] = r._count._all;
  }
  return out;
}

/**
 * Pipeline de generacion automatica de borradores.
 *
 * REGLA INNEGOCIABLE: todo lo que entra por aqui nace como PENDING_REVIEW.
 * No existe ninguna funcion en este fichero capable de publicar una noticia.
 * La unica via de publicacion es la aprobacion manual desde /admin.
 *
 * Cuando se conecte un proveedor de IA real, solo hay que implementar la
 * interfaz `ResearchProvider`: el resto del flujo no cambia.
 */

import { prisma } from "@/lib/prisma";
import { sanitizeAccident, summarizeFindings } from "@/lib/privacy";
import { slugify, uniqueSlug } from "@/lib/slug";
import { MUNICIPALITY_BY_SLUG } from "@/lib/constants";
import { z } from "zod";
import type { AccidentSeverity, Origin, VehicleType } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Contrato de entrada (lo que la IA debe entregar)                           */
/* -------------------------------------------------------------------------- */

export const sourceSchema = z.object({
  outlet: z.string().min(1).max(120),
  url: z.string().url().max(600),
  publishedAt: z.coerce.date().optional().nullable(),
  excerpt: z.string().max(2000).optional().nullable(),
});

export const aiDraftSchema = z.object({
  title: z.string().min(10).max(200),
  summary: z.string().min(20).max(500),
  body: z.string().min(50).max(20000),
  occurredAt: z.coerce.date(),
  municipalitySlug: z.string().min(1),
  vehicleType: z.enum(["COCHE", "MOTO", "CAMION", "BICICLETA", "PEATON", "OTROS"]),
  severity: z.enum(["LEVE", "MODERADO", "GRAVE"]).default("MODERADO"),
  fatalities: z.number().int().min(0).max(50).default(0),
  injuries: z.number().int().min(0).max(200).default(0),
  imageUrl: z.string().url().max(600).optional().nullable(),
  imageAlt: z.string().max(200).optional().nullable(),
  /** Descripcion del lugar en lenguaje natural. NUNCA la direccion exacta. */
  locationDescription: z.string().max(200).optional().nullable(),
  /**
   * Coordenada del lugar, si la fuente la facilita. Se usa SOLO como punto de
   * partida para obtener una ubicacion aproximada (ver perturbarCoordenada).
   */
  geoPoint: z.object({ lat: z.number().min(28.4).max(29.2), lon: z.number().min(-13.95).max(-13.4) }).optional().nullable(),
  sources: z.array(sourceSchema).min(1, "Un borrador debe incluir al menos una fuente verificable"),
});

export type AiDraftInput = z.infer<typeof aiDraftSchema>;

/* -------------------------------------------------------------------------- */
/*  Privacidad: ubicacion siempre aproximada                                    */
/* -------------------------------------------------------------------------- */

/**
 * Desplaza la coordenada un numero aleatorio de entre 400 y 900 metros.
 * El marcador del mapa muestra un area aproximada, no el punto exacto, para no
 * identificar el lugar concreto de un accidente.
 */
export function perturbCoordinate(coord: { lat: number; lon: number }): { lat: number; lon: number } {
  const radiusM = 400 + Math.random() * 500;
  const angle = Math.random() * 2 * Math.PI;
  const dLat = (radiusM * Math.cos(angle)) / 111_320;
  const dLon = (radiusM * Math.sin(angle)) / (111_320 * Math.cos((coord.lat * Math.PI) / 180));
  return { lat: coord.lat + dLat, lon: coord.lon + dLon };
}

/** Punto de referencia: centro del municipio, si no hay coordenada de la fuente. */
function basePoint(municipalitySlug: string): { lat: number; lon: number } {
  const m = MUNICIPALITY_BY_SLUG.get(municipalitySlug);
  if (!m) throw new Error(`Municipio desconocido: ${municipalitySlug}`);
  return { lat: m.lat, lon: m.lon };
}

/* -------------------------------------------------------------------------- */
/*  Creacion del borrador                                                      */
/* -------------------------------------------------------------------------- */

export type CreateDraftResult = {
  ok: boolean;
  id?: string;
  slug?: string;
  status?: "PENDING_REVIEW";
  privacyFindings?: number;
  error?: string;
  details?: unknown;
};

/**
 * Guarda un borrador generado automaticamente.
 *
 * Acciones:
 *  1. Valida el payload con zod.
 *  2. Elimina matriculas, telefonos y documentos del texto.
 *  3. Convierte la coordenada en un punto aproximado.
 *  4. Guarda las fuentes consultadas.
 *  5. Lo crea SIEMPRE como PENDING_REVIEW / origin AI.
 */
export async function createDraftFromAI(payload: unknown): Promise<CreateDraftResult> {
  const parsed = aiDraftSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Payload invalido",
      details: parsed.error.flatten(),
    };
  }
  const input = parsed.data;

  const municipality = MUNICIPALITY_BY_SLUG.get(input.municipalitySlug);
  if (!municipality) {
    return { ok: false, error: `Municipio no valido: ${input.municipalitySlug}` };
  }

  // --- Privacidad: limpieza de datos personales ---
  const { data: clean, findings } = sanitizeAccident({
    title: input.title,
    summary: input.summary,
    body: input.body,
    locationDescription: input.locationDescription ?? null,
  });

  // --- Privacidad: ubicacion aproximada ---
  const origin = input.geoPoint ?? basePoint(input.municipalitySlug);
  const approx = perturbCoordinate(origin);

  // --- Slug unico ---
  const slug = await uniqueSlug(slugify(clean.title), async (candidate) => {
    const found = await prisma.accident.findUnique({ where: { slug: candidate }, select: { id: true } });
    return found !== null;
  });

  const privacyNote = summarizeFindings(findings);

  const created = await prisma.accident.create({
    data: {
      slug,
      title: clean.title,
      summary: clean.summary,
      body: clean.body,
      imageUrl: input.imageUrl ?? null,
      imageAlt: input.imageAlt ?? null,
      occurredAt: input.occurredAt,
      municipality: { connect: { slug: municipality.slug } },
      vehicleType: input.vehicleType,
      severity: input.severity,
      fatalities: input.fatalities,
      injuries: input.injuries,
      approxLat: approx.lat,
      approxLon: approx.lon,
      locationDescription: clean.locationDescription ?? null,

      // Punto no negociable del pipeline
      status: "PENDING_REVIEW",
      origin: "AI" as Origin,

      isFeatured: false,
      reviewNotes: privacyNote,

      sources: {
        create: input.sources.map((s) => ({
          outlet: s.outlet,
          url: s.url,
          publishedAt: s.publishedAt ?? null,
          excerpt: s.excerpt ?? null,
        })),
      },
    },
    select: { id: true, slug: true, status: true },
  });

  // Invariante verificada en runtime: si alguien cambiara el estado de la
  // linea 157, el fallo seria explicito en lugar de propagar en silencio una
  // noticia publicada por el pipeline de IA.
  if (created.status !== "PENDING_REVIEW") {
    throw new Error(
      "Invariante rota: el borrador se ha guardado con un estado distinto de PENDING_REVIEW. " +
        "No se ha devuelto al cliente; revisa createDraftFromAI antes de volver a intentarlo.",
    );
  }

  // Traza de auditoria: un borrador de IA tambien deja constancia de quien lo
  // creo (el sistema) y de que se genero automaticamente. Sin esta fila, el
  // historial de la noticia estaria vacia hasta que un editor la tocase.
  await prisma.revision.create({
    data: {
      accidentId: created.id,
      editor: "ia",
      note: "Borrador generado automaticamente por el pipeline de IA",
      snapshot: JSON.stringify({
        slug: created.slug,
        title: clean.title,
        summary: clean.summary,
        body: clean.body,
        status: "PENDING_REVIEW",
        origin: "AI",
        severity: input.severity,
        vehicleType: input.vehicleType,
        occurredAt: input.occurredAt.toISOString(),
        municipality: municipality.name,
        fatalities: input.fatalities,
        injuries: input.injuries,
        isFeatured: false,
        locationDescription: clean.locationDescription ?? null,
        imageUrl: input.imageUrl ?? null,
        capturedAt: new Date().toISOString(),
      }),
    },
  });

  return {
    ok: true,
    id: created.id,
    slug: created.slug,
    // Se devuelve la constante y no lo que devuelve la base de datos, para que
    // el tipo siga garantizando que nada sale de aqui como publicado.
    status: "PENDING_REVIEW",
    privacyFindings: findings.length,
  };
}

/* -------------------------------------------------------------------------- */
/*  Interfaz para conectar un proveedor de IA real                             */
/* -------------------------------------------------------------------------- */

export type ResearchProvider = {
  /** Nombre legible del proveedor, para mostrarlo en el panel. */
  name: string;
  /**
   * Busca en las fuentes publicas y devuelve candidatos.
   * Implementacion pendiente: conectar aqui el proveedor elegido.
   */
  search(query: { municipality?: string; from?: Date; to?: Date }): Promise<AiDraftInput[]>;
  /** Redacta un borrador a partir de los documentos recopilados. */
  draft(sources: { outlet: string; url: string; text: string }[]): Promise<Omit<AiDraftInput, "sources">>;
};

/**
 * Registro de proveedores. Vacio a proposito: el sistema funciona sin IA.
 * Para activarlo, instancia un proveedor y anadelo aqui.
 */
const providers = new Map<string, ResearchProvider>();

export function registerProvider(provider: ResearchProvider): void {
  providers.set(provider.name, provider);
}

export function listProviders(): ResearchProvider[] {
  return [...providers.values()];
}

/**
 * Ejecuta un proveedor registered y guarda todos sus borradores.
 * Devuelve el recuento de creados y fallidos. Ninguno queda publicado.
 */
export async function runProvider(name: string, query: { municipality?: string; from?: Date; to?: Date }) {
  const provider = providers.get(name);
  if (!provider) throw new Error(`Proveedor no registrado: ${name}`);

  const drafts = await provider.search(query);
  const results: CreateDraftResult[] = [];
  for (const draft of drafts) {
    results.push(await createDraftFromAI(draft));
  }

  return {
    provider: provider.name,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth";
import { createAccident } from "@/lib/admin";
import { parseFilters, type RawSearchParams } from "@/lib/filters";
import { listAccidents } from "@/lib/queries";
import { VEHICLE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;

/**
 * GET /api/accidents
 * Listado publico. Solo devuelve noticias publicadas, con los mismos filtros
 * que el sitio web.
 *
 * Parametros: municipio, vehicle, desde (dias), q, page
 */
export async function GET(request: NextRequest) {
  const sp: RawSearchParams = {};
  for (const [k, v] of request.nextUrl.searchParams) sp[k] = v;

  const filters = parseFilters(sp);
  const page = Math.floor((filters.skip ?? 0) / PER_PAGE) + 1;
  const { items, total } = await listAccidents({ ...filters, take: PER_PAGE });

  return NextResponse.json({
    meta: {
      total,
      page,
      perPage: PER_PAGE,
      totalPages: Math.max(1, Math.ceil(total / PER_PAGE)),
    },
    data: items.map((a) => ({
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      occurredAt: a.occurredAt.toISOString(),
      municipality: { slug: a.municipality.slug, name: a.municipality.name },
      vehicleType: a.vehicleType,
      vehicleLabel: VEHICLE_LABEL[a.vehicleType],
      severity: a.severity,
      fatalities: a.fatalities,
      injuries: a.injuries,
      isFeatured: a.isFeatured,
      // Ubicacion aproximada: nunca exacta.
      approxLocation: a.locationDescription,
      approxLat: a.approxLat,
      approxLon: a.approxLon,
      imageUrl: a.imageUrl,
      url: `/accidentes/${a.slug}`,
    })),
  });
}

/**
 * POST /api/accidents
 * Crea una noticia. Requiere sesion de administrador valida.
 *
 * Por defecto se crea PENDING_REVIEW. Publicar exige mandar status PUBLISHED
 * de forma explicita y autenticada.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json(
      { error: "No autorizado. Se requiere sesion de administrador." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;

  // ElFormData espera cadenas; aqui se adapta el JSON.
  const fd = new FormData();
  for (const key of [
    "title",
    "summary",
    "body",
    "municipalitySlug",
    "vehicleType",
    "severity",
    "occurredAt",
    "fatalities",
    "injuries",
    "locationDescription",
    "imageUrl",
    "imageAlt",
    "status",
    "reviewNotes",
  ]) {
    const v = b[key];
    if (v !== undefined && v !== null) fd.set(key, String(v));
  }

  if (Array.isArray(b.sources)) {
    fd.set("sourcesJson", JSON.stringify(b.sources));
  }

  // La API trabaja con ISO 8601 completo; el formulario, con hora local.
  if (typeof b.occurredAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(b.occurredAt)) {
    fd.set("occurredAt", toCanaryNaive(new Date(b.occurredAt)));
  }

  try {
    // formDataToInput se importa aqui para reutilizar la validacion y la limpieza.
    const { formDataToInput } = await import("@/lib/admin");
    const created = await createAccident(formDataToInput(fd), "api");
    revalidatePath("/", "layout");

    return NextResponse.json(
      {
        id: created.id,
        slug: created.slug,
        status: created.status,
        message: "Noticia creada.",
      },
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo crear la noticia.";
    const isValidation = "invalid_type" in (e as object) || "too_small" in (e as object);
    return NextResponse.json(
      { error: message },
      { status: isValidation ? 400 : 500 },
    );
  }
}

/** Convierte un instante ISO a la cadena "YYYY-MM-DDTHH:mm" que espera el formulario. */
function toCanaryNaive(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Atlantic/Canary",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const pad = (n: string) => n.padStart(2, "0");
  return `${map.year}-${map.month}-${map.day}T${pad(String(Number(map.hour) % 24))}:${pad(map.minute)}`;
}

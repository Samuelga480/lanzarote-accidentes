import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth";
import {
  changeStatus,
  formDataToInput,
  getForAdmin,
  removeAccident,
  updateAccident,
} from "@/lib/admin";
import { getPublishedAccidentBySlug } from "@/lib/queries";
import { SEVERITY_LABEL, VEHICLE_LABEL } from "@/lib/constants";
import type { AccidentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const VALID_STATUS: AccidentStatus[] = ["PENDING_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED"];

/**
 * GET /api/accidents/[slug]
 * Detalle publico de una noticia publicada, con sus fuentes.
 */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  const accident = await getPublishedAccidentBySlug(slug);

  if (!accident) {
    return NextResponse.json({ error: "Noticia no encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      slug: accident.slug,
      title: accident.title,
      summary: accident.summary,
      body: accident.body,
      occurredAt: accident.occurredAt.toISOString(),
      createdAt: accident.createdAt.toISOString(),
      updatedAt: accident.updatedAt.toISOString(),
      municipality: { slug: accident.municipality.slug, name: accident.municipality.name },
      vehicleType: accident.vehicleType,
      vehicleLabel: VEHICLE_LABEL[accident.vehicleType],
      severity: accident.severity,
      severityLabel: SEVERITY_LABEL[accident.severity],
      fatalities: accident.fatalities,
      injuries: accident.injuries,
      isFeatured: accident.isFeatured,
      // Datos aproximados: no permiten localizar el punto exacto.
      approxLocation: accident.locationDescription,
      approxLat: accident.approxLat,
      approxLon: accident.approxLon,
      imageUrl: accident.imageUrl,
      imageAlt: accident.imageAlt,
      sources: accident.sources.map((s) => ({
        outlet: s.outlet,
        url: s.url,
        publishedAt: s.publishedAt?.toISOString() ?? null,
      })),
      url: `/accidentes/${accident.slug}`,
    },
  });
}

/**
 * PUT /api/accidents/[slug]
 * Actualiza una noticia. Requiere sesion de administrador.
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { slug } = await params;
  const existing = await getForAdmin(slug).catch(() => null);
  // El endpoint trabaja por id interno, no por slug, para no ambiguar.
  void existing;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json(
      { error: "Incluye el campo `id` con el identificador interno de la noticia." },
      { status: 400 },
    );
  }

  const fd = new FormData();
  for (const key of [
    "title", "summary", "body", "municipalitySlug", "vehicleType", "severity",
    "occurredAt", "fatalities", "injuries", "locationDescription",
    "imageUrl", "imageAlt", "status", "reviewNotes",
  ]) {
    const v = body[key];
    if (v !== undefined && v !== null) fd.set(key, String(v));
  }
  if (Array.isArray(body.sources)) fd.set("sourcesJson", JSON.stringify(body.sources));

  try {
    const current = await getForAdmin(id);
    if (!current) return NextResponse.json({ error: "Noticia no encontrada." }, { status: 404 });

    // Conserva los campos que el cliente no envie.
    if (!body.occurredAt) fd.set("occurredAt", toCanaryNaive(current.occurredAt));
    for (const key of ["title", "summary", "body", "municipalitySlug", "vehicleType", "severity", "status"]) {
      if (fd.get(key) === null) {
        const cur = key === "municipalitySlug" ? current.municipality.slug : (current as unknown as Record<string, unknown>)[key];
        fd.set(key, String(cur));
      }
    }
    if (fd.get("fatalities") === null) fd.set("fatalities", String(current.fatalities));
    if (fd.get("injuries") === null) fd.set("injuries", String(current.injuries));
    if (fd.get("sourcesJson") === null) {
      fd.set(
        "sourcesJson",
        JSON.stringify(
          current.sources.map((s) => ({ outlet: s.outlet, url: s.url, excerpt: s.excerpt ?? "" })),
        ),
      );
    }

    const updated = await updateAccident(id, formDataToInput(fd), "api");
    revalidatePath("/", "layout");

    return NextResponse.json({
      id: updated.id,
      slug: updated.slug,
      status: updated.status,
      message: "Noticia actualizada.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo actualizar." },
      { status: 400 },
    );
  }
}

/**
 * PATCH /api/accidents/[slug]
 * Cambia el estado editorial. Es la via de publicacion.
 *   body: { id, status: "PUBLISHED", note?: string }
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  void params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  const status = body.status as AccidentStatus;

  if (!id || !VALID_STATUS.includes(status)) {
    return NextResponse.json(
      { error: `Indica \`id\` y un \`status\` válido (${VALID_STATUS.join(", ")}).` },
      { status: 400 },
    );
  }

  try {
    await changeStatus(id, status, "api", typeof body.note === "string" ? body.note : null);
    revalidatePath("/", "layout");
    return NextResponse.json({ id, status, message: "Estado actualizado." });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo cambiar el estado." },
      { status: 400 },
    );
  }
}

/**
 * DELETE /api/accidents/[slug]
 *   body: { id }
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  void params;

  let id: string | null = null;
  try {
    const body = (await request.json()) as { id?: string };
    id = body.id ?? null;
  } catch {
    // Se admite tambien ?id= en la query string.
    id = request.nextUrl.searchParams.get("id");
  }

  if (!id) {
    return NextResponse.json({ error: "Indica el `id` de la noticia a eliminar." }, { status: 400 });
  }

  try {
    await removeAccident(id, "api");
    revalidatePath("/", "layout");
    return NextResponse.json({ message: "Noticia eliminada." });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo eliminar." },
      { status: 400 },
    );
  }
}

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

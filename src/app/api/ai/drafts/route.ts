import { NextResponse, type NextRequest } from "next/server";

import { createDraftFromAI } from "@/lib/ai/pipeline";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/drafts
 *
 * Endpoint de entrada para el sistema de IA. Recibe un borrador ya redactado,
 * lo limpia de datos personales, convierte su ubicacion en aproximada y lo
 * guarda SIEMPRE como PENDING_REVIEW.
 *
 * Es mathematicamente imposible que este endpoint publique una noticia: la
 * unica funcion a la que llama, createDraftFromAI, fija el estado de forma
 * explicita y no acepta el estado como parametro.
 *
 * Autenticacion: cabecera  Authorization: Bearer <AI_WEBHOOK_SECRET>
 *
 * Si AI_WEBHOOK_SECRET no esta definido en el entorno, el endpoint devuelve
 * 503 y no hace nada. Asi una despliegue mal configurada no expone la via de
 * escritura por accidente.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.AI_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Integración con IA deshabilitada. Define AI_WEBHOOK_SECRET en el fichero .env para activarla.",
      },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!presented || !timingSafeEqualStr(presented, secret)) {
    return NextResponse.json({ error: "Token de acceso no válido." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  // Permite enviar uno o varios borradores.
  const batch = Array.isArray(payload)
    ? payload
    : (payload as { drafts?: unknown[] })?.drafts ?? [payload];

  if (!Array.isArray(batch) || batch.length === 0) {
    return NextResponse.json({ error: "No se ha recibido ningún borrador." }, { status: 400 });
  }

  if (batch.length > 50) {
    return NextResponse.json(
      { error: "Máximo 50 borradores por petición." },
      { status: 413 },
    );
  }

  const results = [];
  for (const draft of batch) {
    results.push(await createDraftFromAI(draft));
  }

  const created = results.filter((r) => r.ok).length;
  const failed = results.length - created;

  return NextResponse.json(
    {
      created,
      failed,
      // Recordatorio explícito en la propia respuesta.
      notice:
        "Los borradores se han guardado como PENDING_REVIEW. Ninguno se ha publicado: requieren aprobación manual en /admin.",
      results,
    },
    { status: created > 0 ? 201 : 422 },
  );
}

/** Compara dos cadenas en tiempo constante, sin filtrar por longitud antes. */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Aun asi se recorre la cadena para nofiltrar informacion por el tiempo.
    let diff = 1;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ 0;
    return diff === 0 && false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** GET: describe el contrato, util para quien integrate el sistema. */
export async function GET() {
  const enabled = Boolean(process.env.AI_WEBHOOK_SECRET);
  return NextResponse.json({
    endpoint: "POST /api/ai/drafts",
    enabled,
    auth: "Authorization: Bearer <AI_WEBHOOK_SECRET>",
    guarantees: [
      "Todo borrador se crea con status PENDING_REVIEW; nunca se publica automáticamente.",
      "Se eliminan matrículas, teléfonos, documentos de identidad y correos antes de guardar.",
      "La coordenada se desplaza entre 400 y 900 m, de modo que el mapa nunca muestra el punto exacto.",
      "Las fuentes enviadas se conservan y se publican junto a la noticia.",
      "Cada borrador exige al menos una fuente verificable (campo `sources`, mínimo 1 elemento).",
    ],
    payload: {
      title: "string (10-200)",
      summary: "string (20-500)",
      body: "string (50-20000)",
      occurredAt: "ISO 8601, p. ej. 2026-09-30T14:30:00Z",
      municipalitySlug: "arrecife | haria | teguise | tinajo | tias | tizayuca | yaiza",
      zoneSlug: "opcional. Slug de la zona dentro del municipio (p. ej. puerto-del-carmen)",
      vehicleType: "COCHE | MOTO | CAMION | BICICLETA | PEATON | OTROS",
      severity: "LEVE | MODERADO | GRAVE (opcional, por defecto MODERADO)",
      fatalities: "número, opcional",
      injuries: "número, opcional",
      locationDescription: "string, opcional. Zona aproximada, nunca una dirección exacta.",
      geoPoint: "{ lat, lon }, opcional. Se desplaza antes de guardarse.",
      imageUrl: "URL, opcional",
      sources: "[{ outlet, url, publishedAt?, excerpt? }] — obligatorio, mínimo 1",
    },
  });
}

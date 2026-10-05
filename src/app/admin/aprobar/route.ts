import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import { changeStatus } from "@/lib/admin";
import type { AccidentStatus } from "@/lib/types";

/**
 * Publica o rechaza un borrador.
 *
 * Equivale al boton "Aprobar" del panel original. Es el unico camino por el que
 * una noticia pasa a PUBLISHED: no hay ninguna ruta automatica que lo haga.
 *
 * Se acepta POST con id en el cuerpo y, por comodidad, tambien ?id= en la URL,
 * que es como lo enlazaba el JavaScript del sitio antiguo.
 *
 * ---------------------------------------------------------------------------
 *  EL PARAMETRO `volver`
 * ---------------------------------------------------------------------------
 *
 * La ficha de una sola noticia, `/admin/<id>`, es adonde llega el enlace del
 * correo de aviso. Antes, al aprobar desde ahi, la respuesta saltaba al panel
 * entero: habia que volver a buscar la noticia en la lista, que es justo lo que
 * el enlace pretendia evitar.
 *
 * Con `volver` se queda en la ficha. Solo se acepta una ruta interna que empiece
 * por `/admin`, para que el parametro no sirva de redireccion abierta a un sitio
 * de fuera.
 */
export async function POST(request: Request) {
  await requireAuth();

  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);

  const id = (form?.get("id")?.toString() || url.searchParams.get("id") || "").trim();
  if (!id) redirect("/admin?error=falta-id");

  const estado = (form?.get("estado")?.toString() || "PUBLISHED") as AccidentStatus;
  const destino = ["PENDING_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED"].includes(estado)
    ? estado
    : "PUBLISHED";

  await changeStatus(id, destino, "editor", "Aprobado desde el panel");

  revalidatePath("/admin");
  revalidatePath("/", "layout");

  const pedido = (form?.get("volver")?.toString() || "").trim();
  const volver = pedido.startsWith("/admin") && !pedido.startsWith("//") ? pedido : "";
  const aviso = destino === "PUBLISHED" ? "publicada=1" : "rechazada=1";

  redirect(volver ? `${volver}?${aviso}` : `/admin?${aviso}`);
}
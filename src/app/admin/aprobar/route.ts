import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import { changeStatus } from "@/lib/admin";
import type { AccidentStatus } from "@/lib/types";

/**
 * Publica un borrador.
 *
 * Equivale al boton "Aprobar" del panel original. Es el unico camino por el que
 * una noticia pasa a PUBLISHED: no hay ninguna ruta automatica que lo haga.
 *
 * Se acepta POST con id en el cuerpo y, por comodidad, tambien ?id= en la URL,
 * que es como lo enlazaba el JavaScript del sitio antiguo.
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

  redirect("/admin?publicada=1");
}
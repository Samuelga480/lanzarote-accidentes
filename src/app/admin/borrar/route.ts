import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-guard";
import { removeAccident } from "@/lib/admin";

/**
 * Borra una noticia del panel.
 *
 * Equivale al boton "Eliminar" del panel original.
 *
 * A diferencia del alta y de la edicion, aqui no hay Server Action con
 * confirmacion: el borrado es irreversible, asi que la confirmacion la pide el
 * propio boton en el cliente antes de enviar nada.
 */
export async function POST(request: Request) {
  await requireAuth();

  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const id = (form?.get("id")?.toString() || url.searchParams.get("id") || "").trim();

  if (!id) redirect("/admin?error=falta-id");

  await removeAccident(id, "editor");

  revalidatePath("/admin");
  revalidatePath("/", "layout");

  redirect("/admin?borrada=1");
}
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { audit } from "@/lib/logger";
import { TODAS_LAS_CATEGORIAS } from "@/lib/categorias";
import type { IncidentCategory } from "@prisma/client";

/**
 * Corrige el tipo de una noticia.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE EXISTE
 * ---------------------------------------------------------------------------
 *
 * El panel ensenaba la categoria en readonly y no habia forma de tocarla. Con
 * siete tipos de suceso eso no pasaba nada: o estaba bien o se rechazaba la
 * noticia. Con 34 temas de informacion pasa lo contrario: el clasificador se
 * equivoca a menudo y la noticia es buena, solo que mal etiquetada. Sin poder
 * corregirla, la unica salida era tirar el trabajo y volver a detectinglo.
 *
 * Ademas el cambio de familia no es cosmetico. Marcar como OTRO saca la
 * noticia del mapa y de los resumenes de accidentes; marcarla como ATROPELLO la
 * mete. Por eso el selector esta en la ficha y no escondido en el listado.
 *
 * ---------------------------------------------------------------------------
 *  QUE SE ACEPTA Y QUE NO
 * ---------------------------------------------------------------------------
 *
 * Solo valores que esten de verdad en la lista. Se valida contra
 * TODAS_LAS_CATEGORIAS y no contra lo que llegue: el parametro viene de un
 * formulario, y escribir a la enum una cadena inventada es un error de Postgres
 * que tumba la peticion.
 *
 * ---------------------------------------------------------------------------
 *  AUDITORIA
 * ---------------------------------------------------------------------------
 *
 * Se guarda el antes y el despues en reviewNotes. Una reclasificacion es una
 * decision editorial y tiene que poder explicarse despues, igual que una
 * aprobacion.
 */
export async function POST(request: Request) {
  await requireAuth();

  const form = await request.formData().catch(() => null);
  const id = (form?.get("id")?.toString() || "").trim();
  const pedida = (form?.get("categoria")?.toString() || "").trim();

  const volver = `/admin/${id}`;

  if (!id) redirect("/admin?error=falta-id");
  if (!TODAS_LAS_CATEGORIAS.includes(pedida)) redirect(`${volver}?categoria=error`);

  const actual = await prisma.accident.findUnique({
    where: { id },
    select: { id: true, category: true, status: true },
  });

  if (!actual) redirect("/admin?error=no-existe");

  // No se toca nada si el valor es el mismo: escribir la misma categoria borra
  // la nota de revision anterior sin motivo.
  if (actual.category === pedida) redirect(`${volver}?categoria=igual`);

  await prisma.accident.update({
    where: { id },
    data: {
      category: pedida as IncidentCategory,
      reviewedAt: new Date(),
      reviewedBy: "editor",
      reviewNotes: `Categoria corregida a mano: ${actual.category} -> ${pedida}.`,
    },
  });

  await audit({
    actor: "editor",
    action: "UPDATE",
    entity: "accident",
    entityId: id,
    detail: { campo: "category", de: actual.category, a: pedida, estado: actual.status },
  });

  // El mapa, los resumenes y la portada dependen de la familia, asi que hay que
  // revalidar por el layout entero.
  revalidatePath("/admin");
  revalidatePath("/", "layout");

  redirect(`${volver}?categoria=1`);
}
/**
 * Publicar un comentario, como Server Action.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE NO ES UN ENDPOINT
 * ---------------------------------------------------------------------------
 *
 * Antes era `POST /api/comments`, con el formulario haciendo un `fetch` con JSON
 * y despues un `router.refresh()` para que la lista se volviera a pintar. Con
 * Server Actions el `<form action={...}>` llama a esta funcion en el servidor y
 * `revalidatePath` recarga la ficha: el comentario nuevo aparece sin que el
 * navegador tenga que pedir nada a una API.
 */

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/user-auth";

export type CommentState = {
  ok: boolean;
  error: string;
};

/**
 * Publica un comentario en una noticia. Requiere sesion iniciada.
 *
 * El recorte coincide con el CHECK de la tabla: si aqui se dejara pasar mas, la
 * base de datos rechazaria la escritura y el error seria incomprensible.
 */
export async function createCommentAction(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "Necesitas iniciar sesion para comentar." };
  }

  const accidentId = formData.get("accidentId")?.toString() ?? "";
  const slug = formData.get("slug")?.toString() ?? "";
  const text = formData.get("body")?.toString() ?? "";

  const clean = text.trim().slice(0, 2000);
  if (!clean) return { ok: false, error: "El comentario esta vacio." };

  // La noticia tiene que existir y estar publicada: comentar en un borrador
  // filtraria el contenido antes de tiempo.
  const accident = await prisma.accident.findFirst({
    where: { id: accidentId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!accident) return { ok: false, error: "La noticia no existe." };

  await prisma.comment.create({
    data: { body: clean, userId: user.id, accidentId: accident.id },
    select: { id: true },
  });

  /*
    La ficha de la noticia, el perfil de quien comenta y su ficha publica
    muestran los comentarios. Se revalidan los tres: si no, el comentario
    apareceria en la noticia y no en los otros dos, que es exactamente lo que se
    vio antes de cambiar esto.
  */
  if (slug) revalidatePath(`/noticias/${slug}`);
  revalidatePath("/perfil");
  revalidatePath(`/u/${user.id}`);

  return { ok: true, error: "" };
}
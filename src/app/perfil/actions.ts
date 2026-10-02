"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/user-auth";

/** Lo que devuelve la edicion del perfil, para poder mostrar el resultado. */
export type ProfileActionState = {
  ok: boolean;
  message: string;
};

/**
 * Guarda el nombre publico y la descripcion del usuario.
 *
 * Solo toca los campos de la cuenta de quien esta edición. El correo y el rol
 * no se aceptan aqui a proposito: el rol se cambia desde el script de alta y el
 * correo identifica la cuenta.
 *
 * El recorte coincide con los CHECK de la tabla (nombre 80, descripcion 1000).
 * Si aqui dejara pasar mas, la base de datos rechazaria la escritura y el error
 * le llegaria al usuario como un fallo seco.
 */
export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");

  const name = (formData.get("name")?.toString() ?? "").trim().slice(0, 80);
  const bio = (formData.get("bio")?.toString() ?? "").trim().slice(0, 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      // Un nombre en blanco se guarda como null, no como cadena vacia: asi la
      // interfaz puede distinguir "no ha puesto nombre" de "lo ha borrado".
      name: name.length > 0 ? name : null,
      bio: bio.length > 0 ? bio : null,
    },
  });

  revalidatePath("/perfil");
  revalidatePath("/usuarios");
  // La cabecera lleva el nombre, asi que tambien se recarga.
  revalidatePath("/", "layout");

  return { ok: true, message: "Cambios guardados." };
}
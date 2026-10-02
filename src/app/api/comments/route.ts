import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

/** Publica un comentario en una noticia. Requiere sesion iniciada. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Necesitas iniciar sesion para comentar." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Peticion invalida." }, { status: 400 });
  }

  const { accidentId, body: text } = (body ?? {}) as Record<string, string>;

  // El recorte coincide con el CHECK de la tabla: si aqui se dejara pasar mas,
  // la base de datos rechazaria la escritura y el error seria incomprensible.
  const clean = (text ?? "").trim().slice(0, 2000);
  if (!clean) {
    return NextResponse.json({ error: "El comentario esta vacio." }, { status: 400 });
  }

  // La noticia tiene que existir y estar publicada: comentar en un borrador
  // filtraria el contenido antes de tiempo.
  const accident = await prisma.accident.findFirst({
    where: { id: accidentId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!accident) {
    return NextResponse.json({ error: "La noticia no existe." }, { status: 404 });
  }

  const comment = await prisma.comment.create({
    data: { body: clean, userId: user.id, accidentId: accident.id },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, id: comment.id }, { status: 201 });
}
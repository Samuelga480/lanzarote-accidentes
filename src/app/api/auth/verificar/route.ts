import { redirect } from "next/navigation";
import { confirmarConToken } from "@/lib/email-verificacion";

export const dynamic = "force-dynamic";

/**
 * Confirma una cuenta pulsando el enlace del correo.
 *
 * Es una redireccion y no una API que devuelve JSON, porque a quien llega
 * aqui ha pulsado un enlace: es una persona, no un programa. Se responde
 * siempre con la pagina de resultado.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";

  const { resultado } = await confirmarConToken(token);

  if (resultado === "ok") redirect("/correo-confirmado?estado=ok");
  if (resultado === "caducado") redirect("/correo-confirmado?estado=caducado");

  redirect("/correo-confirmado?estado=invalido");
}
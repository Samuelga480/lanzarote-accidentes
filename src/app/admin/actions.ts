"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSessionCookie, setSessionCookie, verifyPassword } from "@/lib/auth";
import {
  changeStatus,
  createAccident,
  formDataToInput,
  removeAccident,
  toggleFeatured,
  updateAccident,
} from "@/lib/admin";
import { requireAuth } from "@/lib/auth-guard";
import { runCycle } from "@/lib/monitor";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/logger";
import { TODAS_LAS_CATEGORIAS } from "@/lib/categorias";
import type { AccidentStatus } from "@/lib/types";
import type { IncidentCategory } from "@prisma/client";
import type { ActionState } from "./action-state";
import type { CycleActionState } from "./actions-cycle";

/*
  Todas las acciones cuelgan de `requireAuth` de `@/lib/auth-guard`, que acepta
  las dos vias de entrada (cuenta ADMIN de /entrar y cookie del panel) y redirige
  a /entrar si no hay ninguna.

  Antes este archivo traia su propio `requireAuth`, que solo miraba la cookie del
  panel y ademas fallaba con una excepcion. Los botones de la lista de noticias
  llaman ahora a estas acciones en vez de a las rutas /admin/aprobar y
  /admin/borrar, asi que un editor que entro por /entrar se habria encontrado con
  un "sesion no valida" sin motivo: la cuenta es valida, lo que no existe es la
  cookie del panel.
*/

/* -------------------------------------------------------------------------- */
/*  Sesion                                                                    */
/* -------------------------------------------------------------------------- */

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = formData.get("password")?.toString() ?? "";

  if (!password) {
    return { ok: false, message: "Escribe la contraseña." };
  }

  let valid = false;
  try {
    valid = verifyPassword(password);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error de configuración." };
  }

  if (!valid) {
    return { ok: false, message: "Contraseña incorrecta." };
  }

  await setSessionCookie();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/admin/login");
}

/* -------------------------------------------------------------------------- */
/*  Noticias                                                                  */
/* -------------------------------------------------------------------------- */

function parseForm(fd: FormData) {
  try {
    return { ok: true as const, input: formDataToInput(fd) };
  } catch (e) {
    if (e && typeof e === "object" && "flatten" in e) {
      const flat = (e as { flatten: () => { fieldErrors: Record<string, string[]> } }).flatten();
      return { ok: false as const, fieldErrors: flat.fieldErrors, message: "Revisa los campos marcados." };
    }
    return { ok: false as const, message: e instanceof Error ? e.message : "Datos no válidos." };
  }
}

export async function createAccidentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const parsed = parseForm(formData);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, fieldErrors: parsed.fieldErrors };
  }

  try {
    const created = await createAccident(parsed.input, "editor");
    revalidatePath("/");
    revalidatePath("/noticias");
    redirect(`/admin/${created.id}?creado=1`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect()
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo crear la noticia." };
  }
}

export async function updateAccidentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAuth();

  const id = formData.get("id")?.toString();
  if (!id) return { ok: false, message: "Falta el identificador de la noticia." };

  const parsed = parseForm(formData);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, fieldErrors: parsed.fieldErrors };
  }

  try {
    await updateAccident(id, parsed.input, "editor");
    revalidatePath("/");
    revalidatePath("/noticias");
    revalidatePath(`/noticias`);
    return { ok: true, message: "Cambios guardados." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/**
 * Adonde se vuelve tras cambiar el estado.
 *
 * La ficha de una sola noticia, `/admin/<id>`, es adonde llega el enlace del
 * correo de aviso. Antes, al aprobar desde ahi, la respuesta saltaba al panel
 * entero: habia que volver a buscar la noticia en la lista, que es justo lo que
 * el enlace pretendia evitar. Con `volver` se queda en la ficha.
 *
 * Solo se acepta una ruta interna que empiece por `/admin` y que no empiece por
 * `//`, para que el parametro no sirva de redireccion abierta a un sitio de fuera.
 */
function destinoTrasCambio(volver: string, destino: AccidentStatus): string {
  const pedido = volver.trim();
  const seguro = pedido.startsWith("/admin") && !pedido.startsWith("//");
  const aviso = destino === "PUBLISHED" ? "publicada=1" : "rechazada=1";
  return seguro ? `${pedido}?${aviso}` : `/admin?${aviso}`;
}

/**
 * Cambia el estado de una noticia desde el panel.
 *
 * Aprobar y Rechazar van por la misma accion y se distinguen por el campo
 * `status` (que la ficha de una noticia envia como `estado`). Rechazar deja la
 * noticia en el historico con su motivo para poder consultarla, y eliminar la
 * borra: sin la accion de rechazar no habia forma de decir "esta no entra" sin
 * perderla.
 *
 * `changeStatus` puede lanzar, y lanza con un mensaje que el editor necesita leer:
 * por ejemplo, al intentar publicar una noticia ya fusionada en otra. Sin el
 * `try`, ese mensaje se perderia en una pagina de error en vez de volver al
 * panel con la explicacion.
 */
export async function setStatusAction(formData: FormData): Promise<void> {
  await requireAuth();

  const id = formData.get("id")?.toString();
  // Se aceptan los dos nombres porque la ficha de una noticia y la lista no
  // tienen por que usar el mismo.
  const status = (
    formData.get("status")?.toString() ??
    formData.get("estado")?.toString() ??
    ""
  ) as AccidentStatus;
  const note = formData.get("note")?.toString() || null;
  const volver = formData.get("volver")?.toString() ?? "";

  if (!id || !status) redirect("/admin?error=falta-id");
  if (!["PENDING_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED"].includes(status)) return;

  try {
    await changeStatus(id, status, "editor", note);
  } catch (e) {
    redirect(`/admin?error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }

  revalidatePath("/admin");
  revalidatePath("/", "layout");

  redirect(destinoTrasCambio(volver, status));
}

/**
 * Corrige el tipo de una noticia.
 *
 * ---------------------------------------------------------------------------
 *  POR QUE EXISTE
 * ---------------------------------------------------------------------------
 *
 * El sistema decide la categoria solo y se equivoca a menudo: hay 34 temas de
 * informacion ademas de los sucesos. Marcar como OTRO saca la noticia del mapa y
 * de los resumenes de accidentes; marcarla como ATROPELLO la mete. Sin poder
 * corregirla, la unica salida era tirar el trabajo y volver a detectarlo.
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
export async function setCategoryAction(formData: FormData): Promise<void> {
  await requireAuth();

  const id = (formData.get("id")?.toString() || "").trim();
  const pedida = (formData.get("categoria")?.toString() || "").trim();

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

/** Publica un borrador de IA. Exige confirmacion explicita del editor. */
export async function approveAiDraftAction(formData: FormData): Promise<void> {
  await requireAuth();

  const id = formData.get("id")?.toString();
  const confirmed = formData.get("confirmado")?.toString();

  if (!id) return;
  if (confirmed !== "si") {
    redirect(`/admin/${id}?error=confirmacion`);
  }

  await changeStatus(id, "PUBLISHED", "editor", "Aprobado manualmente tras verificar las fuentes");
  revalidatePath("/", "layout");
}

export async function toggleFeaturedAction(formData: FormData): Promise<void> {
  await requireAuth();
  const id = formData.get("id")?.toString();
  if (!id) return;

  await toggleFeatured(id, "editor");
  revalidatePath("/", "layout");
}

export async function deleteAccidentAction(formData: FormData): Promise<void> {
  await requireAuth();
  const id = formData.get("id")?.toString();
  const volver = formData.get("volver")?.toString() ?? "";
  if (!id) redirect("/admin?error=falta-id");

  try {
    await removeAccident(id, "editor");
  } catch (e) {
    redirect(`/admin?error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }

  revalidatePath("/admin");
  revalidatePath("/", "layout");

  // Borrar no tiene aviso: la ficha de la noticia ya no existe a donde volver.
  const pedido = volver.trim();
  redirect(pedido.startsWith("/admin") && !pedido.startsWith("//") ? pedido : "/admin?borrada=1");
}

/* -------------------------------------------------------------------------- */
/*  Recopilar ahora                                                           */
/*                                                                             */
/*  El sitio original tenia un boton "Recopilar" que lanzaba el scraper. Aqui  */
/*  dispara un ciclo de monitorizacion: detectan las fuentes nuevas, las        */
/*  reescriben y las dejan como borrador, sin publicar nada.                     */
/* -------------------------------------------------------------------------- */

export async function runCycleAction(
  _prev: CycleActionState,
  _formData: FormData,
): Promise<CycleActionState> {
  await requireAuth();

  try {
    const result = await runCycle("MANUAL");

    revalidatePath("/admin");
    revalidatePath("/", "layout");

    const partes = [`${result.itemsFound} noticia(s) encontrada(s)`];
    if (result.duplicatesMerged) partes.push(`${result.duplicatesMerged} duplicada(s) fusionada(s)`);
    if (result.draftsCreated) partes.push(`${result.draftsCreated} borrador(es) esperando revision`);
    if (result.feedsFailed) partes.push(`${result.feedsFailed} fuente(s) con errores`);

    return { ok: result.ok, message: partes.join(". ") + "." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo ejecutar el ciclo." };
  }
}

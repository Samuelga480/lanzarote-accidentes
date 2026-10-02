"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearSessionCookie,
  isAuthenticated,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import {
  changeStatus,
  createAccident,
  formDataToInput,
  removeAccident,
  toggleFeatured,
  updateAccident,
} from "@/lib/admin";
import { runCycle } from "@/lib/monitor";
import type { AccidentStatus } from "@/lib/types";
import type { ActionState } from "./action-state";
import type { CycleActionState } from "./actions-cycle";

/** Todas las acciones cuelgan de la sesion del panel. */
async function requireAuth(): Promise<string> {
  if (!(await isAuthenticated())) {
    throw new Error("Sesión no válida. Vuelve a iniciar sesión.");
  }
  return "editor";
}

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
  try {
    await requireAuth();
  } catch {
    redirect("/admin/login");
  }

  const parsed = parseForm(formData);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, fieldErrors: parsed.fieldErrors };
  }

  try {
    const created = await createAccident(parsed.input, "editor");
    revalidatePath("/");
    revalidatePath("/accidentes");
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
  try {
    await requireAuth();
  } catch {
    redirect("/admin/login");
  }

  const id = formData.get("id")?.toString();
  if (!id) return { ok: false, message: "Falta el identificador de la noticia." };

  const parsed = parseForm(formData);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, fieldErrors: parsed.fieldErrors };
  }

  try {
    await updateAccident(id, parsed.input, "editor");
    revalidatePath("/");
    revalidatePath("/accidentes");
    revalidatePath(`/accidentes`);
    return { ok: true, message: "Cambios guardados." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

export async function setStatusAction(formData: FormData): Promise<void> {
  await requireAuth();

  const id = formData.get("id")?.toString();
  const status = formData.get("status")?.toString() as AccidentStatus;
  const note = formData.get("note")?.toString() || null;

  if (!id || !status) return;
  if (!["PENDING_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED"].includes(status)) return;

  await changeStatus(id, status, "editor", note);
  revalidatePath("/", "layout");
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
  if (!id) return;

  await removeAccident(id, "editor");
  revalidatePath("/", "layout");
  redirect("/admin?borrada=1");
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

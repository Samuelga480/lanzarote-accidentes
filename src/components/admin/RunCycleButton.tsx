"use client";

import { useActionState } from "react";
import { runCycleAction } from "@/app/admin/actions";
import type { CycleActionState } from "@/app/admin/actions-cycle";

/**
 * Boton "Recopilar".
 *
 * El sitio original lo tenia en el panel y lanzaba el scraper a mano. Aqui
 * dispara un ciclo de monitorizacion: revisa las fuentes, reescribe lo nuevo y
 * lo deja como borrador. No publica nada; publicar sigue siendo siempre un acto
 * manual del editor.
 */
export function RunCycleButton() {
  const [state, formAction, pending] = useActionState<CycleActionState, FormData>(runCycleAction, {
    ok: false,
    message: "",
  });

  return (
    <form action={formAction} style={{ display: "inline" }}>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Recopilando..." : "Recopilar"}
      </button>

      {/*
        aria-live para que el lector de pantalla anuncie el resultado: el texto
        aparece sin que se recargue la pagina y con el foco donde estaba.
      */}
      <span role="status" aria-live="polite" className="login-error" style={{ marginBottom: 0 }}>
        {state.message}
      </span>
    </form>
  );
}
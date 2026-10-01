"use client";

import { useActionState } from "react";
import { runCycleAction, type CycleActionState } from "@/app/admin/actions-cycle";

const INITIAL: CycleActionState | null = null;

/**
 * Boton "Buscar ahora" de /admin/fuentes.
 *
 * Se usa `useActionState` porque la accion devuelve un estado que hay que
 * mostrar. Con `action` a secas, React no dejaria leer el resultado.
 */
export function RunCycleButton() {
  const [state, formAction, pending] = useActionState(runCycleAction, INITIAL);

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Buscando…" : "Buscar ahora"}
        </button>
      </form>

      {state ? (
        <p
          role="status"
          className={`text-xs text-right max-w-sm ${
            state.ok ? "text-ok" : "text-alert"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
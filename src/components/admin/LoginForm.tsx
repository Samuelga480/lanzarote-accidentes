"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/admin/actions";
import { initialState, type ActionState } from "@/app/admin/action-state";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    loginAction,
    initialState(),
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">
          Contraseña de acceso
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field"
          autoComplete="current-password"
          required
          autoFocus
        />
      </div>

      {state.message ? (
        <p
          role="alert"
          className="text-sm text-alert bg-alert-soft border border-alert/30 rounded-sm px-3 py-2"
        >
          {state.message}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Comprobando…" : "Entrar"}
      </button>
    </form>
  );
}

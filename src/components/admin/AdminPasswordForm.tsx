"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/admin/actions";
import type { ActionState } from "@/app/admin/action-state";

/**
 * Acceso al panel con la contrasena.
 *
 * Es la via de emergencia: la normal es entrar en /entrar con la cuenta de
 * administrador. Se conserva la variable ADMIN_PASSWORD para no perder el acceso
 * si la cuenta se perdiera, que es justo cuando mas falta hace.
 */
export function AdminPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, {
    ok: false,
    message: "",
  });

  return (
    <form action={formAction} className="admin-stat-card" style={{ maxWidth: 400, margin: "60px auto" }}>
      <div className="admin-stat-label" style={{ marginBottom: 16 }}>
        Panel de Administracion
      </div>

      <div className="form-group">
        <label htmlFor="password">Contrasena</label>
        <input
          type="password"
          id="password"
          name="password"
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>

      <div className="login-error" role="alert" style={{ minHeight: 0, marginBottom: 12 }}>
        {state.ok ? "" : (state.message ?? "")}
      </div>

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Comprobando..." : "Entrar"}
      </button>

      <p style={{ marginTop: 16 }}>
        <a href="/entrar" className="admin-nav-link" style={{ padding: "8px 0" }}>
          Entrar con tu cuenta
        </a>
      </p>
    </form>
  );
}
"use client";

import { useActionState, useState } from "react";
import { registerAction } from "@/app/registro/actions";
import { REGISTRO_INICIAL, type RegisterState } from "@/app/registro/state";

/**
 * Formulario de alta de cuenta de invitado.
 *
 * El de register.html del sitio original, mas el campo de confirmacion que tambien
 * estaba ahi. Los requisitos de la contrasena se avisan antes de enviar, no
 * despues: el backend los vuelve a comprobar.
 *
 * ---------------------------------------------------------------------------
 *  SIN PETICIONES DESDE EL NAVEGADOR
 * ---------------------------------------------------------------------------
 *
 * No hay ningun `fetch`: el formulario llama a la Server Action `registerAction`
 * con `<form action={...}>`. El exito lo resuelve un `redirect()` dentro de la
 * accion, de modo que la cabecera se vuelve a pintar en el servidor con la cookie
 * nueva y ya sale con la sesion abierta.
 */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    registerAction,
    REGISTRO_INICIAL,
  );
  const [show, setShow] = useState(false);

  return (
    <form id="register-form" className="login-form" action={formAction}>
      <div className="form-group">
        <label htmlFor="reg-email">Correo electronico</label>
        <input
          type="email"
          id="reg-email"
          name="email"
          placeholder="tu@email.com"
          required
          autoComplete="email"
          defaultValue={state.email}
        />
      </div>

      <div className="form-group">
        <label htmlFor="reg-password">Contrasena</label>
        <div className="password-wrapper">
          <input
            type={show ? "text" : "password"}
            id="reg-password"
            name="password"
            placeholder="Minimo 8, con letras y numeros"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="toggle-password"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Ocultar contrasena" : "Mostrar contrasena"}
            aria-pressed={show}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="reg-password2">Confirmar contrasena</label>
        <input
          type="password"
          id="reg-password2"
          name="confirmPassword"
          placeholder="Repite la contrasena"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <div className="login-error" role="alert">
        {state.error}
      </div>

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Creando cuenta..." : "Crear cuenta"}
      </button>
    </form>
  );
}
"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction, reenviarConfirmacionAction } from "@/app/entrar/actions";
import { LOGIN_INICIAL, type LoginState } from "@/app/entrar/state";

/**
 * Formulario de acceso.
 *
 * Es el de login.html del sitio original: correo, contrasena con boton para
 * voirla, mensaje de error en rojo y enlace al registro.
 *
 * ---------------------------------------------------------------------------
 *  SIN PETICIONES DESDE EL NAVEGADOR
 * ---------------------------------------------------------------------------
 *
 * No hay ningun `fetch`. Los dos formularios llaman a Server Actions
 * (`loginAction` y `reenviarConfirmacionAction`) con `<form action={...}>`: el
 * navegador no pide nada a una API propia, y sin JavaScript el formulario tambien
 * funciona, porque Next convierte la accion en un envio de formulario normal.
 *
 * Los exitos se resuelven con `redirect()` dentro de la accion, no con
 * `window.location.assign`. La diferencia se nota en la cabecera, que se dibuja en
 * el servidor leyendo la cookie httpOnly: al redirigir, Next pide la pagina de
 * nuevo y la cabecera ya sale con la sesion.
 *
 * ---------------------------------------------------------------------------
 *  LOS TRES ESTADOS QUE AVISA LA URL
 * ---------------------------------------------------------------------------
 *
 *   ?confirmado=1   se acaba de dar de alta y hay que confirmar el correo
 *   ?reenviar=1     el enlace de confirmacion caducado o no vale
 *   ?reenviado=1    el correo de confirmacion se ha vuelto a mandar
 *
 * Los lee la pagina (`/entrar`) y los pasa como `avisoInicial`, en vez de sacarlos
 * aqui con `useSearchParams`: la URL la interpreta el servidor y el componente
 * solo pinta.
 */
export function LoginForm({ avisoInicial = "" }: { avisoInicial?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    LOGIN_INICIAL,
  );
  const [reenvio, reenviarAction, reenviando] = useActionState<LoginState, FormData>(
    reenviarConfirmacionAction,
    LOGIN_INICIAL,
  );

  /*
    Los avisos se vacian en cuanto se escribe en el formulario: si alguien corrige
    el correo tras ver "esa cuenta no existe", el mensaje viejo ya no describe lo
    que esta pasando y confunde mas que ayudar.
  */
  const [avisoLocal, setAvisoLocal] = useState(avisoInicial);
  useEffect(() => {
    if (avisoInicial) setAvisoLocal(avisoInicial);
  }, [avisoInicial]);

  const [showPassword, setShowPassword] = useState(false);

  const aviso = reenvio.aviso || avisoLocal;
  const error = reenvio.error || state.error;

  return (
    <>
      <form
        id="login-form"
        className="login-form"
        action={formAction}
        onChange={() => setAvisoLocal("")}
      >
        <div className="form-group">
          <label htmlFor="email">Correo electronico</label>
          <input
            type="email"
            id="email"
            name="email"
            placeholder="tu@email.com"
            required
            autoComplete="email"
            defaultValue={state.email}
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Contrasena</label>
          <div className="password-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
              aria-pressed={showPassword}
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

        <div className="login-error" role="alert">
          {error}
        </div>

        {aviso ? (
          <p className="login-aviso" role="status">
            {aviso}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
          {pending ? "Comprobando..." : "Iniciar sesion"}
        </button>
      </form>

      {/*
        El reenvio va en un formulario aparte, y no en un boton dentro del
        anterior: son dos acciones distintas y un formulario no puede tener dos
        `action`. Solo aparece cuando el acceso ha fallado porque el correo sigue
        sin confirmar, y es el unico caso en que el error dice que hacer.
      */}
      {state.necesitaReenvio ? (
        <form className="login-form" action={reenviarAction}>
          <input type="hidden" name="email" value={state.email} />
          <button type="submit" className="btn btn-secondary btn-full" disabled={reenviando}>
            {reenviando ? "Enviando..." : "Reenviar el correo de confirmacion"}
          </button>
        </form>
      ) : null}
    </>
  );
}
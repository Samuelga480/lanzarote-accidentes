"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Formulario de acceso.
 *
 * Es el de login.html del sitio original: correo, contrasena con boton para
 * voirla, mensaje de error en rojo y enlace al registro. Lo que cambia es el
 * destino: cuando hay exito se sale de la pagina de acceso y se vuelve al sitio.
 *
 * Ademas hay tres estados que la pagina de entrada avisa con parametros:
 *
 *   ?confirmado=1   se acaba de dar de alta y hay que confirmar el correo
 *   ?reenviar=1     el enlace de confirmacion caducado o no vale
 *   ?reenviado=1    el correo de confirmacion se ha vuelto a mandar
 *
 * Y una respuesta 403 con `codigo: "correo-sin-confirmar"`, que es la cuenta
 * cuya contrasena es correcta pero que todavia no ha confirmado. Ahi se
 * ofrece reenviar el correo en vez de dejar a alguien atascado con un error.
 */
export function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [emailSinConfirmar, setEmailSinConfirmar] = useState("");
  const [reenviando, setReenviando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  /*
    Los avisos de la URL se vacian en cuanto se escribe en el formulario: si
    alguien corrige el correo tras ver "esa cuenta no existe", el mensaje viejo
    ya no describe lo que esta pasando y confunde mas que ayudar.
  */
  useEffect(() => {
    if (params.get("confirmado")) {
      setAviso("Te hemos enviado un correo para confirmar la direccion. Confirma y ya podras entrar.");
    } else if (params.get("reenviar")) {
      setAviso("Escribe tu correo y te lo enviamos otra vez.");
    } else if (params.get("reenviado")) {
      setAviso("Correo de confirmacion enviado. Revisa tambien la carpeta de spam.");
    }
  }, [params]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);

    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // La cookie de sesion es httpOnly: tiene que fijarla el servidor.
        credentials: "same-origin",
        body: JSON.stringify({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; codigo?: string }
          | null;
        setError(body?.error ?? "No se ha podido iniciar sesion.");

        // La contrasena era correcta pero falta confirmar el correo: se recuerda
        // el correo para poder ofrecer el reenvio sin volver a escribirlo.
        if (body?.codigo === "correo-sin-confirmar") {
          setEmailSinConfirmar(String(data.get("email") ?? ""));
          setAviso("");
        }

        setBusy(false);
        return;
      }

      /*
        Tras el login hay que rehacer la pagina entera, no solo mover el router.

        `router.refresh()` recarga el arbol de la ruta actual, pero la cabecera
        es un Server Component que lee la cookie httpOnly: si se navega en el
        cliente, Next reutiliza la carga anterior de la ruta y el menu sigue
        mostrando "Acceder" hasta que se recargue a mano. `location.assign` pide
        el HTML de nuevo al servidor, que ya ve la cookie nueva.
      */
      window.location.assign("/perfil");
    } catch {
      setError("No se ha podido conectar con el servidor.");
      setBusy(false);
    }
  }

  /** Vuelve a mandar el correo de confirmacion. */
  async function reenviar() {
    setAviso("");
    setError("");
    setReenviando(true);

    try {
      const res = await fetch("/api/auth/reenviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: emailSinConfirmar }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;

      if (!res.ok) {
        setError(body?.error ?? "No se ha podido reenviar el correo.");
      } else {
        setAviso("Correo de confirmacion enviado. Revisa tambien la carpeta de spam.");
        setEmailSinConfirmar("");
      }
    } catch {
      setError("No se ha podido conectar con el servidor.");
    } finally {
      setReenviando(false);
    }
  }

  return (
    <form id="login-form" className="login-form" onSubmit={onSubmit}>
      <div className="form-group">
        <label htmlFor="email">Correo electronico</label>
        <input type="email" id="email" name="email" placeholder="tu@email.com" required autoComplete="email" />
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

      {/*
        Salen juntos: el error de confirmacion pendiente y el boton de reenviar.
        Es el unico caso en que el error dice que hacer, y por eso lleva su
        propio boton y no solo texto.
      */}
      {emailSinConfirmar ? (
        <button
          type="button"
          className="btn btn-secondary btn-full"
          onClick={reenviar}
          disabled={reenviando}
        >
          {reenviando ? "Enviando..." : "Reenviar el correo de confirmacion"}
        </button>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
        {busy ? "Comprobando..." : "Iniciar sesion"}
      </button>
    </form>
  );
}
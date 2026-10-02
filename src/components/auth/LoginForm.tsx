"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Formulario de acceso.
 *
 * Es el de login.html del sitio original: correo, contrasena con boton para
 * voirla, mensaje de error en rojo y enlace al registro. Lo que cambia es el
 * destino: cuando hay exito se sale de la pagina de acceso y se vuelve al sitio.
 */
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "No se ha podido iniciar sesion.");
        setBusy(false);
        return;
      }

      router.refresh();
      router.push("/perfil");
    } catch {
      setError("No se ha podido conectar con el servidor.");
      setBusy(false);
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

      <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
        {busy ? "Comprobando..." : "Iniciar sesion"}
      </button>
    </form>
  );
}
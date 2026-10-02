"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Formulario de alta de cuenta de invitado.
 *
 * El de register.html del sitio original, mas el campo de confirmacion que
 * tambien estaba ahi. Los requisitos de la contrasena se avisan antes de
 * enviar, no despues: el backend los vuelve a comprobar.
 */
export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);

    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
          confirmPassword: String(data.get("confirmPassword") ?? ""),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "No se ha podido crear la cuenta.");
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
    <form id="register-form" className="login-form" onSubmit={onSubmit}>
      <div className="form-group">
        <label htmlFor="reg-email">Correo electronico</label>
        <input
          type="email"
          id="reg-email"
          name="email"
          placeholder="tu@email.com"
          required
          autoComplete="email"
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
        {error}
      </div>

      <button type="submit" className="btn btn-primary btn-full" disabled={busy}>
        {busy ? "Creando cuenta..." : "Crear cuenta"}
      </button>
    </form>
  );
}
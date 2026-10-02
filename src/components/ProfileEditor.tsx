"use client";

import { useActionState, useState } from "react";
import { updateProfileAction, type ProfileActionState } from "@/app/perfil/actions";

/**
 * Seccion "Sobre mi" del perfil.
 *
 * El texto se muestra y se sustituye por el formulario al pulsar "Editar", que
 * es lo que hacia el sitio original: el boton vive en la cabecera de la seccion,
 * a la derecha del titulo.
 *
 * El formulario se abre y se cierra con la clase `active` sobre
 * `.perfil-editar`, igual que entonces, en vez de con el atributo `hidden`: el
 * CSS del sitio ya define ese par de clases y asi el comportamiento se ve igual.
 */
export function ProfileEditor({ name, bio }: { name: string; bio: string | null }) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(
    updateProfileAction,
    { ok: false, message: "" },
  );

  return (
    <div className="perfil-seccion">
      <div className="perfil-seccion-header">
        <h3>Sobre mi</h3>

        {!editando ? (
          <button
            type="button"
            className="btn btn-small btn-secondary"
            onClick={() => setEditando(true)}
          >
            Editar
          </button>
        ) : null}
      </div>

      {/* Texto guardado */}
      <div id="perfil-bio-container" hidden={editando}>
        <p className={`perfil-bio${bio ? "" : " perfil-bio-vacia"}`}>
          {bio || "Este usuario aun no ha anadido una descripcion."}
        </p>
      </div>

      {/* Formulario */}
      <div className={`perfil-editar${editando ? " active" : ""}`}>
        <form action={formAction}>
          <div className="form-group">
            <label htmlFor="edit-nombre">Nombre</label>
            <input
              type="text"
              id="edit-nombre"
              name="name"
              defaultValue={name}
              placeholder="Tu nombre publico"
              maxLength={80}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-bio">Descripcion</label>
            <textarea
              id="edit-bio"
              name="bio"
              placeholder="Cuentanos sobre ti..."
              defaultValue={bio ?? ""}
              maxLength={1000}
            />
          </div>

          <div className="perfil-acciones">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setEditando(false);
                // Se recarga para descartar lo que se habia escrito sin guardar.
                window.location.reload();
              }}
              disabled={pending}
            >
              {state.ok ? "Cerrar" : "Cancelar"}
            </button>
          </div>

          <div className="login-error" role="status" style={{ minHeight: 0, marginTop: 12 }}>
            {state.message}
          </div>
        </form>
      </div>
    </div>
  );
}
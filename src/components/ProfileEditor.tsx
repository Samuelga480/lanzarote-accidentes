"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
 *
 * ---------------------------------------------------------------------------
 *  SIN PETICIONES DESDE EL NAVEGADOR
 * ---------------------------------------------------------------------------
 *
 * El guardado va por Server Action (`updateProfileAction`), sin `fetch` ni
 * `window.location.reload()`. Al guardar bien, la accion hace `revalidatePath` y el
 * formulario se cierra solo; al cancelar se vacia con `reset()`, que es lo mismo
 * que hacia la recarga pero sin volver a pedir la pagina entera.
 */
export function ProfileEditor({ name, bio }: { name: string; bio: string | null }) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(
    updateProfileAction,
    { ok: false, message: "" },
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Guardado bien: el formulario se cierra y el texto nuevo ya esta en la pagina.
  useEffect(() => {
    if (state.ok) setEditando(false);
  }, [state]);

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
        <form action={formAction} ref={formRef}>
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
                // Descarta lo escrito sin guardar. Antes esto era
                // `window.location.reload()`; `reset()` hace lo mismo sin pedir la
                // pagina entera otra vez.
                formRef.current?.reset();
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
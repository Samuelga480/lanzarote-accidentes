"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { createCommentAction, type CommentState } from "@/app/noticias/actions";
import { formatDate } from "@/lib/format";

export type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  userName: string | null;
  isOwn: boolean;
};

const ESTADO_INICIAL: CommentState = { ok: false, error: "" };

/**
 * Seccion de comentarios de una noticia.
 *
 * Es la que tenia noticia.html: formulario para escribir y lista de lo ya
 * escrito, cada uno con su autor y su fecha.
 *
 * ---------------------------------------------------------------------------
 *  SIN PETICIONES DESDE EL NAVEGADOR
 * ---------------------------------------------------------------------------
 *
 * Antes era un `fetch` a `POST /api/comments` y despues un `router.refresh()` para
 * que la lista se volviera a pintar. Ahora es un `<form action={...}>` que llama
 * a la Server Action `createCommentAction`, y la accion hace el `revalidatePath`:
 * el comentario aparece en la lista sin que el navegador pida nada a una API.
 *
 * El identificador de la noticia y su slug viajan como campos ocultos en vez de
 * como props del closure, que es lo que hace que el formulario siga siendo un
 * formulario de verdad y no una llamada a una API disfrazada.
 */
export function Comments({
  accidentId,
  slug,
  comments,
  loggedIn,
}: {
  accidentId: string;
  /** Slug de la noticia, para recargar la ruta correcta. */
  slug: string;
  comments: CommentItem[];
  loggedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState<CommentState, FormData>(
    createCommentAction,
    ESTADO_INICIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Al guardarse bien, el textarea se vacia: si se deja lo escrito, volver a
  // pulsar "Publicar" repetiria el mismo comentario.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <section className="comentarios-section" aria-labelledby="titulo-comentarios">
      <h2 id="titulo-comentarios">Comentarios</h2>

      {loggedIn ? (
        <form className="comentario-form" action={formAction} ref={formRef}>
          <input type="hidden" name="accidentId" value={accidentId} />
          <input type="hidden" name="slug" value={slug} />

          <label htmlFor="comentario" className="sr-only">
            Escribe tu comentario
          </label>
          <textarea
            id="comentario"
            name="body"
            placeholder="Escribe tu comentario..."
            rows={4}
            maxLength={2000}
            required
          />

          <div className="login-error" role="alert">
            {state.error}
          </div>

          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Publicando..." : "Publicar comentario"}
          </button>
        </form>
      ) : (
        <div className="comentarios-login">
          <p>
            <a href="/entrar">Inicia sesion</a> para comentar en esta noticia.
          </p>
        </div>
      )}

      {comments.length > 0 ? (
        comments.map((c) => (
          <article key={c.id} className="comentario-item">
            <div className="comentario-header">
              {/*
                El nombre lleva a la ficha publica del autor. Antes era texto
                plano: el comentario no llevaba a ninguna parte, de modo que la
                descripcion que el usuario escribe en su perfil no era visible
                para nadie mas.
              */}
              <Link href={`/u/${c.userId}`} className="comentario-usuario">
                {c.userName ?? "Invitado"}
              </Link>
              <time className="comentario-fecha" dateTime={c.createdAt}>
                {formatDate(c.createdAt)}
              </time>
              {c.isOwn ? (
                <span className="comentario-fecha" style={{ color: "var(--accent)" }}>
                  tu comentario
                </span>
              ) : null}
            </div>
            <p className="comentario-texto">{c.body}</p>
          </article>
        ))
      ) : (
        <p className="news-description">Todavia no hay comentarios en esta noticia.</p>
      )}
    </section>
  );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";

export type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  userName: string | null;
  isOwn: boolean;
};

/**
 * Seccion de comentarios de una noticia.
 *
 * Es la que tenia noticia.html: formulario para escribir y lista de lo ya
 * escrito, cada uno con su autor y su fecha.
 */
export function Comments({
  accidentId,
  comments,
  loggedIn,
}: {
  accidentId: string;
  comments: CommentItem[];
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);

    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ accidentId, body: String(data.get("body") ?? "") }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "No se ha podido publicar el comentario.");
        setBusy(false);
        return;
      }

      e.currentTarget.reset();
      setBusy(false);
      // Los comentarios se releen en el servidor: se recargan la pagina para no
      // duplicar a mano la lista que acaba de pintar la base de datos.
      router.refresh();
    } catch {
      setError("No se ha podido conectar con el servidor.");
      setBusy(false);
    }
  }

  return (
    <section className="comentarios-section" aria-labelledby="titulo-comentarios">
      <h2 id="titulo-comentarios">Comentarios</h2>

      {loggedIn ? (
        <form className="comentario-form" onSubmit={onSubmit}>
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
            {error}
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Publicando..." : "Publicar comentario"}
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
              <span className="comentario-usuario">{c.userName ?? "Invitado"}</span>
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
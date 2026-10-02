"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";

export type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
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

    /*
      El formulario se guarda aqui y no se usa `e.currentTarget` despues del
      await. React vacia esa propiedad en cuanto el manejador termina su parte
      sincrona, asi que tras un await es `null`: usarla ahi lanzaba un
      TypeError que caia en el catch y decia "No se ha podido conectar con el
      servidor" cuando el servidor si habia contestado. El comentario quedaba
      guardado y el usuario creia que no se habia publicado.
    */
    const form = e.currentTarget;

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

      form.reset();
      setBusy(false);
      // Los comentarios se releen en el servidor: se recargan la pagina para no
      // duplicar a mano la lista que acaba de pintar la base de datos.
      router.refresh();
    } catch (err) {
      /*
        Solo el fallo de red llega aqui: el fetch es lo unico que puede cortar
        la ejecucion de verdad. Cualquier otro error (un fallo de base de datos,
        por ejemplo) devuelve una respuesta con status 500 y lo trata el `if
        (!res.ok)` de arriba. Este texto no se muestra cuando el servidor si ha
        contestado, para no culpar a la conexion de un fallo que no es suyo.
      */
      console.error("No se pudo enviar el comentario", err);
      setError("No se ha podido enviar el comentario. Intentalo de nuevo.");
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
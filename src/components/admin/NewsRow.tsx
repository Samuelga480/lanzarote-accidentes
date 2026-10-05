"use client";

import { deleteAccidentAction, setStatusAction } from "@/app/admin/actions";

/**
 * Fila de noticia con los botones del panel.
 *
 * ---------------------------------------------------------------------------
 *  SIN PETICIONES DESDE EL NAVEGADOR
 * ---------------------------------------------------------------------------
 *
 * Antes cada boton montaba un formulario a mano con `document.createElement` y lo
 * enviaba con `form.submit()` a las rutas `/admin/aprobar` y `/admin/borrar`: tres
 * POST del navegador a endpoints propios, uno de ellos construido por codigo. Ahora
 * son formularios de verdad con `<form action={setStatusAction}>` y
 * `<form action={deleteAccidentAction}>`, que apuntan a Server Actions. La
 * confirmacion se sigue pidiendo en el navegador antes de que salga nada de la
 * pestana, porque eliminar y rechazar no se pueden deshacer.
 *
 * Sin JavaScript los formularios siguen funcionando; lo unico que se pierde es la
 * confirmacion, por eso se pide en `onSubmit` y no con una pantalla intermedia.
 */
export function NewsRow({ row }: { row: AdminRow }) {
  /**
   * Bloquea el envio si el editor no confirma.
   *
   * Devolver `false` en `onSubmit` cancela el envio y deja el formulario intacto,
   * que es justo lo que se quiere: si se acepta, el formulario sigue su curso
   * normal y lo llama la Server Action.
   */
  function confirmar(mensaje: string): boolean {
    return window.confirm(mensaje);
  }

  return (
    <div className="admin-news-item" data-id={row.id}>
      <div className="admin-news-info">
        <div className="admin-news-title">{row.title}</div>
        <div className="admin-news-meta">
          <span>{row.occurredAt}</span>
          <span>{row.municipality}</span>
          <span>{row.category}</span>
          <span>Fuente: {row.fuentes}</span>
        </div>
      </div>

      <span className={`admin-news-status ${row.status}`}>{row.status}</span>

      <div className="admin-news-actions">
        {/* El detalle va en un <details>: es el mismo contenido sin modales. */}
        <details>
          <summary className="btn btn-secondary btn-small" style={{ listStyle: "none" }}>
            Ver
          </summary>
          <div className="modal-content" style={{ position: "absolute", right: 0, top: "100%", zIndex: 10 }}>
            <div className="modal-header">
              <h2>Detalles de la Noticia</h2>
            </div>
            <div className="modal-body">
              <dl>
                <dt className="resumen-stat-label">Titulo</dt>
                <dd>{row.title}</dd>

                <dt className="resumen-stat-label">Fecha</dt>
                <dd>{row.occurredAt}</dd>

                <dt className="resumen-stat-label">Zona</dt>
                <dd>{row.municipality}</dd>

                <dt className="resumen-stat-label">Tipo</dt>
                <dd>{row.category}</dd>

                <dt className="resumen-stat-label">Fuente</dt>
                <dd>{row.fuentes}</dd>

                <dt className="resumen-stat-label">Resumen IA</dt>
                <dd>{row.resumenIA ?? "Sin resumen generado."}</dd>
              </dl>

              <div className="modal-actions">
                {row.status === "aprobada" ? (
                  <a href={`/noticias/${row.slug}`} className="btn btn-secondary">
                    Ver en la web
                  </a>
                ) : (
                  <span className="admin-news-meta">
                    Aun no esta publicada, asi que no tiene ficha pública.
                  </span>
                )}
              </div>
            </div>
          </div>
        </details>

        {/*
          "Editar" lleva a la ficha de la noticia, pero solo se ofrece si ya esta
          publicada: la pagina publica filtra por `status = PUBLISHED`, asi que un
          borrador da 404 y el boton parece roto sin serlo.
        */}
        {row.status === "aprobada" ? (
          <a href={`/noticias/${row.slug}`} className="btn btn-primary btn-small">
            Ver
          </a>
        ) : null}

        {/*
          Aprobar y Rechazar van a la misma accion y se distinguen por `status`.

          Rechazar y Eliminar no son lo mismo: rechazar deja la noticia en el
          historico con su motivo para poder consultarla, y eliminar la borra.
        */}
        <form action={setStatusAction}>
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="status" value="PUBLISHED" />
          <button type="submit" className="btn btn-success btn-small">
            Aprobar
          </button>
        </form>

        {row.status !== "rechazada" ? (
          <form
            action={setStatusAction}
            onSubmit={(e) => {
              // Rechazar es la accion de la que mas se duda: casi nadie la pulsa
              // sin querer, pero pulsar por error un boton de un solo clic es
              // facil. Se pregunta antes de que salga nada de la pestana.
              if (!confirmar(`¿Rechazar "${row.title}"?\n\nLa noticia no se publica, pero se queda en el historico.`)) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="status" value="REJECTED" />
            <button type="submit" className="btn btn-warning btn-small">
              Rechazar
            </button>
          </form>
        ) : null}

        <form
          action={deleteAccidentAction}
          onSubmit={(e) => {
            // Unico caso irreversible: no hay forma de recuperarlo.
            if (!confirmar(`¿Eliminar "${row.title}"?\n\nEsta accion no se puede deshacer.`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" className="btn btn-danger btn-small">
            Eliminar
          </button>
        </form>
      </div>
    </div>
  );
}

export type AdminRow = {
  id: string;
  title: string;
  occurredAt: string;
  municipality: string;
  category: string;
  status: "pendiente" | "aprobada" | "rechazada";
  resumenIA: string | null;
  fuentes: string;
  slug: string;
};
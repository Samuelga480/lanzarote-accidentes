"use client";

/**
 * Fila de noticia con los botones del panel.
 *
 * Envia a las rutas /admin/aprobar y /admin/borrar. El borrado pide
 * confirmacion en el propio boton, antes de que nada salga del navegador: es la
 * unica accion del panel que no se puede deshacer.
 */
export function NewsRow({ row }: { row: AdminRow }) {
  async function borrar() {
    if (!window.confirm(`¿Eliminar "${row.title}"?\n\nEsta accion no se puede deshacer.`)) return;

    const form = document.createElement("form");
    form.method = "post";
    form.action = "/admin/borrar";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "id";
    input.value = row.id;

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
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
                <a href={`/accidentes/${row.slug}`} className="btn btn-secondary">
                  Ver en la web
                </a>
              </div>
            </div>
          </div>
        </details>

        <a href={`/accidentes/${row.slug}`} className="btn btn-primary btn-small">
          Editar
        </a>

        {row.status !== "aprobada" ? (
          <form action="/admin/aprobar" method="post">
            <input type="hidden" name="id" value={row.id} />
            <button type="submit" className="btn btn-success btn-small">
              Aprobar
            </button>
          </form>
        ) : null}

        <button type="button" className="btn btn-danger btn-small" onClick={borrar}>
          Eliminar
        </button>
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
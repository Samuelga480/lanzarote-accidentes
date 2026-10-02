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

  /*
    Rechazar es la accion de la que mas se duda en un panel: casi nadie la pulsa
    sin querer, pero pulsarla por error desde un boton de un solo clic es facil.
    Pide confirmacion en el navegador, antes de que salga nada de la pestana.
  */
  function rechazar() {
    if (!window.confirm(`¿Rechazar "${row.title}"?\n\nLa noticia no se publica, pero se queda en el historico.`)) return;

    const form = document.createElement("form");
    form.method = "post";
    form.action = "/admin/aprobar";

    const id = document.createElement("input");
    id.type = "hidden";
    id.name = "id";
    id.value = row.id;

    const estado = document.createElement("input");
    estado.type = "hidden";
    estado.name = "estado";
    estado.value = "REJECTED";

    form.appendChild(id);
    form.appendChild(estado);
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
                {row.status === "aprobada" ? (
                  <a href={`/accidentes/${row.slug}`} className="btn btn-secondary">
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
          <a href={`/accidentes/${row.slug}`} className="btn btn-primary btn-small">
            Ver
          </a>
        ) : null}

        {/*
          Aprobar y Rechazar van a la misma ruta y se distinguen por `estado`.

          Rechazar y Eliminar no son lo mismo: rechazar deja la noticia en el
          historico con su motivo para poder consultarla, y eliminar la borra. Sin
          el boton de rechazar solo se podia aprobar o borrar, y no habia forma de
          decir "esta no entra" sin perderla.
        */}
        <form action="/admin/aprobar" method="post">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="estado" value="PUBLISHED" />
          <button type="submit" className="btn btn-success btn-small">
            Aprobar
          </button>
        </form>

        {row.status !== "rechazada" ? (
          <button type="button" className="btn btn-warning btn-small" onClick={rechazar}>
            Rechazar
          </button>
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
// ===== API BASE =====
const API_BASE = window.location.origin.includes('localhost')
    ? 'http://localhost:3000/api'
    : '/api';

// ===== ESTADO =====
let noticias = [];
let currentTab = 'pendientes';

// ===== ELEMENTOS DOM =====
const elementos = {
    // Estadísticas
    statTotal: document.getElementById('stat-total'),
    statPendientes: document.getElementById('stat-pendientes'),
    statAprobadas: document.getElementById('stat-aprobadas'),
    statRechazadas: document.getElementById('stat-rechazadas'),
    badgePendientes: document.getElementById('badge-pendientes'),

    // Listas
    listaPendientes: document.getElementById('lista-pendientes'),
    listaAprobadas: document.getElementById('lista-aprobadas'),
    listaRechazadas: document.getElementById('lista-rechazadas'),
    listaTodas: document.getElementById('lista-todas'),
    listaLogs: document.getElementById('lista-logs'),

    // Modal
    modal: document.getElementById('modal'),
    modalTitulo: document.getElementById('modal-titulo'),
    modalBody: document.getElementById('modal-body'),
    modalFooter: document.getElementById('modal-footer'),
    modalCerrar: document.getElementById('modal-cerrar'),

    // Botones
    btnGenerar: document.getElementById('btn-generar'),
    btnVerOllama: document.getElementById('btn-ver-ollama'),

    // Toast
    toastContainer: document.getElementById('toast-container')
};

// ===== FUNCIONES API =====
async function apiGet(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`);
    return response.json();
}

async function apiPost(endpoint, data = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

async function apiDelete(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'DELETE'
    });
    return response.json();
}

// ===== CARGA DE DATOS =====
async function cargarDatos() {
    try {
        const [noticiasRes, statsRes, logsRes] = await Promise.all([
            apiGet('/admin/noticias'),
            apiGet('/estadisticas'),
            apiGet('/admin/logs')
        ]);

        if (noticiasRes.success) {
            noticias = noticiasRes.data;
            renderizarNoticias();
        }

        if (statsRes.success) {
            actualizarStats(statsRes.data);
        }

        if (logsRes.success) {
            renderizarLogs(logsRes.data);
        }
    } catch (error) {
        mostrarToast('Error al cargar datos: ' + error.message, 'error');
    }
}

function actualizarStats(stats) {
    elementos.statTotal.textContent = stats.total;
    elementos.statPendientes.textContent = stats.pendientes;
    elementos.statAprobadas.textContent = stats.aprobadas;
    elementos.statRechazadas.textContent = stats.rechazadas;
    elementos.badgePendientes.textContent = stats.pendientes;
}

// ===== RENDERIZAR NOTICIAS =====
function renderizarNoticias() {
    const pendientes = noticias.filter(n => n.estado === 'pendiente');
    const aprobadas = noticias.filter(n => n.estado === 'aprobada');
    const rechazadas = noticias.filter(n => n.estado === 'rechazada');

    renderizarLista(elementos.listaPendientes, pendientes, 'pendiente');
    renderizarLista(elementos.listaAprobadas, aprobadas, 'aprobada');
    renderizarLista(elementos.listaRechazadas, rechazadas, 'rechazada');
    renderizarLista(elementos.listaTodas, noticias, 'todas');
}

function renderizarLista(container, datos, tipo) {
    if (datos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                </svg>
                <p>No hay noticias ${tipo === 'todas' ? 'registradas' : tipo}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = datos.map(noticia => `
        <div class="news-item" data-id="${noticia.id}">
            <div class="news-item-header">
                <h4 class="news-item-title">${escapeHtml(noticia.titulo)}</h4>
                <span class="news-item-tag tag-${noticia.estado}">${capitalize(noticia.estado)}</span>
            </div>
            <div class="news-item-meta">
                <span class="news-item-tag" style="background: var(--bg-hover); color: var(--text-secondary);">${escapeHtml(noticia.zona)}</span>
                <span class="news-item-tag" style="background: var(--bg-hover); color: var(--text-secondary);">${escapeHtml(noticia.tipo)}</span>
                <span class="news-item-tag" style="background: var(--bg-hover); color: var(--text-secondary);">${formatFecha(noticia.fecha_accidente)}</span>
            </div>
            <p class="news-item-description">${escapeHtml(noticia.descripcion)}</p>
            <div class="news-item-footer">
                <div class="news-item-source">
                    Fuente: <a href="${escapeHtml(noticia.fuente_url)}" target="_blank">${escapeHtml(noticia.fuente_nombre)}</a>
                    · ${formatFecha(noticia.fuente_fecha)}
                </div>
                <div class="news-item-actions">
                    <button class="btn btn-secondary btn-sm" onclick="verDetalles(${noticia.id})">
                        Ver detalles
                    </button>
                    ${noticia.estado === 'pendiente' ? `
                        <button class="btn btn-success btn-sm" onclick="aprobarNoticia(${noticia.id})">
                            Aprobar
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="rechazarNoticia(${noticia.id})">
                            Rechazar
                        </button>
                    ` : ''}
                    <button class="btn btn-ghost btn-sm" onclick="eliminarNoticia(${noticia.id})">
                        Eliminar
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// ===== RENDERIZAR LOGS =====
function renderizarLogs(logs) {
    if (logs.length === 0) {
        elementos.listaLogs.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <p>No hay registros de actividad</p>
            </div>
        `;
        return;
    }

    elementos.listaLogs.innerHTML = logs.map(log => `
        <div class="log-item">
            <span class="log-action ${log.accion}">${log.accion}</span>
            <span class="log-details">${escapeHtml(log.detalles || '')}</span>
            <span class="log-date">${formatFecha(log.fecha)}</span>
        </div>
    `).join('');
}

// ===== ACCIONES =====
async function generarNoticias() {
    elementos.btnGenerar.disabled = true;
    elementos.btnGenerar.innerHTML = '<span class="loading"></span> Generando...';

    try {
        const resultado = await apiPost('/admin/generar');

        if (resultado.success) {
            mostrarToast(resultado.message, 'success');
            await cargarDatos();
        } else {
            mostrarToast('Error: ' + resultado.error, 'error');
        }
    } catch (error) {
        mostrarToast('Error de conexión: ' + error.message, 'error');
    } finally {
        elementos.btnGenerar.disabled = false;
        elementos.btnGenerar.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            Generar Noticias
        `;
    }
}

async function aprobarNoticia(id) {
    try {
        const resultado = await apiPost(`/admin/noticias/${id}/aprobar`);
        if (resultado.success) {
            mostrarToast('Noticia aprobada correctamente', 'success');
            await cargarDatos();
        } else {
            mostrarToast('Error: ' + resultado.error, 'error');
        }
    } catch (error) {
        mostrarToast('Error de conexión: ' + error.message, 'error');
    }
}

async function rechazarNoticia(id) {
    try {
        const resultado = await apiPost(`/admin/noticias/${id}/rechazar`);
        if (resultado.success) {
            mostrarToast('Noticia rechazada', 'info');
            await cargarDatos();
        } else {
            mostrarToast('Error: ' + resultado.error, 'error');
        }
    } catch (error) {
        mostrarToast('Error de conexión: ' + error.message, 'error');
    }
}

async function eliminarNoticia(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta noticia?')) return;

    try {
        const resultado = await apiDelete(`/admin/noticias/${id}`);
        if (resultado.success) {
            mostrarToast('Noticia eliminada', 'info');
            await cargarDatos();
        } else {
            mostrarToast('Error: ' + resultado.error, 'error');
        }
    } catch (error) {
        mostrarToast('Error de conexión: ' + error.message, 'error');
    }
}

function verDetalles(id) {
    const noticia = noticias.find(n => n.id === id);
    if (!noticia) return;

    elementos.modalTitulo.textContent = noticia.titulo;
    elementos.modalBody.innerHTML = `
        <div class="detail-row">
            <div class="detail-label">Descripción</div>
            <div class="detail-value">${escapeHtml(noticia.descripcion)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Zona</div>
            <div class="detail-value">${escapeHtml(noticia.zona)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Tipo de accidente</div>
            <div class="detail-value">${escapeHtml(noticia.tipo)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Fecha del accidente</div>
            <div class="detail-value">${formatFecha(noticia.fecha_accidente)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Fecha de generación</div>
            <div class="detail-value">${formatFecha(noticia.fecha_generacion)}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Fuente original</div>
            <div class="detail-value">
                <a href="${escapeHtml(noticia.fuente_url)}" target="_blank">${escapeHtml(noticia.fuente_nombre)}</a>
                <br><small style="color: var(--text-muted);">Publicada: ${formatFecha(noticia.fuente_fecha)}</small>
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Estado</div>
            <div class="detail-value">
                <span class="news-item-tag tag-${noticia.estado}">${capitalize(noticia.estado)}</span>
            </div>
        </div>
        ${noticia.fecha_revision ? `
        <div class="detail-row">
            <div class="detail-label">Fecha de revisión</div>
            <div class="detail-value">${formatFecha(noticia.fecha_revision)}</div>
        </div>
        ` : ''}
    `;

    elementos.modalFooter.innerHTML = `
        ${noticia.estado === 'pendiente' ? `
            <button class="btn btn-success" onclick="aprobarNoticia(${noticia.id}); cerrarModal();">
                Aprobar
            </button>
            <button class="btn btn-danger" onclick="rechazarNoticia(${noticia.id}); cerrarModal();">
                Rechazar
            </button>
        ` : ''}
        <button class="btn btn-secondary" onclick="cerrarModal()">Cerrar</button>
    `;

    elementos.modal.classList.add('active');
}

function cerrarModal() {
    elementos.modal.classList.remove('active');
}

// ===== VERIFICAR OLLAMA =====
async function verificarOllama() {
    try {
        const resultado = await apiGet('/admin/ollama/estado');
        if (resultado.success) {
            const { conectado, modelos, modelo, host, puerto } = resultado.data;
            const estadoHtml = conectado
                ? `<span style="color: var(--success);">Conectado</span>`
                : `<span style="color: var(--danger);">No conectado</span>`;

            elementos.modalTitulo.textContent = 'Estado de Ollama';
            elementos.modalBody.innerHTML = `
                <div class="detail-row">
                    <div class="detail-label">Estado</div>
                    <div class="detail-value">${estadoHtml}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Host</div>
                    <div class="detail-value">${host}:${puerto}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Modelo configurado</div>
                    <div class="detail-value">${modelo}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Modelos disponibles</div>
                    <div class="detail-value">${modelos.length > 0 ? modelos.join(', ') : 'No se pudieron obtener'}</div>
                </div>
                ${!conectado ? `
                <div class="detail-row">
                    <div class="detail-label">Instrucciones</div>
                    <div class="detail-value" style="color: var(--warning);">
                        Asegúrate de que Ollama esté instalado y ejecutándose:<br>
                        <code style="background: var(--bg-hover); padding: 4px 8px; border-radius: 4px; display: inline-block; margin-top: 8px;">
                            ollama serve
                        </code>
                    </div>
                </div>
                ` : ''}
            `;
            elementos.modalFooter.innerHTML = `
                <button class="btn btn-secondary" onclick="cerrarModal()">Cerrar</button>
            `;
            elementos.modal.classList.add('active');
        }
    } catch (error) {
        mostrarToast('Error al verificar Ollama: ' + error.message, 'error');
    }
}

// ===== UTILIDADES =====
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatFecha(fechaStr) {
    if (!fechaStr) return '-';
    const fecha = new Date(fechaStr);
    const opciones = { day: 'numeric', month: 'short', year: 'numeric' };
    return fecha.toLocaleDateString('es-ES', opciones);
}

function mostrarToast(mensaje, tipo = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `
        <span class="toast-icon">${tipo === 'success' ? '✓' : tipo === 'error' ? '✗' : 'ℹ'}</span>
        <span class="toast-message">${escapeHtml(mensaje)}</span>
    `;
    elementos.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===== EVENTOS =====
elementos.btnGenerar.addEventListener('click', generarNoticias);
elementos.btnVerOllama.addEventListener('click', verificarOllama);
elementos.modalCerrar.addEventListener('click', cerrarModal);

elementos.modal.addEventListener('click', (e) => {
    if (e.target === elementos.modal) cerrarModal();
});

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
        currentTab = tab;
    });
});

// Funciones globales para onclick
window.aprobarNoticia = aprobarNoticia;
window.rechazarNoticia = rechazarNoticia;
window.eliminarNoticia = eliminarNoticia;
window.verDetalles = verDetalles;
window.cerrarModal = cerrarModal;

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    cargarDatos();

    // Actualizar cada 30 segundos
    setInterval(cargarDatos, 30000);
});

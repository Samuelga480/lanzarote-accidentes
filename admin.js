// ===== PANEL DE ADMINISTRACIÓN =====

let noticias = [];
let authToken = localStorage.getItem('auth_token');
let userRole = localStorage.getItem('auth_role');

// Cargar noticias al iniciar
document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticación
    if (!authToken) {
        window.location.href = 'login.html';
        return;
    }

    // Verificar que sea admin
    if (userRole !== 'admin') {
        alert('No tienes permisos para acceder al panel de administración');
        window.location.href = 'index.html';
        return;
    }

    cargarNoticias();
    cargarStats();

    // Event listeners
    document.getElementById('btn-recopilar').addEventListener('click', recopilarNoticias);
    document.getElementById('admin-buscador').addEventListener('input', filtrarNoticias);
    document.getElementById('admin-filtro-estado').addEventListener('change', filtrarNoticias);
    document.getElementById('admin-filtro-zona').addEventListener('change', filtrarNoticias);
    document.getElementById('admin-filtro-tipo').addEventListener('change', filtrarNoticias);

    // Modal de edición
    document.getElementById('modal-close').addEventListener('click', cerrarModalEditar);
    document.getElementById('btn-cancelar').addEventListener('click', cerrarModalEditar);
    document.getElementById('edit-form').addEventListener('submit', guardarEdicion);

    // Modal de ver
    document.getElementById('view-modal-close').addEventListener('click', cerrarModalVer);

    // Botón de logout
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn btn-secondary';
    logoutBtn.innerHTML = 'Cerrar Sesión';
    logoutBtn.addEventListener('click', cerrarSesion);
    document.querySelector('.admin-nav').appendChild(logoutBtn);
});

// ===== CERRAR SESIÓN =====
async function cerrarSesion() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
        // Ignorar errores
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_email');
    window.location.href = 'login.html';
}

// Función para obtener headers de autenticación
function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };
}

// ===== CARGAR NOTICIAS =====
async function cargarNoticias() {
    try {
        const response = await fetch('/api/noticias', {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            noticias = data.data;
            renderNoticias(noticias);
        }
    } catch (error) {
        console.error('Error cargando noticias:', error);
    }
}

// ===== CARGAR ESTADÍSTICAS =====
async function cargarStats() {
    try {
        const response = await fetch('/api/stats', {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            document.getElementById('stat-total').textContent = data.data.total;
            document.getElementById('stat-pendientes').textContent = data.data.pendientes;
            document.getElementById('stat-aprobadas').textContent = data.data.aprobadas;
            document.getElementById('stat-rechazadas').textContent = data.data.rechazadas;
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// ===== RENDER NOTICIAS =====
function renderNoticias(data) {
    const container = document.getElementById('admin-news-list');

    if (data.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">No hay noticias para mostrar.</p>';
        return;
    }

    container.innerHTML = data.map(noticia => `
        <div class="admin-news-item" data-id="${noticia.id}">
            <div class="admin-news-info">
                <div class="admin-news-title">${escapeHTML(noticia.titulo)}</div>
                <div class="admin-news-meta">
                    <span>${formatFecha(noticia.fecha)}</span>
                    <span>${noticia.zona}</span>
                    <span>${noticia.tipo}</span>
                    <span>Fuente: ${noticia.fuente}</span>
                </div>
            </div>
            <span class="admin-news-status ${noticia.estado}">${noticia.estado}</span>
            <div class="admin-news-actions">
                <button class="btn btn-secondary btn-small" onclick="verNoticia(${noticia.id})">Ver</button>
                <button class="btn btn-primary btn-small" onclick="editarNoticia(${noticia.id})">Editar</button>
                ${noticia.estado !== 'aprobada' ? `<button class="btn btn-success btn-small" onclick="aprobarNoticia(${noticia.id})">Aprobar</button>` : ''}
                ${noticia.estado !== 'rechazada' ? `<button class="btn btn-danger btn-small" onclick="rechazarNoticia(${noticia.id})">Rechazar</button>` : ''}
                <button class="btn btn-danger btn-small" onclick="eliminarNoticia(${noticia.id})">Eliminar</button>
            </div>
        </div>
    `).join('');
}

// ===== FILTRAR NOTICIAS =====
function filtrarNoticias() {
    const busqueda = document.getElementById('admin-buscador').value.toLowerCase();
    const estado = document.getElementById('admin-filtro-estado').value;
    const zona = document.getElementById('admin-filtro-zona').value;
    const tipo = document.getElementById('admin-filtro-tipo').value;

    let filtradas = noticias.filter(noticia => {
        if (busqueda) {
            const texto = `${noticia.titulo} ${noticia.descripcion} ${noticia.zona}`.toLowerCase();
            if (!texto.includes(busqueda)) return false;
        }
        if (estado && noticia.estado !== estado) return false;
        if (zona && noticia.zona !== zona) return false;
        if (tipo && noticia.tipo !== tipo) return false;
        return true;
    });

    renderNoticias(filtradas);
}

// ===== RECOPILAR NOTICIAS =====
async function recopilarNoticias() {
    const btn = document.getElementById('btn-recopilar');
    btn.disabled = true;
    btn.innerHTML = '<span>Recopilando...</span>';

    try {
        const response = await fetch('/api/recopilar', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            alert(`Se recopilaron ${data.count} noticias nuevas. Están pendientes de revisión.`);
            cargarNoticias();
            cargarStats();
        } else {
            alert('Error al recopilar noticias: ' + data.error);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
            </svg>
            Recopilar Noticias
        `;
    }
}

// ===== VER NOTICIA =====
function verNoticia(id) {
    const noticia = noticias.find(n => n.id === id);
    if (!noticia) return;

    const body = document.getElementById('view-modal-body');
    body.innerHTML = `
        <div class="form-group">
            <label>Título</label>
            <p>${escapeHTML(noticia.titulo)}</p>
        </div>
        <div class="form-group">
            <label>Descripción</label>
            <p>${escapeHTML(noticia.descripcion)}</p>
        </div>
        ${noticia.resumen_ia ? `
        <div class="form-group">
            <label>Resumen IA</label>
            <p>${escapeHTML(noticia.resumen_ia)}</p>
        </div>
        ` : ''}
        <div class="form-row">
            <div class="form-group">
                <label>Zona</label>
                <p>${noticia.zona}</p>
            </div>
            <div class="form-group">
                <label>Municipio</label>
                <p>${noticia.municipio}</p>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Tipo</label>
                <p>${noticia.tipo}</p>
            </div>
            <div class="form-group">
                <label>Fecha</label>
                <p>${formatFecha(noticia.fecha)}</p>
            </div>
        </div>
        <div class="form-group">
            <label>Fuente</label>
            <p>${noticia.fuente}</p>
        </div>
        ${noticia.url_fuente ? `
        <div class="form-group">
            <label>URL Fuente</label>
            <p><a href="${noticia.url_fuente}" target="_blank" style="color: var(--accent);">${noticia.url_fuente}</a></p>
        </div>
        ` : ''}
        <div class="form-row">
            <div class="form-group">
                <label>Latitud</label>
                <p>${noticia.lat || '-'}</p>
            </div>
            <div class="form-group">
                <label>Longitud</label>
                <p>${noticia.lng || '-'}</p>
            </div>
        </div>
    `;

    document.getElementById('view-modal').classList.add('active');
}

// ===== EDITAR NOTICIA =====
function editarNoticia(id) {
    const noticia = noticias.find(n => n.id === id);
    if (!noticia) return;

    document.getElementById('edit-id').value = noticia.id;
    document.getElementById('edit-titulo').value = noticia.titulo;
    document.getElementById('edit-descripcion').value = noticia.descripcion;
    document.getElementById('edit-resumen').value = noticia.resumen_ia || '';
    document.getElementById('edit-zona').value = noticia.zona;
    document.getElementById('edit-municipio').value = noticia.municipio;
    document.getElementById('edit-tipo').value = noticia.tipo;
    document.getElementById('edit-fecha').value = noticia.fecha;
    document.getElementById('edit-lat').value = noticia.lat || '';
    document.getElementById('edit-lng').value = noticia.lng || '';
    document.getElementById('edit-fuente').value = noticia.fuente;
    document.getElementById('edit-url').value = noticia.url_fuente || '';

    document.getElementById('edit-modal').classList.add('active');
}

async function guardarEdicion(e) {
    e.preventDefault();

    const id = document.getElementById('edit-id').value;
    const datos = {
        titulo: document.getElementById('edit-titulo').value,
        descripcion: document.getElementById('edit-descripcion').value,
        resumen_ia: document.getElementById('edit-resumen').value,
        zona: document.getElementById('edit-zona').value,
        municipio: document.getElementById('edit-municipio').value,
        tipo: document.getElementById('edit-tipo').value,
        fecha: document.getElementById('edit-fecha').value,
        lat: parseFloat(document.getElementById('edit-lat').value) || null,
        lng: parseFloat(document.getElementById('edit-lng').value) || null,
        fuente: document.getElementById('edit-fuente').value,
        url_fuente: document.getElementById('edit-url').value
    };

    try {
        const response = await fetch(`/api/noticias/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(datos)
        });

        const data = await response.json();

        if (data.success) {
            alert('Noticia actualizada correctamente.');
            cerrarModalEditar();
            cargarNoticias();
            cargarStats();
        } else {
            alert('Error al actualizar: ' + data.error);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
    }
}

// ===== APROBAR NOTICIA =====
async function aprobarNoticia(id) {
    if (!confirm('¿Estás seguro de aprobar esta noticia?')) return;

    try {
        const response = await fetch(`/api/noticias/${id}/aprobar`, { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            cargarNoticias();
            cargarStats();
        } else {
            alert('Error al aprobar: ' + data.error);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
    }
}

// ===== RECHAZAR NOTICIA =====
async function rechazarNoticia(id) {
    if (!confirm('¿Estás seguro de rechazar esta noticia?')) return;

    try {
        const response = await fetch(`/api/noticias/${id}/rechazar`, { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            cargarNoticias();
            cargarStats();
        } else {
            alert('Error al rechazar: ' + data.error);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
    }
}

// ===== ELIMINAR NOTICIA =====
async function eliminarNoticia(id) {
    try {
        const response = await fetch(`/api/noticias/${id}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            cargarNoticias();
            cargarStats();
        } else {
            alert('Error al eliminar: ' + data.error);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
    }
}

// ===== UTILIDADES =====
function cerrarModalEditar() {
    document.getElementById('edit-modal').classList.remove('active');
}

function cerrarModalVer() {
    document.getElementById('view-modal').classList.remove('active');
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatFecha(fechaStr) {
    const fecha = new Date(fechaStr);
    return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

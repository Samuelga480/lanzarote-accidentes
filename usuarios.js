// ===== PÁGINA DE USUARIOS REGISTRADOS =====

let usuarios = [];
let authToken = localStorage.getItem('auth_token');
let userRole = localStorage.getItem('auth_role');

document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticación
    if (!authToken) {
        window.location.href = 'login.html';
        return;
    }

    // Verificar que sea admin
    if (userRole !== 'admin') {
        alert('No tienes permisos para acceder a esta página');
        window.location.href = 'index.html';
        return;
    }

    cargarUsuarios();

    // Event listeners
    document.getElementById('usuarios-buscador').addEventListener('input', filtrarUsuarios);
    document.getElementById('usuarios-filtro-rol').addEventListener('change', filtrarUsuarios);
    document.getElementById('comentarios-modal-close').addEventListener('click', cerrarModalComentarios);
});

// ===== CARGAR USUARIOS =====
async function cargarUsuarios() {
    try {
        const response = await fetch('/api/usuarios', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        const data = await response.json();

        if (data.success) {
            usuarios = data.data;
            renderUsuarios(usuarios);
            actualizarStats();
        }
    } catch (error) {
        console.error('Error cargando usuarios:', error);
    }
}

// ===== ACTUALIZAR ESTADÍSTICAS =====
function actualizarStats() {
    const total = usuarios.length;
    const admins = usuarios.filter(u => u.role === 'admin').length;
    const invitados = usuarios.filter(u => u.role === 'invitado').length;

    document.getElementById('stat-total-usuarios').textContent = total;
    document.getElementById('stat-admins').textContent = admins;
    document.getElementById('stat-invitados').textContent = invitados;
}

// ===== RENDER USUARIOS =====
function renderUsuarios(data) {
    const container = document.getElementById('admin-users-list');

    if (data.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">No se encontraron usuarios.</p>';
        return;
    }

    container.innerHTML = data.map(usuario => `
        <div class="admin-user-item">
            <div class="admin-user-avatar">${usuario.nombre.charAt(0).toUpperCase()}</div>
            <div class="admin-user-info">
                <div class="admin-user-name">${escapeHTML(usuario.nombre)}</div>
                <div class="admin-user-email">${escapeHTML(usuario.email)}</div>
                <div class="admin-user-role ${usuario.role}">${usuario.role}</div>
            </div>
            <div class="admin-user-actions">
                <button class="btn btn-secondary btn-small" onclick="verComentarios('${usuario.email}', '${escapeHTML(usuario.nombre)}')">Ver comentarios</button>
            </div>
            <div class="admin-user-date">${formatFecha(usuario.fechaRegistro)}</div>
        </div>
    `).join('');
}

// ===== FILTRAR USUARIOS =====
function filtrarUsuarios() {
    const busqueda = document.getElementById('usuarios-buscador').value.toLowerCase();
    const rol = document.getElementById('usuarios-filtro-rol').value;

    let filtrados = usuarios.filter(usuario => {
        if (busqueda) {
            const texto = `${usuario.nombre} ${usuario.email}`.toLowerCase();
            if (!texto.includes(busqueda)) return false;
        }
        if (rol && usuario.role !== rol) return false;
        return true;
    });

    renderUsuarios(filtrados);
}

// ===== VER COMENTARIOS DE USUARIO =====
async function verComentarios(email, nombre) {
    document.getElementById('comentarios-usuario-nombre').textContent = nombre;
    const modal = document.getElementById('comentarios-modal');
    const body = document.getElementById('comentarios-modal-body');

    body.innerHTML = '<p style="color: var(--text-secondary);">Cargando comentarios...</p>';
    modal.classList.add('active');

    try {
        const response = await fetch(`/api/comentarios/usuario/${email}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        const data = await response.json();

        if (data.success && data.data.length > 0) {
            body.innerHTML = data.data.map(comentario => {
                const fecha = new Date(comentario.fecha).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return `
                    <div class="comentario-item">
                        <p class="comentario-texto">${escapeHTML(comentario.texto)}</p>
                        <p class="comentario-fecha">${fecha}</p>
                        <p class="comentario-noticia">En: <a href="noticia.html?id=${comentario.noticiaId}">Ver noticia</a></p>
                    </div>
                `;
            }).join('');
        } else {
            body.innerHTML = '<p style="color: var(--text-secondary);">Este usuario aún no ha realizado comentarios.</p>';
        }
    } catch (error) {
        console.error('Error cargando comentarios:', error);
        body.innerHTML = '<p style="color: var(--text-secondary);">Error al cargar los comentarios.</p>';
    }
}

// ===== CERRAR MODAL =====
function cerrarModalComentarios() {
    document.getElementById('comentarios-modal').classList.remove('active');
}

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

// ===== UTILIDADES =====
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

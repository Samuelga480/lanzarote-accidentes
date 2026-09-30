// ===== PÁGINA DE PERFIL =====

let currentUser = null;
let perfilUsuario = null;
let isEditing = false;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('id');
    const authToken = localStorage.getItem('auth_token');
    const userEmail = localStorage.getItem('auth_email');

    // Actualizar nav
    const navLogin = document.getElementById('nav-login');
    const navLogout = document.getElementById('nav-logout');
    if (authToken) {
        navLogin.textContent = 'Mi Perfil';
        navLogin.href = 'perfil.html';
        navLogout.style.display = 'inline-block';
    }

    try {
        if (userId) {
            // Ver perfil de otro usuario
            const response = await fetch(`/api/perfil/${userId}`);
            const data = await response.json();
            if (data.success) {
                perfilUsuario = data.data;
                renderPerfil();
            } else {
                mostrarError('Usuario no encontrado');
            }
        } else if (authToken) {
            // Ver perfil propio
            const response = await fetch('/api/perfil', {
                headers: { 
                    'Authorization': `Bearer ${authToken}`, 
                    'user-email': userEmail 
                }
            });
            const data = await response.json();
            if (data.success) {
                perfilUsuario = data.data;
                currentUser = data.data;
                renderPerfil();
            } else {
                // Si no existe el perfil, crearlo
                mostrarError('No se pudo cargar el perfil. Código: ' + (data.error || 'desconocido'));
            }
        } else {
            // No autenticado
            mostrarError('Debes iniciar sesión para ver tu perfil');
        }
    } catch (error) {
        console.error('Error cargando perfil:', error);
        mostrarError('Error de conexión al cargar el perfil');
    }
});

function mostrarError(mensaje) {
    const container = document.getElementById('perfil-container');
    container.innerHTML = `
        <div style="padding: 60px 40px; text-align: center;">
            <h2 style="font-family: 'Merriweather', serif; margin-bottom: 16px; color: var(--text-primary);">Perfil de usuario</h2>
            <p style="color: var(--text-secondary); margin-bottom: 24px;">${mensaje}</p>
            <a href="login.html" class="btn btn-primary" style="display: inline-block; padding: 12px 24px; background: var(--text-primary); color: white; text-decoration: none; border-radius: 6px;">Iniciar sesión</a>
        </div>
    `;
}

function renderPerfil() {
    if (!perfilUsuario) {
        mostrarError('No se pudieron cargar los datos del perfil');
        return;
    }

    const container = document.getElementById('perfil-container');
    const fechaRegistro = new Date(perfilUsuario.fechaRegistro).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const esPerfilPropio = currentUser && currentUser.email === perfilUsuario.email;
    const nombreMostrar = perfilUsuario.nombre || perfilUsuario.email.split('@')[0];

    container.innerHTML = `
        <div class="perfil-header">
            <div class="perfil-foto-container">
                <div class="perfil-foto" id="perfil-foto" onclick="${esPerfilPropio ? 'document.getElementById(\'perfil-foto-input\').click()' : ''}">
                    ${perfilUsuario.foto 
                        ? `<img src="${perfilUsuario.foto}" alt="Foto de perfil">`
                        : `<div class="perfil-foto-placeholder">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                            </svg>
                        </div>`
                    }
                </div>
                ${esPerfilPropio ? `
                <div class="perfil-foto-icono" onclick="document.getElementById('perfil-foto-input').click()" title="Cambiar foto">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                    </svg>
                </div>
                <input type="file" id="perfil-foto-input" class="perfil-foto-input" accept="image/*" onchange="subirFoto(this)">
                ` : ''}
            </div>
            <h2 class="perfil-nombre">${nombreMostrar}</h2>
            <p class="perfil-email">${perfilUsuario.email}</p>
            <p class="perfil-fecha">Miembro desde ${fechaRegistro}</p>
        </div>
        <div class="perfil-body">
            <div class="perfil-seccion">
                <div class="perfil-seccion-header">
                    <h3>Descripción</h3>
                    ${esPerfilPropio ? `<button class="btn btn-small btn-secondary" onclick="toggleEditar()">Editar</button>` : ''}
                </div>
                <div id="perfil-bio-container">
                    <p class="perfil-bio ${!perfilUsuario.bio ? 'perfil-bio-vacia' : ''}" id="perfil-bio-texto">
                        ${perfilUsuario.bio || 'Este usuario aún no ha añadido una descripción.'}
                    </p>
                </div>
                ${esPerfilPropio ? `
                <div class="perfil-editar" id="perfil-editar">
                    <div class="form-group">
                        <label for="edit-nombre">Nombre</label>
                        <input type="text" id="edit-nombre" value="${nombreMostrar}" placeholder="Tu nombre público">
                    </div>
                    <div class="form-group">
                        <label for="edit-bio">Descripción</label>
                        <textarea id="edit-bio" placeholder="Cuéntanos sobre ti...">${perfilUsuario.bio || ''}</textarea>
                    </div>
                    <div class="perfil-acciones">
                        <button class="btn btn-primary" onclick="guardarPerfil()">Guardar cambios</button>
                        <button class="btn btn-secondary" onclick="toggleEditar()">Cancelar</button>
                    </div>
                </div>
                ` : ''}
            </div>
            <div class="perfil-seccion">
                <div class="perfil-seccion-header">
                    <h3>Comentarios</h3>
                </div>
                <div id="comentarios-list">
                    <p style="color: var(--text-muted);">Cargando comentarios...</p>
                </div>
            </div>
        </div>
    `;

    cargarComentarios();
}

async function cargarComentarios() {
    try {
        const response = await fetch(`/api/comentarios/usuario/${perfilUsuario.email}`);
        const data = await response.json();
        
        const container = document.getElementById('comentarios-list');
        
        if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(comentario => {
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
            container.innerHTML = '<p style="color: var(--text-muted);">Este usuario aún no ha realizado comentarios.</p>';
        }
    } catch (error) {
        console.error('Error cargando comentarios:', error);
    }
}

function toggleEditar() {
    isEditing = !isEditing;
    const editarDiv = document.getElementById('perfil-editar');
    if (isEditing) {
        editarDiv.classList.add('active');
    } else {
        editarDiv.classList.remove('active');
    }
}

async function subirFoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Verificar tamaño (máximo 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert('La imagen no puede superar 2MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const foto = e.target.result;
            await actualizarFoto(foto);
        };
        reader.readAsDataURL(file);
    }
}

async function actualizarFoto(foto) {
    const authToken = localStorage.getItem('auth_token');
    const userEmail = localStorage.getItem('auth_email');

    try {
        const response = await fetch('/api/perfil/foto', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'user-email': userEmail
            },
            body: JSON.stringify({ foto })
        });

        const data = await response.json();
        if (data.success) {
            location.reload();
        } else {
            alert('Error al subir la foto');
        }
    } catch (error) {
        console.error('Error subiendo foto:', error);
        alert('Error de conexión');
    }
}

async function guardarPerfil() {
    const authToken = localStorage.getItem('auth_token');
    const userEmail = localStorage.getItem('auth_email');
    const nombre = document.getElementById('edit-nombre').value;
    const bio = document.getElementById('edit-bio').value;

    try {
        const response = await fetch('/api/perfil', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'user-email': userEmail
            },
            body: JSON.stringify({ nombre, bio })
        });

        const data = await response.json();
        if (data.success) {
            location.reload();
        } else {
            alert('Error al guardar los cambios');
        }
    } catch (error) {
        console.error('Error guardando perfil:', error);
        alert('Error de conexión');
    }
}

function cerrarSesion(event) {
    event.preventDefault();
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_email');
    window.location.href = 'index.html';
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

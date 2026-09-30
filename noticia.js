// ===== PÁGINA DE NOTICIA INDIVIDUAL =====

let map;
let noticiaActual = null;
let authToken = localStorage.getItem('auth_token');
let userEmail = localStorage.getItem('auth_email');
let userRole = localStorage.getItem('auth_role');

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    // Actualizar nav
    const navLogin = document.getElementById('nav-login');
    if (authToken) {
        navLogin.textContent = 'Mi Perfil';
        navLogin.href = 'perfil.html';
    }

    if (!id) {
        window.location.href = 'index.html';
        return;
    }

    await cargarNoticia(id);
});

async function cargarNoticia(id) {
    try {
        const response = await fetch(`/api/noticias/${id}`);
        const data = await response.json();

        if (!data.success) {
            window.location.href = 'index.html';
            return;
        }

        noticiaActual = data.data;
        renderNoticia(noticiaActual);
        initMap(noticiaActual);
        cargarRelacionadas(noticiaActual);
        cargarComentarios();
        renderFormularioComentario();
    } catch (error) {
        console.error('Error cargando noticia:', error);
        window.location.href = 'index.html';
    }
}

function renderNoticia(noticia) {
    const container = document.getElementById('noticia-content');

    document.title = `${noticia.titulo} — Accidentes Lanzarote`;

    container.innerHTML = `
        <div class="noticia-body">
            <div class="noticia-meta">
                <span class="noticia-fecha">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    ${formatFecha(noticia.fecha)}
                    ${noticia.hora ? `a las ${noticia.hora}` : ''}
                </span>
                <span class="noticia-zona">${noticia.zona}</span>
                <span class="noticia-tipo ${noticia.tipo.toLowerCase().replace(' ', '-')}">${noticia.tipo}</span>
            </div>
            <h1 class="noticia-titulo">${escapeHTML(noticia.titulo)}</h1>
            <p class="noticia-descripcion">${escapeHTML(noticia.descripcion).replace(/\n\n/g, '</p><p>')}</p>

            <div class="noticia-fuente">
                <strong>Fuente:</strong> ${noticia.fuente}
            </div>
        </div>
    `;
}

function initMap(noticia) {
    if (!noticia.lat || !noticia.lng) return;

    map = L.map('map').setView([noticia.lat, noticia.lng], 13);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    const marker = L.circleMarker([noticia.lat, noticia.lng], {
        radius: 12,
        fillColor: getColorByTipo(noticia.tipo),
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);

    marker.bindPopup(`
        <div class="popup-title">${escapeHTML(noticia.titulo)}</div>
        <div class="popup-info">
            <strong>Zona:</strong> ${noticia.zona}<br>
            <strong>Fecha:</strong> ${formatFecha(noticia.fecha)}<br>
            <strong>Tipo:</strong> ${noticia.tipo}
        </div>
    `).openPopup();
}

async function cargarRelacionadas(noticiaActual) {
    try {
        const response = await fetch(`/api/noticias?estado=aprobada&zona=${noticiaActual.zona}`);
        const data = await response.json();

        if (data.success) {
            const relacionadas = data.data
                .filter(n => n.id !== noticiaActual.id)
                .slice(0, 3);

            const container = document.getElementById('related-news');

            if (relacionadas.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary);">No hay noticias relacionadas.</p>';
                return;
            }

            container.innerHTML = relacionadas.map(noticia => `
                <article class="news-card" onclick="window.location.href='noticia.html?id=${noticia.id}'">
                    <div class="news-content">
                        <div class="news-meta">
                            <span class="news-date">${formatFecha(noticia.fecha)}</span>
                            <span class="news-zone">${noticia.zona}</span>
                            <span class="news-type ${noticia.tipo.toLowerCase().replace(' ', '-')}">${noticia.tipo}</span>
                        </div>
                        <h3 class="news-title">${escapeHTML(noticia.titulo)}</h3>
                        <p class="news-description">${escapeHTML(noticia.descripcion.substring(0, 100))}...</p>
                    </div>
                </article>
            `).join('');
        }
    } catch (error) {
        console.error('Error cargando noticias relacionadas:', error);
    }
}

// ===== COMENTARIOS =====

function renderFormularioComentario() {
    const container = document.getElementById('comentarios-form-container');

    if (!authToken) {
        container.innerHTML = `
            <div class="comentarios-login">
                <p>Para comentar, <a href="login.html">inicia sesión</a> o <a href="register.html">regístrate</a>.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <form id="comentario-form" class="comentario-form">
            <div class="form-group">
                <textarea id="comentario-texto" placeholder="Escribe tu comentario..." rows="3" required></textarea>
            </div>
            <button type="submit" class="btn btn-primary">Publicar comentario</button>
        </form>
    `;

    document.getElementById('comentario-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await crearComentario();
    });
}

async function crearComentario() {
    const texto = document.getElementById('comentario-texto').value;

    try {
        const response = await fetch('/api/comentarios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'user-email': userEmail
            },
            body: JSON.stringify({ noticiaId: noticiaActual.id, texto })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('comentario-texto').value = '';
            cargarComentarios();
        } else {
            alert(data.error || 'Error al publicar comentario');
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

async function cargarComentarios() {
    try {
        const response = await fetch(`/api/comentarios/noticia/${noticiaActual.id}`);
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

                // Obtener info del usuario
                const esAutor = userEmail === comentario.usuarioEmail;
                const puedeEditar = esAutor || userRole === 'admin';

                return `
                    <div class="comentario-item" data-id="${comentario.id}">
                        <div class="comentario-header">
                            <a href="perfil.html?id=${comentario.usuarioId || ''}" class="comentario-usuario">
                                ${comentario.usuarioNombre || comentario.usuarioEmail.split('@')[0]}
                            </a>
                            <span class="comentario-fecha">${fecha}</span>
                        </div>
                        <p class="comentario-texto">${escapeHTML(comentario.texto)}</p>
                        ${puedeEditar ? `
                        <div class="comentario-acciones">
                            ${esAutor ? `<button class="btn btn-small btn-secondary" onclick="editarComentario(${comentario.id})">Editar</button>` : ''}
                            <button class="btn btn-small btn-danger" onclick="eliminarComentario(${comentario.id})">Eliminar</button>
                        </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = '<p style="color: var(--text-muted);">Sé el primero en comentar.</p>';
        }
    } catch (error) {
        console.error('Error cargando comentarios:', error);
    }
}

async function editarComentario(id) {
    const nuevoTexto = prompt('Edita tu comentario:');
    if (!nuevoTexto) return;

    try {
        const response = await fetch(`/api/comentarios/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                'user-email': userEmail
            },
            body: JSON.stringify({ texto: nuevoTexto })
        });

        const data = await response.json();
        if (data.success) {
            cargarComentarios();
        } else {
            alert(data.error || 'Error al editar comentario');
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

async function eliminarComentario(id) {
    try {
        const response = await fetch(`/api/comentarios/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'user-email': userEmail
            }
        });

        const data = await response.json();
        if (data.success) {
            cargarComentarios();
        } else {
            alert(data.error || 'Error al eliminar comentario');
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

function getColorByTipo(tipo) {
    const colores = {
        'Colisión': '#c92a2a',
        'Atropello': '#e67700',
        'Salida de vía': '#1971c2',
        'Vuelco': '#5f3dc4',
        'Moto': '#2b8a3e'
    };
    return colores[tipo] || '#c92a2a';
}

function formatFecha(fechaStr) {
    const fecha = new Date(fechaStr);
    return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

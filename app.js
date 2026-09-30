// ===== CONFIGURACIÓN DEL MAPA =====
let map;
let markers = [];
let noticias = [];

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initMap();
    await cargarNoticias();
    setupEventListeners();
    actualizarNav();
    setupProfileDropdown();
});

// ===== MODO OSCURO/CLARO =====
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }
}

// ===== ACTUALIZAR NAV SEGÚN AUTENTICACIÓN =====
function actualizarNav() {
    const navAuth = document.getElementById('nav-auth');
    const navProfileContainer = document.getElementById('nav-profile-container');
    const navProfileName = document.getElementById('nav-profile-name');
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    const profileAvatar = document.getElementById('profile-avatar');
    const authToken = localStorage.getItem('auth_token');
    const userEmail = localStorage.getItem('auth_email');

    if (authToken && userEmail) {
        // Usuario autenticado - mostrar menú de perfil
        const nombreUsuario = userEmail.split('@')[0];
        const userRole = localStorage.getItem('auth_role');
        navAuth.style.display = 'none';
        navProfileContainer.style.display = 'block';
        navProfileName.textContent = nombreUsuario;
        profileName.textContent = nombreUsuario;
        profileEmail.textContent = userEmail;
        profileAvatar.textContent = nombreUsuario.charAt(0).toUpperCase();

        // Mostrar "Peticiones de noticias" y "Usuarios registrados" solo a admin
        const peticionesLink = document.getElementById('profile-peticiones');
        const usuariosLink = document.getElementById('profile-usuarios');
        const verPerfilLink = document.getElementById('profile-ver-perfil');
        if (userRole === 'admin') {
            peticionesLink.style.display = 'flex';
            usuariosLink.style.display = 'flex';
            verPerfilLink.style.display = 'flex';
        } else {
            peticionesLink.style.display = 'none';
            usuariosLink.style.display = 'none';
            verPerfilLink.style.display = 'flex';
        }
    } else {
        // No autenticado - mostrar Acceder
        navAuth.style.display = 'block';
        navProfileContainer.style.display = 'none';
        navAuth.textContent = 'Acceder';
        navAuth.href = 'login.html';
        navAuth.classList.add('nav-admin');
    }
}

// ===== MENÚ DESPLEGABLE DE PERFIL =====
function setupProfileDropdown() {
    const profileBtn = document.getElementById('nav-profile-btn');
    const profileDropdown = document.getElementById('profile-dropdown');
    const profileLogout = document.getElementById('profile-logout');

    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!profileDropdown.contains(e.target)) {
                profileDropdown.classList.remove('active');
            }
        });
    }

    if (profileLogout) {
        profileLogout.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_role');
            localStorage.removeItem('auth_email');
            window.location.href = 'index.html';
        });
    }
}

// ===== MAPA =====
function initMap() {
    // Centrar en Lanzarote con zoom apropiado para ver toda la isla
    map = L.map('map', {
        center: [29.05, -13.60],
        zoom: 10,
        minZoom: 9,
        maxZoom: 18,
        scrollWheelZoom: true,
        zoomControl: true
    });

    // Tiles públicos de OpenStreetMap (sin API key, sin servicios de terceros)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Añadir control de escala
    L.control.scale({
        imperial: false,
        metric: true
    }).addTo(map);
}

function addMarkers(data) {
    // Limpiar marcadores existentes
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    data.forEach(noticia => {
        if (!noticia.lat || !noticia.lng) return;

        const marker = L.circleMarker([noticia.lat, noticia.lng], {
            radius: 10,
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
                <strong>Tipo:</strong> ${noticia.tipo}<br>
                <a href="noticia.html?id=${noticia.id}" style="color: var(--accent);">Ver noticia completa</a>
            </div>
        `);

        markers.push(marker);
    });
}

function getColorByTipo(tipo) {
    const colores = {
        'Colisión': '#e63946',
        'Atropello': '#f39c12',
        'Salida de vía': '#3498db',
        'Vuelco': '#9b59b6',
        'Moto': '#2ecc71'
    };
    return colores[tipo] || '#e63946';
}

// ===== CARGAR NOTICIAS =====
async function cargarNoticias(filtros = {}) {
    try {
        const params = new URLSearchParams();
        if (filtros.busqueda) params.append('busqueda', filtros.busqueda);
        if (filtros.zona) params.append('zona', filtros.zona);
        if (filtros.tipo) params.append('tipo', filtros.tipo);
        if (filtros.fecha) params.append('fecha', filtros.fecha);
        params.append('estado', 'aprobada');

        const response = await fetch(`/api/noticias?${params}`);
        const data = await response.json();

        if (data.success) {
            noticias = data.data;
            renderNoticias(noticias);
            addMarkers(noticias);
            updateStats();
        }
    } catch (error) {
        console.error('Error cargando noticias:', error);
    }
}

// ===== RENDER NOTICIAS =====
function renderNoticias(data) {
    const grid = document.getElementById('news-grid');
    grid.innerHTML = '';

    if (data.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px; grid-column: 1 / -1;">No se encontraron noticias con los filtros seleccionados.</p>';
        return;
    }

    data.forEach(noticia => {
        const card = document.createElement('article');
        card.className = 'news-card';
        card.innerHTML = `
            <div class="news-content">
                <div class="news-meta">
                    <span class="news-date">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        ${formatFecha(noticia.fecha)}
                    </span>
                    <span class="news-zone">${noticia.zona}</span>
                    <span class="news-type ${noticia.tipo.toLowerCase().replace(' ', '-')}">${noticia.tipo}</span>
                </div>
                <h3 class="news-title">${escapeHTML(noticia.titulo)}</h3>
                <p class="news-description">${escapeHTML(noticia.descripcion.substring(0, 120))}...</p>
            </div>
        `;
        card.addEventListener('click', () => {
            window.location.href = `noticia.html?id=${noticia.id}`;
        });
        grid.appendChild(card);
    });
}

// ===== ESTADÍSTICAS =====
async function updateStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        if (data.success) {
            const stats = data.data;
            document.getElementById('total-accidentes').textContent = stats.total;
            document.getElementById('accidentes-motos').textContent = stats.porTipo.find(t => t.tipo === 'Moto')?.count || 0;
            document.getElementById('zona-peligrosa').textContent = stats.porZona[0]?.zona || '-';

            if (stats.porZona.length > 0) {
                const zonaConMas = stats.porZona[0].zona;
                document.getElementById('zona-peligrosa').textContent = zonaConMas;
            }
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// ===== FILTROS Y BUSCADOR =====
function setupEventListeners() {
    document.getElementById('buscador').addEventListener('input', debounce(aplicarFiltros, 300));
    document.getElementById('filtro-zona').addEventListener('change', aplicarFiltros);
    document.getElementById('filtro-tipo').addEventListener('change', aplicarFiltros);
    document.getElementById('filtro-fecha').addEventListener('change', aplicarFiltros);
}

function aplicarFiltros() {
    const filtros = {
        busqueda: document.getElementById('buscador').value,
        zona: document.getElementById('filtro-zona').value,
        tipo: document.getElementById('filtro-tipo').value,
        fecha: document.getElementById('filtro-fecha').value
    };

    cargarNoticias(filtros);
}

// ===== UTILIDADES =====
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

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

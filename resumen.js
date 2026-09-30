// ===== PÁGINA DE RESUMEN SEMANAL =====

let resumenSemanal = null;

document.addEventListener('DOMContentLoaded', async () => {
    await cargarResumenSemanal();
});

// ===== CARGAR RESUMEN SEMANAL =====
async function cargarResumenSemanal() {
    try {
        const response = await fetch('/api/resumen-semanal');
        const data = await response.json();

        if (data.success) {
            resumenSemanal = data.data;
            renderResumen(resumenSemanal);
        }
    } catch (error) {
        console.error('Error cargando resumen semanal:', error);
    }
}

// ===== RENDER RESUMEN =====
function renderResumen(data) {
    // Estadísticas
    const statsContainer = document.getElementById('resumen-stats');
    statsContainer.innerHTML = `
        <div class="resumen-stat-card">
            <div class="resumen-stat-number">${data.total}</div>
            <div class="resumen-stat-label">Total accidentes</div>
        </div>
        <div class="resumen-stat-card">
            <div class="resumen-stat-number">${data.porTipo.length}</div>
            <div class="resumen-stat-label">Tipos diferentes</div>
        </div>
        <div class="resumen-stat-card">
            <div class="resumen-stat-number">${data.porZona.length}</div>
            <div class="resumen-stat-label">Zonas afectadas</div>
        </div>
    `;

    // Gráfico de tipos
    const chartTipos = document.getElementById('chart-tipos');
    const maxTipo = Math.max(...data.porTipo.map(t => t.count));
    chartTipos.innerHTML = data.porTipo.map(tipo => `
        <div class="chart-bar">
            <div class="chart-bar-label">${tipo.tipo}</div>
            <div class="chart-bar-track">
                <div class="chart-bar-fill" style="width: ${(tipo.count / maxTipo) * 100}%"></div>
            </div>
            <div class="chart-bar-value">${tipo.count}</div>
        </div>
    `).join('');

    // Gráfico de zonas
    const chartZonas = document.getElementById('chart-zonas');
    const maxZona = Math.max(...data.porZona.map(z => z.count));
    chartZonas.innerHTML = data.porZona.map(zona => `
        <div class="chart-bar">
            <div class="chart-bar-label">${zona.zona}</div>
            <div class="chart-bar-track">
                <div class="chart-bar-fill" style="width: ${(zona.count / maxZona) * 100}%"></div>
            </div>
            <div class="chart-bar-value">${zona.count}</div>
        </div>
    `).join('');

    // Lista de accidentes
    const accidentesList = document.getElementById('resumen-accidentes-list');
    if (data.accidentes.length === 0) {
        accidentesList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">No hay accidentes registrados esta semana.</p>';
    } else {
        accidentesList.innerHTML = data.accidentes.map(accidente => `
            <div class="resumen-accidente-item" onclick="window.location.href='noticia.html?id=${accidente.id}'">
                <div class="resumen-accidente-info">
                    <div class="resumen-accidente-title">${escapeHTML(accidente.titulo)}</div>
                    <div class="resumen-accidente-meta">
                        <span>${formatFecha(accidente.fecha)}</span>
                        <span>${accidente.zona}</span>
                        <span>${accidente.tipo}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }
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

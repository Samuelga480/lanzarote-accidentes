const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { NoticiasDB, LogsDB, ConfigDB } = require('./database');
const { obtenerNoticiasRSS, obtenerNoticiasDemo } = require('./rssFetcher');
const { generarNoticia, verificarConexion, OLLAMA_MODEL } = require('./ollama');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ===== RUTAS API =====

// Obtener noticias aprobadas (público)
app.get('/api/noticias', (req, res) => {
    try {
        const noticias = NoticiasDB.obtenerPorEstado('aprobada');
        res.json({ success: true, data: noticias });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener todas las noticias (admin)
app.get('/api/admin/noticias', (req, res) => {
    try {
        const noticias = NoticiasDB.obtenerTodas();
        res.json({ success: true, data: noticias });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener estadísticas
app.get('/api/estadisticas', (req, res) => {
    try {
        const stats = NoticiasDB.getEstadisticas();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Aprobar noticia
app.post('/api/admin/noticias/:id/aprobar', (req, res) => {
    try {
        NoticiasDB.actualizarEstado(req.params.id, 'aprobada');
        LogsDB.registrar('APROBAR', `Noticia ${req.params.id} aprobada`);
        res.json({ success: true, message: 'Noticia aprobada' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rechazar noticia
app.post('/api/admin/noticias/:id/rechazar', (req, res) => {
    try {
        NoticiasDB.actualizarEstado(req.params.id, 'rechazada');
        LogsDB.registrar('RECHAZAR', `Noticia ${req.params.id} rechazada`);
        res.json({ success: true, message: 'Noticia rechazada' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Eliminar noticia
app.delete('/api/admin/noticias/:id', (req, res) => {
    try {
        NoticiasDB.eliminar(req.params.id);
        LogsDB.registrar('ELIMINAR', `Noticia ${req.params.id} eliminada`);
        res.json({ success: true, message: 'Noticia eliminada' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generar noticias automáticamente
app.post('/api/admin/generar', async (req, res) => {
    try {
        LogsDB.registrar('GENERAR', 'Iniciando generación automática de noticias');

        // Obtener noticias de RSS o datos demo
        let noticiasRSS = await obtenerNoticiasRSS();

        // Si no hay RSS, usar datos de demostración
        if (noticiasRSS.length === 0) {
            noticiasRSS = obtenerNoticiasDemo();
            LogsDB.registrar('GENERAR', 'RSS no disponibles, usando datos de demostración');
        }

        const resultados = {
            procesadas: 0,
            generadas: 0,
            errores: 0,
            detalles: []
        };

        for (const noticiaRSS of noticiasRSS) {
            try {
                // Verificar si ya existe una noticia similar
                const existentes = NoticiasDB.obtenerTodas();
                const duplicada = existentes.some(n =>
                    n.fuente_url === noticiaRSS.url && n.estado !== 'rechazada'
                );

                if (duplicada) {
                    resultados.detalles.push({
                        titulo: noticiaRSS.titulo,
                        estado: 'duplicada',
                        mensaje: 'Ya existe una noticia similar'
                    });
                    continue;
                }

                // Generar noticia con Ollama
                const noticiaGenerada = await generarNoticia(noticiaRSS);

                // Guardar en base de datos
                NoticiasDB.insertar(noticiaGenerada);

                resultados.generadas++;
                resultados.detalles.push({
                    titulo: noticiaGenerada.titulo,
                    estado: 'generada',
                    zona: noticiaGenerada.zona
                });

            } catch (error) {
                resultados.errores++;
                resultados.detalles.push({
                    titulo: noticiaRSS.titulo,
                    estado: 'error',
                    mensaje: error.message
                });
            }

            resultados.procesadas++;
        }

        LogsDB.registrar('GENERAR', `Procesadas: ${resultados.procesadas}, Generadas: ${resultados.generadas}, Errores: ${resultados.errores}`);

        res.json({
            success: true,
            message: `Generación completada: ${resultados.generadas} noticias creadas`,
            data: resultados
        });

    } catch (error) {
        LogsDB.registrar('ERROR', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verificar estado de Ollama
app.get('/api/admin/ollama/estado', async (req, res) => {
    try {
        const estado = await verificarConexion();
        res.json({
            success: true,
            data: {
                ...estado,
                modelo: OLLAMA_MODEL,
                host: process.env.OLLAMA_HOST || 'localhost',
                puerto: process.env.OLLAMA_PORT || '11434'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener logs
app.get('/api/admin/logs', (req, res) => {
    try {
        const logs = LogsDB.obtener(50);
        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== TAREAS PROGRAMADAS =====

// Generar noticias cada 6 horas
cron.schedule('0 */6 * * *', async () => {
    console.log('[CRON] Ejecutando generación automática de noticias...');
    LogsDB.registrar('CRON', 'Ejecución programada iniciada');

    try {
        let noticiasRSS = await obtenerNoticiasRSS();
        if (noticiasRSS.length === 0) {
            noticiasRSS = obtenerNoticiasDemo();
        }

        for (const noticiaRSS of noticiasRSS) {
            try {
                const existentes = NoticiasDB.obtenerTodas();
                const duplicada = existentes.some(n =>
                    n.fuente_url === noticiaRSS.url && n.estado !== 'rechazada'
                );

                if (!duplicada) {
                    const noticiaGenerada = await generarNoticia(noticiaRSS);
                    NoticiasDB.insertar(noticiaGenerada);
                    console.log(`[CRON] Noticia generada: ${noticiaGenerada.titulo}`);
                }
            } catch (error) {
                console.error('[CRON] Error:', error.message);
            }
        }

        LogsDB.registrar('CRON', 'Ejecución programada completada');
    } catch (error) {
        console.error('[CRON] Error en tarea programada:', error.message);
    }
});

// ===== INICIO =====
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     Accidentes Lanzarote - Servidor                       ║
╠════════════════════════════════════════════════════════════╣
║  URL:        http://localhost:${PORT}                       ║
║  API:        http://localhost:${PORT}/api/noticias          ║
║  Admin:      http://localhost:${PORT}/admin/                ║
║  Ollama:     ${process.env.OLLAMA_HOST || 'localhost'}:${process.env.OLLAMA_PORT || '11434'} (${OLLAMA_MODEL})  ║
╚════════════════════════════════════════════════════════════╝
    `);
    LogsDB.registrar('SISTEMA', 'Servidor iniciado');
});

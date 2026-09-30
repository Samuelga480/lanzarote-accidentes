const express = require('express');
const cors = require('cors');
const path = require('path');

// Intentar usar PostgreSQL, si no usar JSON local
let db;
try {
    const pg = require('./database-pg');
    db = pg;
    console.log('Usando PostgreSQL');
} catch (e) {
    console.log('PostgreSQL no disponible, usando JSON local');
    db = require('./database');
}

const { recopilarNoticias } = require('./scraper');
const { generarResumen } = require('./ollama');

const app = express();
const PORT = process.env.PORT || 3001;

// Usuarios del sistema
const USUARIOS = {
    '[REDACTADO]': { password: '[REDACTADO]', role: 'admin' }
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===== AUTENTICACIÓN =====

function verificarAuth(req, res, next) {
    const token = req.headers.authorization;
    if (token && token.startsWith('Bearer ')) {
        const tokenValue = token.substring(7);
        if (tokenValue === '[REDACTADO]' || tokenValue === '[REDACTADO]') {
            return next();
        }
    }
    res.status(401).json({ success: false, error: 'No autorizado' });
}

function verificarAdmin(req, res, next) {
    const token = req.headers.authorization;
    if (token && token.startsWith('Bearer ')) {
        const tokenValue = token.substring(7);
        if (tokenValue === '[REDACTADO]') {
            return next();
        }
    }
    res.status(403).json({ success: false, error: 'Acceso solo para administradores' });
}

// Ruta de login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (USUARIOS[email] && USUARIOS[email].password === password) {
        res.json({
            success: true,
            token: '[REDACTADO]',
            role: 'admin',
            email: email
        });
        return;
    }

    const usuario = await db.getUsuarioByEmail(email);
    if (usuario && usuario.password === password) {
        res.json({
            success: true,
            token: '[REDACTADO]',
            role: 'invitado',
            email: email
        });
        return;
    }

    res.status(401).json({ success: false, error: 'Correo o contraseña incorrectos' });
});

// Ruta de registro
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;

    if (USUARIOS[email]) {
        return res.status(400).json({ success: false, error: 'Este correo ya está registrado' });
    }

    const existingUser = await db.getUsuarioByEmail(email);
    if (existingUser) {
        return res.status(400).json({ success: false, error: 'Este correo ya está registrado' });
    }

    const usuario = await db.crearUsuario(email, password, 'invitado');
    if (!usuario) {
        return res.status(400).json({ success: false, error: 'Error al crear usuario' });
    }

    res.json({
        success: true,
        token: '[REDACTADO]',
        role: 'invitado',
        email: email
    });
});

// Ruta de logout
app.post('/api/logout', (req, res) => {
    res.json({ success: true, message: 'Sesión cerrada' });
});

// ===== USUARIOS =====

app.get('/api/perfil', verificarAuth, async (req, res) => {
    const email = req.headers['user-email'];
    const usuario = await db.getUsuarioByEmail(email);
    if (!usuario) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    res.json({ success: true, data: usuario });
});

app.get('/api/perfil/:id', async (req, res) => {
    const usuario = await db.getUsuarioById(req.params.id);
    if (!usuario) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    res.json({ success: true, data: usuario });
});

app.put('/api/perfil', verificarAuth, async (req, res) => {
    const email = req.headers['user-email'];
    const { nombre, bio } = req.body;
    
    const usuario = await db.updateUsuario(email, { nombre, bio });
    if (!usuario) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    res.json({ success: true, data: usuario });
});

app.post('/api/perfil/foto', verificarAuth, async (req, res) => {
    const email = req.headers['user-email'];
    const { foto } = req.body;
    
    const usuario = await db.updateUsuario(email, { foto });
    if (!usuario) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    res.json({ success: true, data: usuario });
});

// ===== NOTICIAS =====

app.get('/api/noticias', verificarAdmin, async (req, res) => {
    try {
        const { zona, tipo, fecha, busqueda, estado } = req.query;
        const noticias = await db.getNoticias({ zona, tipo, fecha, busqueda, estado });
        res.json({ success: true, data: noticias });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/noticias/:id', async (req, res) => {
    try {
        const noticia = await db.getNoticiaById(req.params.id);
        if (!noticia) {
            return res.status(404).json({ success: false, error: 'Noticia no encontrada' });
        }
        res.json({ success: true, data: noticia });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/noticias', async (req, res) => {
    try {
        const { titulo, descripcion, fuente, url_fuente, fecha, hora, zona, municipio, tipo, lat, lng } = req.body;

        let resumen_ia = req.body.resumen_ia;
        if (!resumen_ia && descripcion) {
            try {
                resumen_ia = await generarResumen(descripcion, zona, tipo);
            } catch (e) {
                resumen_ia = null;
            }
        }

        const noticia = await db.createNoticia({
            titulo, descripcion, resumen_ia, fuente, url_fuente, fecha, hora, zona, municipio, tipo, lat, lng, estado: 'pendiente'
        });

        res.status(201).json({ success: true, data: noticia });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/noticias/:id', verificarAdmin, async (req, res) => {
    try {
        const noticia = await db.updateNoticia(req.params.id, req.body);
        if (!noticia) {
            return res.status(404).json({ success: false, error: 'Noticia no encontrada' });
        }
        res.json({ success: true, data: noticia });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/noticias/:id', verificarAdmin, async (req, res) => {
    try {
        const result = await db.deleteNoticia(req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, error: 'Noticia no encontrada' });
        }
        res.json({ success: true, message: 'Noticia eliminada' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/noticias/:id/aprobar', verificarAdmin, async (req, res) => {
    try {
        const noticia = await db.aprobarNoticia(req.params.id);
        if (!noticia) {
            return res.status(404).json({ success: false, error: 'Noticia no encontrada' });
        }
        res.json({ success: true, data: noticia });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/noticias/:id/rechazar', verificarAdmin, async (req, res) => {
    try {
        const noticia = await db.rechazarNoticia(req.params.id);
        if (!noticia) {
            return res.status(404).json({ success: false, error: 'Noticia no encontrada' });
        }
        res.json({ success: true, data: noticia });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stats', verificarAdmin, async (req, res) => {
    try {
        const stats = await db.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/pendientes', verificarAdmin, async (req, res) => {
    try {
        const pendientes = await db.getPendientes();
        res.json({ success: true, data: pendientes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/recopilar', verificarAdmin, async (req, res) => {
    try {
        const noticias = await recopilarNoticias();
        const guardadas = [];
        for (const noticia of noticias) {
            try {
                const guardada = await db.createNoticia(noticia);
                guardadas.push(guardada);
            } catch (e) {
                console.error('Error guardando noticia:', e.message);
            }
        }
        res.json({ success: true, data: guardadas, count: guardadas.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== COMENTARIOS =====

app.post('/api/comentarios', verificarAuth, async (req, res) => {
    try {
        const { noticiaId, texto } = req.body;
        const email = req.headers['user-email'];

        const comentariosUsuario = await db.getComentariosByUsuario(email);
        if (comentariosUsuario.length > 0) {
            const ultimoComentario = comentariosUsuario[0];
            const tiempoDesdeUltimo = Date.now() - new Date(ultimoComentario.fecha).getTime();
            if (tiempoDesdeUltimo < 30000) {
                return res.status(429).json({ success: false, error: 'Espera 30 segundos antes de comentar de nuevo' });
            }
        }

        if (!texto || texto.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'El comentario es demasiado corto' });
        }

        const comentario = await db.createComentario({ noticiaId, usuarioEmail: email, texto: texto.trim() });
        res.status(201).json({ success: true, data: comentario });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/comentarios/noticia/:id', async (req, res) => {
    try {
        const comentarios = await db.getComentariosByNoticia(req.params.id);
        res.json({ success: true, data: comentarios });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/comentarios/usuario/:email', async (req, res) => {
    try {
        const comentarios = await db.getComentariosByUsuario(req.params.email);
        res.json({ success: true, data: comentarios });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/comentarios', verificarAdmin, async (req, res) => {
    try {
        const comentarios = await db.getAllComentarios();
        res.json({ success: true, data: comentarios });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/comentarios/:id', verificarAuth, async (req, res) => {
    try {
        const email = req.headers['user-email'];
        const comentario = await db.getComentarioById(req.params.id);

        if (!comentario) {
            return res.status(404).json({ success: false, error: 'Comentario no encontrado' });
        }

        if (comentario.usuario_email !== email) {
            const usuario = await db.getUsuarioByEmail(email);
            if (!usuario || usuario.role !== 'admin') {
                return res.status(403).json({ success: false, error: 'No tienes permiso para editar este comentario' });
            }
        }

        const actualizado = await db.updateComentario(req.params.id, { texto: req.body.texto });
        res.json({ success: true, data: actualizado });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/comentarios/:id', verificarAuth, async (req, res) => {
    try {
        const email = req.headers['user-email'];
        const comentario = await db.getComentarioById(req.params.id);

        if (!comentario) {
            return res.status(404).json({ success: false, error: 'Comentario no encontrado' });
        }

        if (comentario.usuario_email !== email) {
            const usuario = await db.getUsuarioByEmail(email);
            if (!usuario || usuario.role !== 'admin') {
                return res.status(403).json({ success: false, error: 'No tienes permiso para eliminar este comentario' });
            }
        }

        await db.deleteComentario(req.params.id);
        res.json({ success: true, message: 'Comentario eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Monitoreo automático de fuentes
let ultimasNoticias = new Set();

async function monitorearFuentes() {
    try {
        const noticias = await recopilarNoticias();
        let nuevasNoticias = 0;
        
        for (const noticia of noticias) {
            const clave = `${noticia.titulo}-${noticia.fecha}`;
            if (!ultimasNoticias.has(clave)) {
                ultimasNoticias.add(clave);
                try {
                    await db.createNoticia(noticia);
                    nuevasNoticias++;
                } catch (e) {}
            }
        }
        
        if (nuevasNoticias > 0) {
            console.log(`Se guardaron ${nuevasNoticias} noticias nuevas`);
        }
    } catch (error) {
        console.error('Error monitoreando fuentes:', error.message);
    }
}

setInterval(monitorearFuentes, 60 * 1000);
monitorearFuentes();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Servidor corriendo en red local: http://0.0.0.0:${PORT}`);
    console.log(`Panel de administración: http://localhost:${PORT}/admin.html`);
    console.log('Base de datos: JSON local (PostgreSQL no disponible)');
    console.log('Recopilación automática activada cada 1 minuto');
});

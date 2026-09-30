const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'accidentes.db'));

// Crear tablas
db.exec(`
    CREATE TABLE IF NOT EXISTS noticias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        zona TEXT NOT NULL,
        tipo TEXT NOT NULL,
        fecha_accidente TEXT NOT NULL,
        fecha_generacion TEXT NOT NULL,
        fuente_nombre TEXT NOT NULL,
        fuente_url TEXT NOT NULL,
        fuente_fecha TEXT NOT NULL,
        imagen TEXT,
        estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'aprobada', 'rechazada')),
        fecha_revision TEXT,
        revisor TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS config (
        clave TEXT PRIMARY KEY,
        valor TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        accion TEXT NOT NULL,
        detalles TEXT,
        fecha TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

// Funciones de acceso a datos
const NoticiasDB = {
    // Insertar noticia pendiente
    insertar(noticia) {
        const stmt = db.prepare(`
            INSERT INTO noticias (titulo, descripcion, zona, tipo, fecha_accidente, fecha_generacion, fuente_nombre, fuente_url, fuente_fecha, imagen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            noticia.titulo,
            noticia.descripcion,
            noticia.zona,
            noticia.tipo,
            noticia.fechaAccidente,
            noticia.fechaGeneracion,
            noticia.fuenteNombre,
            noticia.fuenteUrl,
            noticia.fuenteFecha,
            noticia.imagen || null
        );
    },

    // Obtener noticias por estado
    obtenerPorEstado(estado) {
        const stmt = db.prepare('SELECT * FROM noticias WHERE estado = ? ORDER BY created_at DESC');
        return stmt.all(estado);
    },

    // Obtener todas las noticias
    obtenerTodas() {
        return db.prepare('SELECT * FROM noticias ORDER BY created_at DESC').all();
    },

    // Actualizar estado
    actualizarEstado(id, estado, revisor = 'admin') {
        const stmt = db.prepare(`
            UPDATE noticias SET estado = ?, fecha_revision = datetime('now'), revisor = ?
            WHERE id = ?
        `);
        return stmt.run(estado, revisor, id);
    },

    // Eliminar noticia
    eliminar(id) {
        return db.prepare('DELETE FROM noticias WHERE id = ?').run(id);
    },

    // Obtener estadísticas
    getEstadisticas() {
        const total = db.prepare('SELECT COUNT(*) as count FROM noticias').get().count;
        const pendientes = db.prepare("SELECT COUNT(*) as count FROM noticias WHERE estado = 'pendiente'").get().count;
        const aprobadas = db.prepare("SELECT COUNT(*) as count FROM noticias WHERE estado = 'aprobada'").get().count;
        const rechazadas = db.prepare("SELECT COUNT(*) as count FROM noticias WHERE estado = 'rechazada'").get().count;
        return { total, pendientes, aprobadas, rechazadas };
    }
};

const LogsDB = {
    registrar(accion, detalles = '') {
        const stmt = db.prepare('INSERT INTO logs (accion, detalles) VALUES (?, ?)');
        return stmt.run(accion, detalles);
    },

    obtener(limite = 50) {
        return db.prepare('SELECT * FROM logs ORDER BY fecha DESC LIMIT ?').all(limite);
    }
};

const ConfigDB = {
    obtener(clave) {
        const row = db.prepare('SELECT valor FROM config WHERE clave = ?').get(clave);
        return row ? row.valor : null;
    },

    establecer(clave, valor) {
        db.prepare(`
            INSERT INTO config (clave, valor) VALUES (?, ?)
            ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
        `).run(clave, valor);
    }
};

module.exports = { NoticiasDB, LogsDB, ConfigDB };

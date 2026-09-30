const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_Ey8B2chmpZiq@ep-damp-night-b42grn6a-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: {
        rejectUnauthorized: false
    }
});

// Inicializar tablas
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'invitado',
                nombre VARCHAR(255),
                foto TEXT,
                bio TEXT,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS noticias (
                id SERIAL PRIMARY KEY,
                titulo TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                resumen_ia TEXT,
                fuente TEXT NOT NULL,
                url_fuente TEXT,
                fecha DATE NOT NULL,
                hora TIME,
                zona TEXT NOT NULL,
                municipio TEXT NOT NULL,
                tipo TEXT NOT NULL,
                lat DECIMAL(10, 8),
                lng DECIMAL(11, 8),
                imagen TEXT,
                estado VARCHAR(50) DEFAULT 'pendiente',
                fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS comentarios (
                id SERIAL PRIMARY KEY,
                noticia_id INTEGER REFERENCES noticias(id) ON DELETE CASCADE,
                usuario_email VARCHAR(255) NOT NULL,
                texto TEXT NOT NULL,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Tablas de PostgreSQL creadas correctamente');
    } catch (error) {
        console.error('Error creando tablas:', error.message);
    }
}

// ===== USUARIOS =====

async function crearUsuario(email, password, role = 'invitado') {
    try {
        const result = await pool.query(
            'INSERT INTO usuarios (email, password, role) VALUES ($1, $2, $3) RETURNING *',
            [email, password, role]
        );
        return result.rows[0];
    } catch (error) {
        if (error.code === '23505') return null; // Duplicado
        throw error;
    }
}

async function getUsuarioByEmail(email) {
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    return result.rows[0] || null;
}

async function getUsuarioById(id) {
    const result = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function updateUsuario(email, data) {
    const campos = [];
    const valores = [];
    let i = 1;

    if (data.nombre !== undefined) { campos.push(`nombre = $${i++}`); valores.push(data.nombre); }
    if (data.foto !== undefined) { campos.push(`foto = $${i++}`); valores.push(data.foto); }
    if (data.bio !== undefined) { campos.push(`bio = $${i++}`); valores.push(data.bio); }
    if (data.role !== undefined) { campos.push(`role = $${i++}`); valores.push(data.role); }

    if (campos.length === 0) return null;

    valores.push(email);
    const result = await pool.query(
        `UPDATE usuarios SET ${campos.join(', ')} WHERE email = $${i} RETURNING *`,
        valores
    );
    return result.rows[0] || null;
}

// ===== NOTICIAS =====

async function getNoticias(filtros = {}) {
    let sql = 'SELECT * FROM noticias WHERE 1=1';
    const params = [];
    let i = 1;

    if (filtros.estado) { sql += ` AND estado = $${i++}`; params.push(filtros.estado); }
    if (filtros.zona) { sql += ` AND zona = $${i++}`; params.push(filtros.zona); }
    if (filtros.municipio) { sql += ` AND municipio = $${i++}`; params.push(filtros.municipio); }
    if (filtros.tipo) { sql += ` AND tipo = $${i++}`; params.push(filtros.tipo); }

    if (filtros.fecha) {
        const hoy = new Date();
        let fechaLimite;
        switch (filtros.fecha) {
            case 'hoy':
                fechaLimite = hoy.toISOString().split('T')[0];
                sql += ` AND fecha = $${i++}`;
                params.push(fechaLimite);
                break;
            case 'semana':
                fechaLimite = new Date(hoy - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                sql += ` AND fecha >= $${i++}`;
                params.push(fechaLimite);
                break;
            case 'mes':
                fechaLimite = new Date(hoy - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                sql += ` AND fecha >= $${i++}`;
                params.push(fechaLimite);
                break;
        }
    }

    if (filtros.busqueda) {
        sql += ` AND (titulo ILIKE $${i} OR descripcion ILIKE $${i} OR zona ILIKE $${i} OR municipio ILIKE $${i})`;
        params.push(`%${filtros.busqueda}%`);
        i++;
    }

    sql += ' ORDER BY fecha DESC, hora DESC';

    const result = await pool.query(sql, params);
    return result.rows;
}

async function getNoticiaById(id) {
    const result = await pool.query('SELECT * FROM noticias WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function createNoticia(data) {
    const result = await pool.query(
        `INSERT INTO noticias (titulo, descripcion, resumen_ia, fuente, url_fuente, fecha, hora, zona, municipio, tipo, lat, lng, imagen, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [data.titulo, data.descripcion, data.resumen_ia || null, data.fuente, data.url_fuente || null,
         data.fecha, data.hora || null, data.zona, data.municipio, data.tipo,
         data.lat || null, data.lng || null, data.imagen || null, data.estado || 'pendiente']
    );
    return result.rows[0];
}

async function updateNoticia(id, data) {
    const campos = [];
    const valores = [];
    let i = 1;

    const camposPermitidos = ['titulo', 'descripcion', 'resumen_ia', 'fuente', 'url_fuente', 'fecha', 'hora', 'zona', 'municipio', 'tipo', 'lat', 'lng', 'imagen', 'estado'];

    camposPermitidos.forEach(campo => {
        if (data[campo] !== undefined) {
            campos.push(`${campo} = $${i++}`);
            valores.push(data[campo]);
        }
    });

    if (campos.length === 0) return null;

    campos.push(`fecha_actualizacion = CURRENT_TIMESTAMP`);
    valores.push(id);

    const result = await pool.query(
        `UPDATE noticias SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
        valores
    );
    return result.rows[0] || null;
}

async function deleteNoticia(id) {
    const result = await pool.query('DELETE FROM noticias WHERE id = $1', [id]);
    return result.rowCount > 0;
}

async function aprobarNoticia(id) {
    return updateNoticia(id, { estado: 'aprobada' });
}

async function rechazarNoticia(id) {
    return updateNoticia(id, { estado: 'rechazada' });
}

async function getPendientes() {
    const result = await pool.query("SELECT * FROM noticias WHERE estado = 'pendiente' ORDER BY fecha_creacion DESC");
    return result.rows;
}

// ===== COMENTARIOS =====

async function createComentario(data) {
    const result = await pool.query(
        'INSERT INTO comentarios (noticia_id, usuario_email, texto) VALUES ($1, $2, $3) RETURNING *',
        [data.noticiaId, data.usuarioEmail, data.texto]
    );
    return result.rows[0];
}

async function getComentariosByNoticia(noticiaId) {
    const result = await pool.query(
        'SELECT c.*, u.nombre as usuario_nombre, u.foto as usuario_foto FROM comentarios c LEFT JOIN usuarios u ON c.usuario_email = u.email WHERE c.noticia_id = $1 ORDER BY c.fecha DESC',
        [noticiaId]
    );
    return result.rows;
}

async function getComentariosByUsuario(usuarioEmail) {
    const result = await pool.query(
        'SELECT c.*, n.titulo as noticia_titulo FROM comentarios c LEFT JOIN noticias n ON c.noticia_id = n.id WHERE c.usuario_email = $1 ORDER BY c.fecha DESC',
        [usuarioEmail]
    );
    return result.rows;
}

async function getComentarioById(id) {
    const result = await pool.query('SELECT * FROM comentarios WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function updateComentario(id, data) {
    const result = await pool.query(
        'UPDATE comentarios SET texto = $1 WHERE id = $2 RETURNING *',
        [data.texto, id]
    );
    return result.rows[0] || null;
}

async function deleteComentario(id) {
    const result = await pool.query('DELETE FROM comentarios WHERE id = $1', [id]);
    return result.rowCount > 0;
}

async function getAllComentarios() {
    const result = await pool.query(
        'SELECT c.*, u.nombre as usuario_nombre, u.foto as usuario_foto FROM comentarios c LEFT JOIN usuarios u ON c.usuario_email = u.email ORDER BY c.fecha DESC'
    );
    return result.rows;
}

// ===== ESTADÍSTICAS =====

async function getStats() {
    const total = await pool.query('SELECT COUNT(*) FROM noticias');
    const pendientes = await pool.query("SELECT COUNT(*) FROM noticias WHERE estado = 'pendiente'");
    const aprobadas = await pool.query("SELECT COUNT(*) FROM noticias WHERE estado = 'aprobada'");
    const rechazadas = await pool.query("SELECT COUNT(*) FROM noticias WHERE estado = 'rechazada'");

    const porZona = await pool.query('SELECT zona, COUNT(*) as count FROM noticias GROUP BY zona ORDER BY count DESC');
    const porTipo = await pool.query('SELECT tipo, COUNT(*) as count FROM noticias GROUP BY tipo ORDER BY count DESC');
    const porMunicipio = await pool.query('SELECT municipio, COUNT(*) as count FROM noticias GROUP BY municipio ORDER BY count DESC');

    return {
        total: parseInt(total.rows[0].count),
        pendientes: parseInt(pendientes.rows[0].count),
        aprobadas: parseInt(aprobadas.rows[0].count),
        rechazadas: parseInt(rechazadas.rows[0].count),
        porZona: porZona.rows,
        porTipo: porTipo.rows,
        porMunicipio: porMunicipio.rows
    };
}

module.exports = {
    initDB,
    crearUsuario,
    getUsuarioByEmail,
    getUsuarioById,
    updateUsuario,
    getNoticias,
    getNoticiaById,
    createNoticia,
    updateNoticia,
    deleteNoticia,
    aprobarNoticia,
    rechazarNoticia,
    getPendientes,
    createComentario,
    getComentariosByNoticia,
    getComentariosByUsuario,
    getComentarioById,
    updateComentario,
    deleteComentario,
    getAllComentarios,
    getStats
};

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'accidentes.json');

// Inicializar la base de datos si no existe
function initDB() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ 
            noticias: [], 
            usuarios: {},
            comentarios: [],
            nextId: 1,
            nextUserId: 1,
            nextComentarioId: 1
        }, null, 2));
    }
}

// Leer la base de datos
function readDB() {
    initDB();
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
}

// Guardar la base de datos
function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ===== FUNCIONES DE USUARIOS =====

function crearUsuario(email, password, role = 'invitado') {
    const db = readDB();
    
    if (db.usuarios[email]) {
        return null;
    }

    const id = db.nextUserId++;
    const usuario = {
        id,
        email,
        password, // En producción: hashear con bcrypt
        role,
        nombre: email.split('@')[0],
        foto: null,
        bio: '',
        fechaRegistro: new Date().toISOString()
    };

    db.usuarios[email] = usuario;
    writeDB(db);

    return usuario;
}

function getUsuarioByEmail(email) {
    const db = readDB();
    return db.usuarios[email] || null;
}

function getUsuarioById(id) {
    const db = readDB();
    return Object.values(db.usuarios).find(u => u.id === parseInt(id)) || null;
}

function updateUsuario(email, data) {
    const db = readDB();
    
    if (!db.usuarios[email]) {
        return null;
    }

    const camposPermitidos = ['nombre', 'foto', 'bio', 'role'];

    camposPermitidos.forEach(campo => {
        if (data[campo] !== undefined) {
            db.usuarios[email][campo] = data[campo];
        }
    });

    writeDB(db);
    return db.usuarios[email];
}

function deleteUsuario(email) {
    const db = readDB();
    
    if (!db.usuarios[email]) {
        return false;
    }

    delete db.usuarios[email];
    writeDB(db);
    return true;
}

// ===== FUNCIONES DE NOTICIAS =====

function getNoticias(filtros = {}) {
    const db = readDB();
    let noticias = db.noticias;

    if (filtros.estado) {
        noticias = noticias.filter(n => n.estado === filtros.estado);
    }

    if (filtros.zona) {
        noticias = noticias.filter(n => n.zona === filtros.zona);
    }

    if (filtros.municipio) {
        noticias = noticias.filter(n => n.municipio === filtros.municipio);
    }

    if (filtros.tipo) {
        noticias = noticias.filter(n => n.tipo === filtros.tipo);
    }

    if (filtros.fecha) {
        const hoy = new Date();
        let fechaLimite;

        switch (filtros.fecha) {
            case 'hoy':
                fechaLimite = hoy.toISOString().split('T')[0];
                noticias = noticias.filter(n => n.fecha === fechaLimite);
                break;
            case 'semana':
                fechaLimite = new Date(hoy - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                noticias = noticias.filter(n => n.fecha >= fechaLimite);
                break;
            case 'mes':
                fechaLimite = new Date(hoy - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                noticias = noticias.filter(n => n.fecha >= fechaLimite);
                break;
        }
    }

    if (filtros.busqueda) {
        const termino = filtros.busqueda.toLowerCase();
        noticias = noticias.filter(n => {
            const texto = `${n.titulo} ${n.descripcion} ${n.zona} ${n.municipio}`.toLowerCase();
            return texto.includes(termino);
        });
    }

    noticias.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return noticias;
}

function getNoticiaById(id) {
    const db = readDB();
    return db.noticias.find(n => n.id === parseInt(id)) || null;
}

function createNoticia(data) {
    const db = readDB();
    const id = db.nextId++;

    const noticia = {
        id,
        titulo: data.titulo,
        descripcion: data.descripcion,
        resumen_ia: data.resumen_ia || null,
        fuente: data.fuente,
        url_fuente: data.url_fuente || null,
        fecha: data.fecha,
        hora: data.hora || null,
        zona: data.zona,
        municipio: data.municipio,
        tipo: data.tipo,
        lat: data.lat || null,
        lng: data.lng || null,
        imagen: data.imagen || null,
        estado: data.estado || 'pendiente',
        fecha_creacion: new Date().toISOString(),
        fecha_actualizacion: new Date().toISOString()
    };

    db.noticias.push(noticia);
    writeDB(db);

    return noticia;
}

function updateNoticia(id, data) {
    const db = readDB();
    const index = db.noticias.findIndex(n => n.id === parseInt(id));

    if (index === -1) return null;

    const camposPermitidos = ['titulo', 'descripcion', 'resumen_ia', 'fuente', 'url_fuente', 'fecha', 'hora', 'zona', 'municipio', 'tipo', 'lat', 'lng', 'imagen', 'estado'];

    camposPermitidos.forEach(campo => {
        if (data[campo] !== undefined) {
            db.noticias[index][campo] = data[campo];
        }
    });

    db.noticias[index].fecha_actualizacion = new Date().toISOString();
    writeDB(db);

    return db.noticias[index];
}

function deleteNoticia(id) {
    const db = readDB();
    const index = db.noticias.findIndex(n => n.id === parseInt(id));

    if (index === -1) return false;

    db.noticias.splice(index, 1);
    writeDB(db);
    return true;
}

function aprobarNoticia(id) {
    return updateNoticia(id, { estado: 'aprobada' });
}

function rechazarNoticia(id) {
    return updateNoticia(id, { estado: 'rechazada' });
}

function getPendientes() {
    const db = readDB();
    return db.noticias
        .filter(n => n.estado === 'pendiente')
        .sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
}

// ===== FUNCIONES DE COMENTARIOS =====

function createComentario(data) {
    const db = readDB();
    const id = db.nextComentarioId++;

    const comentario = {
        id,
        noticiaId: parseInt(data.noticiaId),
        usuarioEmail: data.usuarioEmail,
        texto: data.texto,
        fecha: new Date().toISOString()
    };

    db.comentarios.push(comentario);
    writeDB(db);

    return comentario;
}

function getComentariosByNoticia(noticiaId) {
    const db = readDB();
    return db.comentarios
        .filter(c => c.noticiaId === parseInt(noticiaId))
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

function getComentariosByUsuario(usuarioEmail) {
    const db = readDB();
    return db.comentarios
        .filter(c => c.usuarioEmail === usuarioEmail)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

function getComentarioById(id) {
    const db = readDB();
    return db.comentarios.find(c => c.id === parseInt(id)) || null;
}

function updateComentario(id, data) {
    const db = readDB();
    const index = db.comentarios.findIndex(c => c.id === parseInt(id));

    if (index === -1) return null;

    if (data.texto !== undefined) {
        db.comentarios[index].texto = data.texto;
    }

    writeDB(db);
    return db.comentarios[index];
}

function deleteComentario(id) {
    const db = readDB();
    const index = db.comentarios.findIndex(c => c.id === parseInt(id));

    if (index === -1) return false;

    db.comentarios.splice(index, 1);
    writeDB(db);
    return true;
}

function getAllComentarios() {
    const db = readDB();
    return db.comentarios.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

// ===== ESTADÍSTICAS =====

function getStats() {
    const db = readDB();
    const noticias = db.noticias;

    const total = noticias.length;
    const pendientes = noticias.filter(n => n.estado === 'pendiente').length;
    const aprobadas = noticias.filter(n => n.estado === 'aprobada').length;
    const rechazadas = noticias.filter(n => n.estado === 'rechazada').length;

    const porZona = {};
    const porTipo = {};
    const porMunicipio = {};

    noticias.forEach(n => {
        porZona[n.zona] = (porZona[n.zona] || 0) + 1;
        porTipo[n.tipo] = (porTipo[n.tipo] || 0) + 1;
        porMunicipio[n.municipio] = (porMunicipio[n.municipio] || 0) + 1;
    });

    return {
        total,
        pendientes,
        aprobadas,
        rechazadas,
        porZona: Object.entries(porZona).map(([zona, count]) => ({ zona, count })).sort((a, b) => b.count - a.count),
        porTipo: Object.entries(porTipo).map(([tipo, count]) => ({ tipo, count })).sort((a, b) => b.count - a.count),
        porMunicipio: Object.entries(porMunicipio).map(([municipio, count]) => ({ municipio, count })).sort((a, b) => b.count - a.count)
    };
}

module.exports = {
    // Usuarios
    crearUsuario,
    getUsuarioByEmail,
    getUsuarioById,
    updateUsuario,
    deleteUsuario,
    // Noticias
    getNoticias,
    getNoticiaById,
    createNoticia,
    updateNoticia,
    deleteNoticia,
    aprobarNoticia,
    rechazarNoticia,
    getPendientes,
    // Comentarios
    createComentario,
    getComentariosByNoticia,
    getComentariosByUsuario,
    getComentarioById,
    updateComentario,
    deleteComentario,
    getAllComentarios,
    // Stats
    getStats
};

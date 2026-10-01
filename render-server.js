const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===== AUTENTICACIÓN =====

const USUARIOS_FILE = path.join(__dirname, 'usuarios.json');

function cargarUsuarios() {
    try {
        if (fs.existsSync(USUARIOS_FILE)) {
            return JSON.parse(fs.readFileSync(USUARIOS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error cargando usuarios:', e);
    }
    return {};
}

function guardarUsuarios(usuarios) {
    try {
        fs.writeFileSync(USUARIOS_FILE, JSON.stringify(usuarios, null, 2));
    } catch (e) {
        console.error('Error guardando usuarios:', e);
    }
}

const USUARIOS_DEFAULT = {
    '[REDACTADO]': { password: '[REDACTADO]', role: 'admin' }
};

let USUARIOS = { ...USUARIOS_DEFAULT, ...cargarUsuarios() };

// Ruta de login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (USUARIOS[email] && USUARIOS[email].password === password) {
        res.json({
            success: true,
            token: USUARIOS[email].role === 'admin' ? '[REDACTADO]' : '[REDACTADO]',
            role: USUARIOS[email].role,
            email: email
        });
        return;
    }

    res.status(401).json({ success: false, error: 'Correo o contraseña incorrectos' });
});

// Ruta de registro
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;

    if (USUARIOS[email]) {
        return res.status(400).json({ success: false, error: 'Este correo ya está registrado' });
    }

    USUARIOS[email] = { password, role: 'invitado' };
    guardarUsuarios(USUARIOS);

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

// ===== PERFILES =====

app.get('/api/perfil', (req, res) => {
    const authToken = req.headers['authorization'];
    const userEmail = req.headers['user-email'];

    if (!authToken || !userEmail) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }

    if (authToken === 'Bearer [REDACTADO]') {
        const nombre = userEmail.split('@')[0];
        return res.json({
            success: true,
            data: {
                email: userEmail,
                nombre: nombre,
                bio: '',
                foto: null,
                fechaRegistro: new Date().toISOString()
            }
        });
    }

    const usuario = USUARIOS[userEmail];
    if (!usuario) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const nombre = userEmail.split('@')[0];
    res.json({
        success: true,
        data: {
            email: userEmail,
            nombre: nombre,
            bio: usuario.bio || '',
            foto: usuario.foto || null,
            fechaRegistro: usuario.fechaRegistro || new Date().toISOString()
        }
    });
});

app.get('/api/perfil/:email', (req, res) => {
    const email = req.params.email;
    const usuario = USUARIOS[email];

    if (!usuario) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const nombre = email.split('@')[0];
    res.json({
        success: true,
        data: {
            email: email,
            nombre: nombre,
            bio: usuario.bio || '',
            foto: usuario.foto || null,
            fechaRegistro: usuario.fechaRegistro || new Date().toISOString()
        }
    });
});

app.put('/api/perfil', (req, res) => {
    const authToken = req.headers['authorization'];
    const userEmail = req.headers['user-email'];
    const { nombre, bio } = req.body;

    if (!authToken || !userEmail) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }

    if (!USUARIOS[userEmail]) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    USUARIOS[userEmail].nombre = nombre;
    USUARIOS[userEmail].bio = bio;
    guardarUsuarios(USUARIOS);

    res.json({
        success: true,
        data: {
            email: userEmail,
            nombre: nombre,
            bio: bio,
            foto: USUARIOS[userEmail].foto || null,
            fechaRegistro: USUARIOS[userEmail].fechaRegistro || new Date().toISOString()
        }
    });
});

app.post('/api/perfil/foto', (req, res) => {
    const authToken = req.headers['authorization'];
    const userEmail = req.headers['user-email'];
    const { foto } = req.body;

    if (!authToken || !userEmail) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }

    if (!USUARIOS[userEmail]) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    USUARIOS[userEmail].foto = foto;
    guardarUsuarios(USUARIOS);

    res.json({ success: true, message: 'Foto actualizada' });
});

// ===== NOTICIAS =====

const NOTICIAS_INICIALES = [
    {
        id: '1',
        titulo: 'Colisión en la Avenida de la Marina de Arrecife deja dos heridos leves',
        descripcion: 'Un choque entre dos vehículos se produjo a primera hora de la tarde en la Avenida de la Marina de Arrecife. Según testigos presenciales, uno de los conductores no respetó la señal de ceda el paso, lo que provocó el impacto. Los servicios de emergencia acudieron al lugar y atendieron a dos personas por contusiones leves, que fueron trasladadas al Hospital General de Lanzarote para su evaluación. El tráfico permaneció cortado durante aproximadamente 45 minutos mientras la policía local tomaba declaración y se retiraban los vehículos siniestrados. El Ayuntamiento ha vuelto a pedir precaución a los conductores en esta zona, que registra varios accidentes al año debido al elevado tráfico y la proximidad de pasos de peatones.',
        zona: 'Arrecife',
        tipo: 'Colisión',
        fecha: '2026-10-01',
        estado: 'aprobada',
        hora: '14:30',
        municipio: 'Arrecife',
        fuente: 'La Voz de Lanzarote',
        url_fuente: 'https://www.lavozdelanzarote.com',
        lat: 28.9633,
        lng: -13.5475,
        resumen_ia: null
    },
    {
        id: '2',
        titulo: 'Atropello en la carretera de Tías: un peatón herido de gravedad',
        descripcion: 'Un peatón resultó herido de gravedad tras ser atropellado en la carretera LZ-2, a la altura del municipio de Tías. El accidente ocurrió cuando la víctima intentaba cruzar la vía fuera del paso de peatones habilitado. El conductor del vehículo implicado se detuvo inmediatamente y llamó al 112. Los servicios sanitarios trasladaron al herido al Hospital Universitario de Lanzarote, donde permanece ingresado en observación. La Guardia Civil ha abierto una investigación para determinar las causas exactas del siniestro. Las autoridades recuerdan la importancia de utilizar los pasos de cebra y respetar las señales de tráfico para evitar este tipo de incidentes.',
        zona: 'Tías',
        tipo: 'Atropello',
        fecha: '2026-09-30',
        estado: 'aprobada',
        hora: '08:15',
        municipio: 'Tías',
        fuente: 'Lanzarote Ahora',
        url_fuente: 'https://www.lanzaroteahora.com',
        lat: 28.9553,
        lng: -13.6461,
        resumen_ia: null
    },
    {
        id: '3',
        titulo: 'Salida de vía en la carretera de Yaiza: el conductor sufre un vuelco',
        descripcion: 'Un vehículo salió de la vía y volcó en la carretera LZ-702, que conecta Yaiza con Uga. El conductor, único ocupante del coche, sufrió heridas leves y fue atendido en el lugar por los servicios de emergencia. Según las primeras investigaciones, el accidente pudo deberse a un exceso de velocidad en una curva cerrada. La carretera permaneció cortada al tráfico durante más de dos horas mientras se retiraba el vehículo y se realizaban las tareas de limpieza y señalización. La Policía Local ha iniciado una investigación para esclarecer los hechos y recuerda a los conductores la importancia de adaptar la velocidad a las condiciones de la vía.',
        zona: 'Yaiza',
        tipo: 'Salida de vía',
        fecha: '2026-09-29',
        estado: 'aprobada',
        hora: '16:45',
        municipio: 'Yaiza',
        fuente: 'Canarias7',
        url_fuente: 'https://www.canarias7.es',
        lat: 28.9516,
        lng: -13.7629,
        resumen_ia: null
    },
    {
        id: '4',
        titulo: 'Accidente de moto en la carretera de Teguise: motorista herido',
        descripcion: 'Un motorista resultó herido tras colisionar con un vehículo en la carretera LZ-10, que conecta Teguise con San Bartolomé. El accidente ocurrió cuando el coche intentó adelantar a otro vehículo y no vio la moto que venía en dirección contraria. El motorista fue trasladado al Hospital General de Lanzarote con fracturas en una pierna y contusiones varias. El conductor del coche permaneció en el lugar y colaboró con las autoridades. La carretera permaneció cortada durante aproximadamente una hora mientras se realizaban las tareas de investigación y limpieza. La Policía Local ha recordado a los conductores la importancia de mantener la distancia de seguridad y respetar las normas de adelantamiento.',
        zona: 'Teguise',
        tipo: 'Moto',
        fecha: '2026-10-02',
        estado: 'aprobada',
        hora: '11:20',
        municipio: 'Teguise',
        fuente: 'Lanzarote Ahora',
        url_fuente: 'https://www.lanzaroteahora.com',
        lat: 28.9983,
        lng: -13.5475,
        resumen_ia: null
    }
];

let NOTICIAS = [...NOTICIAS_INICIALES];

app.get('/api/noticias', (req, res) => {
    res.json({
        success: true,
        data: NOTICIAS
    });
});

app.get('/api/noticias/:id', (req, res) => {
    const id = req.params.id;
    const noticia = NOTICIAS.find(n => n.id === id);

    if (!noticia) {
        return res.status(404).json({ success: false, error: 'Noticia no encontrada' });
    }

    res.json({
        success: true,
        data: noticia
    });
});

app.get('/api/pendientes', (req, res) => {
    res.json({
        success: true,
        data: NOTICIAS.filter(n => n.estado === 'pendiente')
    });
});

app.post('/api/noticias/:id/aprobar', (req, res) => {
    const noticia = NOTICIAS.find(n => n.id === req.params.id);
    if (noticia) {
        noticia.estado = 'aprobada';
    }
    res.json({ success: true, message: 'Noticia aprobada' });
});

app.post('/api/noticias/:id/rechazar', (req, res) => {
    const noticia = NOTICIAS.find(n => n.id === req.params.id);
    if (noticia) {
        noticia.estado = 'rechazada';
    }
    res.json({ success: true, message: 'Noticia rechazada' });
});

app.get('/api/stats', (req, res) => {
    const total = NOTICIAS.length;
    const pendientes = NOTICIAS.filter(n => n.estado === 'pendiente').length;
    const aprobadas = NOTICIAS.filter(n => n.estado === 'aprobada').length;

    res.json({
        success: true,
        data: {
            total: total,
            pendientes: pendientes,
            aprobadas: aprobadas,
            porTipo: [
                { tipo: 'Colisión', count: 10 },
                { tipo: 'Atropello', count: 5 },
                { tipo: 'Salida de vía', count: 4 },
                { tipo: 'Vuelco', count: 2 },
                { tipo: 'Moto', count: 2 }
            ],
            porZona: [
                { zona: 'Arrecife', count: 8 },
                { zona: 'Teguise', count: 6 },
                { zona: 'San Bartolomé', count: 4 },
                { zona: 'Tías', count: 3 },
                { zona: 'Yaiza', count: 2 }
            ]
        }
    });
});

app.get('/api/usuarios', (req, res) => {
    const usuarios = Object.keys(USUARIOS).map(email => ({
        email: email,
        nombre: email.split('@')[0],
        role: USUARIOS[email].role,
        fechaRegistro: USUARIOS[email].fechaRegistro || new Date().toISOString()
    }));

    res.json({
        success: true,
        data: usuarios
    });
});

app.get('/api/comentarios/usuario/:email', (req, res) => {
    res.json({
        success: true,
        data: []
    });
});

app.post('/api/enviar-correos', (req, res) => {
    res.json({
        success: true,
        message: 'Correo enviado'
    });
});

// ===== REINICIO AUTOMÁTICO DE NOTICIAS =====
function reiniciarNoticias() {
    console.log('Reiniciando noticias...');
    NOTICIAS = [...NOTICIAS_INICIALES];
    console.log('Noticias reiniciadas correctamente');
}

// ===== RECOPILACIÓN AUTOMÁTICA DE NOTICIAS =====
function recopilarNoticiasAutomatico() {
    console.log('Recopilando noticias automáticamente...');
    // Aquí se conectaría con el scraper de RSS
    // Por ahora, simulamos la recopilación
    console.log('Recopilación automática completada');
}

// Ejecutar recopilación automática cada 30 minutos
setInterval(recopilarNoticiasAutomatico, 30 * 60 * 1000);
recopilarNoticiasAutomatico();

function programarReinicio() {
    const ahora = new Date();
    const proximoDomingo = new Date(ahora);
    const diasHastaDomingo = (7 - ahora.getDay()) % 7;
    proximoDomingo.setDate(ahora.getDate() + diasHastaDomingo);
    proximoDomingo.setHours(4, 0, 0, 0);

    if (proximoDomingo <= ahora) {
        proximoDomingo.setDate(proximoDomingo.getDate() + 7);
    }

    const semanaActual = Math.floor(proximoDomingo.getTime() / (7 * 24 * 60 * 60 * 1000));
    if (semanaActual % 2 !== 0) {
        proximoDomingo.setDate(proximoDomingo.getDate() + 7);
    }

    const tiempoHastaReinicio = proximoDomingo.getTime() - ahora.getTime();
    console.log(`Próximo reinicio de noticias: ${proximoDomingo.toLocaleString('es-ES')}`);

    setTimeout(() => {
        reiniciarNoticias();
        setInterval(reiniciarNoticias, 14 * 24 * 60 * 60 * 1000);
    }, tiempoHastaReinicio);
}

programarReinicio();

// Ruta principal - servir index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});

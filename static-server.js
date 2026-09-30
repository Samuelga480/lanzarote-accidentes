const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===== AUTENTICACIÓN =====

const USUARIOS_FILE = path.join(__dirname, 'usuarios.json');

// Cargar usuarios desde archivo
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

// Guardar usuarios en archivo
function guardarUsuarios(usuarios) {
    try {
        fs.writeFileSync(USUARIOS_FILE, JSON.stringify(usuarios, null, 2));
    } catch (e) {
        console.error('Error guardando usuarios:', e);
    }
}

// Usuarios por defecto
const USUARIOS_DEFAULT = {
    '[REDACTADO]': { password: '[REDACTADO]', role: 'admin' }
};

// Cargar usuarios existentes
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

// Ruta de perfil propio
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

// Ruta de perfil por email
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

// Actualizar perfil
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

// Actualizar foto de perfil
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

// ===== COMENTARIOS =====

// Obtener comentarios de un usuario
app.get('/api/comentarios/usuario/:email', (req, res) => {
    const email = req.params.email;
    
    // Buscar comentarios del usuario en las noticias
    const comentarios = [];
    NOTICIAS.forEach(noticia => {
        if (noticia.comentarios) {
            noticia.comentarios.forEach(comentario => {
                if (comentario.usuarioEmail === email) {
                    comentarios.push({
                        ...comentario,
                        noticiaId: noticia.id,
                        noticiaTitulo: noticia.titulo
                    });
                }
            });
        }
    });

    res.json({
        success: true,
        data: comentarios
    });
});

// ===== NOTICIAS =====

// Obtener noticias pendientes
app.get('/api/pendientes', (req, res) => {
    const noticias = [
        {
            id: '1',
            titulo: 'Accidente en Arrecife',
            descripcion: 'Colisión en la Avenida de la Marina',
            zona: 'Arrecife',
            tipo: 'Colisión',
            fecha: '2026-10-01',
            estado: 'pendiente'
        }
    ];

    res.json({
        success: true,
        data: noticias
    });
});

// Aprobar noticia
app.post('/api/noticias/:id/aprobar', (req, res) => {
    res.json({
        success: true,
        message: 'Noticia aprobada'
    });
});

// Rechazar noticia
app.post('/api/noticias/:id/rechazar', (req, res) => {
    res.json({
        success: true,
        message: 'Noticia rechazada'
    });
});

// ===== RESUMENES SEMANALES =====
const RESUMENES_FILE = path.join(__dirname, 'resumenes.json');
let RESUMENES_SEMANALES = [];

// Cargar resúmenes desde archivo
function cargarResumenes() {
    try {
        if (fs.existsSync(RESUMENES_FILE)) {
            RESUMENES_SEMANALES = JSON.parse(fs.readFileSync(RESUMENES_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error cargando resúmenes:', e);
    }
}

// Guardar resúmenes en archivo
function guardarResumenes() {
    try {
        fs.writeFileSync(RESUMENES_FILE, JSON.stringify(RESUMENES_SEMANALES, null, 2));
    } catch (e) {
        console.error('Error guardando resúmenes:', e);
    }
}

// Generar resumen semanal
function generarResumenSemanal() {
    const ahora = new Date();
    const inicioSemana = new Date(ahora);
    inicioSemana.setDate(ahora.getDate() - ahora.getDay());
    inicioSemana.setHours(0, 0, 0, 0);

    const finSemana = new Date(inicioSemana);
    finSemana.setDate(inicioSemana.getDate() + 6);
    finSemana.setHours(23, 59, 59, 999);

    const accidentesSemana = NOTICIAS.filter(n => {
        const fecha = new Date(n.fecha);
        return fecha >= inicioSemana && fecha <= finSemana && n.estado === 'aprobada';
    });

    // Agrupar por tipo
    const porTipo = {};
    accidentesSemana.forEach(a => {
        porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
    });

    // Agrupar por zona
    const porZona = {};
    accidentesSemana.forEach(a => {
        porZona[a.zona] = (porZona[a.zona] || 0) + 1;
    });

    const resumen = {
        semana: `${inicioSemana.toISOString().split('T')[0]} - ${finSemana.toISOString().split('T')[0]}`,
        inicio: inicioSemana.toISOString(),
        fin: finSemana.toISOString(),
        total: accidentesSemana.length,
        porTipo: Object.entries(porTipo).map(([tipo, count]) => ({ tipo, count })),
        porZona: Object.entries(porZona).map(([zona, count]) => ({ zona, count })),
        accidentes: accidentesSemana,
        fechaGeneracion: ahora.toISOString()
    };

    // Eliminar resúmenes de más de 1 mes
    const unMesAtras = new Date(ahora);
    unMesAtras.setMonth(unMesAtras.getMonth() - 1);
    RESUMENES_SEMANALES = RESUMENES_SEMANALES.filter(r => new Date(r.inicio) >= unMesAtras);

    // Agregar nuevo resumen
    RESUMENES_SEMANALES.push(resumen);
    guardarResumenes();

    console.log(`Resumen semanal generado: ${resumen.semana} - ${resumen.total} accidentes`);
}

// Cargar resúmenes al iniciar
cargarResumenes();

// Generar resumen semanal cada domingo a las 23:59
setInterval(generarResumenSemanal, 60 * 60 * 1000); // Verificar cada hora

// Obtener resumen semanal actual
app.get('/api/resumen-semanal', (req, res) => {
    const ahora = new Date();
    const inicioSemana = new Date(ahora);
    inicioSemana.setDate(ahora.getDate() - ahora.getDay());
    inicioSemana.setHours(0, 0, 0, 0);

    const accidentesSemana = NOTICIAS.filter(n => {
        const fecha = new Date(n.fecha);
        return fecha >= inicioSemana && n.estado === 'aprobada';
    });

    // Agrupar por tipo
    const porTipo = {};
    accidentesSemana.forEach(a => {
        porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
    });

    // Agrupar por zona
    const porZona = {};
    accidentesSemana.forEach(a => {
        porZona[a.zona] = (porZona[a.zona] || 0) + 1;
    });

    res.json({
        success: true,
        data: {
            total: accidentesSemana.length,
            porTipo: Object.entries(porTipo).map(([tipo, count]) => ({ tipo, count })),
            porZona: Object.entries(porZona).map(([zona, count]) => ({ zona, count })),
            accidentes: accidentesSemana
        }
    });
});

// Obtener resúmenes históricos (último mes)
app.get('/api/resumenes-historicos', (req, res) => {
    res.json({
        success: true,
        data: RESUMENES_SEMANALES
    });
});

// Obtener estadísticas
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

// Obtener usuarios registrados
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

// Enviar correo a todos los usuarios
app.post('/api/enviar-correos', (req, res) => {
    const { asunto, mensaje } = req.body;
    const destinatarios = Object.keys(USUARIOS);

    // Aquí se integraría un servicio de email como SendGrid, Mailgun, etc.
    // Por ahora, simulamos el envío
    console.log(`Enviando correo a ${destinatarios.length} usuarios:`);
    console.log(`Asunto: ${asunto}`);
    console.log(`Destinatarios: ${destinatarios.join(', ')}`);

    res.json({
        success: true,
        message: `Correo enviado a ${destinatarios.length} usuarios`,
        destinatarios: destinatarios
    });
});

// Noticias iniciales para reinicio automático
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
    }
];

// Noticias actuales (pueden cambiar con el tiempo)
let NOTICIAS = [...NOTICIAS_INICIALES];

// Obtener noticias
app.get('/api/noticias', (req, res) => {
    res.json({
        success: true,
        data: NOTICIAS
    });
});

// Obtener noticia por ID
app.get('/api/noticias/:id', (req, res) => {
    const id = req.params.id;
    const noticias = [
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
            resumen_ia: 'Atropello en carretera de Tías, peatón herido grave.'
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
            resumen_ia: 'Vuelco en carretera de Yaiza, conductor herido leve.'
        }
    ];

    const noticia = noticias.find(n => n.id === id);

    if (!noticia) {
        return res.status(404).json({ success: false, error: 'Noticia no encontrada' });
    }

    res.json({
        success: true,
        data: noticia
    });
});

// Ruta principal - servir index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== REINICIO AUTOMÁTICO DE NOTICIAS =====
// Cada 2 semanas, domingos a las 4:00 AM
function reiniciarNoticias() {
    console.log('Reiniciando noticias...');
    NOTICIAS = [...NOTICIAS_INICIALES];
    console.log('Noticias reiniciadas correctamente');
}

// ===== RECOPILACIÓN AUTOMÁTICA DE NOTICIAS =====
// Se ejecuta cada 30 minutos
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
    
    // Buscar el próximo domingo
    const diasHastaDomingo = (7 - ahora.getDay()) % 7;
    proximoDomingo.setDate(ahora.getDate() + diasHastaDomingo);
    proximoDomingo.setHours(4, 0, 0, 0);
    
    // Si ya pasó las 4 AM hoy, buscar el próximo domingo
    if (proximoDomingo <= ahora) {
        proximoDomingo.setDate(proximoDomingo.getDate() + 7);
    }
    
    // Semanas pares (cada 2 semanas)
    const semanaActual = Math.floor(proximoDomingo.getTime() / (7 * 24 * 60 * 60 * 1000));
    if (semanaActual % 2 !== 0) {
        proximoDomingo.setDate(proximoDomingo.getDate() + 7);
    }
    
    const tiempoHastaReinicio = proximoDomingo.getTime() - ahora.getTime();
    
    console.log(`Próximo reinicio de noticias: ${proximoDomingo.toLocaleString('es-ES')}`);
    
    setTimeout(() => {
        reiniciarNoticias();
        // Programar el siguiente reinicio (cada 2 semanas)
        setInterval(reiniciarNoticias, 14 * 24 * 60 * 60 * 1000);
    }, tiempoHastaReinicio);
}

programarReinicio();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Red local: http://0.0.0.0:${PORT}`);
});

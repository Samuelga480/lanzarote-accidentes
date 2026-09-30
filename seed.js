// Script para poblar la base de datos con datos de ejemplo
const { createNoticia } = require('./database');

const noticiasEjemplo = [
    {
        titulo: 'Colisión frontal en la Avenida de las Naciones de Arrecife',
        descripcion: 'Dos vehículos colisionan frontalmente en la avenida principal de Arrecife. Corte total de la circulación durante dos horas. Los conductores sufren heridas leves.',
        fuente: 'La Voz de Lanzarote',
        url_fuente: 'https://www.lavozdelanzarote.com',
        fecha: '2026-09-28',
        hora: '14:30',
        zona: 'Arrecife',
        municipio: 'Arrecife',
        tipo: 'Colisión',
        lat: 28.9635,
        lng: -13.5477,
        estado: 'aprobada'
    },
    {
        titulo: 'Accidente de moto en la carretera LZ-10',
        descripcion: 'Un motorista sufre una caída en la curva de la carretera LZ-10. Traslado al Hospital General con fractura de pierna. La circulación se restablece una hora después.',
        fuente: 'Lanzarote Ahora',
        url_fuente: 'https://www.lanzaroteahora.es',
        fecha: '2026-09-25',
        hora: '09:15',
        zona: 'Teguise',
        municipio: 'Teguise',
        tipo: 'Moto',
        lat: 29.0600,
        lng: -13.5600,
        estado: 'aprobada'
    },
    {
        titulo: 'Salida de vía en la carretera LZ-20',
        descripcion: 'Un turismo sale de la vía en la carretera LZ-20 tras un reventón. El conductor resulta ileso pero el vehículo queda muy dañado. La grúa tarda 45 minutos en llegar.',
        fuente: 'Canarias7',
        url_fuente: 'https://www.canarias7.es',
        fecha: '2026-09-22',
        hora: '16:45',
        zona: 'San Bartolomé',
        municipio: 'San Bartolomé',
        tipo: 'Salida de vía',
        lat: 28.9500,
        lng: -13.5500,
        estado: 'aprobada'
    },
    {
        titulo: 'Colisión en rotonda de Puerto del Carmen',
        descripcion: 'Colisión entre un coche y una furgoneta en la rotonda de Puerto del Carmen. Retenciones de 30 minutos en la zona. Ambos conductores sufren heridas leves.',
        fuente: 'La Voz de Lanzarote',
        url_fuente: 'https://www.lavozdelanzarote.com',
        fecha: '2026-09-18',
        hora: '11:20',
        zona: 'Tías',
        municipio: 'Tías',
        tipo: 'Colisión',
        lat: 28.9200,
        lng: -13.6500,
        estado: 'aprobada'
    },
    {
        titulo: 'Atropello en Playa Blanca',
        descripcion: 'Un peatón es atropellado al cruzar la avenida de Playa Blanca. La víctima es trasladada al hospital con heridas leves. Se investiga las causas del accidente.',
        fuente: 'Lanzarote Ahora',
        url_fuente: 'https://www.lanzaroteahora.es',
        fecha: '2026-09-15',
        hora: '19:00',
        zona: 'Yaiza',
        municipio: 'Yaiza',
        tipo: 'Atropello',
        lat: 28.8600,
        lng: -13.8300,
        estado: 'aprobada'
    },
    {
        titulo: 'Vuelco en la carretera LZ-404',
        descripcion: 'Un vehículo vuelca en la carretera LZ-404 cerca de Mancha Blanca. El conductor resulta herido de gravedad y es trasladado en helicóptero al hospital.',
        fuente: 'Canarias7',
        url_fuente: 'https://www.canarias7.es',
        fecha: '2026-09-12',
        hora: '08:30',
        zona: 'Tinajo',
        municipio: 'Tinajo',
        tipo: 'Vuelco',
        lat: 29.0500,
        lng: -13.7000,
        estado: 'aprobada'
    },
    {
        titulo: 'Colisión en la carretera LZ-101',
        descripcion: 'Dos coches colisionen en la carretera LZ-101. Ambos conductores sufren heridas leves y son atendidos en el lugar. La circulación se corta durante 45 minutos.',
        fuente: 'La Voz de Lanzarote',
        url_fuente: 'https://www.lavozdelanzarote.com',
        fecha: '2026-09-08',
        hora: '13:10',
        zona: 'Haría',
        municipio: 'Haría',
        tipo: 'Colisión',
        lat: 29.1500,
        lng: -13.5000,
        estado: 'aprobada'
    },
    {
        titulo: 'Accidente de moto en el Charco de San Ginés',
        descripcion: 'Un motorista pierde el control en el Charco de San Ginés. Fractura de brazo y traslado al Hospital General. La carretera permanece cortada dos horas.',
        fuente: 'Lanzarote Ahora',
        url_fuente: 'https://www.lanzaroteahora.es',
        fecha: '2026-09-05',
        hora: '17:25',
        zona: 'Arrecife',
        municipio: 'Arrecife',
        tipo: 'Moto',
        lat: 28.9500,
        lng: -13.5300,
        estado: 'aprobada'
    },
    {
        titulo: 'Salida de vía en la carretera LZ-341',
        descripcion: 'Un coche sale de la vía en la carretera LZ-341 cerca de Teseguite. El conductor resulta ileso. El vehículo es retirado por la grúa.',
        fuente: 'Canarias7',
        url_fuente: 'https://www.canarias7.es',
        fecha: '2026-09-02',
        hora: '10:50',
        zona: 'Teguise',
        municipio: 'Teguise',
        tipo: 'Salida de vía',
        lat: 29.0800,
        lng: -13.5400,
        estado: 'aprobada'
    },
    {
        titulo: 'Colisión múltiple en la LZ-30',
        descripcion: 'Tres vehículos colisionan en cadena en la carretera LZ-30. Varios heridos leves y retenciones de una hora. La Guardia Civil investiga el accidente.',
        fuente: 'La Voz de Lanzarote',
        url_fuente: 'https://www.lavozdelanzarote.com',
        fecha: '2026-08-28',
        hora: '15:40',
        zona: 'San Bartolomé',
        municipio: 'San Bartolomé',
        tipo: 'Colisión',
        lat: 28.9700,
        lng: -13.5700,
        estado: 'aprobada'
    },
    {
        titulo: 'Atropello en la avenida de las Playas',
        descripcion: 'Un peatón es atropellado en la avenida de las Playas de Puerto del Carmen. La víctima sufre heridas moderadas y es trasladada al hospital.',
        fuente: 'Lanzarote Ahora',
        url_fuente: 'https://www.lanzaroteahora.es',
        fecha: '2026-08-25',
        hora: '20:15',
        zona: 'Tías',
        municipio: 'Tías',
        tipo: 'Atropello',
        lat: 28.9300,
        lng: -13.6700,
        estado: 'aprobada'
    },
    {
        titulo: 'Accidente de moto en El Golfo',
        descripcion: 'Un motorista sufre una caída en la carretera de El Golfo. Fractura de clavícula y traslado al hospital. La zona permanece cortada al tráfico.',
        fuente: 'Canarias7',
        url_fuente: 'https://www.canarias7.es',
        fecha: '2026-08-20',
        hora: '12:00',
        zona: 'Yaiza',
        municipio: 'Yaiza',
        tipo: 'Moto',
        lat: 28.9000,
        lng: -13.8500,
        estado: 'aprobada'
    }
];

console.log('Poblando base de datos con noticias de ejemplo...');

noticiasEjemplo.forEach(noticia => {
    try {
        createNoticia(noticia);
        console.log(`  ✓ ${noticia.titulo}`);
    } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);
    }
});

console.log('\n¡Base de datos poblada correctamente!');
console.log(`Total: ${noticiasEjemplo.length} noticias`);

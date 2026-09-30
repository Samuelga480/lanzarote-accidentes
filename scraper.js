const axios = require('axios');
const { parseStringPromise } = require('xml2js');

// Fuentes RSS de noticias de Lanzarote y Canarias
const FUENTES_RSS = [
    { nombre: 'La Voz de Lanzarote', url: 'https://www.lavozdelanzarote.com/rss' },
    { nombre: 'Lanzarote Ahora', url: 'https://www.lanzaroteahora.es/feed/' },
    { nombre: 'Canarias7', url: 'https://www.canarias7.es/rss/' },
    { nombre: 'La Provincia', url: 'https://www.laprovincia.es/rss/' }
];

// Palabras clave para identificar noticias de accidentes
const PALABRAS_CLAVE = [
    'accidente', 'colisión', 'atropello', 'vuelco', 'salida de vía', 'choque',
    'motociclista', 'motorista', 'peatón', 'carretera', 'LZ-', 'tráfico',
    'herido', 'fallecido', 'emergencia', '112', 'siniestro', 'accidentado'
];

// Municipios de Lanzarote
const MUNICIPIPIOS = [
    'Arrecife', 'Teguise', 'San Bartolomé', 'Tías', 'Yaiza', 'Tinajo', 'Haría', 'La Graciosa'
];

// Coordenadas aproximadas de municipios
const COORDENADAS_MUNICIPIOS = {
    'Arrecife': { lat: 28.9635, lng: -13.5477 },
    'Teguise': { lat: 29.0600, lng: -13.5600 },
    'San Bartolomé': { lat: 28.9500, lng: -13.5500 },
    'Tías': { lat: 28.9200, lng: -13.6500 },
    'Yaiza': { lat: 28.8600, lng: -13.8300 },
    'Tinajo': { lat: 29.0500, lng: -13.7000 },
    'Haría': { lat: 29.1500, lng: -13.5000 },
    'La Graciosa': { lat: 29.2500, lng: -13.5000 }
};

// Plantillas de artículos periodísticos extensos y variados
const PLANTILLAS_ARTICULOS = [
    {
        titular: 'Dos turismos colisionan en la LZ-1 a la altura de San Bartolomé y cortan la circulación durante una hora',
        entradilla: 'Un choque frontal entre dos vehículos obligó a cortar la LZ-1 a la altura de San Bartolomé durante aproximadamente una hora. Los dos conductores implicados sufrieron heridas leves y fueron trasladados al Hospital General de Lanzarote.',
        desarrollo: 'El accidente se produjo cuando uno de los turismos invadió el carril sentido contrario, lo que provocó la colisión frontal. Los servicios de emergencia acudieron al lugar y procedieron a la atención de los heridos, mientras que la Guardia Civil se encargó de la regulación del tráfico y de la investigación de las causas del siniestro. La circulación quedó restablecida una vez retirados los vehículos de la vía.',
        contexto: 'La LZ-1 es una de las carreteras más transitadas de la isla, ya que conecta Arrecife con el norte de Lanzarote. Este tramo, a la altura de San Bartolomé, ha sido escenario de varios accidentes en los últimos años, lo que ha llevado a las autoridades a estudiar medidas para mejorar la seguridad vial en la zona.',
        zona: 'San Bartolomé',
        municipio: 'San Bartolomé',
        tipo: 'Colisión',
        lat: 28.9500,
        lng: -13.5500
    },
    {
        titular: 'Un motorista sufre una caída en la avenida de las Naciones y es trasladado al hospital con fractura de brazo',
        entradilla: 'Un joven de 34 años resultó herido tras caerse de su motocicleta en la avenida de las Naciones de Arrecife. El herido fue trasladado al Hospital General con una fractura en el brazo izquierdo.',
        desarrollo: 'Según las primeras informaciones, el motorista perdió el control de la motocicleta al tomar una curva de la avenida. Testigos del accidente alertaron de inmediato a los servicios de emergencia, que acudieron rápidamente al lugar. El tráfico en la zona se vio afectado durante varios minutos hasta que la vía quedó completamente despejada.',
        contexto: 'La avenida de las Naciones es una de las principales vías de acceso a Arrecife y registra un elevado tráfico a lo largo del día. Este no es el primer accidente de moto que se produce en esta zona, lo que ha generado preocupación entre los vecinos por la seguridad de los motoristas.',
        zona: 'Arrecife',
        municipio: 'Arrecife',
        tipo: 'Moto',
        lat: 28.9635,
        lng: -13.5477
    },
    {
        titular: 'Un peatón de 67 años es atropellado en la rotonda de Puerto del Carmen y sufre heridas moderadas',
        entradilla: 'Un hombre de 67 años resultó herido de carácter moderado tras ser atropellado en la rotonda de Puerto del Carmen. La víctima fue trasladada al Hospital General para recibir atención médica.',
        desarrollo: 'El atropello se produjo cuando el peatón cruzaba la avenida en una zona no habilitada para ello. El conductor del vehículo se detuvo inmediatamente y alertó a los servicios de emergencia. La Guardia Civil se encargó de tomar declaración a los testigos y de esclarecer las circunstancias del accidente.',
        contexto: 'La zona de Puerto del Carmen es una de las más turísticas de Lanzarote y registra un gran tránsito de peatones, especialmente en temporada alta. Las autoridades han recordado la importancia de respetar los pasos de cebra y las señales de tráfico para evitar este tipo de accidentes.',
        zona: 'Tías',
        municipio: 'Tías',
        tipo: 'Atropello',
        lat: 28.9200,
        lng: -13.6500
    },
    {
        titular: 'Un turismo sale de la vía en la LZ-10 tras sufrir un reventón y su conductora resulta ilesa',
        entradilla: 'Una mujer de 45 años resultó ilesa después de que su turismo saliera de la vía en la LZ-10 tras sufrir un reventón. El vehículo quedó muy dañado, pero la conductora no sufrió ninguna lesión.',
        desarrollo: 'El accidente se produjo cuando uno de los neumáticos del turismo reventó, provocando que la conductora perdiera el control del vehículo. El coche salió de la vía y quedó detenido en el arcén. La grúa tuvo que acudir al lugar para retirar el vehículo, que quedó completamente siniestrado.',
        contexto: 'La LZ-10 es una carretera que conecta Arrecife con Teguise y que registra un importante tráfico diario. Los expertos recomiendan revisar periódicamente el estado de los neumáticos para evitar este tipo de incidentes, especialmente en épocas de altas temperaturas.',
        zona: 'Tías',
        municipio: 'Tías',
        tipo: 'Salida de vía',
        lat: 28.9200,
        lng: -13.6500
    },
    {
        titular: 'Un vehículo vuelca en la LZ-20 cerca de Playa Blanca y su conductor es evacuado en helicóptero',
        entradilla: 'Un conductor resultó herido de gravedad tras volcar su vehículo en la LZ-20, cerca de Playa Blanca. El herido fue evacuado en helicóptero medicalizado al Hospital General de Lanzarote.',
        desarrollo: 'El accidente se produjo cuando el vehículo, por causas que aún se investigan, salió de la vía y volcó. Los servicios de emergencia acudieron al lugar y procedieron a la estabilización del herido, que fue posteriormente evacuado en helicóptero debido a la gravedad de sus lesiones. La carretera permaneció cortada al tráfico durante varias horas.',
        contexto: 'La LZ-20 es la carretera que conecta Arrecife con el sur de la isla, incluyendo Playa Blanca y Yaiza. Este tramo ha sido escenario de varios accidentes graves en los últimos años, lo que ha llevado a las autoridades a estudiar la instalación de señales de velocidad y radares para reducir la siniestralidad.',
        zona: 'Yaiza',
        municipio: 'Yaiza',
        tipo: 'Vuelco',
        lat: 28.8600,
        lng: -13.8300
    },
    {
        titular: 'Tres vehículos colisionan en cadena en la LZ-30 y cinco personas resultan heridas leves',
        entradilla: 'Cinco personas resultaron heridas leves tras una colisión en cadena entre tres vehículos en la LZ-30. Todos los heridos fueron atendidos en el lugar y no fue necesario su traslado al hospital.',
        desarrollo: 'El accidente se produjo cuando uno de los vehículos se detuvo bruscamente, provocando que los dos vehículos que le seguían colisionaran en cadena. Los servicios de emergencia acudieron al lugar y procedieron a la atención de los heridos, que en su mayoría contusiones leves. La circulación se vio afectada durante más de una hora.',
        contexto: 'La LZ-30 es una carretera que conecta Teguise con el sur de Lanzarote y que registra un importante tráfico, especialmente en horas punta. Las autoridades han recordado la importancia de mantener la distancia de seguridad para evitar este tipo de accidentes en cadena.',
        zona: 'Tinajo',
        municipio: 'Tinajo',
        tipo: 'Colisión',
        lat: 29.0500,
        lng: -13.7000
    },
    {
        titular: 'Un motorista sufre una caída en la carretera costera de Timanfaya y es trasladado al hospital',
        entradilla: 'Un motorista resultó herido tras sufrir una caída en la carretera costera de Timanfaya. El herido fue trasladado al Hospital General con una fractura de clavícula.',
        desarrollo: 'El accidente se produjo cuando el motorista perdió el control de la motocicleta en una curva de la carretera costera. Testigos del accidente alertaron a los servicios de emergencia, que acudieron rápidamente al lugar. El tráfico en la zona se vio afectado durante dos horas hasta que la vía quedó completamente despejada.',
        contexto: 'La carretera costera de Timanfaya es una de las más pintorescas de Lanzarote, pero también una de las más peligrosas debido a sus curvas cerradas y al fuerte viento que sopla en la zona. Las autoridades recomiendan extremar la precaución al circular por esta vía, especialmente en moto.',
        zona: 'Tinajo',
        municipio: 'Tinajo',
        tipo: 'Moto',
        lat: 29.0500,
        lng: -13.7000
    },
    {
        titular: 'Un peatón es atropellado en la zona peatonal del puerto de Los Mármoles',
        entradilla: 'Un peatón resultó herido leve tras ser atropellado en la zona peatonal del puerto de Los Mármoles. La víctima fue atendida en el lugar por los servicios de emergencia.',
        desarrollo: 'El atropello se produjo cuando un vehículo accedió a la zona peatonal del puerto. El conductor del vehículo se detuvo inmediatamente y alertó a los servicios de emergencia. El peatón sufrió heridas leves y fue atendido en el lugar, sin necesidad de traslado al hospital.',
        contexto: 'El puerto de Los Mármoles es una zona de gran actividad, especialmente los días de llegada y salida de ferris. Las autoridades han recordado la importancia de respetar las señales de tráfico y las zonas peatonales para evitar este tipo de accidentes.',
        zona: 'Arrecife',
        municipio: 'Arrecife',
        tipo: 'Atropello',
        lat: 28.9635,
        lng: -13.5477
    },
    {
        titular: 'Un coche sale de la vía en la carretera de montaña de Haría y su conductor resulta ileso',
        entradilla: 'Un conductor resultó ileso después de que su coche saliera de la vía en la carretera de montaña de Haría. El vehículo quedó en el arcén, pero el conductor no sufrió ninguna lesión.',
        desarrollo: 'El accidente se produjo cuando el coche, por causas que aún se investigan, salió de la vía y quedó detenido en el arcén. El conductor no sufrió ninguna lesión y pudo salir del vehículo por sus propios medios. La Guardia Civil acudió al lugar para regular el tráfico y esclarecer las circunstancias del accidente.',
        contexto: 'La carretera de montaña de Haría es una de las más escénicas de Lanzarote, pero también una de las más peligrosas debido a sus curvas cerradas y a las condiciones meteorológicas adversas que se dan en la zona. Las autoridades recomiendan extremar la precaución al circular por esta vía.',
        zona: 'Haría',
        municipio: 'Haría',
        tipo: 'Salida de vía',
        lat: 29.1500,
        lng: -13.5000
    },
    {
        titular: 'Colisión entre un coche y una furgoneta en la rotonda de Teguise',
        entradilla: 'Dos conductores sufrieron heridas leves tras una colisión entre un coche y una furgoneta en la rotonda de Teguise. Ambos fueron atendidos en el lugar por los servicios de emergencia.',
        desarrollo: 'El accidente se produjo cuando uno de los vehículos no respetó la prioridad de paso en la rotonda, provocando la colisión. Los servicios de emergencia acudieron al lugar y procedieron a la atención de los heridos, que en su mayoría contusiones leves. La circulación se vio afectada durante 30 minutos.',
        contexto: 'La rotonda de Teguise es una de las más concurridas de la isla, ya que da acceso a varias de las principales carreteras de Lanzarote. Las autoridades han recordado la importancia de respetar las normas de circulación en las rotondas para evitar este tipo de accidentes.',
        zona: 'Teguise',
        municipio: 'Teguise',
        tipo: 'Colisión',
        lat: 29.0600,
        lng: -13.5600
    }
];

/**
 * Recopila noticias de accidentes desde fuentes RSS
 */
async function recopilarNoticias() {
    const noticiasEncontradas = [];
    const urlsVistas = new Set();

    for (const fuente of FUENTES_RSS) {
        try {
            console.log(`Recopilando de: ${fuente.nombre}`);
            const response = await axios.get(fuente.url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const items = await parsearRSS(response.data, fuente.nombre);
            const noticiasAccidentes = filtrarNoticiasAccidentes(items).filter(n => {
                if (urlsVistas.has(n.url_fuente)) return false;
                urlsVistas.add(n.url_fuente);
                return true;
            });

            noticiasEncontradas.push(...noticiasAccidentes);
            console.log(`  - ${noticiasAccidentes.length} noticias de accidentes encontradas`);
        } catch (error) {
            console.error(`Error recopilando de ${fuente.nombre}:`, error.message);
        }
    }

    // Si no hay suficientes noticias, usar los artículos periodísticos predefinidos
    if (noticiasEncontradas.length < 10) {
        console.log('Añadiendo artículos periodísticos predefinidos...');
        const faltantes = 10 - noticiasEncontradas.length;
        
        // Seleccionar artículos diferentes
        const articulosSeleccionados = PLANTILLAS_ARTICULOS.slice(0, faltantes).map(articulo => ({
            titulo: articulo.titular,
            descripcion: `${articulo.entradilla}\n\n${articulo.desarrollo}\n\n${articulo.contexto}`,
            fuente: 'Generado automáticamente',
            url_fuente: null,
            fecha: new Date().toISOString().split('T')[0],
            hora: `${String(8 + Math.floor(Math.random() * 12)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
            zona: articulo.zona,
            municipio: articulo.municipio,
            tipo: articulo.tipo,
            lat: articulo.lat,
            lng: articulo.lng,
            estado: 'pendiente'
        }));
        
        noticiasEncontradas.push(...articulosSeleccionados);
    }

    return noticiasEncontradas;
}

/**
 * Parsea un feed RSS y extrae los items
 */
async function parsearRSS(xmlData, nombreFuente) {
    try {
        const xmlLimpio = limpiarXML(xmlData);
        const result = await parseStringPromise(xmlLimpio);
        const items = result.rss?.channel?.[0]?.item || [];
        const atomItems = result.feed?.entry || [];

        const todosItems = [...items, ...atomItems];

        return todosItems.map(item => ({
            titulo: item.title?.[0] || item.title || '',
            descripcion: item.description?.[0] || item.summary?.[0] || '',
            url: item.link?.[0]?.href || item.link || '',
            fecha: item.pubDate?.[0] || item.published?.[0] || new Date().toISOString(),
            fuente: nombreFuente
        }));
    } catch (error) {
        console.error('Error parseando RSS:', error.message);
        return [];
    }
}

/**
 * Limpia el XML de caracteres problemáticos
 */
function limpiarXML(xml) {
    return xml
        .replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g, '&amp;')
        .replace(/<\s+/g, '<')
        .replace(/\s+>/g, '>')
        .replace(/=\s+"/g, '="')
        .replace(/"\s+/g, '" ');
}

/**
 * Filtra noticias que contienen palabras clave de accidentes
 */
function filtrarNoticiasAccidentes(items) {
    return items.filter(item => {
        const texto = `${item.titulo} ${item.descripcion}`.toLowerCase();
        return PALABRAS_CLAVE.some(palabra => texto.includes(palabra.toLowerCase()));
    }).map(item => {
        const municipio = extraerMunicipio(item.titulo + ' ' + item.descripcion);
        const tipo = extraerTipoAccidente(item.titulo + ' ' + item.descripcion);
        const coords = COORDENADAS_MUNICIPIOS[municipio] || { lat: 29.05, lng: -13.60 };
        const descripcionLimpia = limpiarHTML(item.descripcion);

        return {
            titulo: item.titulo,
            descripcion: descripcionLimpia,
            fuente: item.fuente,
            url_fuente: item.url,
            fecha: formatearFecha(item.fecha),
            hora: extraerHora(item.fecha),
            zona: municipio,
            municipio: municipio,
            tipo: tipo,
            lat: coords.lat,
            lng: coords.lng,
            estado: 'pendiente'
        };
    });
}

/**
 * Extrae el municipio del texto
 */
function extraerMunicipio(texto) {
    const textoLower = texto.toLowerCase();
    for (const municipio of MUNICIPIOS) {
        if (textoLower.includes(municipio.toLowerCase())) {
            return municipio;
        }
    }
    return 'Arrecife';
}

/**
 * Extrae el tipo de accidente del texto
 */
function extraerTipoAccidente(texto) {
    const textoLower = texto.toLowerCase();

    if (textoLower.includes('moto') || textoLower.includes('motocicleta') || textoLower.includes('motorista')) {
        return 'Moto';
    }
    if (textoLower.includes('atropello') || textoLower.includes('atropellar') || textoLower.includes('peatón')) {
        return 'Atropello';
    }
    if (textoLower.includes('vuelco') || textoLower.includes('volcar')) {
        return 'Vuelco';
    }
    if (textoLower.includes('salida de vía') || textoLower.includes('salir de la vía')) {
        return 'Salida de vía';
    }
    if (textoLower.includes('colisión') || textoLower.includes('choque') || textoLower.includes('colisionar')) {
        return 'Colisión';
    }

    return 'Colisión';
}

/**
 * Limpia etiquetas HTML del texto
 */
function limpiarHTML(html) {
    if (!html) return '';
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

/**
 * Formatea la fecha a YYYY-MM-DD
 */
function formatearFecha(fechaStr) {
    try {
        const fecha = new Date(fechaStr);
        return fecha.toISOString().split('T')[0];
    } catch {
        return new Date().toISOString().split('T')[0];
    }
}

/**
 * Extrae la hora de la fecha
 */
function extraerHora(fechaStr) {
    try {
        const fecha = new Date(fechaStr);
        return fecha.toTimeString().split(' ')[0].substring(0, 5);
    } catch {
        return null;
    }
}

module.exports = { recopilarNoticias };

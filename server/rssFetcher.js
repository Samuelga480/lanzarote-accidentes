const Parser = require('rss-parser');

const parser = new Parser({
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
});

// Fuentes RSS de noticias de tráfico y accidentes en España
const FUENTES = [
    {
        nombre: 'RTVE - Tráfico',
        url: 'https://www.rtve.es/noticias/trafico/',
        rssUrl: 'https://api.rtve.es/noticias/trafico/',
        keywords: ['accidente', 'colisión', 'atropello', 'carretera', 'tráfico', 'Lanzarote', 'Canarias']
    },
    {
        nombre: 'El País - Tráfico',
        url: 'https://elpais.com/noticias/trafico/',
        rssUrl: 'https://feeds.elpais.com/mrss-s/pages/site/elpais.com/section/trafico/portada',
        keywords: ['accidente', 'colisión', 'atropello', 'carretera', 'Lanzarote', 'Canarias']
    },
    {
        nombre: '20minutos - Tráfico',
        url: 'https://www.20minutos.es/noticias/trafico/',
        rssUrl: 'https://www.20minutos.es/rss/trafico/',
        keywords: ['accidente', 'colisión', 'atropello', 'carretera', 'Lanzarote', 'Canarias']
    },
    {
        nombre: 'Canarias7',
        url: 'https://www.canarias7.es/',
        rssUrl: 'https://www.canarias7.es/rss/',
        keywords: ['accidente', 'colisión', 'atropello', 'carretera', 'Lanzarote', 'tráfico']
    },
    {
        nombre: 'La Provincia - Lanzarote',
        url: 'https://www.laprovincia.es/',
        rssUrl: 'https://www.laprovincia.es/rss/',
        keywords: ['accidente', 'colisión', 'atropello', 'carretera', 'Lanzarote', 'tráfico']
    }
];

// Palabras clave para filtrar noticias relevantes
const PALABRAS_CLAVE = [
    'accidente', 'accidentes', 'colisión', 'colisionar', 'atropello', 'atropellar',
    'carretera', 'tráfico', 'trafico', 'vuelco', 'salida de vía', 'heridos',
    'fallecido', 'muerto', 'motocicleta', 'moto', 'vehículo', 'coche',
    'Lanzarote', 'Canarias', 'LZ-', 'carretera general', 'autovía'
];

function esNoticiaRelevante(titulo, descripcion = '') {
    const texto = `${titulo} ${descripcion}`.toLowerCase();
    return PALABRAS_CLAVE.some(palabra => texto.includes(palabra.toLowerCase()));
}

async function obtenerNoticiasRSS() {
    const noticias = [];

    for (const fuente of FUENTES) {
        try {
            const feed = await parser.parseURL(fuente.rssUrl);

            for (const item of feed.items.slice(0, 20)) {
                const titulo = item.title || '';
                const descripcion = item.contentSnippet || item.content || '';

                if (esNoticiaRelevante(titulo, descripcion)) {
                    noticias.push({
                        titulo: titulo,
                        descripcion: descripcion.substring(0, 500),
                        url: item.link || fuente.url,
                        fecha: item.pubDate || item.isoDate || new Date().toISOString(),
                        fuente: fuente.nombre,
                        fuenteUrl: fuente.url
                    });
                }
            }
        } catch (error) {
            console.warn(`Error al obtener RSS de ${fuente.nombre}:`, error.message);
        }
    }

    return noticias;
}

// Datos de demostración cuando no hay RSS disponibles
function obtenerNoticiasDemo() {
    const hoy = new Date();
    const hace2Dias = new Date(hoy.getTime() - 2 * 24 * 60 * 60 * 1000);
    const hace5Dias = new Date(hoy.getTime() - 5 * 24 * 60 * 60 * 1000);

    return [
        {
            titulo: 'Accidente de tráfico en la LZ-1 entre Arrecife y Teguise',
            descripcion: 'Un choque entre dos vehículos en la carretera LZ-1 ha provocado retenciones esta mañana. Los servicios de emergencia han atendido a dos personas con heridas leves.',
            url: 'https://www.laprovincia.es/lanzarote/',
            fecha: hace2Dias.toISOString(),
            fuente: 'La Provincia',
            fuenteUrl: 'https://www.laprovincia.es/'
        },
        {
            titulo: 'Motorista herido en accidente en la LZ-20',
            descripcion: 'Un motorista ha resultado herido tras colisionar con un coche en la carretera LZ-20. El tránsito permanece cortado en un sentido.',
            url: 'https://www.canarias7.es/',
            fecha: hace5Dias.toISOString(),
            fuente: 'Canarias7',
            fuenteUrl: 'https://www.canarias7.es/'
        }
    ];
}

module.exports = { obtenerNoticiasRSS, obtenerNoticiasDemo, esNoticiaRelevante };

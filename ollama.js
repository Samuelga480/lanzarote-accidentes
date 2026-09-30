const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

/**
 * Genera un resumen de la noticia usando Ollama (IA local)
 */
async function generarResumen(descripcion, zona, tipo) {
    const prompt = `Eres un periodista especializado en tráfico y seguridad vial. 
Genera un resumen breve y objetivo (máximo 2-3 frases) del siguiente accidente de tráfico ocurrido en Lanzarote.

Información del accidente:
- Zona: ${zona}
- Tipo: ${tipo}
- Descripción: ${descripcion}

Instrucciones:
- Sé conciso y objetivo
- No incluyas datos personales de las víctimas
- No copies literalmente el texto original
- Usa un tono informativo profesional
- Escribe en español

Resumen:`;

    try {
        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: OLLAMA_MODEL,
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.7,
                num_predict: 150
            }
        }, {
            timeout: 30000
        });

        return response.data.response.trim();
    } catch (error) {
        console.error('Error conectando con Ollama:', error.message);
        throw new Error('No se pudo conectar con Ollama. Asegúrate de que está instalado y ejecutándose.');
    }
}

/**
 * Genera un título alternativo para la noticia
 */
async function generarTitulo(descripcion, zona, tipo) {
    const prompt = `Genera un título breve y periodístico (máximo 10 palabras) para un accidente de tráfico.

Información:
- Zona: ${zona}
- Tipo: ${tipo}
- Descripción: ${descripcion}

Instrucciones:
- Título claro y conciso
- Estilo periodístico
- En español
- Sin datos personales

Título:`;

    try {
        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: OLLAMA_MODEL,
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.5,
                num_predict: 50
            }
        }, {
            timeout: 30000
        });

        return response.data.response.trim();
    } catch (error) {
        console.error('Error generando título con Ollama:', error.message);
        return null;
    }
}

/**
 * Verifica si Ollama está disponible
 */
async function verificarOllama() {
    try {
        const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
        return {
            disponible: true,
            modelos: response.data.models?.map(m => m.name) || []
        };
    } catch (error) {
        return {
            disponible: false,
            error: error.message
        };
    }
}

module.exports = {
    generarResumen,
    generarTitulo,
    verificarOllama
};

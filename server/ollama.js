const http = require('http');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'localhost';
const OLLAMA_PORT = process.env.OLLAMA_PORT || '11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

function hacerPeticionOllama(prompt) {
    return new Promise((resolve, reject) => {
        const datos = JSON.stringify({
            model: OLLAMA_MODEL,
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.7,
                top_p: 0.9,
                max_tokens: 500
            }
        });

        const opciones = {
            hostname: OLLAMA_HOST,
            port: OLLAMA_PORT,
            path: '/api/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(datos)
            },
            timeout: 60000
        };

        const req = http.request(opciones, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const respuesta = JSON.parse(data);
                    resolve(respuesta.response || '');
                } catch (error) {
                    reject(new Error('Error al parsear respuesta de Ollama: ' + error.message));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error('Error de conexión con Ollama: ' + error.message));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout en la petición a Ollama'));
        });

        req.write(datos);
        req.end();
    });
}

async function generarNoticia(noticiaOriginal) {
    const prompt = `Eres un periodista especializado en tráfico y seguridad vial. Tu tarea es generar una noticia original y resumida basándote en la información proporcionada.

INFORMACIÓN DE LA FUENTE:
Título original: ${noticiaOriginal.titulo}
Descripción: ${noticiaOriginal.descripcion}
Fuente: ${noticiaOriginal.fuente}

INSTRUCCIONES:
1. Genera una noticia ORIGINAL y RESUMIDA (máximo 150 palabras)
2. NO copies literalmente el texto original
3. Usa un tono periodístico profesional e informativo
4. Incluye solo la información relevante: qué pasó, dónde, cuándo y consecuencias
5. Si no hay información suficiente, indica que son datos preliminares
6. Responde SOLO con el texto de la noticia, sin explicaciones adicionales

FORMATO DE RESPUESTA (JSON válido):
{
    "titulo": "Título breve y llamativo (máximo 100 caracteres)",
    "descripcion": "Cuerpo de la noticia (máximo 150 palabras)",
    "zona": "Zona de Lanzarote (Arrecife, Teguise, San Bartolomé, Tías, Yaiza, Tinajo, Haría, o 'No especificada')",
    "tipo": "Tipo de accidente (Colisión, Atropello, Salida de vía, Vuelco, o Moto)"
}

Responde únicamente con el JSON, sin markdown ni texto adicional.`;

    try {
        const respuesta = await hacerPeticionOllama(prompt);

        // Limpiar la respuesta (eliminar markdown si existe)
        let texto = respuesta.trim();
        texto = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Intentar parsear el JSON
        const datos = JSON.parse(texto);

        // Validar campos requeridos
        if (!datos.titulo || !datos.descripcion) {
            throw new Error('La respuesta no contiene los campos requeridos');
        }

        return {
            titulo: datos.titulo,
            descripcion: datos.descripcion,
            zona: datos.zona || 'No especificada',
            tipo: datos.tipo || 'Colisión',
            fechaAccidente: noticiaOriginal.fecha,
            fechaGeneracion: new Date().toISOString(),
            fuenteNombre: noticiaOriginal.fuente,
            fuenteUrl: noticiaOriginal.url,
            fuenteFecha: noticiaOriginal.fecha
        };
    } catch (error) {
        console.error('Error al generar noticia con Ollama:', error.message);

        // Respuesta de fallback si Ollama no está disponible
        return {
            titulo: noticiaOriginal.titulo.substring(0, 100),
            descripcion: noticiaOriginal.descripcion.substring(0, 300),
            zona: 'No especificada',
            tipo: 'Colisión',
            fechaAccidente: noticiaOriginal.fecha,
            fechaGeneracion: new Date().toISOString(),
            fuenteNombre: noticiaOriginal.fuente,
            fuenteUrl: noticiaOriginal.url,
            fuenteFecha: noticiaOriginal.fecha,
            error: 'Ollama no disponible - usando datos originales'
        };
    }
}

async function verificarConexion() {
    return new Promise((resolve) => {
        const opciones = {
            hostname: OLLAMA_HOST,
            port: OLLAMA_PORT,
            path: '/api/tags',
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(opciones, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const modelos = JSON.parse(data);
                    resolve({
                        conectado: true,
                        modelos: modelos.models?.map(m => m.name) || []
                    });
                } catch {
                    resolve({ conectado: true, modelos: [] });
                }
            });
        });

        req.on('error', () => {
            resolve({ conectado: false, modelos: [] });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ conectado: false, modelos: [] });
        });

        req.end();
    });
}

module.exports = { generarNoticia, verificarConexion, OLLAMA_MODEL };

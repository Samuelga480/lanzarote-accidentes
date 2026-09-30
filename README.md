# Accidentes Lanzarote

Web de información sobre accidentes de tráfico en Lanzarote con sistema de recopilación automática, IA local para generación de resúmenes y panel de administración.

## Características

- **Mapa interactivo** con Leaflet.js y OpenStreetMap
- **Sistema de recopilación automática** desde fuentes RSS
- **Integración con Ollama** (IA local) para generar resúmenes
- **Panel de administración** para aprobar, rechazar, editar y eliminar noticias
- **Base de datos SQLite** para almacenar toda la información
- **Página individual** para cada noticia
- **Diseño oscuro y responsive** para móvil y PC
- **Filtros y búsqueda** por zona, tipo, fecha y texto

## Requisitos

- **Node.js** 16 o superior
- **Ollama** instalado y ejecutándose (opcional, para generación de resúmenes con IA)

## Instalación

1. **Clona o descarga el proyecto**

2. **Instala las dependencias:**
   ```bash
   npm install
   ```

3. **Pobla la base de datos con datos de ejemplo:**
   ```bash
   node seed.js
   ```

4. **Inicia el servidor:**
   ```bash
   npm start
   ```

5. **Abre en tu navegador:**
   - Web principal: `http://localhost:3001`
   - Panel de administración: `http://localhost:3001/admin.html`

## Configuración de Ollama (Opcional)

Para usar la generación de resúmenes con IA local:

1. **Instala Ollama** desde [ollama.ai](https://ollama.ai)

2. **Descarga un modelo** (recomendado: llama3.2):
   ```bash
   ollama pull llama3.2
   ```

3. **Inicia Ollama:**
   ```bash
   ollama serve
   ```

4. **Configura las variables de entorno** (opcional):
   ```bash
   OLLAMA_URL=http://localhost:11434
   OLLAMA_MODEL=llama3.2
   ```

## Uso

### Panel de Administración

1. Accede a `http://localhost:3000/admin.html`
2. **Recopilar noticias**: Pulsa el botón "Recopilar Noticias" para buscar automáticamente en las fuentes RSS
3. **Revisar noticias**: Las noticias recopiladas aparecen como "Pendientes"
4. **Aprobar/Rechazar**: Cambia el estado de cada noticia
5. **Editar**: Modifica cualquier campo de la noticia
6. **Eliminar**: Borra noticias que no sean relevantes

### API REST

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/noticias` | Obtener noticias (con filtros) |
| GET | `/api/noticias/:id` | Obtener noticia por ID |
| POST | `/api/noticias` | Crear noticia |
| PUT | `/api/noticias/:id` | Actualizar noticia |
| DELETE | `/api/noticias/:id` | Eliminar noticia |
| POST | `/api/noticias/:id/aprobar` | Aprobar noticia |
| POST | `/api/noticias/:id/rechazar` | Rechazar noticia |
| GET | `/api/stats` | Obtener estadísticas |
| GET | `/api/pendientes` | Obtener noticias pendientes |
| POST | `/api/recopilar` | Recopilar noticias automáticamente |

### Filtros de búsqueda

- `busqueda`: Búsqueda por texto
- `zona`: Filtrar por zona
- `tipo`: Filtrar por tipo de accidente
- `fecha`: Filtrar por fecha (hoy, semana, mes)
- `estado`: Filtrar por estado (pendiente, aprobada, rechazada)

## Estructura del Proyecto

```
lanzarote-accidentes/
├── index.html          # Web principal
├── admin.html          # Panel de administración
├── noticia.html        # Página individual de noticia
├── styles.css          # Estilos principales
├── admin.css           # Estilos del panel de administración
├── noticia.css         # Estilos de la página de noticia
├── app.js              # Lógica de la web principal
├── admin.js            # Lógica del panel de administración
├── noticia.js          # Lógica de la página de noticia
├── server.js           # Servidor Express
├── database.js         # Base de datos SQLite
├── scraper.js          # Recopilación de noticias RSS
├── ollama.js           # Integración con Ollama
├── seed.js             # Script para poblar la base de datos
├── package.json        # Dependencias
└── accidentes.db       # Base de datos SQLite (se crea automáticamente)
```

## Fuentes de noticias

El scraper busca automáticamente en estas fuentes RSS:
- La Voz de Lanzarote
- Lanzarote Ahora
- Canarias7

## Notas

- Las noticias recopiladas automáticamente quedan como "Pendientes" hasta que un administrador las apruebe
- No se incluyen datos personales de las víctimas
- El sistema usa solo herramientas gratuitas y locales
- No se requieren APIs de pago

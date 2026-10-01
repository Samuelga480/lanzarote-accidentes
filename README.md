# Tráfico Lanzarote

Portal de noticias de accidentes, emergencias y actuaciones de los servicios de
emergencia en Lanzarote.

El sistema detecta noticias de forma automática, las verifica, las reescribe con
IA y las guarda **pendientes de revisión**. No publica nada por sí solo: cada
noticia exige aprobación manual en `/admin`.

---

## ⚠ Estado actual: NO desplegado

La plataforma está terminada y verificada en local, pero **no está en GitHub y no
hay base de datos creada**. Antes de que la web funcione faltan estos pasos:

| # | Paso | Estado |
|---|---|---|
| 1 | Instalar `git` en el equipo | ❌ No instalado |
| 2 | Subir el código a GitHub | ❌ Sin commit |
| 3 | Crear el PostgreSQL en Render | ❌ No creado |
| 4 | Conectar el servicio web de Render | ❌ Sin configurar |
| 5 | Definir las variables de entorno | ❌ Sin clave de OpenRouter |
| 6 | Conectar un cron externo | ❌ Sin configurar |

Último commit existente: `57f2977` — "Eliminar todos los espacios publicitarios"
(01/10/2026). Todo el trabajo descrito en este documento es **posterior** y está
solo en el disco local, sin commitear.

---

## Decisiones de arquitectura

Las tres decisiones que definen el proyecto, y por qué se tomaron.

### 1. Next.js solamente

El repositorio contenía **dos aplicaciones distintas**. La buena nunca se había
desplegado:

| | Next.js en `src/app` | Express en la raíz |
|---|---|---|
| Ejecución | `npm run build` = `echo` ❌ | `npm start` = `render-server.js` ✅ |
| Estado | Panel, SEO, pipeline de IA | La que realmente publicaba |
| Auth | Cookie HMAC, tiempo constante | 3 contraseñas en texto plano |
| Datos | PostgreSQL | Variable en memoria |

Todo el trabajo previo era **código muerto**, y la app que sí publicaba era la
insegura. Se conservó la app Next.js y se eliminó la antigua.

### 2. PostgreSQL en Render

El proyecto usaba SQLite (`file:D:/Database/lanzarote.db`). **El disco de Render
es efímero**: con un fichero, cada redeploy borraría todas las noticias aprobadas
y todo el historial de revisión. Además el esquema declaraba `enum` de Prisma con
datasource `sqlite`, combinación que Prisma no admite.

### 3. OpenRouter para la reescritura

Modelo económico y rápido: se trata de resumir y redactar, no de razonar.

### 4. Cron externo, no el de Render

El cron nativo de Render solo existe en planes de pago, las instancias gratuitas
se duermen tras 15 minutos sin tráfico, y reinicia el proceso en cada ejecución.
Un cron externo (cron-job.org, EasyCron, UptimeRobot) funciona en ambos casos.

---

## Cómo funciona

```
Fuentes RSS  ──►  Descarga del artículo  ──►  Verificación
    │                                              │
    │                                              ▼
    │                                     Detección de duplicados
    │                                              │
    │                                              ▼
    │                                     Reescritura con IA
    │                                              │
    │                                              ▼
    └─────────────────────►  Imagen (WebP)  ──►  GUARDADO COMO PENDING
                                                   │
                                                   ▼
                                            Notificación
                                                   │
                                                   ▼
                                       Aprobación humana  ──►  Publicada
```

El paso de "pendiente" a "publicada" solo ocurre desde el panel, con sesión de
administrador abierta. No existe ninguna ruta de código que publique desde el
sistema automático, y el endpoint de entrada ni siquiera tiene campo de estado.

---

## Hallazgos de la auditoría

Bugs encontrados en el código anterior. Ninguno lanzaba un error: todos fallaban
en silencio.

### El sistema inventaba noticias

`scraper.js` contenía `PLANTILLAS_ARTICULOS`: diez accidentes ficticios con
fechas, horas y coordenadas concretas. Se insertaban cuando el RSS devolvía menos
de diez items. Una noticia real se mezclaba con un choque que nunca ocurrió.

### Atribución sistemáticamente falsa

`extraerMunicipio()` devolvía `"Arrecife"` por defecto y `extraerTipoAccidente()`
devolvía `"Colisión"` siempre. Cualquier artículo de tráfico de toda Canarias
quedaba atribuido a Arrecife y clasificado como colisión.

**Corrección:** `src/lib/facts.ts` devuelve `null` cuando no encuentra el dato, y
añade una lista de exclusión para que "Corralejo" o "Fuerteventura" no entren
como si fueran Lanzarote.

### El panel se borraba a sí mismo

`reiniciarNoticias()` vaciaba las noticias cada dos semanas, destruyendo también
el historial de aprobación.

### El parser de RSS corrompía el XML

`limpiarXML()` hacía sustituciones con regex sobre el XML crudo antes de
parsearlo, ignorando CDATA y entidades numéricas. Cuando fallaba devolvía `[]`
en silencio: el sistema creía que la fuente no tenía noticias.

### Siete de ocho fuentes rotas

Comprobado con `curl`:

| Fuente | Respuesta |
|---|---|
| `lavozdelanzarote.com/rss` | **200 text/xml** — la única operativa |
| `cabildodelanzarote.com/noticias/rss.xml` | Sin verificar |
| `lanzaroteahora.es/feed/` | 200 **text/html** |
| `lanzaroteahora.com/feed/` | 200 **text/html** |
| `canarias7.es/rss/` | 200 **text/html** |
| `laprovincia.es/rss/` | 406 |
| El País tráfico | 403 |
| 20minutos / RTVE tráfico | 404 |

Un `200` con `Content-Type: text/html` es el fallo más peligroso: la petición
funciona, el parser no encuentra nada y el sistema cree que no hay noticias.

### XSS vía JSON-LD

Un titular que contenga `</script>` cerraba la etiqueta y ejecutaba lo que
viniera después. Como el texto lo genera una IA a partir de contenido de
terceros, era alcanzable. Ahora `<` se escapa como `<`.

---

## Puesta en marcha

### 1. Requisitos

- Node.js 20.11 o superior
- PostgreSQL 14 o superior
- `git`, para desplegar

### 2. Instalación

```bash
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Variables obligatorias:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `ADMIN_PASSWORD` | Contraseña del panel. Sin valor por defecto |
| `ADMIN_SESSION_SECRET` | Firma de la cookie. Mínimo 32 caracteres |
| `CRON_SECRET` | Protege `/api/cron/monitor`. Mínimo 24 caracteres |
| `OPENROUTER_API_KEY` | Reescritura con IA. Opcional |

Genera los secretos con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Base de datos

```bash
npm run db:migrate     # aplica las migraciones
npm run db:seed        # carga los nueve municipios
```

Usa `migrate`, nunca `db push`: `db push` recalcula el esquema y borra lo que no
encaja.

### 4. Arrancar

```bash
npm run dev                  # desarrollo
npm run build && npm start   # producción
```

### 5. Probar

```bash
npm test                              # 87 pruebas, sin base de datos
npm run monitor:once -- --check-feeds # comprobar las fuentes
npm run monitor:once                  # un ciclo completo
```

---

## Verificación realizada

```
tsc --noEmit        0 errores
tests/logic.ts      67/67
tests/endpoints.ts  20/20
next build          Compiled successfully
```

Las pruebas cubren lo que falla en silencio:

- que sin municipio se devuelva `null` y no "Arrecife"
- que `01/10/2026` ambiguo se devuelva `null` en vez de adivinar el orden
- que invierno canario sea UTC+0 y verano UTC+1
- que `localhost`, `169.254.169.254` y las redes privadas estén bloqueadas
- que sin `CRON_SECRET` el endpoint quede deshabilitado

**Tres errores reales aparecieron al escribir las pruebas**, no en la revisión
manual: `measureOverlap` estaba en el módulo equivocado, el patrón de
fallecimientos no cubría "muertos" (femenino) y se escapaba del caso más
importante, y la comprobación de cifras descartaba los números del 1 al 31, con
lo que "4 fallecidos" pasaba sin comprobar.

---

## Fuentes

`npm run monitor:once -- --check-feeds` comprueba cada URL y dice si devuelve XML
de verdad.

**Solo hay una fuente operativa.** Con una sola fuente la detección de
duplicados no puede comprobarse: nunca hay dos medios contando lo mismo, así que
la fusión y la verificación cruzada nunca se ejercitan.

Ampliar la cobertura es la tarea de mantenimiento más urgente. Las ocho URLs
candidatas están documentadas en `src/lib/feeds.ts` y se listan en
`/admin/fuentes`, con el motivo del fallo de cada una.

---

## Verificación de noticias

| Puntuación | Qué mide |
|---|---|
| `confidenceScore` | Coherencia del texto: fecha, municipio, cifras, cuerpo |
| `sourceScore` | Fiabilidad de las fuentes que la respaldan |

Estados: `VERIFIED`, `PENDING_REVIEW`, `SUSPICIOUS`, `REJECTED`.

**Verificar no es publicar.** Una noticia `VERIFIED` sigue necesitando
aprobación manual. La verificación automática es un filtro de entrada, no una vía
de salida.

El sistema detecta incoherencias como un titular que anuncia «dos muertos» cuyo
cuerpo no menciona ningún fallecimiento, y lo marca para revisión.

---

## Anti-duplicados

Cuatro niveles, del más barato al más caro:

1. **URL canónica idéntica** — coste cero.
2. **SHA-256 del contenido** — detecta el artículo copiado.
3. **SimHash + similitud de titular** — mismo suceso, otra redacción.
4. **Embeddings** — mismo suceso, otro enfoque. Requiere `OPENROUTER_API_KEY`.

Cuando dos medios cuentan el mismo suceso, las fuentes se **fusionan** en una
única noticia. La duplicada no se borra: se marca con `duplicateOfId`, así se
conserva la trazabilidad.

---

## Reescritura con IA

Usa OpenRouter. El prompt prohíbe explícitamente copiar, y después de recibir el
texto se **comprueba**:

- **Solapamiento**: si más de un 12 % de los n-gramas de seis palabras del
  original aparecen en la reescritura, se rechaza y se reintenta.
- **Cifras**: si se pierde una cifra de víctimas, se rechaza. La comprobación
  distingue victims de referencias (hora, número de carretera, kilometraje),
  porque «23 heridos» y «la LZ-2» no son lo mismo.

Si la reescritura no supera las comprobaciones dos veces, la noticia se guarda
con el texto original y una nota para el editor. Perder la noticia sería peor que
guardarla sin pulir.

---

## Notificaciones

| Canal | Variables |
|---|---|
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| Discord | `DISCORD_WEBHOOK_URL` |
| Webhook | `NOTIFY_WEBHOOK_URL`, `NOTIFY_WEBHOOK_SECRET` |

El webhook se firma con HMAC-SHA256 en la cabecera `X-Signature`. Todos los
envíos quedan registrados en `NotificationLog` con su estado y su error.

---

## Seguridad

- **SSRF**: toda petición saliente pasa por `src/lib/net.ts`, que resuelve el DNS
  y rechaza IPs privadas, de loopback y de enlace local, **en cada redirección**.
- **XSS**: el JSON-LD escapa `<` como `\u003c`.
- **CSRF**: las Server Actions validan el origen y exigen cookie de sesión.
- **Privacidad**: `src/lib/privacy.ts` elimina matrículas, teléfonos, documentos
  y correos antes de guardar. La ubicación se desplaza entre 400 y 900 m.
- **Secrets**: sin valores por defecto. Si falta `ADMIN_PASSWORD`, el panel no
  arranca.

### 🔴 Credenciales que estaban expuestas

El repositorio contiene contraseñas en texto plano en tres servidores
(`render-server.js`, `server.js`, `static-server.js`), en `usuarios.json` y en
`.env`, con emails reales. `usuarios.json` además **no estaba en `.gitignore`**.

**Si alguna se usó en un entorno público, cámbiala ahora.** Si el repositorio de
GitHub es público, esas credenciales están indexadas aunque se borren del código
actual: el historial las conserva.

---

## Despliegue en Render

El `render.yaml` crea el Postgres, el servicio web y las variables. Opciones de
interfaz: Blueprint.

Dos detalles que importan:

- **El disco de Render es efímero.** Por eso el proyecto usa PostgreSQL y no
  SQLite.
- **`NEXT_PUBLIC_SITE_URL` se lee en tiempo de compilación** y queda fijada en el
  bundle. Si el `buildArg` no coincide con la variable de entorno, el canonical y
  las tarjetas sociales muestren la URL de compilación.

Imagen: tres etapas en el `Dockerfile`. La final corre como usuario sin
privilegios y comprueba su salud contra `/api/health`.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo |
| `npm run build` | Compila para producción |
| `npm start` | Arranca el build |
| `npm run typecheck` | TypeScript sin emitir |
| `npm test` | Pruebas de lógica y de endpoints |
| `npm run db:migrate` | Aplica migraciones |
| `npm run db:seed` | Carga los municipios |
| `npm run monitor:once` | Un ciclo de detección |
| `npm run monitor:once -- --check-feeds` | Comprueba las fuentes |
| `npm run monitor:once -- --stats` | Estado del sistema |

---

## Endpoints

| Ruta | Método | Para qué |
|---|---|---|
| `/api/cron/monitor` | GET, POST | Dispara un ciclo. Requiere `CRON_SECRET` |
| `/api/ingest` | POST | Ingesta manual. Requiere `CRON_SECRET` |
| `/api/health` | GET | Sonda de salud. 503 si la base de datos no responde |
| `/feed.xml` | GET | RSS de las noticias publicadas |
| `/sitemap.xml` | GET | Sitemap |
| `/robots.txt` | GET | Reglas para buscadores |
| `/api/accidents` | GET | API pública, solo publicadas |

---

## Estructura

```
prisma/
  schema.prisma              Esquema PostgreSQL
  migrations/                Migraciones versionadas
  seed.ts                    Solo municipios, no noticias
src/
  app/
    admin/                   Panel de administración
    api/cron/monitor/        Endpoint del ciclo
    api/ingest/              Endpoint de ingesta
    api/health/              Sonda de salud
    feed.xml/                RSS
  lib/
    env.ts                   Configuración validada
    net.ts                   Cliente HTTP con protección SSRF
    cron-auth.ts             Autenticación en tiempo constante
    rss.ts                   Parser RSS/Atom
    extract.ts               Extracción del artículo
    facts.ts                 Municipio, carretera, cifras, categoría
    dates.ts                 Fechas y Atlantic/Canary
    verify.ts                Puntuaciones y estados
    dedupe.ts                Detección y fusión de duplicados
    text.ts                  Hashing, SimHash, similitud
    images.ts                Descarga, WebP y variantes
    monitor.ts               Ciclo de detección
    ingest.ts                Orquestación de una noticia
    notify.ts                Email, Telegram, Discord, webhook
    jsonld.ts                Datos estructurados
    privacy.ts               Datos personales
    ai/                      OpenRouter y reescritura
  worker/
    run-cycle.ts             Ciclo manual y comprobación de fuentes
tests/
  logic.ts                   Pruebas de la lógica del pipeline
  endpoints.ts               Pruebas de seguridad de los endpoints
```

---

## Notas de mantenimiento

**Atlantic/Canary, no Europe/Madrid.** Las Canarias van una hora por detrás de
la península en invierno. Sumar una hora fija desplaza las fechas durante siete
meses al año.

**Nunca un valor por defecto en un secreto.** Si falta una variable obligatoria,
el sistema falla con un mensaje claro en lugar de arrancar con una configuración
insegura.

**Verificado no es publicado.** Cualquier vía que publique sin intervención
humana es un error de diseño, no una funcionalidad.
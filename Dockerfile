// syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Imagen de produccion. Dos etapas: la de compilacion lleva Node completo con
# las dependencias de desarrollo, la final solo lo necesario para ejecutar.
#
# ElNext.js necesita `sharp` para servir imagenes optimizadas, y la version
# precompilada se selecciona con la plataforma de destino (linuxmusl en Alpine).
# ---------------------------------------------------------------------------

# ----------------------------- Etapa 1: dependencias -------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Se copia solo el manifiesto primero: mientras este no cambie, la capa de
# node_modules se reutiliza de la cache y `npm ci` no se repite en cada build.
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# --------------------------- Etapa 2: compilacion ---------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables que Next.js lee EN TIEMPO DE COMPILACION y que quedan fijadas en el
# bundle. Si faltan, Next sustituye `undefined` y el HTML saldra con URLs
# "undefined/accidentes/...". Por eso se inyectan como ARG de build y hay que
# pasarlas con `--build-arg` en el despliegue.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# El esquema se genera aqui: si falta, el build falla con un error claro en vez
# de generar un cliente que no coincide con la base de datos de produccion.
RUN npx prisma generate
RUN npm run build

# --------------------------- Etapa 3: ejecucion ----------------------------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl curl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=10000
ENV TZ=Atlantic/Canary
# En Alpine, el heap de Node es pequeno por defecto y Next puede quedarse sin
# memoria en la compilacion de paginas grandes.
ENV NODE_OPTIONS=--max-old-space-size=2048

# Usuario sin privilegios. La imagen base incluye el grupo `node` con uid 1000.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Prisma necesita el motor en el sistema.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/@img ./node_modules/@img
COPY --from=builder /app/node_modules/next ./node_modules/next
COPY --from=builder /app/node_modules/react ./node_modules/react
COPY --from=builder /app/node_modules/react-dom ./node_modules/react-dom

# El cliente generado por Prisma.
COPY --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client
# Prisma 6+ genera el cliente en una carpeta propia; se copia la aplicacion ya
# compilada (.next), el manifiesto y los ficheros de esquema y migracion, que
# hacen falta para `migrate deploy` en el arranque.
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/zod ./node_modules/zod
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/cheerio ./node_modules/cheerio
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/fast-xml-parser ./node_modules/fast-xml-parser
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/nodemailer ./node_modules/nodemailer
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/domhandler ./node_modules/domhandler
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/domutils ./node_modules/domutils
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dom-serializer ./node_modules/dom-serializer
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/undici ./node_modules/undici
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/whatwg-url ./node_modules/whatwg-url
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/parse5 ./node_modules/parse5
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/parse5-parser-stream ./node_modules/parse5-parser-stream
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/parse5-htmlparser2-tree-adapter ./node_modules/parse5-htmlparser2-tree-adapter
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/htmlparser2 ./node_modules/htmlparser2
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/encoding-sniffer ./node_modules/encoding-sniffer
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/iconv-lite ./node_modules/iconv-lite
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/entities ./node_modules/entities
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/css-select ./node_modules/css-select
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/domutils ./node_modules/domutils
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/boolbase ./node_modules/boolbase
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/css-what ./node_modules/css-what
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/domhandler ./node_modules/domhandler
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv

# Las imagenes procesadas. Es el unico directorio donde la app escribe en
# tiempo de ejecucion: sin el, `processImage` fallaria con ENOENT.
RUN mkdir -p /app/public/media && chown -R nextjs:nodejs /app/public/media

USER nextjs

EXPOSE 10000

# Sonda de salud. Render usa esta ruta para saber si la instancia sirve: si
# devuelve 503 porque la base de datos no contesta, Render la reinicia.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:10000/api/health || exit 1

CMD ["npm", "run", "start"]
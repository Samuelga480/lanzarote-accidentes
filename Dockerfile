# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Imagen de produccion en tres etapas.
#
# 1. deps     -> node_modules de compilacion (con devDependencies)
# 2. builder  -> compila Next.js
# 3. runner   -> solo dependencias de produccion + el build
#
# La version anterior copiaba a mano unas 25 carpetas de node_modules para
# adelgazar la imagen. Era un error: cheerio y sus dependencias transitivas
# (domhandler, parse5, htmlparser2, encoding-sniffer, whatwg-url, undici...)
# cambian entre versiones, y olvidar una sola daba un error MODULE_NOT_FOUND
# en produccion que no se detecta hasta el arranque. Ahora se instala de verdad
# con `npm ci --omit=dev`, que garantiza el arbol completo.
# ---------------------------------------------------------------------------

# ----------------------------- Etapa 1: dependencias -------------------------
FROM node:22-alpine AS deps
# libc6-compat y openssl los necesita Prisma para el motor nativo.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Se copia solo el manifiesto: mientras no cambie, la capa se reutiliza de la
# cache y `npm ci` no se repite en cada build.
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# --------------------------- Etapa 2: compilacion ---------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_SITE_URL se lee EN TIEMPO DE COMPILACION y queda fijada dentro del
# bundle de JavaScript. Si falta, Next la sustituye por undefined y el HTML
# sale con URLs "undefined/accidentes/...". Por eso es un ARG de build: hay que
# pasarlo con `--build-arg` desde render.yaml.
ARG NEXT_PUBLIC_SITE_URL=https://ejemplo.com
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# El cliente de Prisma se genera en la plataforma de destino. Si se generase en
# la maquina que construye (otso SO), el motor nativo no funcionaria en Alpine.
RUN npx prisma generate
RUN npm run build

# --------------------- Etapa 3: dependencias de produccion ------------------
FROM node:22-alpine AS prod-deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* ./
# Sin devDependencies: la imagen final no lleva TypeScript, prisma CLI ni el
# compilador de esbuild, que no hacen falta para ejecutar.
RUN npm ci --omit=dev

# --------------------------- Etapa 4: ejecucion ----------------------------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl curl tini
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=10000
# Atlantic/Canary, no Europe/Madrid: en invierno las Canarias van una hora por
# detras de la peninsula, y usar la zona equivocada desplaza las fechas.
ENV TZ=Atlantic/Canary
# En Alpine el heap de Node es pequeño por defecto y Next puede quedarse sin
# memoria al servir imagenes grandes.
ENV NODE_OPTIONS=--max-old-space-size=2048

# Usuario sin privilegios. uid 1001 para no chocar con el grupo node (1000).
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Arbol de dependencias COMPLETO de produccion.
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# El cliente de Prisma generado para esta plataforma. Va DESPUES de copiar
# node_modules para que no se sobrescriba con la copia generica.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

# La aplicacion compilada y lo necesario para ejecutar las migraciones.
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# public/media es el unico directorio donde la app escribe en ejecucion. Si no
# existe, processImage falla con ENOENT al intentar guardar la primera imagen.
RUN mkdir -p /app/public/media && chown -R nextjs:nodejs /app/public/media

USER nextjs

EXPOSE 10000

# Sonda de salud. Render la usa para saber si la instancia sirve.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:10000/api/health || exit 1

# tini como init: recoge los procesos zombis y reparte las senales. Sin el, un
# Ctrl-C o un SIGTERM de Render no llega al proceso de Node y la instancia
# tarda mas en apagarse.
ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
#!/bin/sh
# ---------------------------------------------------------------------------
# Punto de entrada del contenedor.
#
# POR QUE ESTE FICHERO EXISTE
#
# `next start` arranca el servidor pero NO crea las tablas de la base de datos.
# En el primer despliegue, la base de datos esta vacia: el build terminaria
# bien, el contenedor arrancaria bien, y la primera consulta de Prisma fallaria
# con "relation Accident does not exist". La web devolveria 500 en todas las
# paginas y el health check empezaria a fallar, con lo que Render reiniciaria
# el contenedor en bucle sin explicar nada.
#
# Asi que antes de arrancar el servidor se aplican las migraciones pendientes.
# `prisma migrate deploy` es idempotente: lee la tabla _prisma_migrations, solo
# aplica lo que falta y no hace nada si ya esta todo al dia. Se puede ejecutar
# en cada arranque sin riesgo.
#
# La migracion NO se ejecuta en la etapa de build a proposito: el build ocurre
# en un contenedor efimero sin acceso de red a la base de datos de produccion.
# ---------------------------------------------------------------------------

set -e

echo "[entrada] aplicando migraciones pendientes..."

# Si la migracion falla, `set -e` detiene el arranque en vez de levantar un
# servidor que va a fallar en cada peticion. Un contenedor que muere es mucho
# mas facil de diagnosticar que uno que sirve errores.
if ! npx prisma migrate deploy; then
  echo ""
  echo "[entrada] ERROR: no se pudieron aplicar las migraciones."
  echo "[entrada] Comprueba que DATABASE_URL apunta a un PostgreSQL accesible"
  echo "[entrada] desde esta red y que las credenciales son correctas."
  exit 1
fi

echo "[entrada] migraciones al dia"

# Se ejecutan las semillas (los nueve municipios) solo si la tabla esta vacia.
# El propio seed comprueba antes de insertar, asi que es seguro repetirlo.
if [ "${RUN_SEED_ON_START:-false}" = "true" ]; then
  echo "[entrada] ejecutando seed (municipios)..."
  npx prisma db seed || echo "[entrada] aviso: el seed fallo, se continua"
fi

echo "[entrada] arrancando el servidor en el puerto ${PORT:-10000}"
exec "$@"
#!/usr/bin/env bash
# Prueba de los botones del panel contra el servidor de desarrollo.
# No forma parte del proyecto: es una comprobacion puntual.

set -u
BASE="http://localhost:3111"
# cookie de sesion de panel firmada con ADMIN_SESSION_SECRET del .env
COOKIE="lz_admin_session=admin:1790937858070.ff6589a4c0d5fa8de99bf5c4e5db68aa7097266eb1bc28675010cc88a29c3a1f"

post() {
  curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
    -X POST "$BASE$1" -H "Cookie: $COOKIE" --data-urlencode "id=$2" "${@:3}"
}

echo "== boton Aprobar (estado por defecto PUBLISHED) =="
post /admin/aprobar "$ID"

echo "== boton Rechazar (estado=REJECTED) =="
post /admin/aprobar "$ID" --data-urlencode "estado=REJECTED"

echo "== boton Aprobar de nuevo =="
post /admin/aprobar "$ID"

echo "== estado en la base de datos =="
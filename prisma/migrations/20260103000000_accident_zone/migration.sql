-- ============================================================================
--  Zona de la noticia
--
--  La isla se divide en siete municipios, pero la prensa escribe de otros
--  nombres: "Costa Teguise", "Puerto del Carmen", "Playa Blanca". Hasta ahora
--  esas localidades se reconocian solo mientras duraba la deteccion y se
--  perdian al guardar, de modo que no habia forma de filtrar por ellas ni de
--  hacer una pagina por zona.
--
--  La columna guarda el slug de la zona (ver ZONES en src/lib/constants.ts) y no
--  su nombre: renombrar una zona despues no obliga a reescribir las noticias.
--
--  Va con indice propio porque las consultas de /zonas filtran por (zone, status)
--  y sin el serian un escaneo de la tabla.
--
--  La columna es nullable a proposito: la mayoria de las noticias no nombran una
--  localidad concreta, solo el municipio, y no hay que forzar un valor.
-- ============================================================================

ALTER TABLE "Accident" ADD COLUMN "zone" TEXT;

CREATE INDEX "Accident_zone_status_idx" ON "Accident"("zone", "status");
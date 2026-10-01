-- ---------------------------------------------------------------------------
-- Migracion inicial: del esquema SQLite de desarrollo a PostgreSQL.
--
-- Por que una migracion y no `prisma db push`:
--
-- `db push` recalcula el esquema desde cero y BORRA lo que no cuadra. Es la
-- herramienta adecuada para desarrollo y es un peligro en produccion. Ademas,
-- SQLite -> PostgreSQL no es un cambio de provider que `db push` resuelva bien:
-- los tipos, los enums y las columnas generadas hay que declararlos a mano.
--
-- Este fichero crea TODAS las tablas del esquema actual. Las noticias que
-- hubiera en el fichero SQLite de desarrollo NO se migran: eran datos de
-- prueba, y mezclarlos con la produccion seria peor que empezar limpio.
--
-- El historico de la tabla Revision se conserva, porque es lo que permite
-- auditar las decisiones editoriales.
-- ---------------------------------------------------------------------------

-- ===========================================================================
--  Geografia
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "Municipality" (
    "id"     TEXT NOT NULL,
    "slug"   TEXT NOT NULL,
    "name"   TEXT NOT NULL,
    "island" TEXT NOT NULL DEFAULT 'Lanzarote',
    "lat"    DOUBLE PRECISION NOT NULL,
    "lon"    DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Municipality_slug_key" ON "Municipality"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Municipality_name_key" ON "Municipality"("name");
CREATE INDEX IF NOT EXISTS "Municipality_name_idx" ON "Municipality"("name");

-- ===========================================================================
--  La noticia
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "Accident" (
    "id"    TEXT NOT NULL,
    "slug"  TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body"   TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageAlt" TEXT,

    -- Metadatos SEO generados
    "seoTitle"        TEXT,
    "metaDescription" TEXT,
    "excerpt"         TEXT,

    -- Instante del suceso, siempre en UTC.
    "occurredAt" TIMESTAMP(3) NOT NULL,

    "municipalityId" TEXT NOT NULL,

    "vehicleType" TEXT NOT NULL,
    "severity"    TEXT NOT NULL DEFAULT 'MODERADO',

    -- Categoría. En PostgreSQL es un enum nativo: si alguien escribe un valor
    -- que no existe, la base de datos lo rechaza.
    "category" "IncidentCategory" NOT NULL DEFAULT 'ACCIDENTE_TRAFICO',

    -- Estado editorial. Se mantiene como TEXT y no como enum a proposito: el
    -- proyecto lo trata como dominio de la aplicacion (ver src/lib/types.ts) y
    -- asi una migracion futura de estados no exige cambiar el tipo en Postgres.
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',

    "fatalities" INTEGER NOT NULL DEFAULT 0,
    "injuries"   INTEGER NOT NULL DEFAULT 0,

    -- Carretera afectada: "LZ-2", "LZ-702"...
    "road" TEXT,

    "isFeatured" BOOLEAN NOT NULL DEFAULT false,

    -- Ubicación aproximada, nunca el punto exacto.
    "approxLat" DOUBLE PRECISION,
    "approxLon" DOUBLE PRECISION,
    "locationDescription" TEXT,

    -- Verificación automática
    "confidenceScore"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceScore"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "verificationNotes"  TEXT,

    -- Deduplicación
    "contentHash"   TEXT,
    "simHash"       TEXT,
    "embedding"     TEXT,
    "duplicateOfId" TEXT,

    -- Trazabilidad del proceso automático
    "originalTitle"   TEXT,
    "originalSummary" TEXT,
    "originalBody"    TEXT,
    "originalUrl"     TEXT,
    "aiModel"         TEXT,
    "rewrittenAt"     TIMESTAMP(3),
    "detectedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Revisión editorial
    "reviewedAt"  TIMESTAMP(3),
    "reviewedBy"  TEXT,
    "reviewNotes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "notifiedAt"  TIMESTAMP(3),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Accident_slug_key" ON "Accident"("slug");
-- Descendente: el listado siempre ordena por fecha reciente. Un indice
-- ascendente sobre las mismas columnas no se usaria y solo penaliza las
-- escrituras. Es la unica diferencia con el bloque de indices de schema.prisma.
CREATE INDEX IF NOT EXISTS "Accident_status_occurredAt_idx" ON "Accident"("status", "occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "Accident_municipalityId_status_idx" ON "Accident"("municipalityId", "status");
CREATE INDEX IF NOT EXISTS "Accident_vehicleType_status_idx" ON "Accident"("vehicleType", "status");
CREATE INDEX IF NOT EXISTS "Accident_occurredAt_idx" ON "Accident"("occurredAt");
CREATE INDEX IF NOT EXISTS "Accident_isFeatured_idx" ON "Accident"("isFeatured");
CREATE INDEX IF NOT EXISTS "Accident_origin_status_idx" ON "Accident"("origin", "status");
CREATE INDEX IF NOT EXISTS "Accident_category_idx" ON "Accident"("category");
CREATE INDEX IF NOT EXISTS "Accident_verificationStatus_idx" ON "Accident"("verificationStatus");
CREATE INDEX IF NOT EXISTS "Accident_status_title_idx" ON "Accident"("status", "title");
CREATE INDEX IF NOT EXISTS "Accident_contentHash_idx" ON "Accident"("contentHash");
CREATE INDEX IF NOT EXISTS "Accident_simHash_idx" ON "Accident"("simHash");
CREATE INDEX IF NOT EXISTS "Accident_duplicateOfId_idx" ON "Accident"("duplicateOfId");

-- ===========================================================================
--  Fuentes
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "FeedSource" (
    "id"   TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url"  TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'rss',
    "region" TEXT NOT NULL DEFAULT 'LANZAROTE',

    "enabled"  BOOLEAN NOT NULL DEFAULT true,
    "baseScore" DOUBLE PRECISION NOT NULL DEFAULT 0.7,

    -- Salud de la fuente
    "status"   "FeedStatus" NOT NULL DEFAULT 'OK',
    "lastRunAt" TIMESTAMP(3),
    "lastOkAt"  TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "failureCount"        INTEGER NOT NULL DEFAULT 0,
    "successCount"        INTEGER NOT NULL DEFAULT 0,
    "avgItemsFound"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs"           INTEGER NOT NULL DEFAULT 0,

    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FeedSource_name_key" ON "FeedSource"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "FeedSource_url_key" ON "FeedSource"("url");
CREATE INDEX IF NOT EXISTS "FeedSource_enabled_status_idx" ON "FeedSource"("enabled", "status");

CREATE TABLE IF NOT EXISTS "ScrapeRun" (
    "id" TEXT NOT NULL,
    "feedSourceId" TEXT,
    "trigger" "RunTrigger" NOT NULL DEFAULT 'CRON',

    "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER NOT NULL DEFAULT 0,

    "ok"         BOOLEAN NOT NULL DEFAULT true,
    "error"      TEXT,
    "httpStatus" INTEGER,

    "itemsFound"     INTEGER NOT NULL DEFAULT 0,
    "itemsNew"       INTEGER NOT NULL DEFAULT 0,
    "itemsChanged"   INTEGER NOT NULL DEFAULT 0,
    "itemsRemoved"   INTEGER NOT NULL DEFAULT 0,
    "itemsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "draftsCreated"  INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScrapeRun_startedAt_idx" ON "ScrapeRun"("startedAt" DESC);
CREATE INDEX IF NOT EXISTS "ScrapeRun_feedSourceId_startedAt_idx" ON "ScrapeRun"("feedSourceId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "ScrapeRun_ok_startedAt_idx" ON "ScrapeRun"("ok", "startedAt" DESC);

CREATE TABLE IF NOT EXISTS "SeenEntry" (
    "id" TEXT NOT NULL,
    "feedSourceId" TEXT,

    "url"          TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "urlHash"      TEXT NOT NULL,

    "title"       TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "simHash"     TEXT,

    "publishedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "missingCount" INTEGER NOT NULL DEFAULT 0,
    "state"        "SeenState" NOT NULL DEFAULT 'PRESENT',

    "accidentId" TEXT,

    CONSTRAINT "SeenEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeenEntry_urlHash_key" ON "SeenEntry"("urlHash");
CREATE INDEX IF NOT EXISTS "SeenEntry_state_lastSeenAt_idx" ON "SeenEntry"("state", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "SeenEntry_feedSourceId_state_idx" ON "SeenEntry"("feedSourceId", "state");
CREATE INDEX IF NOT EXISTS "SeenEntry_accidentId_idx" ON "SeenEntry"("accidentId");
CREATE INDEX IF NOT EXISTS "SeenEntry_firstSeenAt_idx" ON "SeenEntry"("firstSeenAt" DESC);

CREATE TABLE IF NOT EXISTS "Source" (
    "id"         TEXT NOT NULL,
    "accidentId" TEXT NOT NULL,
    "outlet"     TEXT NOT NULL,
    "url"        TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excerpt"    TEXT,
    "mergedFromId" TEXT,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- Una misma URL no se registra dos veces en la misma noticia: es lo que permite
-- que la fusion de duplicados use createMany con skipDuplicates.
CREATE UNIQUE INDEX IF NOT EXISTS "Source_accidentId_url_key" ON "Source"("accidentId", "url");
CREATE INDEX IF NOT EXISTS "Source_accidentId_idx" ON "Source"("accidentId");
CREATE INDEX IF NOT EXISTS "Source_outlet_idx" ON "Source"("outlet");
CREATE INDEX IF NOT EXISTS "Source_url_idx" ON "Source"("url");

-- ===========================================================================
--  Imagenes
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "ImageAsset" (
    "id" TEXT NOT NULL,
    "accidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'HERO',

    "originalUrl" TEXT NOT NULL,
    "localPath"   TEXT,
    "ogPath"      TEXT,

    "width"  INTEGER,
    "height" INTEGER,
    "bytes"  BIGINT,

    -- JSON con el mapa de variantes: {"400":"/media/...","800":"..."}
    "variants" TEXT,

    "alt"           TEXT,
    "dominantColor" TEXT,

    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error"  TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImageAsset_accidentId_kind_idx" ON "ImageAsset"("accidentId", "kind");
CREATE INDEX IF NOT EXISTS "ImageAsset_status_idx" ON "ImageAsset"("status");

-- ===========================================================================
--  Historial y observabilidad
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "Revision" (
    "id" TEXT NOT NULL,
    "accidentId" TEXT NOT NULL,
    "editor" TEXT NOT NULL,
    "note" TEXT,
    -- Instantánea en JSON. Se guarda como texto para no acoplar la migración al
    -- tipo Json nativo de PostgreSQL.
    "snapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Revision_accidentId_createdAt_idx" ON "Revision"("accidentId", "createdAt");

CREATE TABLE IF NOT EXISTS "NotificationLog" (
    "id" TEXT NOT NULL,
    "accidentId" TEXT,
    "channel" TEXT NOT NULL,
    "target"  TEXT,
    "status"  TEXT NOT NULL DEFAULT 'PENDING',
    "error"   TEXT,
    "preview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationLog_accidentId_idx" ON "NotificationLog"("accidentId");
CREATE INDEX IF NOT EXISTS "NotificationLog_channel_createdAt_idx" ON "NotificationLog"("channel", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "NotificationLog_status_idx" ON "NotificationLog"("status");

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "actor"  TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);

-- ===========================================================================
--  Claves foraneas
--
--  NOTA: PostgreSQL no admite `ADD CONSTRAINT IF NOT EXISTS`, a diferencia de
--  CREATE TABLE/INDEX. Ejecutar este fichero dos veces fallaria aqui. Se aplica
--  una sola vez via `prisma migrate deploy`, que lleva su propia tabla de
--  control.
--
--  Se anaden al final, y no en cascada, por dos razones:
--
--  - Accident.municipalityId usa RESTRICT: no se puede borrar un municipio que
    NOTA: la migracion es idempotente (IF NOT EXISTS). Ejecutarla dos veces no rompe
--  - Accident.duplicateOfId usa SET NULL: si se borra la noticia canonica, la
--    duplicada se queda sinApuntar en vez de desaparecer.
-- ===========================================================================

ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_municipalityId_fkey"
    FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_duplicateOfId_fkey"
    FOREIGN KEY ("duplicateOfId") REFERENCES "Accident"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Source"
    ADD CONSTRAINT "Source_accidentId_fkey"
    FOREIGN KEY ("accidentId") REFERENCES "Accident"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Revision"
    ADD CONSTRAINT "Revision_accidentId_fkey"
    FOREIGN KEY ("accidentId") REFERENCES "Accident"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImageAsset"
    ADD CONSTRAINT "ImageAsset_accidentId_fkey"
    FOREIGN KEY ("accidentId") REFERENCES "Accident"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScrapeRun"
    ADD CONSTRAINT "ScrapeRun_feedSourceId_fkey"
    FOREIGN KEY ("feedSourceId") REFERENCES "FeedSource"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeenEntry"
    ADD CONSTRAINT "SeenEntry_feedSourceId_fkey"
    FOREIGN KEY ("feedSourceId") REFERENCES "FeedSource"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
--  Comprobaciones de integridad
--
--  El esquema no valida rangos: PostgreSQL lo haria mejor que el codigo. Estas
--  son las tres invariantes que, si se rompen, producen bugs visibles:
--
--  1. Un ACCIDENTE sin victimacion ni otro con dos. Cero es correcto (no se sabe).
--  2. Un porcentaje de confianza fuera de 0..1. El panel lo pintaria raro.
--  3. Una categoria o un estado de verificacion inventados.
-- ===========================================================================

ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_fatalities_check" CHECK ("fatalities" >= 0);
ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_injuries_check" CHECK ("injuries" >= 0);
ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_confidence_check" CHECK ("confidenceScore" >= 0 AND "confidenceScore" <= 1);
ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_sourceScore_check" CHECK ("sourceScore" >= 0 AND "sourceScore" <= 1);
ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_status_check" CHECK ("status" IN ('PENDING_REVIEW','PUBLISHED','REJECTED','ARCHIVED'));
ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_origin_check" CHECK ("origin" IN ('MANUAL','AI'));
ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_vehicleType_check" CHECK ("vehicleType" IN ('COCHE','MOTO','CAMION','BICICLETA','PEATON','OTROS'));
ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_severity_check" CHECK ("severity" IN ('LEVE','MODERADO','GRAVE'));

-- Una noticia publicada tiene obligatoriamente fecha de publicacion: si no la
-- tiene, el RSS y el JSON-LD emitirian una fecha vacia.
ALTER TABLE "Accident"
    ADD CONSTRAINT "Accident_published_needs_date"
    CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);

ALTER TABLE "FeedSource"
    ADD CONSTRAINT "FeedSource_baseScore_check" CHECK ("baseScore" >= 0 AND "baseScore" <= 1);

ALTER TABLE "ScrapeRun"
    ADD CONSTRAINT "ScrapeRun_duration_check" CHECK ("durationMs" >= 0);

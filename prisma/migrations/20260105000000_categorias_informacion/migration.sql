-- ============================================================================
--  Nuevas categorias: la informacion de la isla deja de ser un accidente
-- ============================================================================
--
-- Que pasa y por que
--
-- El sitio tiene dos cosas mezcladas en la MISMA columna `category`: los
-- accidentes de trafico y la actualidad de la isla. Los segundos no cabian en
-- ningun valor del enum, asi que el pipeline caia a su valor por defecto
-- (ACCIDENTE_TRAFICO) y acababa marcando como "Accidente" cosas que no lo son:
-- un partido de balonmano, un horoscopo, una serie de television o una nota de
-- prensa de Madrid. No era un fallo de clasificacion, era un fallo deTAXONOMIA:
-- no existia un sitio donde meterlas.
--
-- Esta migracion anade los tipos que faltan. No cambia ningun dato: solo amplia
-- el conjunto de valores posibles. La reclasificacion de lo ya publicado se
-- hace despues, con scripts/reclasificar.ts, que deja constancia de cada cambio
-- en el log de auditoria.
--
-- DECISION: SOLO SE ANADEN VALORES, NO SE CAMBIA NINGUNO
--
-- El enum de Postgres no permite quitar valores que ya se usan. Si mas adelante
-- se decide fusionar dos categorias, habria que convertir la columna a texto
-- plano. Por eso esta migracion es aditiva y no destructiva: es la unica
-- operacion que se puede deshacer con la certeza de no perder noticias.
--
-- El agrupamiento en "sucesos" e "informacion" no se guarda en la base de datos.
-- Vive en src/lib/categorias.ts, derivado de la lista, para que cambiar el
-- reparto de un tipo a otro no obligue a migrar otra vez.
--
-- Como anadir un valor al enum
--
--   ALTER TYPE "IncidentCategory" ADD VALUE 'NOMBRE_NUEVO';
--
-- Postgres no permite quitarlo despues. Pienselo dos veces antes de anadir uno.
--
-- ============================================================================

-- --- Informacion: politics e instituciones ---
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'POLITICA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'INSTITUCIONES';

-- --- Informacion: economy, work and business ---
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'ECONOMIA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'EMPLEO';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'EMPRESAS';

-- --- Informacion: servicios publicos ---
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'SERVICIOS';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'TRANSPORTE';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'AGUA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'ENERGIA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'RESIDUOS';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'URBANISMO';

-- --- Informacion: health, education and social ---
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'SANIDAD';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'EDUCACION';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'SOCIEDAD';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'VIVIENDA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'BIENESTAR_SOCIAL';

-- --- Informacion: culture, sport and leisure ---
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'CULTURA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'DEPORTES';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'TURISMO';

-- --- Informacion: environment, agriculture, sea, security ---
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'MEDIO_AMBIENTE';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'AGRICULTURA_GANADERIA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'PESCA_MAR';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'SEGURIDAD_CIUDADANA';

-- --- Informacion: science, technology, health and customs ---
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'CIENCIA_TECNOLOGIA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'SALUD_Y_BIENESTAR';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'TRAMITES_Y_SERVICIOS_CIUDADANO';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'FIESTAS_Y_TRADICIONES';

-- --- Informacion: weather, sea and other everyday life ---
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'METEOROLOGIA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'MAR';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'SUERTES_Y_OCIO';

-- --- Informacion: legal, judicial, religion, protocol ---
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'JURIDICO';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'RELIGION';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'ACTOS_PROTOCOLARIOS';

-- --- Informacion: culture, television and entertainment ---
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'TELEVISION_Y_ESPECTACULOS';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'GASTRONOMIA';
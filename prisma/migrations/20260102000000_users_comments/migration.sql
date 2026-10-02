-- ============================================================================
--  Usuarios y comentarios
--
--  El sitio original tenia registro de invitados, perfil y comentarios sobre
--  las noticias. Se recuperan con estas dos tablas.
--
--  Lo que NO se recupera es el metodo de autenticacion: el sitio estatico
--  guardaba las contrasenas en claro y devolvia un token fijo escrito en el
--  propio servidor ('lanzarote_admin_token_2026'). Aqui las contrasenas se
--  guardan como hash scrypt y la sesion va en cookie firmada.
-- ============================================================================

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'INVITADO');

CREATE TABLE "User" (
    "id"           TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name"         TEXT,
    "bio"          TEXT,
    "photoUrl"     TEXT,
    "role"         "UserRole" NOT NULL DEFAULT 'INVITADO',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comment" (
    "id"         TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    "userId"     TEXT NOT NULL,
    "accidentId" TEXT NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- El correo se busca en cada inicio de sesion y en cada alta. Sin este indice
-- es un recorrido secuencial de la tabla.
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");

-- Los comentarios de una noticia se leen ordenados por fecha, que es como los
-- pinta la pagina; el indice compuesto evita ordenar en memoria.
CREATE INDEX "Comment_accidentId_createdAt_idx" ON "Comment"("accidentId", "createdAt" DESC);
CREATE INDEX "Comment_userId_createdAt_idx" ON "Comment"("userId", "createdAt" DESC);

ALTER TABLE "Comment"
    ADD CONSTRAINT "Comment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment"
    ADD CONSTRAINT "Comment_accidentId_fkey"
    FOREIGN KEY ("accidentId") REFERENCES "Accident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un comentario no puede estar vacio ni ser solo espacios. Sin esta restriccion
-- la interfaz dejaria guardar entradas en blanco.
ALTER TABLE "Comment"
    ADD CONSTRAINT "Comment_body_not_blank"
    CHECK (length(btrim("body")) > 0);

ALTER TABLE "Comment"
    ADD CONSTRAINT "Comment_body_length"
    CHECK (length("body") <= 2000);

-- El correo se normaliza a minusculas y sin espacios antes de guardarse; esta
-- restriccion blinda el indice unico aunque alguien lo escriba a mano.
ALTER TABLE "User"
    ADD CONSTRAINT "User_email_lowercase"
    CHECK ("email" = lower(btrim("email")));

ALTER TABLE "User"
    ADD CONSTRAINT "User_email_format"
    CHECK ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- Limita el tamaño de los campos de texto libre del perfil.
ALTER TABLE "User"
    ADD CONSTRAINT "User_bio_length"
    CHECK ("bio" IS NULL OR length("bio") <= 1000);

ALTER TABLE "User"
    ADD CONSTRAINT "User_name_length"
    CHECK ("name" IS NULL OR length("name") <= 80);
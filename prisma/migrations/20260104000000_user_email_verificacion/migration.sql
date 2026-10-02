-- ============================================================================
--  Verificacion del correo de registro
--
--  Anade tres columnas a User:
--
--    emailVerifiedAt         momento en que se confirma la direccion. Es NULL
--                            en toda cuenta sin verificar.
--    verificationTokenHash   SHA-256 del token que se mando por correo. Se
--                            guarda el hash y no el token: si alguien lee la
--                            tabla puedeFabricar un enlace de confirmacion.
--    verificationSentAt      cuando se envio el ultimo correo, para no poder
--                            pedir otro sin parar (el reenvio es la via para
--                            que alguien te bombarde).
--
--  Las cuentas que ya existian quedan con emailVerifiedAt = NULL, es decir, sin
--  verificar. Es lo correcto: no hay forma de saber si esos correos eran
--  ciertos, y marcarlos como verificados sin probarlo seria mentir. Quien no
--  pueda volver a entrar puede pedir que se le reenvie el correo o que un
--  administrador se lo confirme desde consola.
-- ============================================================================

ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "verificationTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "verificationSentAt" TIMESTAMP(3);

-- El token se busca en cada confirmacion y en cada reenvio, y tiene que ser
-- unico: dos cuentas con el mismo token permitirian confirmar una con el
-- enlace de la otra.
CREATE UNIQUE INDEX "User_verificationTokenHash_key"
    ON "User"("verificationTokenHash");

-- Las cuentas sin verificar son las que se listan al buscar a quien reenviarle
-- el correo.
CREATE INDEX "User_emailVerifiedAt_idx" ON "User"("emailVerifiedAt");
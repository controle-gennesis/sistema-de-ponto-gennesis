-- Códigos de 6 dígitos (enviados por WhatsApp) para redefinir a senha pelo telefone.
-- Guarda só o hash do código; `attempts` limita tentativas erradas por código.
CREATE TABLE IF NOT EXISTS "password_reset_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "password_reset_codes_userId_idx" ON "password_reset_codes"("userId");

-- Endereço da obra (opcional). Idempotente.
ALTER TABLE "obras" ADD COLUMN IF NOT EXISTS "address" TEXT;

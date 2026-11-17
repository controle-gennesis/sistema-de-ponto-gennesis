-- OS (SE e Pasta) escolhida ao criar o diario de obra. Idempotente.
ALTER TABLE "diarios_obra" ADD COLUMN IF NOT EXISTS "osDivSe" TEXT;
ALTER TABLE "diarios_obra" ADD COLUMN IF NOT EXISTS "osFolder" TEXT;

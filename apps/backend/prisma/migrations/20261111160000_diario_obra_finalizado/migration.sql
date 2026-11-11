-- Diário de Obra: finalizar o RDO (trava a edição até reabrir)
ALTER TABLE "diarios_obra" ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMP(3);
ALTER TABLE "diarios_obra" ADD COLUMN IF NOT EXISTS "finalizedById" TEXT;

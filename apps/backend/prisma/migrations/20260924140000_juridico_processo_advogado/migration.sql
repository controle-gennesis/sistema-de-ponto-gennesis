-- Advogado do processo jurídico (funcionário).
ALTER TABLE "juridico_processos" ADD COLUMN IF NOT EXISTS "advogadoId" TEXT;
ALTER TABLE "juridico_processos" ADD COLUMN IF NOT EXISTS "advogado" TEXT;

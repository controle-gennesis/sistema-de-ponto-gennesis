-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensurePncpNumeroCompraColumn().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "pncp_contratacoes"
      ADD COLUMN IF NOT EXISTS "numeroCompra" TEXT;

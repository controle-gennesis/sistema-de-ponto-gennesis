-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureFinancialControlApplicationTypeColumn().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "financial_control_entries"
        ADD COLUMN IF NOT EXISTS "applicationType" TEXT;

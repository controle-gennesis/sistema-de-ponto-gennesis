-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureFinancialControlLancadoStatus().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

DO $$
    BEGIN
      ALTER TYPE "FinancialControlStatus" ADD VALUE 'LANCADO';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

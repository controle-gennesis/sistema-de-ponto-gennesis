-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureDpRequestTypeAdmAsos().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

DO $$
    BEGIN
      ALTER TYPE "DpRequestType" ADD VALUE 'ADM_ASOS';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureContractBillingImportWithoutOsPleito().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "allowBillingImportWithoutOsPleito" BOOLEAN NOT NULL DEFAULT false;

UPDATE "contracts"
    SET "allowBillingImportWithoutOsPleito" = true
    WHERE
      upper("name") LIKE '%CONFEA%508%'
      OR upper("name") LIKE '%CONFEA%516%'
      OR upper("name") LIKE '%CONIFA%508%'
      OR upper("name") LIKE '%CONIFA%516%'
      OR upper(coalesce("number", '')) LIKE '%CONFEA%508%'
      OR upper(coalesce("number", '')) LIKE '%CONFEA%516%';

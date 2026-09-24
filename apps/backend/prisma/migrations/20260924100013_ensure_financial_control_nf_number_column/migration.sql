-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureFinancialControlNfNumberColumn().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "financial_control_entries" ADD COLUMN IF NOT EXISTS "nfNumber" TEXT;

UPDATE "financial_control_entries"
    SET
      "nfNumber" = substring("parcelNumber" from '^(\\d+)-\\d+/\\d+$'),
      "parcelNumber" = substring("parcelNumber" from '^\\d+-(\\d+/\\d+)$')
    WHERE "nfNumber" IS NULL
      AND "parcelNumber" IS NOT NULL
      AND "parcelNumber" ~ '^\\d+-\\d+/\\d+$';

UPDATE "financial_control_entries"
    SET
      "nfNumber" = substring("parcelNumber" from '^(\\d+)-\\d{1,3}$'),
      "parcelNumber" = substring("parcelNumber" from '^\\d+-(\\d{1,3})$')
    WHERE "nfNumber" IS NULL
      AND "parcelNumber" IS NOT NULL
      AND "parcelNumber" ~ '^\\d+-\\d{1,3}$';

UPDATE "financial_control_entries"
    SET
      "nfNumber" = "parcelNumber",
      "parcelNumber" = NULL
    WHERE "nfNumber" IS NULL
      AND "parcelNumber" IS NOT NULL
      AND "parcelNumber" !~ '^\\d+/\\d+$';

UPDATE "financial_control_entries"
    SET
      "nfNumber" = "nfNumber" || '-' || "parcelNumber",
      "parcelNumber" = NULL
    WHERE "nfNumber" IS NOT NULL
      AND "parcelNumber" IS NOT NULL
      AND "nfNumber" !~ '^\\d+$'
      AND "parcelNumber" ~ '^\\d+$'
      AND "parcelNumber" !~ '/';

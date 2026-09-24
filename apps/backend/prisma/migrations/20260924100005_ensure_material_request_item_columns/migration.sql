-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureMaterialRequestItemColumns().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "material_request_items"
        ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT,
        ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;

ALTER TABLE "material_request_items"
        ADD COLUMN IF NOT EXISTS "bankDetails" TEXT;

-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensurePurchaseOrderAttachmentsColumn().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "purchase_orders"
        ADD COLUMN IF NOT EXISTS "attachments" JSONB;

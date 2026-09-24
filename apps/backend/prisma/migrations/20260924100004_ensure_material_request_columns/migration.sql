-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureMaterialRequestColumns().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "serviceOrder" TEXT;

CREATE INDEX IF NOT EXISTS "material_requests_serviceOrder_idx" ON "material_requests"("serviceOrder");

ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "obra" TEXT;

ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "serviceOrderId" TEXT;

CREATE INDEX IF NOT EXISTS "material_requests_serviceOrderId_idx" ON "material_requests"("serviceOrderId");

DO $$
      BEGIN
        ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_serviceOrderId_fkey"
          FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

ALTER TABLE "material_requests"
        ADD COLUMN IF NOT EXISTS "demandSheet" TEXT,
        ADD COLUMN IF NOT EXISTS "demandSheetAttachmentUrl" TEXT,
        ADD COLUMN IF NOT EXISTS "demandSheetAttachmentName" TEXT;

ALTER TABLE "material_requests"
        ADD COLUMN IF NOT EXISTS "demandSheetAttachments" JSONB;

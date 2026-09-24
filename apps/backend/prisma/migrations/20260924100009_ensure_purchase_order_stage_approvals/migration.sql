-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensurePurchaseOrderStageApprovals().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "purchase_orders"
        ADD COLUMN IF NOT EXISTS "comprasApprovedBy" TEXT,
        ADD COLUMN IF NOT EXISTS "comprasApprovedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "gestorApprovedBy" TEXT,
        ADD COLUMN IF NOT EXISTS "gestorApprovedAt" TIMESTAMP(3);

DO $$
      BEGIN
        ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_comprasApprovedBy_fkey"
          FOREIGN KEY ("comprasApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

DO $$
      BEGIN
        ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_gestorApprovedBy_fkey"
          FOREIGN KEY ("gestorApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

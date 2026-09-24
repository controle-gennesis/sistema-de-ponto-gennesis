-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensurePurchaseOrderCommentsTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "purchase_order_comments" (
      "id" TEXT NOT NULL,
      "purchaseOrderId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "purchase_order_comments_pkey" PRIMARY KEY ("id")
    );

CREATE INDEX IF NOT EXISTS "purchase_order_comments_purchaseOrderId_idx"
      ON "purchase_order_comments"("purchaseOrderId");

CREATE INDEX IF NOT EXISTS "purchase_order_comments_userId_idx"
      ON "purchase_order_comments"("userId");

DO $$
BEGIN
  ALTER TABLE "purchase_order_comments"
    ADD CONSTRAINT "purchase_order_comments_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "purchase_order_comments"
    ADD CONSTRAINT "purchase_order_comments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

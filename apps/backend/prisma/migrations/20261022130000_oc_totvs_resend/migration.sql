-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "totvsResendOpenAt" TIMESTAMP(3);
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "totvsResendOpenBy" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "totvsPreviousMovs" JSONB;

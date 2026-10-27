ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "totvsFluxoDireto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "totvsSendError" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "totvsSendErrorAt" TIMESTAMP(3);

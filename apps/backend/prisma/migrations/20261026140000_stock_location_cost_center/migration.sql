ALTER TABLE "stock_locations" ADD COLUMN IF NOT EXISTS "costCenterId" TEXT;
CREATE INDEX IF NOT EXISTS "stock_locations_costCenterId_idx" ON "stock_locations"("costCenterId");

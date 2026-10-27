ALTER TABLE "contract_billings" ADD COLUMN IF NOT EXISTS "measurementCode" TEXT;
ALTER TABLE "contract_billings" ADD COLUMN IF NOT EXISTS "measurementStart" TIMESTAMP(3);
ALTER TABLE "contract_billings" ADD COLUMN IF NOT EXISTS "measurementEnd" TIMESTAMP(3);

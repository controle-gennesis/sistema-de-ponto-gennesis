ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "fuelQuotaUrgencyReais" DECIMAL(12,2);
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "fuelQuotaUrgencyWeekStart" TIMESTAMP(3);

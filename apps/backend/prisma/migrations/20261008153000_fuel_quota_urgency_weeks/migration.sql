CREATE TABLE IF NOT EXISTS "fuel_quota_urgency_weeks" (
  "contractId" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "amountReais" DECIMAL(12,2) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fuel_quota_urgency_weeks_pkey" PRIMARY KEY ("contractId", "weekStart")
);

INSERT INTO "fuel_quota_urgency_weeks" ("contractId", "weekStart", "amountReais", "updatedAt")
SELECT id,
       ("fuelQuotaUrgencyWeekStart")::date,
       "fuelQuotaUrgencyReais",
       CURRENT_TIMESTAMP
FROM "contracts"
WHERE "fuelQuotaUrgencyReais" > 0
  AND "fuelQuotaUrgencyWeekStart" IS NOT NULL
ON CONFLICT ("contractId", "weekStart")
DO UPDATE SET "amountReais" = EXCLUDED."amountReais",
              "updatedAt" = CURRENT_TIMESTAMP;

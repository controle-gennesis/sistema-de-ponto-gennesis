-- Contratos em que o usuário pode aprovar abastecimentos (veículo particular).

CREATE TABLE IF NOT EXISTS "user_fuel_approval_contracts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_fuel_approval_contracts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "position_permission_templates"
  ADD COLUMN IF NOT EXISTS "fuelApprovalContractIds" JSONB NOT NULL DEFAULT '[]';

CREATE UNIQUE INDEX IF NOT EXISTS "user_fuel_approval_contracts_userId_contractId_key"
  ON "user_fuel_approval_contracts"("userId", "contractId");

CREATE INDEX IF NOT EXISTS "user_fuel_approval_contracts_userId_idx"
  ON "user_fuel_approval_contracts"("userId");

CREATE INDEX IF NOT EXISTS "user_fuel_approval_contracts_contractId_idx"
  ON "user_fuel_approval_contracts"("contractId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_fuel_approval_contracts_userId_fkey'
  ) THEN
    ALTER TABLE "user_fuel_approval_contracts"
      ADD CONSTRAINT "user_fuel_approval_contracts_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_fuel_approval_contracts_contractId_fkey'
  ) THEN
    ALTER TABLE "user_fuel_approval_contracts"
      ADD CONSTRAINT "user_fuel_approval_contracts_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_fuel_approval_contracts_updatedBy_fkey'
  ) THEN
    ALTER TABLE "user_fuel_approval_contracts"
      ADD CONSTRAINT "user_fuel_approval_contracts_updatedBy_fkey"
      FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

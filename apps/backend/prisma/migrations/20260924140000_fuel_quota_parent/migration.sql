-- Agrupa contratos que compartilham a mesma cota semanal de abastecimento.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "fuelQuotaParentContractId" TEXT;

CREATE INDEX IF NOT EXISTS "contracts_fuelQuotaParentContractId_idx"
  ON "contracts"("fuelQuotaParentContractId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_fuelQuotaParentContractId_fkey'
  ) THEN
    ALTER TABLE "contracts"
      ADD CONSTRAINT "contracts_fuelQuotaParentContractId_fkey"
      FOREIGN KEY ("fuelQuotaParentContractId")
      REFERENCES "contracts"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

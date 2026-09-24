-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureContractAddendaTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "contract_addenda" (
      "id" TEXT NOT NULL,
      "contractId" TEXT NOT NULL,
      "effectiveDate" TIMESTAMP(3) NOT NULL,
      "amount" DECIMAL(15, 2) NOT NULL,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "contract_addenda_pkey" PRIMARY KEY ("id")
    );

CREATE INDEX IF NOT EXISTS "contract_addenda_contractId_idx"
    ON "contract_addenda"("contractId");

CREATE INDEX IF NOT EXISTS "contract_addenda_contractId_effectiveDate_idx"
    ON "contract_addenda"("contractId", "effectiveDate");

DO $$
    BEGIN
      ALTER TABLE "contract_addenda" ADD CONSTRAINT "contract_addenda_contractId_fkey"
        FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

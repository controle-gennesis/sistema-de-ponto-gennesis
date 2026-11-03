-- Controle de Contratos: aditivos dos contratos do registro
CREATE TABLE IF NOT EXISTS "contract_registry_addenda" (
    "id" TEXT NOT NULL,
    "registryId" TEXT NOT NULL,
    "addendumNumber" TEXT,
    "effectiveDate" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "contract_registry_addenda_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contract_registry_addenda_registryId_effectiveDate_idx" ON "contract_registry_addenda"("registryId", "effectiveDate");

DO $$
BEGIN
  ALTER TABLE "contract_registry_addenda" ADD CONSTRAINT "contract_registry_addenda_registryId_fkey"
    FOREIGN KEY ("registryId") REFERENCES "contract_registry_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

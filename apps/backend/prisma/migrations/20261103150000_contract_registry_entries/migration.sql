-- Controle de Contratos: registro de contratos (separado da tabela operacional de contratos)
CREATE TABLE IF NOT EXISTS "contract_registry_entries" (
    "id" TEXT NOT NULL,
    "contractorName" TEXT NOT NULL,
    "uf" TEXT,
    "art" TEXT,
    "contractNumber" TEXT NOT NULL,
    "document" TEXT,
    "signedAt" DATE,
    "notes" TEXT,
    "value" DECIMAL(15,2),
    "startDate" DATE,
    "guarantee" TEXT,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "contract_registry_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contract_registry_entries_contractorName_idx" ON "contract_registry_entries"("contractorName");
CREATE INDEX IF NOT EXISTS "contract_registry_entries_contractNumber_idx" ON "contract_registry_entries"("contractNumber");
CREATE INDEX IF NOT EXISTS "contract_registry_entries_endDate_idx" ON "contract_registry_entries"("endDate");

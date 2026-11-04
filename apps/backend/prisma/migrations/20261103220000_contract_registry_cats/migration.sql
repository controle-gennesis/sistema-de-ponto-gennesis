-- Controle de Contratos: CAT (Certidão de Acervo Técnico) dos contratos
CREATE TABLE IF NOT EXISTS "contract_registry_cats" (
    "id" TEXT NOT NULL,
    "registryId" TEXT NOT NULL,
    "catNumber" TEXT NOT NULL,
    "professional" TEXT,
    "protocol" TEXT,
    "issuedAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "contract_registry_cats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contract_registry_cats_registryId_issuedAt_idx" ON "contract_registry_cats"("registryId", "issuedAt");

DO $$
BEGIN
  ALTER TABLE "contract_registry_cats" ADD CONSTRAINT "contract_registry_cats_registryId_fkey"
    FOREIGN KEY ("registryId") REFERENCES "contract_registry_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

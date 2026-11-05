-- ARTs avulsas do Controle de Contratos (ART, profissional, baixada e observacao)
CREATE TABLE IF NOT EXISTS "contract_registry_loose_arts" (
  "id" TEXT NOT NULL,
  "registryId" TEXT NOT NULL,
  "art" TEXT NOT NULL,
  "professional" TEXT,
  "baixada" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "contract_registry_loose_arts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contract_registry_loose_arts_registryId_createdAt_idx"
  ON "contract_registry_loose_arts"("registryId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contract_registry_loose_arts_registryId_fkey'
  ) THEN
    ALTER TABLE "contract_registry_loose_arts"
      ADD CONSTRAINT "contract_registry_loose_arts_registryId_fkey"
      FOREIGN KEY ("registryId") REFERENCES "contract_registry_entries"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

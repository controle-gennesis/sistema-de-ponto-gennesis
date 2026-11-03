-- Controle de Contratos: ART e profissional nos aditivos
ALTER TABLE "contract_registry_addenda" ADD COLUMN IF NOT EXISTS "art" TEXT;
ALTER TABLE "contract_registry_addenda" ADD COLUMN IF NOT EXISTS "professional" TEXT;

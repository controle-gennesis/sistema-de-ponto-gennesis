-- Controle de Contratos: profissional da ART
ALTER TABLE "contract_registry_entries" ADD COLUMN IF NOT EXISTS "professional" TEXT;

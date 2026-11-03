-- Controle de Contratos: aditivo com os mesmos campos do contrato (CPF/CNPJ, assinatura, início, término, garantia)
ALTER TABLE "contract_registry_addenda" ADD COLUMN IF NOT EXISTS "document" TEXT;
ALTER TABLE "contract_registry_addenda" ADD COLUMN IF NOT EXISTS "signedAt" DATE;
ALTER TABLE "contract_registry_addenda" ADD COLUMN IF NOT EXISTS "startDate" DATE;
ALTER TABLE "contract_registry_addenda" ADD COLUMN IF NOT EXISTS "endDate" DATE;
ALTER TABLE "contract_registry_addenda" ADD COLUMN IF NOT EXISTS "guarantee" TEXT;

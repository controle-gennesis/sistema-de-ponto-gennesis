-- Aditivos de contrato: número do aditivo (ex.: "2º TA")
ALTER TABLE "contract_addenda" ADD COLUMN IF NOT EXISTS "addendumNumber" TEXT;

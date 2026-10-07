-- Confirmação do valor do orçamento na OS (módulo Contratos).
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "budgetValueConfirmed" BOOLEAN NOT NULL DEFAULT false;

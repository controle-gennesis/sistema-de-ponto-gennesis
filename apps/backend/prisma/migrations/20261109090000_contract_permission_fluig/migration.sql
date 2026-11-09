-- Permissão por contrato da aba Fluig (desligada por padrão).
ALTER TABLE "user_contract_permissions" ADD COLUMN IF NOT EXISTS "accessFluig" BOOLEAN NOT NULL DEFAULT false;

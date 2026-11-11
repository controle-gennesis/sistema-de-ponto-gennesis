-- Permissão por contrato da aba Obras (desligada por padrão).
ALTER TABLE "user_contract_permissions" ADD COLUMN IF NOT EXISTS "accessObras" BOOLEAN NOT NULL DEFAULT false;

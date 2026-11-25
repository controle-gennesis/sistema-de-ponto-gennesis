-- Permissão por contrato: aba "Empreiteiros".
ALTER TABLE "user_contract_permissions" ADD COLUMN IF NOT EXISTS "accessEmpreiteiros" BOOLEAN NOT NULL DEFAULT false;

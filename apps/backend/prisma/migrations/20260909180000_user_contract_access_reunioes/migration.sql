-- Aba Reuniões (quinzenais) em Reuniões de Contrato: opt-in na matriz de permissões.
ALTER TABLE "user_contract_permissions"
  ADD COLUMN IF NOT EXISTS "accessReunioes" BOOLEAN NOT NULL DEFAULT false;

-- Reuniões vira uma aba do contrato com permissão própria (igual Obras, Fluig...).
-- Até aqui a aba seguia o Liberado: quem já tinha o contrato continua com acesso.
ALTER TABLE "user_contract_permissions" ADD COLUMN IF NOT EXISTS "accessReunioes" BOOLEAN NOT NULL DEFAULT false;
UPDATE "user_contract_permissions" SET "accessReunioes" = true;

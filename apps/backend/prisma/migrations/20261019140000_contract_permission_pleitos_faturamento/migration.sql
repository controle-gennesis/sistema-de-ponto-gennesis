-- Permissões por aba do contrato: Pleitos e Faturamento.
-- Pleitos herda o valor atual de O.S. (antes Pleitos seguia O.S.); Faturamento liga para todos (acesso atual preservado).
ALTER TABLE "user_contract_permissions" ADD COLUMN IF NOT EXISTS "accessPleitos" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_contract_permissions" ADD COLUMN IF NOT EXISTS "accessFaturamento" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_contract_permissions" ADD COLUMN IF NOT EXISTS "accessResumo" BOOLEAN NOT NULL DEFAULT true;
UPDATE "user_contract_permissions" SET "accessPleitos" = "accessOrdemServico";

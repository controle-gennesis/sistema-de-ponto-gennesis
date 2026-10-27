-- Vínculo do pleito (OS) com o orçamento de origem. O campo entrou no schema sem migração
-- e a coluna não existia no banco, o que derrubava toda consulta de pleitos (P2022).
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "linkedOrcamentoId" TEXT;

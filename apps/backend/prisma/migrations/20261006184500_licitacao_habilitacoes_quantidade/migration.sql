ALTER TABLE "licitacao_habilitacoes_pendentes"
  ADD COLUMN IF NOT EXISTS "quantidade" DECIMAL(14, 4),
  ADD COLUMN IF NOT EXISTS "unidadeMedida" TEXT;

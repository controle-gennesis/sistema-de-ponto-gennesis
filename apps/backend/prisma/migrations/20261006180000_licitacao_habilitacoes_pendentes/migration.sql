CREATE TABLE IF NOT EXISTS "licitacao_habilitacoes_pendentes" (
  "id" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "acaoSugerida" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "adquiridaEm" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "licitacao_habilitacoes_pendentes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "licitacao_habilitacoes_pendentes_status_idx"
  ON "licitacao_habilitacoes_pendentes"("status");

CREATE INDEX IF NOT EXISTS "licitacao_habilitacoes_pendentes_createdAt_idx"
  ON "licitacao_habilitacoes_pendentes"("createdAt");

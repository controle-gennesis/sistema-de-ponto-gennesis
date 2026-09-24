-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureLicitacaoOrcamentosTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "licitacao_orcamentos" (
      "id" TEXT NOT NULL,
      "licitacaoId" TEXT NOT NULL,
      "inputsJson" JSONB NOT NULL,
      "resultJson" JSONB NOT NULL,
      "createdBy" TEXT,
      "updatedBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_orcamentos_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_orcamentos_licitacaoId_key"
    ON "licitacao_orcamentos"("licitacaoId");

CREATE INDEX IF NOT EXISTS "licitacao_orcamentos_updatedAt_idx"
    ON "licitacao_orcamentos"("updatedAt");

DO $$
    BEGIN
      ALTER TABLE "licitacao_orcamentos"
      ADD CONSTRAINT "licitacao_orcamentos_licitacaoId_fkey"
      FOREIGN KEY ("licitacaoId") REFERENCES "licitacoes"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

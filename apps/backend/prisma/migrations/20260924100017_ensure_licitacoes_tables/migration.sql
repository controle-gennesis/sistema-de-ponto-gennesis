-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureLicitacoesTables().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "licitacoes" (
      "id" TEXT NOT NULL,
      "titulo" TEXT NOT NULL,
      "numeroProcesso" TEXT,
      "orgao" TEXT,
      "modalidade" TEXT,
      "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
      "objeto" TEXT,
      "valorEstimado" TEXT,
      "estado" TEXT,
      "regiaoKey" TEXT,
      "vigenciaContrato" TEXT,
      "analiseJson" JSONB,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "licitacoes_pkey" PRIMARY KEY ("id")
    );

CREATE TABLE IF NOT EXISTS "licitacao_documentos" (
      "id" TEXT NOT NULL,
      "licitacaoId" TEXT NOT NULL,
      "originalName" TEXT NOT NULL,
      "storagePath" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "size" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_documentos_pkey" PRIMARY KEY ("id")
    );

CREATE INDEX IF NOT EXISTS "licitacoes_createdBy_idx" ON "licitacoes"("createdBy");

CREATE INDEX IF NOT EXISTS "licitacoes_status_idx" ON "licitacoes"("status");

CREATE INDEX IF NOT EXISTS "licitacoes_createdAt_idx" ON "licitacoes"("createdAt");

CREATE INDEX IF NOT EXISTS "licitacao_documentos_licitacaoId_idx"
    ON "licitacao_documentos"("licitacaoId");

DO $$
    BEGIN
      ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

DO $$
    BEGIN
      ALTER TABLE "licitacao_documentos" ADD CONSTRAINT "licitacao_documentos_licitacaoId_fkey"
        FOREIGN KEY ("licitacaoId") REFERENCES "licitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

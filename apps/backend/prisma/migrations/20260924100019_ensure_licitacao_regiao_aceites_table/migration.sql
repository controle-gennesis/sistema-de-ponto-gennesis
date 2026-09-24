-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureLicitacaoRegiaoAceitesTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "licitacao_regiao_aceites" (
      "id" TEXT NOT NULL,
      "regiaoKey" TEXT NOT NULL,
      "spreadsheetId" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "rowSnapshot" JSONB,
      "acceptedBy" TEXT NOT NULL,
      "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_regiao_aceites_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_regiao_aceites_regiao_sheet_row_key"
    ON "licitacao_regiao_aceites"("regiaoKey", "spreadsheetId", "rowKey");

CREATE INDEX IF NOT EXISTS "licitacao_regiao_aceites_regiaoKey_idx"
    ON "licitacao_regiao_aceites"("regiaoKey");

DO $$
    BEGIN
      ALTER TABLE "licitacao_regiao_aceites" ADD CONSTRAINT "licitacao_regiao_aceites_acceptedBy_fkey"
        FOREIGN KEY ("acceptedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

ALTER TABLE "licitacao_regiao_aceites"
    ADD COLUMN IF NOT EXISTS "licitacaoId" TEXT;

ALTER TABLE "licitacao_regiao_aceites"
    ADD COLUMN IF NOT EXISTS "processoExcluido" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "licitacao_regiao_aceites_licitacaoId_idx"
    ON "licitacao_regiao_aceites"("licitacaoId");

DO $$
    BEGIN
      ALTER TABLE "licitacao_regiao_aceites" ADD CONSTRAINT "licitacao_regiao_aceites_licitacaoId_fkey"
        FOREIGN KEY ("licitacaoId") REFERENCES "licitacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

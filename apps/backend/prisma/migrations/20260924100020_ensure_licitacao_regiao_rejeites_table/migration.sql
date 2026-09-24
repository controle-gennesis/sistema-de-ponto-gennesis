-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureLicitacaoRegiaoRejeitesTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "licitacao_regiao_rejeites" (
      "id" TEXT NOT NULL,
      "regiaoKey" TEXT NOT NULL,
      "spreadsheetId" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "rowSnapshot" JSONB,
      "rejectedBy" TEXT NOT NULL,
      "rejectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_regiao_rejeites_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_regiao_rejeites_regiao_sheet_row_key"
    ON "licitacao_regiao_rejeites"("regiaoKey", "spreadsheetId", "rowKey");

CREATE INDEX IF NOT EXISTS "licitacao_regiao_rejeites_regiaoKey_idx"
    ON "licitacao_regiao_rejeites"("regiaoKey");

DO $$
    BEGIN
      ALTER TABLE "licitacao_regiao_rejeites" ADD CONSTRAINT "licitacao_regiao_rejeites_rejectedBy_fkey"
        FOREIGN KEY ("rejectedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

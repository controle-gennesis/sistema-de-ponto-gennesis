-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureLicitacaoRegiaoSheetRowsTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "licitacao_regiao_sheet_rows" (
      "id" TEXT NOT NULL,
      "regiaoKey" TEXT NOT NULL,
      "spreadsheetId" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "headers" JSONB NOT NULL,
      "rowSnapshot" JSONB NOT NULL,
      "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_regiao_sheet_rows_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_regiao_sheet_rows_regiao_sheet_row_key"
    ON "licitacao_regiao_sheet_rows"("regiaoKey", "spreadsheetId", "rowKey");

CREATE INDEX IF NOT EXISTS "licitacao_regiao_sheet_rows_regiaoKey_idx"
    ON "licitacao_regiao_sheet_rows"("regiaoKey");

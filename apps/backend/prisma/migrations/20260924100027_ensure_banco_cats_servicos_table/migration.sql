-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureBancoCatsServicosTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "banco_cats_servicos" (
      "id" TEXT NOT NULL,
      "spreadsheetId" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "headers" JSONB NOT NULL,
      "rowSnapshot" JSONB NOT NULL,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "banco_cats_servicos_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "banco_cats_servicos_sheet_row_key"
    ON "banco_cats_servicos"("spreadsheetId", "rowKey");

CREATE INDEX IF NOT EXISTS "banco_cats_servicos_spreadsheetId_idx"
    ON "banco_cats_servicos"("spreadsheetId");

DO $$
    BEGIN
      ALTER TABLE "banco_cats_servicos" ADD CONSTRAINT "banco_cats_servicos_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

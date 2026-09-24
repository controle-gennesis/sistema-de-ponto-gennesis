-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureLicitacaoRegiaoManuaisTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "licitacao_regiao_manuais" (
      "id" TEXT NOT NULL,
      "regiaoKey" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "headers" JSONB NOT NULL,
      "rowSnapshot" JSONB NOT NULL,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "licitacao_regiao_manuais_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "licitacao_regiao_manuais_regiao_row_key"
    ON "licitacao_regiao_manuais"("regiaoKey", "rowKey");

CREATE INDEX IF NOT EXISTS "licitacao_regiao_manuais_regiaoKey_idx"
    ON "licitacao_regiao_manuais"("regiaoKey");

DO $$
    BEGIN
      ALTER TABLE "licitacao_regiao_manuais" ADD CONSTRAINT "licitacao_regiao_manuais_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

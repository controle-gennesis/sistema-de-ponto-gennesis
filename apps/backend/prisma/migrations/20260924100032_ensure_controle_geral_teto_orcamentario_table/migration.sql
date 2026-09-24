-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureControleGeralTetoOrcamentarioTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "controle_geral_teto_orcamentario" (
      "id" TEXT NOT NULL,
      "contractKey" TEXT NOT NULL,
      "contractName" TEXT NOT NULL,
      "year" INTEGER NOT NULL,
      "month" INTEGER NOT NULL,
      "amount" DECIMAL(15,2) NOT NULL,
      "createdById" TEXT,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "controle_geral_teto_orcamentario_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "controle_geral_teto_orcamentario_contractKey_year_month_key"
    ON "controle_geral_teto_orcamentario"("contractKey", "year", "month");

CREATE INDEX IF NOT EXISTS "controle_geral_teto_orcamentario_contractKey_idx"
    ON "controle_geral_teto_orcamentario"("contractKey");

CREATE INDEX IF NOT EXISTS "controle_geral_teto_orcamentario_year_month_idx"
    ON "controle_geral_teto_orcamentario"("year", "month");

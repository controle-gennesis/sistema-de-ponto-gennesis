-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensurePncpEnviadosAnaliseTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "pncp_enviados_analise" (
      "id" TEXT NOT NULL,
      "numeroControlePNCP" TEXT NOT NULL,
      "regiaoKey" TEXT NOT NULL,
      "rowKey" TEXT NOT NULL,
      "enviadoBy" TEXT NOT NULL,
      "enviadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "pncp_enviados_analise_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "pncp_enviados_analise_numero_key"
    ON "pncp_enviados_analise"("numeroControlePNCP");

CREATE INDEX IF NOT EXISTS "pncp_enviados_analise_regiaoKey_idx"
    ON "pncp_enviados_analise"("regiaoKey");

DO $$
    BEGIN
      ALTER TABLE "pncp_enviados_analise" ADD CONSTRAINT "pncp_enviados_analise_enviadoBy_fkey"
        FOREIGN KEY ("enviadoBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

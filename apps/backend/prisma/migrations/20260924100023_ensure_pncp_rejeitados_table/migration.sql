-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensurePncpRejeitadosTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "pncp_rejeitados" (
      "id" TEXT NOT NULL,
      "numeroControlePNCP" TEXT NOT NULL,
      "rejeitadoBy" TEXT NOT NULL,
      "rejeitadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "pncp_rejeitados_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "pncp_rejeitados_numero_key"
    ON "pncp_rejeitados"("numeroControlePNCP");

DO $$
    BEGIN
      ALTER TABLE "pncp_rejeitados" ADD CONSTRAINT "pncp_rejeitados_rejeitadoBy_fkey"
        FOREIGN KEY ("rejeitadoBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

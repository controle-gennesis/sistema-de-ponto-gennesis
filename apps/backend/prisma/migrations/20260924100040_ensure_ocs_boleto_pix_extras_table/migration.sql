-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureOcsBoletoPixExtrasTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "ocs_boleto_pix_extras" (
      "id" TEXT NOT NULL,
      "coligada" INTEGER NOT NULL,
      "idMov" INTEGER NOT NULL,
      "filial" INTEGER,
      "dataVencimento" DATE,
      "numeroNf" TEXT,
      "dataEmissaoNf" DATE,
      "updatedById" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ocs_boleto_pix_extras_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "ocs_boleto_pix_extras_coligada_idMov_key"
    ON "ocs_boleto_pix_extras"("coligada", "idMov");

CREATE INDEX IF NOT EXISTS "ocs_boleto_pix_extras_idMov_idx"
    ON "ocs_boleto_pix_extras"("idMov");

-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensurePncpKeywordsCustomTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "pncp_keywords_custom" (
      "keyword" TEXT NOT NULL,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "pncp_keywords_custom_pkey" PRIMARY KEY ("keyword")
    );

DO $$
    BEGIN
      ALTER TABLE "pncp_keywords_custom" ADD CONSTRAINT "pncp_keywords_custom_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

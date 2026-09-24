-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensurePunchPocColumns()
-- (as colunas de time_records vêm de um loop JS sobre uma lista fixa — resolvidas aqui manualmente).
-- Idempotente (ADD COLUMN IF NOT EXISTS) — seguro mesmo se já aplicado.

ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "requireFaceMatch" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "requirePunchQr" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "time_records" ADD COLUMN IF NOT EXISTS "faceMatchStatus" TEXT;

ALTER TABLE "time_records" ADD COLUMN IF NOT EXISTS "faceMatchSimilarity" DOUBLE PRECISION;

ALTER TABLE "time_records" ADD COLUMN IF NOT EXISTS "punchQrToken" TEXT;

ALTER TABLE "time_records" ADD COLUMN IF NOT EXISTS "punchLocationId" TEXT;

ALTER TABLE "time_records" ADD COLUMN IF NOT EXISTS "punchLocationName" TEXT;

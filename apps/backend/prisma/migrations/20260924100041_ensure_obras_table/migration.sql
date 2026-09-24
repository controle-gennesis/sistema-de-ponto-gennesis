-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureObrasTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "obras" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "contratoId" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "obras_pkey" PRIMARY KEY ("id")
    );

ALTER TABLE "obras" ADD COLUMN IF NOT EXISTS "contratoId" TEXT;

CREATE INDEX IF NOT EXISTS "obras_name_idx" ON "obras"("name");

CREATE INDEX IF NOT EXISTS "obras_isActive_idx" ON "obras"("isActive");

CREATE INDEX IF NOT EXISTS "obras_contratoId_idx" ON "obras"("contratoId");

ALTER TABLE "obras" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "obras_externalId_key" ON "obras"("externalId");

ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "contracts_externalId_key" ON "contracts"("externalId");

DELETE FROM "obras"
    WHERE "contratoId" IS NULL
       OR NOT EXISTS (SELECT 1 FROM "contracts" c WHERE c."id" = "obras"."contratoId");

DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'obras' AND column_name = 'contratoId'
      ) AND NOT EXISTS (
        SELECT 1 FROM "obras" WHERE "contratoId" IS NULL
      ) THEN
        ALTER TABLE "obras" ALTER COLUMN "contratoId" SET NOT NULL;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END $$;

DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'obras_contratoId_fkey'
      ) THEN
        ALTER TABLE "obras"
          ADD CONSTRAINT "obras_contratoId_fkey"
          FOREIGN KEY ("contratoId") REFERENCES "contracts"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END $$;

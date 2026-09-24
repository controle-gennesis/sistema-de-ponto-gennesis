-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureEmpreiteirosTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "empreiteiros" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "tradeName" TEXT,
      "documentKind" TEXT NOT NULL,
      "document" TEXT NOT NULL,
      "phone" TEXT NOT NULL,
      "specialty" TEXT NOT NULL,
      "contractId" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "contactName" TEXT,
      "email" TEXT,
      "city" TEXT,
      "state" TEXT,
      "pixKey" TEXT,
      "bank" TEXT,
      "agency" TEXT,
      "account" TEXT,
      "startDate" TIMESTAMP(3),
      "endDate" TIMESTAMP(3),
      "photoUrl" TEXT,
      "photoKey" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "empreiteiros_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "empreiteiros_document_key" ON "empreiteiros"("document");

CREATE INDEX IF NOT EXISTS "empreiteiros_name_idx" ON "empreiteiros"("name");

CREATE INDEX IF NOT EXISTS "empreiteiros_isActive_idx" ON "empreiteiros"("isActive");

CREATE INDEX IF NOT EXISTS "empreiteiros_contractId_idx" ON "empreiteiros"("contractId");

CREATE INDEX IF NOT EXISTS "empreiteiros_specialty_idx" ON "empreiteiros"("specialty");

ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "bank" TEXT;

ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "agency" TEXT;

ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "account" TEXT;

ALTER TABLE "empreiteiros" DROP COLUMN IF EXISTS "bankDetails";

ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;

ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "photoKey" TEXT;

ALTER TABLE "empreiteiros" DROP COLUMN IF EXISTS "notes";

ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "files" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);

ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "cpf" TEXT;

ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "empreiteiros"
    SET "cpf" = "document"
    WHERE "cpf" IS NULL
      AND "documentKind" = 'CPF'
      AND char_length("document") = 11;

CREATE UNIQUE INDEX IF NOT EXISTS "empreiteiros_cpf_key" ON "empreiteiros"("cpf");

CREATE UNIQUE INDEX IF NOT EXISTS "empreiteiros_userId_key" ON "empreiteiros"("userId");

DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiros_userId_fkey'
      ) THEN
        ALTER TABLE "empreiteiros"
          ADD CONSTRAINT "empreiteiros_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END $$;

DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiros_contractId_fkey'
      ) THEN
        ALTER TABLE "empreiteiros"
          ADD CONSTRAINT "empreiteiros_contractId_fkey"
          FOREIGN KEY ("contractId") REFERENCES "contracts"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END $$;

CREATE TABLE IF NOT EXISTS "empreiteiro_team_members" (
      "id" TEXT NOT NULL,
      "empreiteiroId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "phone" TEXT,
      "document" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "photoUrl" TEXT,
      "photoKey" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "empreiteiro_team_members_pkey" PRIMARY KEY ("id")
    );

CREATE INDEX IF NOT EXISTS "empreiteiro_team_members_empreiteiroId_idx"
      ON "empreiteiro_team_members"("empreiteiroId");

CREATE INDEX IF NOT EXISTS "empreiteiro_team_members_name_idx"
      ON "empreiteiro_team_members"("name");

ALTER TABLE "empreiteiro_team_members" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;

ALTER TABLE "empreiteiro_team_members" ADD COLUMN IF NOT EXISTS "photoKey" TEXT;

ALTER TABLE "empreiteiro_team_members" ADD COLUMN IF NOT EXISTS "files" JSONB NOT NULL DEFAULT '[]';

UPDATE "empreiteiros" e
      SET "files" = COALESCE((
        SELECT jsonb_agg(f)
        FROM "empreiteiro_team_members" m,
             jsonb_array_elements(COALESCE(m."files", '[]'::jsonb)) AS f
        WHERE m."empreiteiroId" = e.id
          AND jsonb_typeof(COALESCE(m."files", '[]'::jsonb)) = 'array'
          AND jsonb_array_length(COALESCE(m."files", '[]'::jsonb)) > 0
      ), e."files")
      WHERE (e."files" IS NULL OR e."files" = '[]'::jsonb)
        AND EXISTS (
          SELECT 1
          FROM "empreiteiro_team_members" m
          WHERE m."empreiteiroId" = e.id
            AND jsonb_typeof(COALESCE(m."files", '[]'::jsonb)) = 'array'
            AND jsonb_array_length(COALESCE(m."files", '[]'::jsonb)) > 0
        );

DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiro_team_members_empreiteiroId_fkey'
      ) THEN
        ALTER TABLE "empreiteiro_team_members"
          ADD CONSTRAINT "empreiteiro_team_members_empreiteiroId_fkey"
          FOREIGN KEY ("empreiteiroId") REFERENCES "empreiteiros"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END $$;

CREATE TABLE IF NOT EXISTS "empreiteiro_daily_measurements" (
      "id" TEXT NOT NULL,
      "empreiteiroId" TEXT NOT NULL,
      "workDate" DATE NOT NULL,
      "description" TEXT NOT NULL,
      "confirmedBy" TEXT,
      "quantity" DECIMAL(12, 2),
      "unit" TEXT,
      "photos" JSONB NOT NULL DEFAULT '[]',
      "createdBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "empreiteiro_daily_measurements_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "empreiteiro_daily_measurements_empreiteiroId_workDate_key"
      ON "empreiteiro_daily_measurements"("empreiteiroId", "workDate");

CREATE INDEX IF NOT EXISTS "empreiteiro_daily_measurements_empreiteiroId_idx"
      ON "empreiteiro_daily_measurements"("empreiteiroId");

CREATE INDEX IF NOT EXISTS "empreiteiro_daily_measurements_workDate_idx"
      ON "empreiteiro_daily_measurements"("workDate");

ALTER TABLE "empreiteiro_daily_measurements" ADD COLUMN IF NOT EXISTS "confirmedBy" TEXT;

ALTER TABLE "empreiteiro_daily_measurements" ADD COLUMN IF NOT EXISTS "teamPhoto" JSONB;

DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiro_daily_measurements_empreiteiroId_fkey'
      ) THEN
        ALTER TABLE "empreiteiro_daily_measurements"
          ADD CONSTRAINT "empreiteiro_daily_measurements_empreiteiroId_fkey"
          FOREIGN KEY ("empreiteiroId") REFERENCES "empreiteiros"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END $$;

CREATE TABLE IF NOT EXISTS "empreiteiro_daily_measurement_workers" (
      "id" TEXT NOT NULL,
      "measurementId" TEXT NOT NULL,
      "teamMemberId" TEXT,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      CONSTRAINT "empreiteiro_daily_measurement_workers_pkey" PRIMARY KEY ("id")
    );

CREATE INDEX IF NOT EXISTS "empreiteiro_daily_measurement_workers_measurementId_idx"
      ON "empreiteiro_daily_measurement_workers"("measurementId");

CREATE INDEX IF NOT EXISTS "empreiteiro_daily_measurement_workers_teamMemberId_idx"
      ON "empreiteiro_daily_measurement_workers"("teamMemberId");

DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiro_daily_measurement_workers_measurementId_fkey'
      ) THEN
        ALTER TABLE "empreiteiro_daily_measurement_workers"
          ADD CONSTRAINT "empreiteiro_daily_measurement_workers_measurementId_fkey"
          FOREIGN KEY ("measurementId") REFERENCES "empreiteiro_daily_measurements"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END $$;

DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiro_daily_measurement_workers_teamMemberId_fkey'
      ) THEN
        ALTER TABLE "empreiteiro_daily_measurement_workers"
          ADD CONSTRAINT "empreiteiro_daily_measurement_workers_teamMemberId_fkey"
          FOREIGN KEY ("teamMemberId") REFERENCES "empreiteiro_team_members"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END $$;

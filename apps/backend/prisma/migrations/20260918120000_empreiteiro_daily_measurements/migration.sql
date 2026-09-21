-- Medição diária da turma do empreiteiro
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
END $$;

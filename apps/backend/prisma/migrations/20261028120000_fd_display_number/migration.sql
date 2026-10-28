-- AlterTable
ALTER TABLE "demand_sheet_approvals" ADD COLUMN IF NOT EXISTS "displayNumber" INTEGER;

-- Backfill: numera as fichas existentes na ordem de criação
UPDATE "demand_sheet_approvals" d
SET "displayNumber" = r.rn + COALESCE((SELECT MAX("displayNumber") FROM "demand_sheet_approvals"), 0)
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "demand_sheet_approvals"
  WHERE "displayNumber" IS NULL
) r
WHERE d."id" = r."id";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "demand_sheet_approvals_displayNumber_key" ON "demand_sheet_approvals"("displayNumber");

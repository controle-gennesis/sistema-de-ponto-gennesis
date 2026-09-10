-- AlterTable: vincula obra a contrato
ALTER TABLE "obras" ADD COLUMN IF NOT EXISTS "contratoId" TEXT;

UPDATE "obras"
SET "contratoId" = (
  SELECT c."id" FROM "contracts" c ORDER BY c."createdAt" ASC LIMIT 1
)
WHERE "contratoId" IS NULL
  AND EXISTS (SELECT 1 FROM "contracts" LIMIT 1);

DELETE FROM "obras" WHERE "contratoId" IS NULL;

ALTER TABLE "obras" ALTER COLUMN "contratoId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "obras_contratoId_idx" ON "obras"("contratoId");

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
END $$;

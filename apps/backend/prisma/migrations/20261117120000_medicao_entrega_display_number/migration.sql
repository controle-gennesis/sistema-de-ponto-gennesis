-- Número sequencial das medições de entrega (#1, #2...), numeradas pela ordem de criação.
ALTER TABLE "empreiteiro_daily_measurements" ADD COLUMN IF NOT EXISTS "displayNumber" INTEGER;

UPDATE "empreiteiro_daily_measurements" m
SET "displayNumber" = n.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn
  FROM "empreiteiro_daily_measurements"
) n
WHERE m.id = n.id AND m."displayNumber" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "empreiteiro_daily_measurements_displayNumber_key"
ON "empreiteiro_daily_measurements"("displayNumber");

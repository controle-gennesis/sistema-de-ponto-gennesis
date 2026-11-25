-- Controle de Boletos: número sequencial fixo por boleto (ID da lista, como nas FDs).
CREATE SEQUENCE IF NOT EXISTS "boleto_control_entries_displayNumber_seq";

ALTER TABLE "boleto_control_entries" ADD COLUMN IF NOT EXISTS "displayNumber" INTEGER;

-- Numera os boletos que já existem, do mais antigo para o mais novo.
UPDATE "boleto_control_entries" t
SET "displayNumber" = n.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "boleto_control_entries"
) n
WHERE t."id" = n."id" AND t."displayNumber" IS NULL;

SELECT setval(
  '"boleto_control_entries_displayNumber_seq"',
  COALESCE((SELECT MAX("displayNumber") FROM "boleto_control_entries"), 0) + 1,
  false
);

ALTER TABLE "boleto_control_entries"
  ALTER COLUMN "displayNumber" SET DEFAULT nextval('"boleto_control_entries_displayNumber_seq"');
ALTER TABLE "boleto_control_entries" ALTER COLUMN "displayNumber" SET NOT NULL;
ALTER SEQUENCE "boleto_control_entries_displayNumber_seq" OWNED BY "boleto_control_entries"."displayNumber";

CREATE UNIQUE INDEX IF NOT EXISTS "boleto_control_entries_displayNumber_key" ON "boleto_control_entries"("displayNumber");

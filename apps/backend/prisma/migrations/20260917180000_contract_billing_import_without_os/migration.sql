-- Flag: importar faturamento sem OS e pleito.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "allowBillingImportWithoutOsPleito" BOOLEAN NOT NULL DEFAULT false;

UPDATE "contracts"
SET "allowBillingImportWithoutOsPleito" = true
WHERE "allowBillingImportWithoutOsPleito" = false
  AND (
    upper("name") LIKE '%CONFEA%508%'
    OR upper("name") LIKE '%CONFEA%516%'
    OR upper("name") LIKE '%CONIFA%508%'
    OR upper("name") LIKE '%CONIFA%516%'
    OR upper(coalesce("number", '')) LIKE '%CONFEA%508%'
    OR upper(coalesce("number", '')) LIKE '%CONFEA%516%'
  );

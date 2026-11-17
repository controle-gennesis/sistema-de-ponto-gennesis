-- Condição importada do TOTVS (só estas aparecem na OC TOTVS)
ALTER TABLE "payment_conditions" ADD COLUMN IF NOT EXISTS "fromTotvs" BOOLEAN NOT NULL DEFAULT false;
-- Já importadas: o código é o CODCPG numérico do TOTVS
UPDATE "payment_conditions" SET "fromTotvs" = true WHERE "code" ~ '^[0-9]+$';

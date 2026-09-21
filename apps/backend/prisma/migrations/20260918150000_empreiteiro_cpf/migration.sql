ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "cpf" TEXT;

UPDATE "empreiteiros"
SET "cpf" = "document"
WHERE "cpf" IS NULL
  AND "documentKind" = 'CPF'
  AND char_length("document") = 11;

CREATE UNIQUE INDEX IF NOT EXISTS "empreiteiros_cpf_key" ON "empreiteiros"("cpf");

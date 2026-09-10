-- IDs legados para importação de Fichas de Demanda (AppSheet)

ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "contracts_externalId_key" ON "contracts"("externalId");

ALTER TABLE "obras" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "obras_externalId_key" ON "obras"("externalId");

ALTER TABLE "demand_sheet_approvals" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "demand_sheet_approvals_externalId_key" ON "demand_sheet_approvals"("externalId");

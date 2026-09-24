-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensurePermissionAccessTables()
-- (inclui a lógica de ensureUserAccessJunctionTable(), chamada 3x com tabelas diferentes, e addFkIfMissing()).
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "user_restricted_dp_approval_cost_centers" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "costCenterId" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_restricted_dp_approval_cost_centers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_restricted_dp_approval_cost_centers_userId_costCenterId_key" ON "user_restricted_dp_approval_cost_centers"("userId", "costCenterId");

CREATE INDEX IF NOT EXISTS "user_restricted_dp_approval_cost_centers_userId_idx" ON "user_restricted_dp_approval_cost_centers"("userId");

CREATE INDEX IF NOT EXISTS "user_restricted_dp_approval_cost_centers_costCenterId_idx" ON "user_restricted_dp_approval_cost_centers"("costCenterId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_restricted_dp_approval_cost_centers_userId_fkey') THEN
    ALTER TABLE "user_restricted_dp_approval_cost_centers" ADD CONSTRAINT "user_restricted_dp_approval_cost_centers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_restricted_dp_approval_cost_centers_costCenterId_fkey') THEN
    ALTER TABLE "user_restricted_dp_approval_cost_centers" ADD CONSTRAINT "user_restricted_dp_approval_cost_centers_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_restricted_dp_approval_cost_centers_updatedBy_fkey') THEN
    ALTER TABLE "user_restricted_dp_approval_cost_centers" ADD CONSTRAINT "user_restricted_dp_approval_cost_centers_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_dp_request_view_cost_centers" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "costCenterId" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_dp_request_view_cost_centers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_dp_request_view_cost_centers_userId_costCenterId_key" ON "user_dp_request_view_cost_centers"("userId", "costCenterId");

CREATE INDEX IF NOT EXISTS "user_dp_request_view_cost_centers_userId_idx" ON "user_dp_request_view_cost_centers"("userId");

CREATE INDEX IF NOT EXISTS "user_dp_request_view_cost_centers_costCenterId_idx" ON "user_dp_request_view_cost_centers"("costCenterId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_dp_request_view_cost_centers_userId_fkey') THEN
    ALTER TABLE "user_dp_request_view_cost_centers" ADD CONSTRAINT "user_dp_request_view_cost_centers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_dp_request_view_cost_centers_costCenterId_fkey') THEN
    ALTER TABLE "user_dp_request_view_cost_centers" ADD CONSTRAINT "user_dp_request_view_cost_centers_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_dp_request_view_cost_centers_updatedBy_fkey') THEN
    ALTER TABLE "user_dp_request_view_cost_centers" ADD CONSTRAINT "user_dp_request_view_cost_centers_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_fd_approval_contracts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_fd_approval_contracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_fd_approval_contracts_userId_contractId_key" ON "user_fd_approval_contracts"("userId", "contractId");

CREATE INDEX IF NOT EXISTS "user_fd_approval_contracts_userId_idx" ON "user_fd_approval_contracts"("userId");

CREATE INDEX IF NOT EXISTS "user_fd_approval_contracts_contractId_idx" ON "user_fd_approval_contracts"("contractId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_fd_approval_contracts_userId_fkey') THEN
    ALTER TABLE "user_fd_approval_contracts" ADD CONSTRAINT "user_fd_approval_contracts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_fd_approval_contracts_contractId_fkey') THEN
    ALTER TABLE "user_fd_approval_contracts" ADD CONSTRAINT "user_fd_approval_contracts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_fd_approval_contracts_updatedBy_fkey') THEN
    ALTER TABLE "user_fd_approval_contracts" ADD CONSTRAINT "user_fd_approval_contracts_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "user_dp_approval_contracts" ADD COLUMN IF NOT EXISTS "allowedSectors" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "user_restricted_dp_approval_cost_centers" ADD COLUMN IF NOT EXISTS "allowedSectors" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "position_permission_templates" ADD COLUMN IF NOT EXISTS "restrictedDpApprovalCostCenterIds" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "position_permission_templates" ADD COLUMN IF NOT EXISTS "dpRequestViewCostCenterIds" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "position_permission_templates" ADD COLUMN IF NOT EXISTS "fdApprovalContractIds" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "position_permission_templates" ADD COLUMN IF NOT EXISTS "dpApprovalContractSectors" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "position_permission_templates" ADD COLUMN IF NOT EXISTS "restrictedDpApprovalCostCenterSectors" JSONB NOT NULL DEFAULT '{}';

-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureDemandSheetApprovals().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

DO $$
      BEGIN
        CREATE TYPE "DemandSheetApprovalStatus" AS ENUM ('WAITING_MANAGER', 'APPROVED', 'REJECTED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

CREATE TABLE IF NOT EXISTS "demand_sheet_approvals" (
        "id" TEXT NOT NULL,
        "numMovRm" TEXT NOT NULL,
        "idMovRm" TEXT NOT NULL,
        "codigoPedido" TEXT NOT NULL,
        "solicitanteId" TEXT NOT NULL,
        "contratoId" TEXT NOT NULL,
        "obra" TEXT NOT NULL,
        "codFichaDemanda" TEXT NOT NULL,
        "faturamentoEstimado" DECIMAL(15,2) NOT NULL,
        "custoEstimado" DECIMAL(15,2) NOT NULL,
        "observacao" TEXT NOT NULL,
        "dataHora" TIMESTAMP(3) NOT NULL,
        "polo" TEXT NOT NULL,
        "anexos" JSONB NOT NULL DEFAULT '[]',
        "status" "DemandSheetApprovalStatus" NOT NULL DEFAULT 'WAITING_MANAGER',
        "createdBy" TEXT NOT NULL,
        "managerApprovedBy" TEXT,
        "managerApprovedAt" TIMESTAMP(3),
        "managerApprovalComment" TEXT,
        "managerRejectionReason" TEXT,
        "managerRejectionComment" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "demand_sheet_approvals_pkey" PRIMARY KEY ("id")
      );

CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_contratoId_idx" ON "demand_sheet_approvals"("contratoId");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_solicitanteId_idx" ON "demand_sheet_approvals"("solicitanteId");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_createdBy_idx" ON "demand_sheet_approvals"("createdBy");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_status_idx" ON "demand_sheet_approvals"("status");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_codFichaDemanda_idx" ON "demand_sheet_approvals"("codFichaDemanda");

DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_solicitanteId_fkey"
          FOREIGN KEY ("solicitanteId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_contratoId_fkey"
          FOREIGN KEY ("contratoId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_createdBy_fkey"
          FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_managerApprovedBy_fkey"
          FOREIGN KEY ("managerApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

DO $$
      BEGIN
        CREATE TYPE "DemandSheetPurchaseStatus" AS ENUM (
          'WAREHOUSE_DF',
          'WAREHOUSE_GO',
          'FULLY_FULFILLED_BY_STOCK',
          'PARTIALLY_FULFILLED_BY_STOCK',
          'PURCHASE_REQUEST',
          'SUPPLIES',
          'FINISHED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

ALTER TABLE "demand_sheet_approvals"
        ADD COLUMN IF NOT EXISTS "purchaseStatus" "DemandSheetPurchaseStatus",
        ADD COLUMN IF NOT EXISTS "purchaseStatusUpdatedBy" TEXT,
        ADD COLUMN IF NOT EXISTS "purchaseStatusUpdatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_purchaseStatus_idx"
      ON "demand_sheet_approvals"("purchaseStatus");

DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_purchaseStatusUpdatedBy_fkey"
          FOREIGN KEY ("purchaseStatusUpdatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

ALTER TABLE "demand_sheet_approvals" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "demand_sheet_approvals_externalId_key"
    ON "demand_sheet_approvals"("externalId");

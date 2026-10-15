ALTER TYPE "DemandSheetPurchaseStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "demand_sheet_approvals"
  ADD COLUMN IF NOT EXISTS "purchaseCancellationNote" TEXT;

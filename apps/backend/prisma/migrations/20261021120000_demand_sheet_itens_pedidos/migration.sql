ALTER TABLE "demand_sheet_approvals" ADD COLUMN IF NOT EXISTS "itensPedidos" JSONB NOT NULL DEFAULT '[]';

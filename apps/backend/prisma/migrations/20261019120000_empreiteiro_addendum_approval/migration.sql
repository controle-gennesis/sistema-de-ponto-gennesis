-- Aditivos de empreita passam por aprovação. Os que já existem continuam valendo (APPROVED).
ALTER TABLE "empreiteiro_contract_addenda"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "applyPlan" JSONB,
  ADD COLUMN IF NOT EXISTS "correctionNote" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

CREATE INDEX IF NOT EXISTS "empreiteiro_contract_addenda_status_idx"
  ON "empreiteiro_contract_addenda"("status");

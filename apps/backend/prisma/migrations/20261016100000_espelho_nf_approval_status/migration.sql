-- Status de aprovação do espelho passa a ficar no banco (antes só no navegador de quem aprovou).
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL';
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "approvalComment" TEXT;
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "approvalDecidedAt" TIMESTAMP(3);
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "approvalDecidedById" TEXT;
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "approvalDecidedByName" TEXT;
CREATE INDEX IF NOT EXISTS "espelho_nf_mirrors_approvalStatus_idx" ON "espelho_nf_mirrors"("approvalStatus");

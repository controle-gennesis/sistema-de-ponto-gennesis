-- Espelho de NF: o Financeiro anexa a NF (e informa o número) e o espelho fica FINALIZED.
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "nfNumber" TEXT;
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMP(3);
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "finalizedById" TEXT;
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "finalizedByName" TEXT;

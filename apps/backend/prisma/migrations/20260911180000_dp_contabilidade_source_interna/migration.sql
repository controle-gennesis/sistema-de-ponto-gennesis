-- Vínculo: solicitação interna finalizada → card DP/Contabilidade (sem duplicar).
ALTER TABLE "dp_contabilidade_requests"
  ADD COLUMN IF NOT EXISTS "sourceDpRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "dp_contabilidade_requests_sourceDpRequestId_key"
  ON "dp_contabilidade_requests"("sourceDpRequestId");

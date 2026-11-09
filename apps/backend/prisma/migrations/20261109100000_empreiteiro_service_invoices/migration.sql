-- Notas fiscais do contrato de servico da empreita (por parcela ou do servico inteiro)
CREATE TABLE IF NOT EXISTS "empreiteiro_service_invoices" (
  "id" TEXT NOT NULL,
  "empreiteiroContractId" TEXT NOT NULL,
  "installmentId" TEXT,
  "number" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT,
  "fileKey" TEXT,
  "amount" DECIMAL(15,2),
  "issuedAt" DATE,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "empreiteiro_service_invoices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "empreiteiro_service_invoices_empreiteiroContractId_idx"
  ON "empreiteiro_service_invoices"("empreiteiroContractId");
CREATE INDEX IF NOT EXISTS "empreiteiro_service_invoices_installmentId_idx"
  ON "empreiteiro_service_invoices"("installmentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiro_service_invoices_empreiteiroContractId_fkey'
  ) THEN
    ALTER TABLE "empreiteiro_service_invoices"
      ADD CONSTRAINT "empreiteiro_service_invoices_empreiteiroContractId_fkey"
      FOREIGN KEY ("empreiteiroContractId") REFERENCES "empreiteiro_contracts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiro_service_invoices_installmentId_fkey'
  ) THEN
    ALTER TABLE "empreiteiro_service_invoices"
      ADD CONSTRAINT "empreiteiro_service_invoices_installmentId_fkey"
      FOREIGN KEY ("installmentId") REFERENCES "empreiteiro_contract_installments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

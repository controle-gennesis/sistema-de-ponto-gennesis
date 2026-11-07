-- Avaliacao (estrelas 1 a 5) do contrato de servico concluido: preco, prazo e pagamento
CREATE TABLE IF NOT EXISTS "empreiteiro_service_reviews" (
  "id" TEXT NOT NULL,
  "empreiteiroContractId" TEXT NOT NULL,
  "empreiteiroId" TEXT NOT NULL,
  "priceRating" INTEGER NOT NULL,
  "deadlineRating" INTEGER NOT NULL,
  "paymentRating" INTEGER NOT NULL,
  "comment" TEXT,
  "reviewedById" TEXT,
  "reviewedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "empreiteiro_service_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "empreiteiro_service_reviews_empreiteiroContractId_key"
  ON "empreiteiro_service_reviews"("empreiteiroContractId");
CREATE INDEX IF NOT EXISTS "empreiteiro_service_reviews_empreiteiroId_idx"
  ON "empreiteiro_service_reviews"("empreiteiroId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiro_service_reviews_empreiteiroContractId_fkey'
  ) THEN
    ALTER TABLE "empreiteiro_service_reviews"
      ADD CONSTRAINT "empreiteiro_service_reviews_empreiteiroContractId_fkey"
      FOREIGN KEY ("empreiteiroContractId") REFERENCES "empreiteiro_contracts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "caixinha_purchases" (
    "id" TEXT NOT NULL,
    "filledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "personName" TEXT NOT NULL,
    "personUserId" TEXT,
    "osNumber" TEXT,
    "contractId" TEXT,
    "contractName" TEXT,
    "obraId" TEXT,
    "obraName" TEXT,
    "caixinha" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3),
    "storeName" TEXT,
    "invoiceNumber" TEXT,
    "amount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "invoicePdfUrl" TEXT,
    "invoicePdfName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caixinha_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "caixinha_purchases_filledAt_idx" ON "caixinha_purchases"("filledAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "caixinha_purchases_caixinha_idx" ON "caixinha_purchases"("caixinha");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "caixinha_purchases_createdById_idx" ON "caixinha_purchases"("createdById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "caixinha_purchases_personName_idx" ON "caixinha_purchases"("personName");

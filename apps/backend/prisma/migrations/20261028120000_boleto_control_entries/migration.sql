-- Controle de Boletos (Financeiro)
CREATE TABLE IF NOT EXISTS "boleto_control_entries" (
    "id" TEXT NOT NULL,
    "polo" TEXT,
    "supplierName" TEXT,
    "costCenterName" TEXT,
    "ocNumber" TEXT,
    "idMov" TEXT,
    "value" DECIMAL(15,2),
    "nfNumber" TEXT,
    "nfEmissionDate" DATE,
    "paymentCondition" TEXT,
    "dueDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'A_VENCER',
    "notes" TEXT,
    "contractManager" TEXT,
    "technicalConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "technicalConfirmedAt" TIMESTAMP(3),
    "technicalConfirmedByName" TEXT,
    "importKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "boleto_control_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "boleto_control_entries_importKey_key" ON "boleto_control_entries"("importKey");
CREATE INDEX IF NOT EXISTS "boleto_control_entries_dueDate_idx" ON "boleto_control_entries"("dueDate");
CREATE INDEX IF NOT EXISTS "boleto_control_entries_status_idx" ON "boleto_control_entries"("status");
CREATE INDEX IF NOT EXISTS "boleto_control_entries_polo_idx" ON "boleto_control_entries"("polo");
CREATE INDEX IF NOT EXISTS "boleto_control_entries_supplierName_idx" ON "boleto_control_entries"("supplierName");
CREATE INDEX IF NOT EXISTS "boleto_control_entries_ocNumber_idx" ON "boleto_control_entries"("ocNumber");
CREATE INDEX IF NOT EXISTS "boleto_control_entries_costCenterName_idx" ON "boleto_control_entries"("costCenterName");

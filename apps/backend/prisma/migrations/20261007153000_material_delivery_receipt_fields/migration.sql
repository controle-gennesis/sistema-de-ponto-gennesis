-- Campos do formulário de confirmação de recebimento (engenharia).

ALTER TABLE "material_deliveries"
  ADD COLUMN IF NOT EXISTS "receiptLocation" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptResponsibleName" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptPdfUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptPhotoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptNotes" TEXT;

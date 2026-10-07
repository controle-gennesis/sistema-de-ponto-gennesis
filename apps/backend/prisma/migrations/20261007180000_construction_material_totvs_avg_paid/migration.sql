-- Média paga das últimas OCs no TOTVS (fallback quando não há compras locais).
ALTER TABLE "construction_materials"
  ADD COLUMN IF NOT EXISTS "totvsAvgPaidUnitPrice" DECIMAL(12, 2);

-- Centros de custo do contrato (Controle de Contratos): varios por contrato
ALTER TABLE "contract_registry_entries"
  ADD COLUMN IF NOT EXISTS "cost_center_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

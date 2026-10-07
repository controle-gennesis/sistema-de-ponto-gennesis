-- Adiciona CANCELADO ao tipo de furo de estoque das entregas.

DO $$
BEGIN
  ALTER TYPE "MaterialDeliveryStockShortfallType" ADD VALUE 'CANCELADO';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

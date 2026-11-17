-- Observação da engenharia no pedido de material da FD (detalhes da RM e Histórico da OC no mapa de cotação).
ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "observacaoSolicitante" TEXT;

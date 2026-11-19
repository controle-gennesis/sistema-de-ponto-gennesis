-- Hora extra concluída: como foi atendida (PAGO_FINANCEIRO ou CREDITADO_BANCO).
ALTER TABLE "dp_requests" ADD COLUMN IF NOT EXISTS "dpResultado" TEXT;

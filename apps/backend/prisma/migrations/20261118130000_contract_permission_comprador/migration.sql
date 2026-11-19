-- Comprador por contrato: vê as RMs e OCs do contrato só no Mapa de Cotação, sem precisar do Liberado.
ALTER TABLE "user_contract_permissions" ADD COLUMN IF NOT EXISTS "accessComprador" BOOLEAN NOT NULL DEFAULT false;

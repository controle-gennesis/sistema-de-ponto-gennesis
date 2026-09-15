-- Setores que o gestor pode aprovar no contrato DF - ADM LOCAL (vazio = todos).
ALTER TABLE "user_dp_approval_contracts" ADD COLUMN IF NOT EXISTS "allowedSectors" JSONB NOT NULL DEFAULT '[]';

-- Setores nas aprovações restritas por centro de custo (DF - ADM LOCAL).
ALTER TABLE "user_restricted_dp_approval_cost_centers" ADD COLUMN IF NOT EXISTS "allowedSectors" JSONB NOT NULL DEFAULT '[]';

-- Template de cargo: mapa contractId -> setores.
ALTER TABLE "position_permission_templates" ADD COLUMN IF NOT EXISTS "dpApprovalContractSectors" JSONB NOT NULL DEFAULT '{}';

-- Template de cargo: mapa costCenterId -> setores (restrições).
ALTER TABLE "position_permission_templates" ADD COLUMN IF NOT EXISTS "restrictedDpApprovalCostCenterSectors" JSONB NOT NULL DEFAULT '{}';

-- A etapa Suprimentos foi removida: as fichas que estavam nela passam para Cotação.
UPDATE "demand_sheet_approvals"
SET "purchaseStatus" = 'QUOTATION'
WHERE "purchaseStatus" IN ('PURCHASE_REQUEST', 'SUPPLIES');

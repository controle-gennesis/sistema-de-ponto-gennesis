-- Novo status "Em Cotação" (QUOTATION); PURCHASE_REQUEST passa a ser exibido como "Suprimentos".
ALTER TYPE "DemandSheetPurchaseStatus" ADD VALUE IF NOT EXISTS 'QUOTATION';

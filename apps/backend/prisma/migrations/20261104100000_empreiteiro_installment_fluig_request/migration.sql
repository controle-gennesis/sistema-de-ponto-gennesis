-- Parcelas de contrato de servico: numero da solicitacao no Fluig (status e vencimento vem de la)
ALTER TABLE "empreiteiro_contract_installments" ADD COLUMN IF NOT EXISTS "fluigRequestNumber" TEXT;

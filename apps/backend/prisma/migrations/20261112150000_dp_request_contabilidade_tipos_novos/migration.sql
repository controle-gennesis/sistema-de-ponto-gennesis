-- Novos tipos de solicitação criados direto para a Contabilidade (Admissão, Afastamento, Alteração de função,
-- Alteração salarial, Férias e Rescisão). Idempotente.

ALTER TYPE "DpRequestType" ADD VALUE IF NOT EXISTS 'CONTAB_ADMISSAO';
ALTER TYPE "DpRequestType" ADD VALUE IF NOT EXISTS 'CONTAB_AFASTAMENTO';
ALTER TYPE "DpRequestType" ADD VALUE IF NOT EXISTS 'CONTAB_ALTERACAO_FUNCAO';
ALTER TYPE "DpRequestType" ADD VALUE IF NOT EXISTS 'CONTAB_ALTERACAO_SALARIAL';
ALTER TYPE "DpRequestType" ADD VALUE IF NOT EXISTS 'CONTAB_FERIAS';
ALTER TYPE "DpRequestType" ADD VALUE IF NOT EXISTS 'CONTAB_RESCISAO';

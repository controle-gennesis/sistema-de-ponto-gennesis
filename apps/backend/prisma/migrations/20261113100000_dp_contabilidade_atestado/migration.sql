-- Solicitação de atestado de colaborador direto para a Contabilidade. Idempotente.

ALTER TYPE "DpRequestType" ADD VALUE IF NOT EXISTS 'CONTAB_ATESTADO';
ALTER TYPE "DpContabilidadeRequestType" ADD VALUE IF NOT EXISTS 'ATESTADO';

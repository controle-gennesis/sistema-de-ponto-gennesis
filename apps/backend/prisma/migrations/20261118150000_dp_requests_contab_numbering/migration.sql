-- Solicitações da Contabilidade passam a ter numeração própria (1, 2, 3…), separada das Solicitações Internas.
-- 1) Marca quais linhas são da Contabilidade (fluxo direto).
ALTER TABLE "dp_requests" ADD COLUMN IF NOT EXISTS "contabDireta" BOOLEAN NOT NULL DEFAULT false;
-- Guarda o número antigo, para rastrear avisos/conversas que citam o número de antes.
ALTER TABLE "dp_requests" ADD COLUMN IF NOT EXISTS "displayNumberLegacy" INTEGER;

UPDATE "dp_requests"
SET "contabDireta" = true
WHERE "requestType" IN (
  'CONVENCAO_COLETIVA','FECHAMENTO_FOLHA','IMPOSTOS_ENCARGOS','REALOCACAO_COLABORADOR',
  'RETIFICACAO_RECALCULO','SOLICITACAO_GERAL','CONTAB_ADMISSAO','CONTAB_AFASTAMENTO',
  'CONTAB_ATESTADO','CONTAB_ALTERACAO_FUNCAO','CONTAB_ALTERACAO_SALARIAL','CONTAB_FERIAS','CONTAB_RESCISAO'
);

-- 2) O número deixa de ser único na tabela toda: passa a ser único dentro de cada grupo.
DROP INDEX IF EXISTS "dp_requests_displayNumber_key";

-- 3) Renumera as da Contabilidade já existentes, na ordem de criação (1, 2, 3…).
UPDATE "dp_requests" d
SET "displayNumberLegacy" = d."displayNumber",
    "displayNumber" = n.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", "displayNumber") AS rn
  FROM "dp_requests"
  WHERE "contabDireta" = true
) n
WHERE d.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS "dp_requests_contabDireta_displayNumber_key"
  ON "dp_requests"("contabDireta", "displayNumber");

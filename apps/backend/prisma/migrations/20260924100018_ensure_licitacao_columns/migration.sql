-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureLicitacaoColumns().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "estado" TEXT;

ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "regiaoKey" TEXT;

ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "arquivada" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "arquivadaEm" TIMESTAMP(3);

ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "arquivadaMotivo" TEXT;

CREATE INDEX IF NOT EXISTS "licitacoes_arquivada_idx"
    ON "licitacoes"("arquivada");

CREATE INDEX IF NOT EXISTS "licitacoes_arquivada_motivo_idx"
    ON "licitacoes"("arquivadaMotivo");

UPDATE "licitacoes"
    SET "arquivadaMotivo" = "analiseJson"->>'arquivadaMotivo'
    WHERE COALESCE("arquivada", FALSE) = TRUE
      AND "arquivadaMotivo" IS NULL
      AND ("analiseJson"->>'arquivadaMotivo') IN (
        'suspensa', 'declinada', 'encerrada', 'em_andamento', 'vencidas', 'aguardando_aprovacao', 'orcamento'
      );

UPDATE "licitacoes"
    SET "arquivadaMotivo" = NULL
    WHERE COALESCE("arquivada", FALSE) = TRUE
      AND "arquivadaMotivo" = 'encerrada'
      AND COALESCE("analiseJson"->>'arquivadaMotivo', '') = '';

ALTER TABLE "licitacoes"
    ADD COLUMN IF NOT EXISTS "analiseEtapa" TEXT NOT NULL DEFAULT 'em_analise';

CREATE INDEX IF NOT EXISTS "licitacoes_analise_etapa_idx"
    ON "licitacoes"("analiseEtapa");

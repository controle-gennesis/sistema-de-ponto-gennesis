-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureDpContabilidadeTables().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

DO $$ BEGIN
      CREATE TYPE "DpContabilidadeRequestType" AS ENUM (
        'ADMISSAO',
        'AFASTAMENTO',
        'ALTERACAO_FUNCAO',
        'ALTERACAO_SALARIAL',
        'CONVENCAO_COLETIVA',
        'FECHAMENTO_FOLHA',
        'FERIAS',
        'IMPOSTOS_ENCARGOS',
        'REALOCACAO_COLABORADOR',
        'RESCISAO',
        'RETIFICACAO_RECALCULO',
        'SOLICITACAO_GERAL'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

DO $$ BEGIN
      CREATE TYPE "DpContabilidadeRequestStatus" AS ENUM (
        'OPEN',
        'IN_PROGRESS',
        'CONCLUDED',
        'CANCELLED'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

CREATE TABLE IF NOT EXISTS "dp_contabilidade_requests" (
      "id" TEXT NOT NULL,
      "displayNumber" INTEGER NOT NULL,
      "createdByUserId" TEXT NOT NULL,
      "createdByName" TEXT NOT NULL,
      "createdByEmail" TEXT NOT NULL,
      "sector" TEXT,
      "requestType" "DpContabilidadeRequestType" NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "contractId" TEXT,
      "contractName" TEXT,
      "status" "DpContabilidadeRequestStatus" NOT NULL DEFAULT 'OPEN',
      "concludedAt" TIMESTAMP(3),
      "concludedByUserId" TEXT,
      "cancelledAt" TIMESTAMP(3),
      "cancelledByUserId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "dp_contabilidade_requests_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "dp_contabilidade_requests_displayNumber_key"
    ON "dp_contabilidade_requests"("displayNumber");

CREATE INDEX IF NOT EXISTS "dp_contabilidade_requests_status_idx"
    ON "dp_contabilidade_requests"("status");

CREATE INDEX IF NOT EXISTS "dp_contabilidade_requests_requestType_idx"
    ON "dp_contabilidade_requests"("requestType");

CREATE INDEX IF NOT EXISTS "dp_contabilidade_requests_createdByUserId_idx"
    ON "dp_contabilidade_requests"("createdByUserId");

CREATE INDEX IF NOT EXISTS "dp_contabilidade_requests_createdAt_idx"
    ON "dp_contabilidade_requests"("createdAt");

ALTER TABLE "dp_contabilidade_requests" ADD COLUMN IF NOT EXISTS "sourceDpRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "dp_contabilidade_requests_sourceDpRequestId_key"
    ON "dp_contabilidade_requests"("sourceDpRequestId");

CREATE TABLE IF NOT EXISTS "dp_contabilidade_comments" (
      "id" TEXT NOT NULL,
      "requestId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "userName" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "dp_contabilidade_comments_pkey" PRIMARY KEY ("id")
    );

CREATE INDEX IF NOT EXISTS "dp_contabilidade_comments_requestId_idx"
    ON "dp_contabilidade_comments"("requestId");

CREATE INDEX IF NOT EXISTS "dp_contabilidade_comments_createdAt_idx"
    ON "dp_contabilidade_comments"("createdAt");

DO $$ BEGIN
      ALTER TABLE "dp_contabilidade_comments"
      ADD CONSTRAINT "dp_contabilidade_comments_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "dp_contabilidade_requests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;

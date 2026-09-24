-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureJuridicoProcessosTables().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "juridico_processos" (
      "id" TEXT NOT NULL,
      "externalId" TEXT NOT NULL,
      "numeroProcesso" TEXT NOT NULL,
      "tribunal" TEXT,
      "vara" TEXT,
      "reclamante" TEXT NOT NULL,
      "dataAudiencia" TEXT,
      "horario" TEXT,
      "presencial" TEXT,
      "statusProcesso" TEXT,
      "decisaoStf" TEXT,
      "polo" TEXT,
      "empresa" TEXT,
      "objeto" TEXT,
      "objeto2" TEXT,
      "contrato" TEXT,
      "funcao" TEXT,
      "regimeContratacao" TEXT,
      "periodo" TEXT,
      "periodoInicio" TEXT,
      "periodoFim" TEXT,
      "representanteAutor" TEXT,
      "acordo" TEXT,
      "valorCausa" DECIMAL(14, 2),
      "statusSentenca" TEXT,
      "valorSentenca" DECIMAL(14, 2),
      "valorRO" DECIMAL(14, 2),
      "valorRR" DECIMAL(14, 2),
      "valorCustas" DECIMAL(14, 2),
      "valorAcordo" DECIMAL(14, 2),
      "valorPagoSentenciado" DECIMAL(14, 2),
      "valorParcela" DECIMAL(14, 2),
      "valorPago" DECIMAL(14, 2),
      "numParcelas" INTEGER,
      "custas" DECIMAL(14, 2),
      "previdencia" DECIMAL(14, 2),
      "outrosGastos" DECIMAL(14, 2),
      "status" TEXT,
      "dataAcordo" TEXT,
      "dataAbertura" TEXT,
      "agravoInstrumento" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "juridico_processos_pkey" PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX IF NOT EXISTS "juridico_processos_externalId_key"
      ON "juridico_processos"("externalId");

CREATE TABLE IF NOT EXISTS "juridico_processo_anexos" (
      "id" TEXT NOT NULL,
      "processoId" TEXT NOT NULL,
      "externalId" TEXT,
      "originalName" TEXT NOT NULL,
      "sourcePath" TEXT,
      "fileUrl" TEXT,
      "fileKey" TEXT,
      "mimeType" TEXT,
      "size" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "juridico_processo_anexos_pkey" PRIMARY KEY ("id")
    );

CREATE TABLE IF NOT EXISTS "juridico_processo_comprovantes" (
      "id" TEXT NOT NULL,
      "processoId" TEXT NOT NULL,
      "externalId" TEXT,
      "originalName" TEXT NOT NULL,
      "sourcePath" TEXT,
      "dataPagamento" TEXT,
      "fileUrl" TEXT,
      "fileKey" TEXT,
      "mimeType" TEXT,
      "size" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "juridico_processo_comprovantes_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
      ALTER TABLE "juridico_processo_anexos"
        ADD CONSTRAINT "juridico_processo_anexos_processoId_fkey"
        FOREIGN KEY ("processoId") REFERENCES "juridico_processos"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

DO $$ BEGIN
      ALTER TABLE "juridico_processo_comprovantes"
        ADD CONSTRAINT "juridico_processo_comprovantes_processoId_fkey"
        FOREIGN KEY ("processoId") REFERENCES "juridico_processos"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

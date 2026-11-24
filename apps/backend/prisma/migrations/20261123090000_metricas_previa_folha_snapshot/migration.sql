-- Prévia da Folha (Métricas): última leitura da consulta FOLPAG do TOTVS (somente consulta; nada é gravado no TOTVS).
CREATE TABLE IF NOT EXISTS "metricas_previa_folha_snapshot" (
  "id" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3),
  "trigger" TEXT,
  "fetchedByName" TEXT,
  "rows" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  CONSTRAINT "metricas_previa_folha_snapshot_pkey" PRIMARY KEY ("id")
);

-- Espelho local de datasets Fluig (ex.: G5-Relatorio-DF-GO-DP)
CREATE TABLE IF NOT EXISTS "fluig_dataset_mirror_meta" (
    "datasetId" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fluig_dataset_mirror_meta_pkey" PRIMARY KEY ("datasetId")
);

CREATE TABLE IF NOT EXISTS "fluig_dataset_mirror_rows" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fluig_dataset_mirror_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fluig_dataset_mirror_rows_datasetId_externalKey_key"
  ON "fluig_dataset_mirror_rows"("datasetId", "externalKey");

CREATE INDEX IF NOT EXISTS "fluig_dataset_mirror_rows_datasetId_idx"
  ON "fluig_dataset_mirror_rows"("datasetId");

CREATE INDEX IF NOT EXISTS "fluig_dataset_mirror_rows_syncedAt_idx"
  ON "fluig_dataset_mirror_rows"("syncedAt");

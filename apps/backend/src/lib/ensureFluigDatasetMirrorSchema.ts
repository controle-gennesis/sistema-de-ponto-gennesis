import type { PrismaClient } from '@prisma/client';

async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `;
  return (rows[0]?.c ?? BigInt(0)) > BigInt(0);
}

/** Cache de metadados de anexo. Roda mesmo quando o espelho já existe. */
export async function ensureFluigDocumentFileMetaTable(prisma: PrismaClient): Promise<void> {
  if (await tableExists(prisma, 'fluig_document_file_meta')) return;

  console.warn('[Schema] Tabela fluig_document_file_meta ausente — criando.');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "fluig_document_file_meta" (
      "documentId" TEXT NOT NULL,
      "filename" TEXT,
      "downloadUrl" TEXT,
      "empty" BOOLEAN NOT NULL DEFAULT false,
      "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "fluig_document_file_meta_pkey" PRIMARY KEY ("documentId")
    );
  `);
}

/** Garante tabelas do espelho Fluig em produção (sem depender só de migrate). */
export async function ensureFluigDatasetMirrorSchema(prisma: PrismaClient): Promise<void> {
  await ensureFluigDocumentFileMetaTable(prisma);
  if (await tableExists(prisma, 'fluig_dataset_mirror_meta')) return;

  console.warn('[Schema] Tabelas fluig_dataset_mirror_* ausentes — criando.');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "fluig_dataset_mirror_meta" (
      "datasetId" TEXT NOT NULL,
      "columns" JSONB NOT NULL,
      "rowCount" INTEGER NOT NULL DEFAULT 0,
      "syncedAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "fluig_dataset_mirror_meta_pkey" PRIMARY KEY ("datasetId")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "fluig_dataset_mirror_rows" (
      "id" TEXT NOT NULL,
      "datasetId" TEXT NOT NULL,
      "externalKey" TEXT NOT NULL,
      "payload" JSONB NOT NULL,
      "syncedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "fluig_dataset_mirror_rows_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "fluig_dataset_mirror_rows_datasetId_externalKey_key"
      ON "fluig_dataset_mirror_rows"("datasetId", "externalKey");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "fluig_dataset_mirror_rows_datasetId_idx"
      ON "fluig_dataset_mirror_rows"("datasetId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "fluig_dataset_mirror_rows_syncedAt_idx"
      ON "fluig_dataset_mirror_rows"("syncedAt");
  `);
}

/** Registro de cada chamada HTTP do Conecta ao Fluig (origem, tipo, status, tempo). */
export async function ensureFluigRequestLogTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "fluig_request_logs" (
      "id" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "origem" TEXT NOT NULL,
      "detalhe" TEXT,
      "userId" TEXT,
      "tipo" TEXT NOT NULL,
      "metodo" TEXT NOT NULL,
      "path" TEXT NOT NULL,
      "datasetId" TEXT,
      "status" INTEGER,
      "ok" BOOLEAN NOT NULL DEFAULT true,
      "durationMs" INTEGER NOT NULL DEFAULT 0,
      "erro" TEXT,
      CONSTRAINT "fluig_request_logs_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "fluig_request_logs_createdAt_idx" ON "fluig_request_logs"("createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "fluig_request_logs_origem_createdAt_idx" ON "fluig_request_logs"("origem", "createdAt");
  `);
}

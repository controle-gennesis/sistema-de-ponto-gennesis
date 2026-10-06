import type { PrismaClient } from '@prisma/client';

async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `;
  return (rows[0]?.c ?? BigInt(0)) > BigInt(0);
}

/** Garante tabelas do espelho Fluig em produção (sem depender só de migrate). */
export async function ensureFluigDatasetMirrorSchema(prisma: PrismaClient): Promise<void> {
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

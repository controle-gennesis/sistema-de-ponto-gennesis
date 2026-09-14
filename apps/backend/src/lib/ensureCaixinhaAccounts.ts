import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { CAIXINHA_ACCOUNT_SEEDS } from './caixinhaAccountSeeds';

function accountIdForName(name: string): string {
  return `cacc_${createHash('sha1').update(name).digest('hex').slice(0, 20)}`;
}

export async function upsertCaixinhaAccountName(
  prisma: PrismaClient,
  name: string
): Promise<void> {
  const n = name.trim();
  if (!n) return;
  await prisma.$executeRaw`
    INSERT INTO "caixinha_accounts" ("id", "name", "createdAt", "updatedAt")
    VALUES (${accountIdForName(n)}, ${n}, NOW(), NOW())
    ON CONFLICT ("name") DO NOTHING
  `;
}

export async function listCaixinhaAccountNames(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT "name" FROM "caixinha_accounts" ORDER BY "name" ASC
  `;
  return rows.map((r) => r.name).filter(Boolean);
}

export async function ensureCaixinhaAccountsTable(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "caixinha_accounts" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "caixinha_accounts_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "caixinha_accounts_name_key"
    ON "caixinha_accounts"("name");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "caixinha_accounts_name_idx"
    ON "caixinha_accounts"("name");
  `);

  const existingRows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT "name" FROM "caixinha_accounts"
  `;
  const existingNames = new Set(existingRows.map((r) => r.name));
  const missing = CAIXINHA_ACCOUNT_SEEDS.filter((name) => !existingNames.has(name));
  if (missing.length === 0) return;

  const chunkSize = 80;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    const values = chunk.map(
      (name) =>
        Prisma.sql`(${accountIdForName(name)}, ${name}, NOW(), NOW())`
    );
    await prisma.$executeRaw`
      INSERT INTO "caixinha_accounts" ("id", "name", "createdAt", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("name") DO NOTHING
    `;
  }
}

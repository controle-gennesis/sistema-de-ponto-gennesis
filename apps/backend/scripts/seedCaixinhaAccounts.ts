import '../src/loadEnv';
import { prisma } from '../src/lib/prisma';
import { CAIXINHA_ACCOUNT_SEEDS } from '../src/lib/caixinhaAccountSeeds';
import { ensureCaixinhaAccountsTable, listCaixinhaAccountNames } from '../src/lib/ensureCaixinhaAccounts';

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "caixinha_accounts" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "caixinha_accounts_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`DELETE FROM "caixinha_accounts"`);
  await ensureCaixinhaAccountsTable(prisma);
  const names = await listCaixinhaAccountNames(prisma);
  console.log(`[caixinha] catálogo substituído: ${names.length} contas (planilha ${CAIXINHA_ACCOUNT_SEEDS.length})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

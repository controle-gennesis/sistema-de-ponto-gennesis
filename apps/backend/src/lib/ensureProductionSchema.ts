import type { PrismaClient } from '@prisma/client';

async function columnExists(
  prisma: PrismaClient,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
  `;
  return (rows[0]?.c ?? BigInt(0)) > BigInt(0);
}

async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `;
  return (rows[0]?.c ?? BigInt(0)) > BigInt(0);
}

async function ensureContractAddendaTable(prisma: PrismaClient): Promise<void> {
  if (await tableExists(prisma, 'contract_addenda')) return;

  console.warn(
    '[Schema] Tabela contract_addenda ausente — criando automaticamente. ' +
      'Prefira: cd apps/backend && npx prisma migrate deploy.'
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "contract_addenda" (
      "id" TEXT NOT NULL,
      "contractId" TEXT NOT NULL,
      "effectiveDate" TIMESTAMP(3) NOT NULL,
      "amount" DECIMAL(15, 2) NOT NULL,
      "note" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "contract_addenda_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "contract_addenda_contractId_idx"
    ON "contract_addenda"("contractId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "contract_addenda_contractId_effectiveDate_idx"
    ON "contract_addenda"("contractId", "effectiveDate");
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      ALTER TABLE "contract_addenda" ADD CONSTRAINT "contract_addenda_contractId_fkey"
        FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function ensureMaterialRequestColumns(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'material_requests'))) return;

  if (!(await columnExists(prisma, 'material_requests', 'serviceOrder'))) {
    console.warn('[Schema] Coluna material_requests.serviceOrder ausente — adicionando.');
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "serviceOrder" TEXT;`
    );
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "material_requests_serviceOrder_idx" ON "material_requests"("serviceOrder");
    `);
  }

  if (!(await columnExists(prisma, 'material_requests', 'obra'))) {
    console.warn('[Schema] Coluna material_requests.obra ausente — adicionando.');
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "obra" TEXT;`
    );
  }

  if (!(await columnExists(prisma, 'material_requests', 'serviceOrderId'))) {
    console.warn('[Schema] Coluna material_requests.serviceOrderId ausente — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "serviceOrderId" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "material_requests_serviceOrderId_idx" ON "material_requests"("serviceOrderId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_serviceOrderId_fkey"
          FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }
}

async function ensureMaterialRequestItemColumns(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'material_request_items'))) return;

  if (!(await columnExists(prisma, 'material_request_items', 'attachmentUrl'))) {
    console.warn('[Schema] Colunas de anexo em material_request_items ausentes — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "material_request_items"
        ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT,
        ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
    `);
  }
}

async function ensureDemandSheetApprovals(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'demand_sheet_approvals'))) {
    console.warn('[Schema] Tabela demand_sheet_approvals ausente — criando.');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        CREATE TYPE "DemandSheetApprovalStatus" AS ENUM ('WAITING_MANAGER', 'APPROVED', 'REJECTED', 'CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "demand_sheet_approvals" (
        "id" TEXT NOT NULL,
        "numMovRm" TEXT NOT NULL,
        "idMovRm" TEXT NOT NULL,
        "codigoPedido" TEXT NOT NULL,
        "solicitanteId" TEXT NOT NULL,
        "contratoId" TEXT NOT NULL,
        "obra" TEXT NOT NULL,
        "codFichaDemanda" TEXT NOT NULL,
        "faturamentoEstimado" DECIMAL(15,2) NOT NULL,
        "custoEstimado" DECIMAL(15,2) NOT NULL,
        "observacao" TEXT NOT NULL,
        "dataHora" TIMESTAMP(3) NOT NULL,
        "polo" TEXT NOT NULL,
        "anexos" JSONB NOT NULL DEFAULT '[]',
        "status" "DemandSheetApprovalStatus" NOT NULL DEFAULT 'WAITING_MANAGER',
        "createdBy" TEXT NOT NULL,
        "managerApprovedBy" TEXT,
        "managerApprovedAt" TIMESTAMP(3),
        "managerApprovalComment" TEXT,
        "managerRejectionReason" TEXT,
        "managerRejectionComment" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "demand_sheet_approvals_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_contratoId_idx" ON "demand_sheet_approvals"("contratoId");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_solicitanteId_idx" ON "demand_sheet_approvals"("solicitanteId");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_createdBy_idx" ON "demand_sheet_approvals"("createdBy");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_status_idx" ON "demand_sheet_approvals"("status");
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_codFichaDemanda_idx" ON "demand_sheet_approvals"("codFichaDemanda");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_solicitanteId_fkey"
          FOREIGN KEY ("solicitanteId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_contratoId_fkey"
          FOREIGN KEY ("contratoId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_createdBy_fkey"
          FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_managerApprovedBy_fkey"
          FOREIGN KEY ("managerApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  if (!(await columnExists(prisma, 'demand_sheet_approvals', 'purchaseStatus'))) {
    console.warn('[Schema] Colunas de status de compras em demand_sheet_approvals ausentes — adicionando.');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        CREATE TYPE "DemandSheetPurchaseStatus" AS ENUM (
          'WAREHOUSE_DF',
          'WAREHOUSE_GO',
          'FULLY_FULFILLED_BY_STOCK',
          'PARTIALLY_FULFILLED_BY_STOCK',
          'PURCHASE_REQUEST',
          'SUPPLIES',
          'FINISHED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "demand_sheet_approvals"
        ADD COLUMN IF NOT EXISTS "purchaseStatus" "DemandSheetPurchaseStatus",
        ADD COLUMN IF NOT EXISTS "purchaseStatusUpdatedBy" TEXT,
        ADD COLUMN IF NOT EXISTS "purchaseStatusUpdatedAt" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "demand_sheet_approvals_purchaseStatus_idx"
      ON "demand_sheet_approvals"("purchaseStatus");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_purchaseStatusUpdatedBy_fkey"
          FOREIGN KEY ("purchaseStatusUpdatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }
}

async function ensurePurchaseOrderStageApprovals(prisma: PrismaClient): Promise<void> {
  if (!(await tableExists(prisma, 'purchase_orders'))) return;

  if (!(await columnExists(prisma, 'purchase_orders', 'comprasApprovedBy'))) {
    console.warn('[Schema] Colunas de aprovação por etapa em purchase_orders ausentes — adicionando.');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "purchase_orders"
        ADD COLUMN IF NOT EXISTS "comprasApprovedBy" TEXT,
        ADD COLUMN IF NOT EXISTS "comprasApprovedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "gestorApprovedBy" TEXT,
        ADD COLUMN IF NOT EXISTS "gestorApprovedAt" TIMESTAMP(3);
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_comprasApprovedBy_fkey"
          FOREIGN KEY ("comprasApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_gestorApprovedBy_fkey"
          FOREIGN KEY ("gestorApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }
}

/**
 * Corrige drift conhecido entre Prisma schema e bancos de produção onde migrate deploy não aplicou tudo.
 * DDL idempotente (IF NOT EXISTS / duplicate_object).
 */
export async function ensureProductionSchema(prisma: PrismaClient): Promise<void> {
  try {
    await ensureContractAddendaTable(prisma);
    await ensureMaterialRequestColumns(prisma);
    await ensureMaterialRequestItemColumns(prisma);
    await ensureDemandSheetApprovals(prisma);
    await ensurePurchaseOrderStageApprovals(prisma);
    console.log('[Schema] Verificação de tabelas/colunas críticas concluída.');
  } catch (e) {
    console.error('[Schema] Falha ao garantir esquema de produção:', e);
  }
}

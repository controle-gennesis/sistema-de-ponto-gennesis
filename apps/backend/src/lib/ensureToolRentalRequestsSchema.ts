import type { PrismaClient } from '@prisma/client';

/**
 * Garante tabelas de solicitação de ferramentas (tool rental).
 * Idempotente — cobre ambientes locais onde a migration não foi aplicada.
 */
export async function ensureToolRentalRequestsSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ToolRentalDemandType" AS ENUM ('NOVA_LOCACAO', 'RENOVACAO', 'DEVOLUCAO', 'COMPRA');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Enum pode existir sem COMPRA em bases antigas
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TYPE "ToolRentalDemandType" ADD VALUE 'COMPRA';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN others THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ToolRentalPriority" AS ENUM ('NORMAL', 'URGENT');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ToolRentalLogisticsMode" AS ENUM (
        'ENTREGA_LOGISTICA',
        'RETIRADA_LOGISTICA',
        'ENTREGA_FORNECEDOR',
        'RETIRADA_FORNECEDOR'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ToolRentalRequestStatus" AS ENUM (
        'OPEN',
        'SUPPLIER_RELATION',
        'AWAITING_PAYMENT',
        'AWAITING_RECEIPT',
        'COMPLETED',
        'REJECTED',
        'CANCELLED'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Enum pode existir sem AWAITING_RECEIPT / QUOTATION em bases antigas
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TYPE "ToolRentalRequestStatus" ADD VALUE 'AWAITING_RECEIPT';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN others THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TYPE "ToolRentalRequestStatus" ADD VALUE 'QUOTATION';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN others THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TYPE "ToolRentalRequestStatus" ADD VALUE 'IN_USE';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN others THEN NULL;
    END $$;
  `);

  // Legado: recebidas e ainda sem renovação/devolução filha passam a Em uso
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      UPDATE "tool_rental_requests" tr
      SET "status" = 'IN_USE', "updatedAt" = CURRENT_TIMESTAMP
      WHERE tr."status" = 'COMPLETED'
        AND tr."receivedAt" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "tool_rental_requests" child
          WHERE child."renewedFromId" = tr."id"
        );
    EXCEPTION
      WHEN others THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "tool_rental_requests" (
      "id" TEXT PRIMARY KEY,
      "code" TEXT NOT NULL UNIQUE,
      "polo" TEXT NOT NULL,
      "contrato" TEXT NOT NULL,
      "obra" TEXT NOT NULL,
      "titulo" TEXT NOT NULL,
      "assignedUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "supplierId" TEXT REFERENCES "suppliers"("id") ON DELETE SET NULL,
      "supplierName" TEXT,
      "priority" "ToolRentalPriority" NOT NULL DEFAULT 'NORMAL',
      "logisticsMode" "ToolRentalLogisticsMode" NOT NULL,
      "demandType" "ToolRentalDemandType" NOT NULL,
      "equipamento" TEXT NOT NULL,
      "periodoInicio" DATE NOT NULL,
      "periodoFim" DATE NOT NULL,
      "linkSugestao" TEXT,
      "status" "ToolRentalRequestStatus" NOT NULL DEFAULT 'OPEN',
      "ocMirrorUrl" TEXT,
      "ocMirrorName" TEXT,
      "paymentProofUrl" TEXT,
      "paymentProofName" TEXT,
      "suppliesApprovedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
      "suppliesApprovedAt" TIMESTAMP(3),
      "suppliesApprovalComment" TEXT,
      "suppliesRejectionReason" TEXT,
      "createdById" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "tool_rental_request_events" (
      "id" TEXT PRIMARY KEY,
      "requestId" TEXT NOT NULL REFERENCES "tool_rental_requests"("id") ON DELETE CASCADE,
      "fromStatus" "ToolRentalRequestStatus",
      "toStatus" "ToolRentalRequestStatus" NOT NULL,
      "note" TEXT,
      "actorId" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_requests_status_idx" ON "tool_rental_requests"("status");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_requests_createdById_idx" ON "tool_rental_requests"("createdById");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_requests_assignedUserId_idx" ON "tool_rental_requests"("assignedUserId");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_requests_createdAt_idx" ON "tool_rental_requests"("createdAt");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_request_events_requestId_createdAt_idx" ON "tool_rental_request_events"("requestId", "createdAt");`
  );

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "tool_rental_requests"
    ADD COLUMN IF NOT EXISTS "attachments" JSONB;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "tool_rental_requests"
    ADD COLUMN IF NOT EXISTS "equipamentos" JSONB;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "tool_rental_requests"
    ADD COLUMN IF NOT EXISTS "receivedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "tool_rental_requests"
    ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "tool_rental_requests"
    ADD COLUMN IF NOT EXISTS "renewedFromId" TEXT REFERENCES "tool_rental_requests"("id") ON DELETE SET NULL;
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_requests_renewedFromId_idx" ON "tool_rental_requests"("renewedFromId");`
  );

  // Recebimento passou a ser flag (receivedAt), não status principal
  await prisma.$executeRawUnsafe(`
    UPDATE "tool_rental_requests"
    SET "status" = 'COMPLETED', "updatedAt" = CURRENT_TIMESTAMP
    WHERE "status" = 'AWAITING_RECEIPT';
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "tool_rental_requests"
    ADD COLUMN IF NOT EXISTS "contractId" TEXT REFERENCES "contracts"("id") ON DELETE SET NULL;
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "tool_rental_requests_contractId_idx" ON "tool_rental_requests"("contractId");`
  );

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "tool_rental_requests"
    ADD COLUMN IF NOT EXISTS "receiptObservation" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "tool_rental_requests"
    ADD COLUMN IF NOT EXISTS "receiptAttachments" JSONB;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "tool_rental_requests"
    ADD COLUMN IF NOT EXISTS "scNumber" TEXT;
  `);

  // Backfill: vincula pelo nome do contrato quando houver match único
  await prisma.$executeRawUnsafe(`
    UPDATE "tool_rental_requests" tr
    SET "contractId" = c.id
    FROM "contracts" c
    WHERE tr."contractId" IS NULL
      AND tr."contrato" IS NOT NULL
      AND LOWER(TRIM(tr."contrato")) = LOWER(TRIM(c.name))
      AND (
        SELECT COUNT(*) FROM "contracts" c2
        WHERE LOWER(TRIM(c2.name)) = LOWER(TRIM(tr."contrato"))
      ) = 1
  `);
}

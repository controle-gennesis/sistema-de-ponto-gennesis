-- AlterTable
ALTER TABLE "demand_sheet_approvals" ADD COLUMN "pedidosEncerrados" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "demand_sheet_approvals" ADD COLUMN "pedidosEncerradosBy" TEXT;
ALTER TABLE "demand_sheet_approvals" ADD COLUMN "pedidosEncerradosAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "demand_sheet_approvals" ADD CONSTRAINT "demand_sheet_approvals_pedidosEncerradosBy_fkey" FOREIGN KEY ("pedidosEncerradosBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

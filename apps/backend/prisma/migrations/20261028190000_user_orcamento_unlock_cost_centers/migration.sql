-- Controle → Aprovações → Destrancar orçamento e FD (por centro de custo).
CREATE TABLE IF NOT EXISTS "user_orcamento_unlock_cost_centers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_orcamento_unlock_cost_centers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_orcamento_unlock_cost_centers_userId_costCenterId_key" ON "user_orcamento_unlock_cost_centers"("userId", "costCenterId");
CREATE INDEX IF NOT EXISTS "user_orcamento_unlock_cost_centers_userId_idx" ON "user_orcamento_unlock_cost_centers"("userId");
CREATE INDEX IF NOT EXISTS "user_orcamento_unlock_cost_centers_costCenterId_idx" ON "user_orcamento_unlock_cost_centers"("costCenterId");

DO $$ BEGIN
  ALTER TABLE "user_orcamento_unlock_cost_centers" ADD CONSTRAINT "user_orcamento_unlock_cost_centers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "user_orcamento_unlock_cost_centers" ADD CONSTRAINT "user_orcamento_unlock_cost_centers_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "user_orcamento_unlock_cost_centers" ADD CONSTRAINT "user_orcamento_unlock_cost_centers_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

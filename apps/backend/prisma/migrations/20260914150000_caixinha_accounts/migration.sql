-- CreateTable
CREATE TABLE IF NOT EXISTS "caixinha_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caixinha_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "caixinha_accounts_name_key" ON "caixinha_accounts"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "caixinha_accounts_name_idx" ON "caixinha_accounts"("name");

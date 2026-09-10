-- CreateTable
CREATE TABLE IF NOT EXISTS "obras" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "obras_name_idx" ON "obras"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "obras_isActive_idx" ON "obras"("isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "obras_contratoId_idx" ON "obras"("contratoId");

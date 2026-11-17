-- CreateTable
CREATE TABLE IF NOT EXISTS "quote_map_drafts" (
  "id" TEXT NOT NULL,
  "materialRequestId" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "updatedById" TEXT NOT NULL,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quote_map_drafts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "quote_map_drafts_materialRequestId_key" ON "quote_map_drafts"("materialRequestId");

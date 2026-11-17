-- CreateTable
CREATE TABLE IF NOT EXISTS "material_request_correction_logs" (
  "id" TEXT NOT NULL,
  "materialRequestId" TEXT NOT NULL,
  "materialId" TEXT,
  "previousMaterialId" TEXT,
  "userId" TEXT NOT NULL,
  "userName" TEXT,
  "changes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "material_request_correction_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "material_request_correction_logs_materialRequestId_idx" ON "material_request_correction_logs"("materialRequestId");

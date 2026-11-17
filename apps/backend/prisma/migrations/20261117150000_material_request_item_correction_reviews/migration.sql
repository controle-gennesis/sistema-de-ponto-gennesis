-- CreateTable
CREATE TABLE IF NOT EXISTS "material_request_item_correction_reviews" (
  "materialRequestItemId" TEXT NOT NULL,
  "materialRequestId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "material_request_item_correction_reviews_pkey" PRIMARY KEY ("materialRequestItemId")
);
CREATE INDEX IF NOT EXISTS "material_request_item_correction_reviews_materialRequestId_idx" ON "material_request_item_correction_reviews"("materialRequestId");

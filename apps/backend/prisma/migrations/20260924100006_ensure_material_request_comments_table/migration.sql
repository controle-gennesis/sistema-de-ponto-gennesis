-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureMaterialRequestCommentsTable().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "material_request_comments" (
      "id" TEXT NOT NULL,
      "materialRequestId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "material_request_comments_pkey" PRIMARY KEY ("id")
    );

CREATE INDEX IF NOT EXISTS "material_request_comments_materialRequestId_idx"
      ON "material_request_comments"("materialRequestId");

CREATE INDEX IF NOT EXISTS "material_request_comments_userId_idx"
      ON "material_request_comments"("userId");

DO $$
BEGIN
  ALTER TABLE "material_request_comments"
    ADD CONSTRAINT "material_request_comments_materialRequestId_fkey"
    FOREIGN KEY ("materialRequestId") REFERENCES "material_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "material_request_comments"
    ADD CONSTRAINT "material_request_comments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

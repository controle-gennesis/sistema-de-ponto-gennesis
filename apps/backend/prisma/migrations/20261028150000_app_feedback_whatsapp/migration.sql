-- AlterTable
ALTER TABLE "app_feedback" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "app_feedback" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'SISTEMA';
ALTER TABLE "app_feedback" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "app_feedback_phone_createdAt_idx" ON "app_feedback"("phone", "createdAt");

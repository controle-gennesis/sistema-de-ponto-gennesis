CREATE TABLE IF NOT EXISTS "app_feedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rating" INTEGER,
  "likes" TEXT,
  "comment" TEXT,
  "page" TEXT,
  "dismissed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "app_feedback_userId_createdAt_idx" ON "app_feedback"("userId", "createdAt");

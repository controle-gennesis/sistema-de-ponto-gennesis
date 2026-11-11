CREATE TABLE IF NOT EXISTS "dp_request_comments" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dp_request_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "dp_request_comments_requestId_createdAt_idx" ON "dp_request_comments"("requestId", "createdAt");
ALTER TABLE "dp_request_comments" DROP CONSTRAINT IF EXISTS "dp_request_comments_requestId_fkey";
ALTER TABLE "dp_request_comments" ADD CONSTRAINT "dp_request_comments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "dp_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "dp_request_comment_reads" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dp_request_comment_reads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "dp_request_comment_reads_requestId_userId_key" ON "dp_request_comment_reads"("requestId", "userId");
CREATE INDEX IF NOT EXISTS "dp_request_comment_reads_userId_idx" ON "dp_request_comment_reads"("userId");
ALTER TABLE "dp_request_comment_reads" DROP CONSTRAINT IF EXISTS "dp_request_comment_reads_requestId_fkey";
ALTER TABLE "dp_request_comment_reads" ADD CONSTRAINT "dp_request_comment_reads_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "dp_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "dp_request_attachments" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "uploadedByUserId" TEXT NOT NULL,
  "uploadedByName" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dp_request_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "dp_request_attachments_requestId_createdAt_idx" ON "dp_request_attachments"("requestId", "createdAt");
ALTER TABLE "dp_request_attachments" DROP CONSTRAINT IF EXISTS "dp_request_attachments_requestId_fkey";
ALTER TABLE "dp_request_attachments" ADD CONSTRAINT "dp_request_attachments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "dp_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

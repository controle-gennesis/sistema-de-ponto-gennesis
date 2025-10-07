-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "point_correction_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "originalDate" TIMESTAMP(3) NOT NULL,
    "originalTime" TEXT NOT NULL,
    "originalType" "TimeRecordType" NOT NULL,
    "correctedDate" TIMESTAMP(3) NOT NULL,
    "correctedTime" TEXT NOT NULL,
    "correctedType" "TimeRecordType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_correction_attachments" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_correction_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_correction_comments" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_correction_comments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "point_correction_requests" ADD CONSTRAINT "point_correction_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_correction_requests" ADD CONSTRAINT "point_correction_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_correction_attachments" ADD CONSTRAINT "point_correction_attachments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "point_correction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_correction_comments" ADD CONSTRAINT "point_correction_comments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "point_correction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_correction_comments" ADD CONSTRAINT "point_correction_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "fluig_request_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origem" TEXT NOT NULL,
    "detalhe" TEXT,
    "userId" TEXT,
    "tipo" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "datasetId" TEXT,
    "status" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,

    CONSTRAINT "fluig_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fluig_request_logs_createdAt_idx" ON "fluig_request_logs"("createdAt");

-- CreateIndex
CREATE INDEX "fluig_request_logs_origem_createdAt_idx" ON "fluig_request_logs"("origem", "createdAt");

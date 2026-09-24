-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureAuditLogTracking().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" TEXT NOT NULL,
        "userId" TEXT,
        "action" TEXT NOT NULL,
        "entity" TEXT NOT NULL,
        "entityId" TEXT,
        "summary" TEXT,
        "oldData" JSONB,
        "newData" JSONB,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
      );

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "summary" TEXT;

CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx"
    ON "audit_logs"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "audit_logs_entity_createdAt_idx"
    ON "audit_logs"("entity", "createdAt");

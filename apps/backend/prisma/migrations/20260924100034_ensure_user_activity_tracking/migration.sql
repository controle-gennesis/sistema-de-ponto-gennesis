-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureUserActivityTracking().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActivityPath" TEXT;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastActivityLabel" TEXT;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facePhotoUrl" TEXT;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facePhotoKey" TEXT;

CREATE TABLE IF NOT EXISTS "user_login_events" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'login',
        "success" BOOLEAN NOT NULL DEFAULT true,
        "source" TEXT,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "user_login_events_pkey" PRIMARY KEY ("id")
      );

ALTER TABLE "user_login_events" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'login';

CREATE TABLE IF NOT EXISTS "user_page_visits" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "path" TEXT NOT NULL,
        "label" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "user_page_visits_pkey" PRIMARY KEY ("id")
      );

CREATE INDEX IF NOT EXISTS "user_login_events_userId_createdAt_idx"
    ON "user_login_events"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "user_page_visits_userId_createdAt_idx"
    ON "user_page_visits"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "user_page_visits_userId_path_createdAt_idx"
    ON "user_page_visits"("userId", "path", "createdAt");

DO $$
    BEGIN
      ALTER TABLE "user_login_events" ADD CONSTRAINT "user_login_events_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

DO $$
    BEGIN
      ALTER TABLE "user_page_visits" ADD CONSTRAINT "user_page_visits_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

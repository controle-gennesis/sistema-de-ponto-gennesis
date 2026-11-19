-- CreateTable
CREATE TABLE IF NOT EXISTS "google_calendar_watches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "expiration" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_calendar_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "google_calendar_watches_channelId_key" ON "google_calendar_watches"("channelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "google_calendar_watches_userId_idx" ON "google_calendar_watches"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "google_calendar_watches_expiration_idx" ON "google_calendar_watches"("expiration");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "google_calendar_watches" ADD CONSTRAINT "google_calendar_watches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

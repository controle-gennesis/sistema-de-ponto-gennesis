ALTER TABLE "empreiteiros" ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "empreiteiros_userId_key" ON "empreiteiros"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiros_userId_fkey'
  ) THEN
    ALTER TABLE "empreiteiros"
      ADD CONSTRAINT "empreiteiros_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

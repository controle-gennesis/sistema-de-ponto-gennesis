-- AlterTable
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "osTemporaria" BOOLEAN NOT NULL DEFAULT false;

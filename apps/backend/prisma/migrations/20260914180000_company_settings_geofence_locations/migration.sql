-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "geofenceLocations" JSONB;

-- Conferencia de presenca por geolocalizacao no registro de ponto
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "geofenceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "geofenceBlockOutside" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "geofenceRequireLocation" BOOLEAN NOT NULL DEFAULT true;

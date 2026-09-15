-- Foto de confronto facial do ponto (separada do avatar de perfil).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facePhotoUrl" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facePhotoKey" TEXT;

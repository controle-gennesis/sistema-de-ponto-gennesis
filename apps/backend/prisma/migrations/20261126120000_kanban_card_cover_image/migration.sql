-- Foto de capa dos cartões do Tasks (imagem e miniatura).
ALTER TABLE "kanban_cards" ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;
ALTER TABLE "kanban_cards" ADD COLUMN IF NOT EXISTS "coverThumbUrl" TEXT;

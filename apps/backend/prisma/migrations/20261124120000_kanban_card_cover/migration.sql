-- Capa colorida nos cartões do Kanban
ALTER TABLE "kanban_cards" ADD COLUMN IF NOT EXISTS "coverColor" TEXT;
ALTER TABLE "kanban_cards" ADD COLUMN IF NOT EXISTS "coverSize" TEXT NOT NULL DEFAULT 'NORMAL';

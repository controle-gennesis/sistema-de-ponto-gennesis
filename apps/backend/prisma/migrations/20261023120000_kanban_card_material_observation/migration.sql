-- Observação por material nos cards do Kanban.
ALTER TABLE "kanban_card_materials" ADD COLUMN IF NOT EXISTS "observation" TEXT;

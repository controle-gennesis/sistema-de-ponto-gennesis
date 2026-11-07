-- Arquivar quadro inteiro do Kanban (some da lista de quadros; pode ser restaurado)
ALTER TABLE "kanban_boards" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

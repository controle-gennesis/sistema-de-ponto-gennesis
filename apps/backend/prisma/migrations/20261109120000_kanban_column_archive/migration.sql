-- Arquivar uma lista (coluna) do Kanban: some do quadro e pode ser restaurada
ALTER TABLE "kanban_columns" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

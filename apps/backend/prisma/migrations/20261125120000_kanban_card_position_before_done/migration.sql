-- Lugar do cartão na coluna antes de ser concluído (para voltar ao desmarcar)
ALTER TABLE "kanban_cards" ADD COLUMN IF NOT EXISTS "positionBeforeDone" INTEGER;

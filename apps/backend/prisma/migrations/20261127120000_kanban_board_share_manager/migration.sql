-- Gerente do quadro: convidado que também pode convidar e remover pessoas.
ALTER TABLE "kanban_board_shares" ADD COLUMN IF NOT EXISTS "can_manage" BOOLEAN NOT NULL DEFAULT false;

-- Histórico de ações nos cards do Kanban (mover, concluir, arquivar, editar, anexos...).

CREATE TABLE IF NOT EXISTS "kanban_card_activities" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kanban_card_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "kanban_card_activities_cardId_createdAt_idx"
  ON "kanban_card_activities"("cardId", "createdAt");

CREATE INDEX IF NOT EXISTS "kanban_card_activities_userId_idx"
  ON "kanban_card_activities"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kanban_card_activities_cardId_fkey'
  ) THEN
    ALTER TABLE "kanban_card_activities"
      ADD CONSTRAINT "kanban_card_activities_cardId_fkey"
      FOREIGN KEY ("cardId") REFERENCES "kanban_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kanban_card_activities_userId_fkey'
  ) THEN
    ALTER TABLE "kanban_card_activities"
      ADD CONSTRAINT "kanban_card_activities_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

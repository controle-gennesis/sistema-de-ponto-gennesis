-- Atribuições novas de card que a pessoa ainda não viu (sino de notificações)
ALTER TABLE "kanban_card_members" ADD COLUMN IF NOT EXISTS "unread" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "kanban_card_members_userId_unread_idx" ON "kanban_card_members"("userId", "unread");

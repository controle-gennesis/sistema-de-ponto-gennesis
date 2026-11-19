-- Pessoas marcadas (@) nos comentários do Kanban: alimenta o sino de notificações (web e mobile).
CREATE TABLE IF NOT EXISTS "kanban_comment_mentions" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unread" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "kanban_comment_mentions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "kanban_comment_mentions_commentId_userId_key"
  ON "kanban_comment_mentions"("commentId", "userId");
CREATE INDEX IF NOT EXISTS "kanban_comment_mentions_userId_unread_idx"
  ON "kanban_comment_mentions"("userId", "unread");
CREATE INDEX IF NOT EXISTS "kanban_comment_mentions_cardId_idx"
  ON "kanban_comment_mentions"("cardId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kanban_comment_mentions_commentId_fkey'
  ) THEN
    ALTER TABLE "kanban_comment_mentions"
      ADD CONSTRAINT "kanban_comment_mentions_commentId_fkey"
      FOREIGN KEY ("commentId") REFERENCES "kanban_card_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

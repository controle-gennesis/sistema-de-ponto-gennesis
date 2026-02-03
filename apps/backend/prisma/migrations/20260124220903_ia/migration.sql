-- CreateTable
CREATE TABLE "chatgpt_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatgpt_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatgpt_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chatgpt_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chatgpt_conversations_userId_idx" ON "chatgpt_conversations"("userId");

-- CreateIndex
CREATE INDEX "chatgpt_conversations_createdAt_idx" ON "chatgpt_conversations"("createdAt");

-- CreateIndex
CREATE INDEX "chatgpt_messages_conversationId_idx" ON "chatgpt_messages"("conversationId");

-- CreateIndex
CREATE INDEX "chatgpt_messages_createdAt_idx" ON "chatgpt_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "chatgpt_conversations" ADD CONSTRAINT "chatgpt_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatgpt_messages" ADD CONSTRAINT "chatgpt_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chatgpt_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

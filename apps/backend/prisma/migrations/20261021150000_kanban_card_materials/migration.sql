CREATE TABLE "kanban_card_materials" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kanban_card_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kanban_card_materials_cardId_materialId_key" ON "kanban_card_materials"("cardId", "materialId");
CREATE INDEX "kanban_card_materials_materialId_idx" ON "kanban_card_materials"("materialId");

ALTER TABLE "kanban_card_materials" ADD CONSTRAINT "kanban_card_materials_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "kanban_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kanban_card_materials" ADD CONSTRAINT "kanban_card_materials_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "construction_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "construction_materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "construction_materials_name_idx" ON "construction_materials"("name");

-- CreateIndex
CREATE INDEX "construction_materials_isActive_idx" ON "construction_materials"("isActive");

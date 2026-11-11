-- Diário de Obra (RDO): um registro por obra por dia
CREATE TABLE IF NOT EXISTS "diarios_obra" (
  "id" TEXT NOT NULL,
  "obraId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "noActivity" BOOLEAN NOT NULL DEFAULT false,
  "noActivityReason" TEXT,
  "content" JSONB NOT NULL DEFAULT '{}',
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "diarios_obra_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "diarios_obra_obraId_date_key" ON "diarios_obra"("obraId", "date");
CREATE INDEX IF NOT EXISTS "diarios_obra_obraId_date_idx" ON "diarios_obra"("obraId", "date");
DO $$ BEGIN
  ALTER TABLE "diarios_obra" ADD CONSTRAINT "diarios_obra_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "obras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

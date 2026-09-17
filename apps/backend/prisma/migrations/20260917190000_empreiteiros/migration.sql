-- Cadastro de empreiteiros da Engenharia
CREATE TABLE IF NOT EXISTS "empreiteiros" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "documentKind" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "contactName" TEXT,
    "email" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pixKey" TEXT,
    "bank" TEXT,
    "agency" TEXT,
    "account" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "photoUrl" TEXT,
    "photoKey" TEXT,
    "files" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empreiteiros_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "empreiteiros_document_key" ON "empreiteiros"("document");
CREATE INDEX IF NOT EXISTS "empreiteiros_name_idx" ON "empreiteiros"("name");
CREATE INDEX IF NOT EXISTS "empreiteiros_isActive_idx" ON "empreiteiros"("isActive");
CREATE INDEX IF NOT EXISTS "empreiteiros_contractId_idx" ON "empreiteiros"("contractId");
CREATE INDEX IF NOT EXISTS "empreiteiros_specialty_idx" ON "empreiteiros"("specialty");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiros_contractId_fkey'
  ) THEN
    ALTER TABLE "empreiteiros"
      ADD CONSTRAINT "empreiteiros_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "contracts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "empreiteiro_team_members" (
    "id" TEXT NOT NULL,
    "empreiteiroId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "document" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "photoUrl" TEXT,
    "photoKey" TEXT,
    "files" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empreiteiro_team_members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "empreiteiro_team_members_empreiteiroId_idx" ON "empreiteiro_team_members"("empreiteiroId");
CREATE INDEX IF NOT EXISTS "empreiteiro_team_members_name_idx" ON "empreiteiro_team_members"("name");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empreiteiro_team_members_empreiteiroId_fkey'
  ) THEN
    ALTER TABLE "empreiteiro_team_members"
      ADD CONSTRAINT "empreiteiro_team_members_empreiteiroId_fkey"
      FOREIGN KEY ("empreiteiroId") REFERENCES "empreiteiros"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

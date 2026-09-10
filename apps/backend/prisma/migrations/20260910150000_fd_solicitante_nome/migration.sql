-- Nome do solicitante vindo da planilha (COLABORADORES), sem precisar de User do sistema.
ALTER TABLE "demand_sheet_approvals" ADD COLUMN IF NOT EXISTS "solicitanteNome" TEXT;

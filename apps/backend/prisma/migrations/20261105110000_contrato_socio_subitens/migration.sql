-- Contratos Socios: linhas de detalhe (ex.: predios) de cada contrato, por mes e ano
CREATE TABLE IF NOT EXISTS "contrato_socio_subitens" (
    "id" TEXT NOT NULL,
    "contrato" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "faturamento" DECIMAL(15,2),
    "liquido" DECIMAL(15,2),
    "recebido" DECIMAL(15,2),
    "tetoOrcamentario" DECIMAL(15,2),
    "gastos" DECIMAL(15,2),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrato_socio_subitens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "contrato_socio_subitens_contrato_ano_mes_idx" ON "contrato_socio_subitens"("contrato", "ano", "mes");

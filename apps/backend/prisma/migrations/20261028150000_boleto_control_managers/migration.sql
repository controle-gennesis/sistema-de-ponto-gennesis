-- Controle de Boletos: gestor do contrato por centro de custo
CREATE TABLE IF NOT EXISTS "boleto_control_managers" (
    "id" TEXT NOT NULL,
    "costCenterName" TEXT NOT NULL,
    "managerName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boleto_control_managers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "boleto_control_managers_costCenterName_key" ON "boleto_control_managers"("costCenterName");

-- Carga inicial: tabela CENTRO DE CUSTO → GESTOR da aba CONFIG da planilha de controle (nomes oficiais do cadastro)
INSERT INTO "boleto_control_managers" ("id", "costCenterName", "managerName", "updatedAt") VALUES
  ('bcm_' || md5('SES GDF - LOTE 10'), 'SES GDF - LOTE 10', 'ENGª CARLA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('SES GDF - LOTE 12'), 'SES GDF - LOTE 12', 'ENGª CARLA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('SES GDF - LOTE 14'), 'SES GDF - LOTE 14', 'ENGª CARLA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('TJGO RETROFIT - LOTE 1'), 'TJGO RETROFIT - LOTE 1', 'ENGª CARLA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('TJGO RETROFIT R5 - LOTE 4'), 'TJGO RETROFIT R5 - LOTE 4', 'ENGª CARLA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('TJGO RETROFIT R5 - LOTE 5'), 'TJGO RETROFIT R5 - LOTE 5', 'ENGª CARLA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('MINISTÉRIO DA CULTURA - DF'), 'MINISTÉRIO DA CULTURA - DF', 'ENGª JULIANA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('SEDES'), 'SEDES', 'ENGª JULIANA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('SEDES NORTE'), 'SEDES NORTE', 'ENGª JULIANA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('SENAC - DF'), 'SENAC - DF', 'ENGª JULIANA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('CONFEA - 508 NORTE'), 'CONFEA - 508 NORTE', 'ENGª JULIANA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('CONFEA - 516 NORTE'), 'CONFEA - 516 NORTE', 'ENGª JULIANA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('FHE - DF'), 'FHE - DF', 'ENGª JULIANA', CURRENT_TIMESTAMP),
  ('bcm_' || md5('MAPA - UMIPI DE JEQUIE'), 'MAPA - UMIPI DE JEQUIE', 'ENG. CIRO', CURRENT_TIMESTAMP),
  ('bcm_' || md5('STM - DF'), 'STM - DF', 'ENG. CIRO', CURRENT_TIMESTAMP),
  ('bcm_' || md5('UFGO'), 'UFGO', 'ENG. EDUARDO', CURRENT_TIMESTAMP),
  ('bcm_' || md5('CAPITANIA FLUVIAL - GO'), 'CAPITANIA FLUVIAL - GO', 'ENG. LEONARDO', CURRENT_TIMESTAMP),
  ('bcm_' || md5('SEMASDH - GO'), 'SEMASDH - GO', 'ENG. LEONARDO', CURRENT_TIMESTAMP),
  ('bcm_' || md5('ITAMARATY - SERVIÇOS EVENTUAIS'), 'ITAMARATY - SERVIÇOS EVENTUAIS', 'ENGª ERICA', CURRENT_TIMESTAMP)
ON CONFLICT ("costCenterName") DO NOTHING;

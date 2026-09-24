-- Cota semanal de abastecimento por contrato (em tanques) + preço do tanque nas configurações da empresa.
ALTER TABLE "contracts" ADD COLUMN "weeklyFuelTankQuota" DECIMAL(6,2);
ALTER TABLE "company_settings" ADD COLUMN "fuelTankPriceReais" DECIMAL(10,2) NOT NULL DEFAULT 350;

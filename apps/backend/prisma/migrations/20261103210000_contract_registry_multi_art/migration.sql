-- Controle de Contratos: mais de uma ART por contrato e por aditivo
ALTER TABLE "contract_registry_entries" ADD COLUMN IF NOT EXISTS "arts" JSONB;
ALTER TABLE "contract_registry_addenda" ADD COLUMN IF NOT EXISTS "arts" JSONB;

-- Leva a ART única que já existia para a lista
UPDATE "contract_registry_entries"
SET "arts" = jsonb_build_array(jsonb_build_object('art', COALESCE("art", ''), 'professional', COALESCE("professional", '')))
WHERE "arts" IS NULL AND ("art" IS NOT NULL OR "professional" IS NOT NULL);

UPDATE "contract_registry_addenda"
SET "arts" = jsonb_build_array(jsonb_build_object('art', COALESCE("art", ''), 'professional', COALESCE("professional", '')))
WHERE "arts" IS NULL AND ("art" IS NOT NULL OR "professional" IS NOT NULL);

ALTER TABLE "contract_registry_entries" DROP COLUMN IF EXISTS "art";
ALTER TABLE "contract_registry_entries" DROP COLUMN IF EXISTS "professional";
ALTER TABLE "contract_registry_addenda" DROP COLUMN IF EXISTS "art";
ALTER TABLE "contract_registry_addenda" DROP COLUMN IF EXISTS "professional";

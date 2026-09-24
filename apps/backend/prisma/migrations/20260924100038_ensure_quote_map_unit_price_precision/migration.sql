-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureQuoteMapUnitPricePrecision().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

ALTER TABLE "quote_map_supplier_items"
      ALTER COLUMN "unitPrice" TYPE DECIMAL(12, 5);

ALTER TABLE "quote_map_winner_items"
      ALTER COLUMN "winnerUnitPrice" TYPE DECIMAL(12, 5);

ALTER TABLE "quote_map_winner_items"
      ALTER COLUMN "winnerScore" TYPE DECIMAL(15, 5);

ALTER TABLE "purchase_order_items"
      ALTER COLUMN "unitPrice" TYPE DECIMAL(12, 5);

ALTER TABLE "purchase_order_items"
      ALTER COLUMN "totalPrice" TYPE DECIMAL(14, 5);

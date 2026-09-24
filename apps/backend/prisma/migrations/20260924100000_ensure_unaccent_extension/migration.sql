-- Migration formal para o schema fix que já roda em runtime via ensureProductionSchema.ts::ensureUnaccentExtension().
-- Idempotente (IF NOT EXISTS / DO $$ ... EXCEPTION WHEN duplicate_object) — seguro mesmo se já aplicado.

CREATE EXTENSION IF NOT EXISTS unaccent

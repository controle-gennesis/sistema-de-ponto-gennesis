ALTER TABLE "tool_rental_requests" ADD COLUMN IF NOT EXISTS "scId" TEXT;

UPDATE "tool_rental_requests" SET "status" = 'QUOTATION' WHERE "status" = 'SUPPLIER_RELATION';
ALTER TABLE "tool_rental_requests" ADD COLUMN IF NOT EXISTS "ocId" TEXT;

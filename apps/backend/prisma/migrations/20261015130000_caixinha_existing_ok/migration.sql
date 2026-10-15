-- Lançamentos que já existiam ficam OK (PAGO). Novos continuam PENDENTE no create.
UPDATE "caixinha_purchases" SET "status" = 'PAGO' WHERE "status" <> 'PAGO';

-- O ID interno das RMs geradas pela FD era gravado em "idMovRm" (campo do ID de movimento do TOTVS).
-- Remove só os tokens que são IDs de RMs do Conecta; IDs do TOTVS informados à mão ficam.
UPDATE "demand_sheet_approvals" d
SET "idMovRm" = COALESCE((
  SELECT string_agg(btrim(t.token), ', ' ORDER BY t.ord)
  FROM unnest(string_to_array(d."idMovRm", ',')) WITH ORDINALITY AS t(token, ord)
  WHERE btrim(t.token) <> ''
    AND NOT EXISTS (SELECT 1 FROM "material_requests" m WHERE m."id" = btrim(t.token))
), '')
WHERE EXISTS (
  SELECT 1
  FROM unnest(string_to_array(d."idMovRm", ',')) AS t(token)
  JOIN "material_requests" m ON m."id" = btrim(t.token)
);

-- Controle de Boletos saiu de /ponto/financeiro/controle-boletos para /ponto/controle-boletos.
-- O código do módulo de permissão acompanha o endereço (ponto_financeiro_controle-boletos -> ponto_controle-boletos).
-- Copia o acesso de quem já tinha o módulo antigo para o novo, para ninguém perder a página na virada.
-- As linhas antigas ficam como estão: enquanto o frontend antigo ainda estiver no ar, ele continua enxergando o acesso.
INSERT INTO user_permissions (id, "userId", module, action, allowed, "updatedBy", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  old."userId",
  'ponto_controle-boletos',
  old.action,
  old.allowed,
  old."updatedBy",
  NOW(),
  NOW()
FROM user_permissions old
WHERE old.module = 'ponto_financeiro_controle-boletos'
  AND NOT EXISTS (
    SELECT 1
    FROM user_permissions x
    WHERE x."userId" = old."userId"
      AND x.module = 'ponto_controle-boletos'
      AND x.action = old.action
  );

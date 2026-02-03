# Instruções para Executar a Migração

## Problema
As tabelas `cost_centers` e `material_categories` não existem no banco de dados.

## Solução

### Opção 1: Executar a migração via Prisma (Recomendado)

1. Abra o terminal no diretório do backend:
```bash
cd "C:\Users\Lenovo\Desktop\projeto dp - 13.01.2026\sistema-de-ponto-gennesis\apps\backend"
```

2. Execute a migração:
```bash
npm run db:migrate
```

Ou diretamente:
```bash
npx prisma migrate dev
```

### Opção 2: Executar SQL diretamente no banco

Se o Prisma não funcionar, você pode executar o SQL diretamente no banco de dados PostgreSQL:

1. Abra o arquivo: `prisma/migrations/20260122000000_add_engineering_tables/migration.sql`
2. Copie todo o conteúdo
3. Execute no seu cliente PostgreSQL (pgAdmin, DBeaver, ou via psql)

### Opção 3: Usar Prisma Studio para verificar

Após executar a migração, você pode verificar se as tabelas foram criadas:

```bash
npm run db:studio
```

## Após a Migração

Depois que as tabelas forem criadas, execute o seed para popular os centros de custo:

```bash
npm run db:seed
```

Isso irá criar todos os 16 centros de custo solicitados com o campo `isActive: true`.

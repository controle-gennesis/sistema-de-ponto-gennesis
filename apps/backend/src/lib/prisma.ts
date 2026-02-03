import { PrismaClient } from '@prisma/client';

// Configurar DATABASE_URL com connection pool limit se não tiver
let databaseUrl = process.env.DATABASE_URL || '';
if (databaseUrl && !databaseUrl.includes('connection_limit')) {
  // Adiciona connection_limit se não existir
  const separator = databaseUrl.includes('?') ? '&' : '?';
  databaseUrl = `${databaseUrl}${separator}connection_limit=5&pool_timeout=10`;
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl || process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Configurar pool de conexões para evitar "too many connections"
// Isso garante que não abra mais conexões do que o banco permite
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export { prisma };


import { PrismaClient, Prisma } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Garante .env antes de montar o client (imports do index são hoisted e rodam antes do dotenv.config).
dotenv.config({ path: path.join(__dirname, '../.env') });

/** Default seguro sob carga (ex.: 30 logins simultâneos). Override: PRISMA_CONNECTION_LIMIT */
const DEFAULT_CONNECTION_LIMIT = 12;
/** Tempo de espera na fila do pool (segundos). Override: PRISMA_POOL_TIMEOUT */
const DEFAULT_POOL_TIMEOUT = 20;

function resolvePoolNumber(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function upsertQueryParam(url: string, key: string, value: string): string {
  const re = new RegExp(`([?&])${key}=[^&]*`);
  if (re.test(url)) {
    return url.replace(re, `$1${key}=${value}`);
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${key}=${value}`;
}

// Configurar DATABASE_URL com connection pool (sobrescreve limit baixo se já existir)
let databaseUrl = process.env.DATABASE_URL || '';
const connectionLimit = resolvePoolNumber('PRISMA_CONNECTION_LIMIT', DEFAULT_CONNECTION_LIMIT);
const poolTimeout = resolvePoolNumber('PRISMA_POOL_TIMEOUT', DEFAULT_POOL_TIMEOUT);

if (databaseUrl) {
  databaseUrl = upsertQueryParam(databaseUrl, 'connection_limit', String(connectionLimit));
  databaseUrl = upsertQueryParam(databaseUrl, 'pool_timeout', String(poolTimeout));
}

export function getPrismaPoolConfig(): { connectionLimit: number; poolTimeout: number } {
  return { connectionLimit, poolTimeout };
}

// Configurar logs do Prisma
// Se PRISMA_LOG_QUERIES=true, mostra todas as queries SQL (útil para debug)
// Por padrão, mostra apenas erros e warnings
const prismaLogLevels: Prisma.LogLevel[] = process.env.PRISMA_LOG_QUERIES === 'true' 
  ? ['query', 'error', 'warn'] 
  : ['error', 'warn'];

function buildPrismaClient(): PrismaClient {
  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL não configurada. Verifique o arquivo apps/backend/.env e reinicie o backend.'
    );
  }
  return new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
    log: prismaLogLevels,
  });
}

let prisma = buildPrismaClient();

/** Recria o client se modelos novos ainda não estiverem na instância em memória (após prisma generate). */
export function getPrisma(): PrismaClient {
  const p = prisma as PrismaClient & {
    licitacao?: unknown;
    licitacaoDocumento?: unknown;
  };
  if (!p.licitacao || !p.licitacaoDocumento) {
    console.warn(
      '[Prisma] Recriando PrismaClient — modelos de Licitações ausentes na instância em memória.'
    );
    const previous = prisma;
    prisma = buildPrismaClient();
    void previous.$disconnect().catch(() => undefined);
  }
  return prisma;
}

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

// Garante que o @prisma/client está atualizado (reinicie o backend após `npx prisma generate`)
const p = prisma as {
  driveFolder?: unknown;
  driveFile?: unknown;
  extratoCaixaFiltroSalvo?: unknown;
};
if (!p.driveFolder || !p.driveFile) {
  console.error(
    '❌ @prisma/client sem modelos Drive. Rode na pasta apps/backend: npx prisma generate e reinicie o servidor.',
  );
} else if (process.env.NODE_ENV === 'development') {
  console.log('✅ Prisma: modelos Drive (drive_folders / drive_files) carregados.');
}
if (!p.extratoCaixaFiltroSalvo) {
  console.error(
    '❌ @prisma/client sem ExtratoCaixaFiltroSalvo (filtros salvos do extrato). Rode em apps/backend: npx prisma generate e reinicie o servidor.',
  );
}

const pLicit = getPrisma() as { licitacao?: unknown; licitacaoDocumento?: unknown };
if (!pLicit.licitacao || !pLicit.licitacaoDocumento) {
  console.error(
    '❌ @prisma/client sem modelos Licitações. Rode em apps/backend: npx prisma generate e reinicie o npm run dev.',
  );
} else if (process.env.NODE_ENV === 'development') {
  console.log('✅ Prisma: modelos Licitações (licitacoes / licitacao_documentos) carregados.');
}

export { prisma };

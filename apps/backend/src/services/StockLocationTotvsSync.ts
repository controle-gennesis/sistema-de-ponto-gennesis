import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { ensureStockLocationsTable } from '../lib/ensureProductionSchema';
import { fetchRmConsultaRows, pickRmField } from '../lib/totvsRmConsulta';

export type StockLocationSyncResult = {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  syncedAt: string;
};

const SUPPORTED_FILIAIS = new Set([1, 5]);
const MIN_INTERVAL_MS = 60_000;

let inFlight: Promise<StockLocationSyncResult> | null = null;
let lastResult: StockLocationSyncResult | null = null;
let lastRunAt = 0;

const pick = pickRmField;

function parseActive(value: string): boolean {
  if (!value) return true;
  const v = value.trim().toUpperCase();
  return !(v === '0' || v === 'F' || v === 'FALSE' || v === 'N' || v === 'NAO' || v === 'NÃO');
}

function newId(): string {
  return `sl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function runSync(): Promise<StockLocationSyncResult> {
  await ensureStockLocationsTable(prisma);
  const rows = await fetchRmConsultaRows('LOCAISESTOQUE', 'TOTVS_RM_LOCAISESTOQUE_PATH');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const code = pick(row, 'ID', 'CODLOC', 'CODIGO');
    const name = pick(row, 'NOME', 'DESCRICAO');
    const filial = Number(pick(row, 'FILIAL', 'CODFILIAL'));
    if (!code || !name || !SUPPORTED_FILIAIS.has(filial)) {
      skipped += 1;
      continue;
    }
    const isActive = parseActive(pick(row, 'ATIVO'));
    const now = new Date();

    const existing = await prisma.$queryRaw<Array<{ id: string; name: string; isActive: boolean }>>`
      SELECT id, name, "isActive" FROM stock_locations WHERE filial = ${filial} AND code = ${code} LIMIT 1
    `;
    const current = existing[0];
    if (!current) {
      await prisma.$executeRaw`
        INSERT INTO stock_locations (id, code, name, polo, filial, "isActive", "createdAt", "updatedAt")
        VALUES (${newId()}, ${code}, ${name}, ${null}, ${filial}, ${isActive}, ${now}, ${now})
        ON CONFLICT (filial, code) DO NOTHING
      `;
      created += 1;
    } else if (current.name !== name || current.isActive !== isActive) {
      await prisma.$executeRaw`
        UPDATE stock_locations
        SET name = ${name}, "isActive" = ${isActive}, "updatedAt" = ${now}
        WHERE id = ${current.id}
      `;
      updated += 1;
    }
  }

  return { created, updated, skipped, total: rows.length, syncedAt: new Date().toISOString() };
}

/** Lê LOCAISESTOQUE do RM e cria/atualiza stock_locations (polo é mantido, pois não existe no RM). */
export async function syncStockLocationsFromTotvs(options: { force?: boolean } = {}): Promise<StockLocationSyncResult> {
  if (inFlight) return inFlight;
  if (!options.force && lastResult && Date.now() - lastRunAt < MIN_INTERVAL_MS) {
    return { ...lastResult, created: 0, updated: 0 };
  }
  inFlight = runSync()
    .then((result) => {
      lastResult = result;
      lastRunAt = Date.now();
      if (result.created > 0 || result.updated > 0) {
        console.log(
          `[stock-locations-sync] ${result.created} criado(s), ${result.updated} atualizado(s) de ${result.total}`
        );
      }
      return result;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Sincroniza ao iniciar e a cada 30 minutos. */
export function startStockLocationTotvsSyncScheduler(): void {
  const tz = process.env.TZ || 'America/Sao_Paulo';
  const run = () => {
    void syncStockLocationsFromTotvs({ force: true }).catch((err) => {
      console.error('[stock-locations-sync] falha:', err instanceof Error ? err.message : err);
    });
  };
  run();
  cron.schedule('*/30 * * * *', run, { timezone: tz });
}

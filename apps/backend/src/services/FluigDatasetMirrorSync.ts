import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { ensureFluigDatasetMirrorSchema } from '../lib/ensureFluigDatasetMirrorSchema';
import { FluigService, type FluigDatasetValues } from './FluigService';

const fluigForMirror = new FluigService();

/** Datasets espelhados no Postgres e servidos pela API sem hit no Fluig a cada request. */
export const FLUIG_MIRRORED_DATASET_IDS = [
  'G5-Relatorio-DF-GO-DP',
  'Processos_Workflow_Aprovacao_G3',
  'Processos_Workflow_Aprovacao_G5',
  'DataSet_G3FollowUp',
  'DataSet_G4FollowUp',
  'G5-Relatorio-DF-GO-TODOS-SETORES',
  'G5-Relatorio-DF-GO-JURIDICO',
] as const;

export type FluigMirroredDatasetId = (typeof FLUIG_MIRRORED_DATASET_IDS)[number];

export type FluigDatasetMirrorSyncResult = {
  datasetId: string;
  rowCount: number;
  syncedAt: string;
  skipped?: boolean;
  error?: string;
};

const MIN_INTERVAL_MS = 60_000;
const BATCH_SIZE = 400;

const inFlightByDataset = new Map<string, Promise<FluigDatasetMirrorSyncResult>>();
const lastRunAtByDataset = new Map<string, number>();

export function isFluigMirroredDataset(datasetId: string): boolean {
  return (FLUIG_MIRRORED_DATASET_IDS as readonly string[]).includes(datasetId);
}

function cellToKeyPart(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const v = o.display ?? o.displayValue ?? o.internalValue ?? o.value ?? '';
    return String(v ?? '').trim();
  }
  return String(value).trim();
}

function pickExternalKey(row: Record<string, unknown>, index: number): string {
  const keys = Object.keys(row);
  const prefer =
    keys.find((k) => /^num_proces$/i.test(k.trim())) ||
    keys.find((k) => k.replace(/[_\s]+/g, '').toLowerCase() === 'idmov') ||
    keys.find((k) => {
      const n = k
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .toLowerCase();
      return n.includes('numero') && n.includes('processo') && !n.includes('sequencia');
    });
  if (prefer) {
    const part = cellToKeyPart(row[prefer]);
    if (part) return `${prefer}:${part}`;
  }
  return `row:${index}`;
}

function normalizeColumns(
  columns: string[] | undefined,
  values: Record<string, unknown>[]
): string[] {
  if (Array.isArray(columns) && columns.length > 0) {
    return columns.map((c) => String(c));
  }
  const set = new Set<string>();
  for (const row of values) {
    for (const k of Object.keys(row || {})) set.add(k);
  }
  return [...set];
}

/** Postgres JSON/text não aceita \u0000 — remove de strings no payload. */
function sanitizeJsonForPostgres(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.includes('\u0000') ? value.replace(/\u0000/g, '') : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonForPostgres(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeJsonForPostgres(v);
    }
    return out;
  }
  return value;
}

async function replaceMirrorSnapshot(
  datasetId: string,
  data: FluigDatasetValues
): Promise<FluigDatasetMirrorSyncResult> {
  const rawValues = Array.isArray(data.content?.values)
    ? (data.content!.values as Record<string, unknown>[])
    : [];
  const values = rawValues.map(
    (row) => sanitizeJsonForPostgres(row) as Record<string, unknown>
  );
  const columns = normalizeColumns(data.content?.columns, values);
  const syncedAt = new Date();

  await prisma.$transaction(
    async (tx) => {
      await tx.fluigDatasetMirrorRow.deleteMany({ where: { datasetId } });

      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        const slice = values.slice(i, i + BATCH_SIZE);
        await tx.fluigDatasetMirrorRow.createMany({
          data: slice.map((row, offset) => ({
            datasetId,
            externalKey: String(pickExternalKey(row, i + offset)).replace(/\u0000/g, ''),
            payload: row as object,
            syncedAt,
          })),
          skipDuplicates: true,
        });
      }

      await tx.fluigDatasetMirrorMeta.upsert({
        where: { datasetId },
        create: {
          datasetId,
          columns,
          rowCount: values.length,
          syncedAt,
        },
        update: {
          columns,
          rowCount: values.length,
          syncedAt,
        },
      });
    },
    { timeout: 180_000, maxWait: 30_000 }
  );

  return {
    datasetId,
    rowCount: values.length,
    syncedAt: syncedAt.toISOString(),
  };
}

export async function syncFluigDatasetMirror(
  datasetId: string,
  options: { force?: boolean } = {}
): Promise<FluigDatasetMirrorSyncResult> {
  if (!isFluigMirroredDataset(datasetId)) {
    return {
      datasetId,
      rowCount: 0,
      syncedAt: new Date().toISOString(),
      skipped: true,
      error: 'Dataset não configurado para espelho',
    };
  }

  const existing = inFlightByDataset.get(datasetId);
  if (existing) return existing;

  const last = lastRunAtByDataset.get(datasetId) || 0;
  if (!options.force && Date.now() - last < MIN_INTERVAL_MS) {
    const meta = await prisma.fluigDatasetMirrorMeta.findUnique({ where: { datasetId } });
    return {
      datasetId,
      rowCount: meta?.rowCount ?? 0,
      syncedAt: (meta?.syncedAt ?? new Date()).toISOString(),
      skipped: true,
    };
  }

  const promise = (async (): Promise<FluigDatasetMirrorSyncResult> => {
    await ensureFluigDatasetMirrorSchema(prisma);
    const data = await fluigForMirror.fetchDatasetUncached(datasetId);
    const result = await replaceMirrorSnapshot(datasetId, data);
    lastRunAtByDataset.set(datasetId, Date.now());
    console.log(
      `[fluig-mirror] ${datasetId}: ${result.rowCount} linha(s) em ${result.syncedAt}`
    );
    return result;
  })()
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[fluig-mirror] falha ${datasetId}:`, message);
      return {
        datasetId,
        rowCount: 0,
        syncedAt: new Date().toISOString(),
        error: message,
      } satisfies FluigDatasetMirrorSyncResult;
    })
    .finally(() => {
      inFlightByDataset.delete(datasetId);
    });

  inFlightByDataset.set(datasetId, promise);
  return promise;
}

export async function syncAllFluigDatasetMirrors(
  options: { force?: boolean } = {}
): Promise<FluigDatasetMirrorSyncResult[]> {
  const out: FluigDatasetMirrorSyncResult[] = [];
  for (const id of FLUIG_MIRRORED_DATASET_IDS) {
    out.push(await syncFluigDatasetMirror(id, options));
  }
  return out;
}

export async function getFluigDatasetMirrorPayload(
  datasetId: string
): Promise<{
  data: FluigDatasetValues;
  syncedAt: string | null;
  fromMirror: boolean;
} | null> {
  if (!isFluigMirroredDataset(datasetId)) return null;

  await ensureFluigDatasetMirrorSchema(prisma);

  const meta = await prisma.fluigDatasetMirrorMeta.findUnique({ where: { datasetId } });
  if (!meta) {
    return {
      data: { content: { columns: [], values: [] }, message: 'Espelho ainda não sincronizado.' },
      syncedAt: null,
      fromMirror: true,
    };
  }

  const rows = await prisma.fluigDatasetMirrorRow.findMany({
    where: { datasetId },
    select: { payload: true },
    orderBy: { externalKey: 'asc' },
  });

  const columns = Array.isArray(meta.columns)
    ? (meta.columns as unknown[]).map((c) => String(c))
    : [];

  return {
    data: {
      content: {
        columns,
        values: rows.map((r) => r.payload as Record<string, unknown>),
      },
      message: null,
    },
    syncedAt: meta.syncedAt.toISOString(),
    fromMirror: true,
  };
}

/** Sync a cada 30 min + uma execução após o boot. */
export function startFluigDatasetMirrorScheduler(): void {
  const tz = process.env.TZ || 'America/Sao_Paulo';

  const run = (reason: string) => {
    void syncAllFluigDatasetMirrors({ force: true })
      .then((results) => {
        const ok = results.filter((r) => !r.error).length;
        console.log(`[fluig-mirror] ${reason}: ${ok}/${results.length} dataset(s) ok`);
      })
      .catch((err) => {
        console.error('[fluig-mirror] scheduler falhou:', err);
      });
  };

  // Boot: espera o servidor estabilizar (como o warmup Fluig).
  setTimeout(() => run('boot'), 10_000);

  cron.schedule(
    '*/30 * * * *',
    () => {
      run('cron-30m');
    },
    { timezone: tz }
  );

  console.log('[fluig-mirror] agendado: a cada 30 minutos (+ sync no boot)');
}

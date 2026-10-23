import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { prisma } from './prisma';
import { savePersistentUploadFromPath } from './persistentUpload';

/**
 * Copia para o armazenamento do Conecta (S3) os anexos do Tasks que foram importados do Trello e
 * ainda apontam para trello.com. Depois de copiado, o anexo não depende mais do Trello.
 *
 * - Roda em segundo plano no servidor; só um job por vez.
 * - Idempotente: só pega anexos que ainda apontam para o Trello, então pode parar e retomar.
 * - Se o mesmo arquivo do Trello está em vários cards, uma cópia serve para todos.
 */

const TRELLO_URL_PREFIX = 'https://trello.com/1/cards/';
const MIGRATED_FOLDER = 'kanban-trello';
const MAX_FILE_BYTES = 300 * 1024 * 1024;
const CONCURRENCY = 3;
const BATCH = 60;

type Failure = { attachmentId: string; fileName: string; reason: string; cardTitle?: string; board?: string };

type JobState = {
  running: boolean;
  stopRequested: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  processed: number;
  copied: number;
  failed: number;
  bytesCopied: number;
  limit: number | null;
  lastError: string | null;
  failures: Failure[];
  /** Total de falhas por motivo (a lista `failures` guarda só as mais recentes). */
  failureCounts: Record<string, number>;
};

const state: JobState = {
  running: false,
  stopRequested: false,
  startedAt: null,
  finishedAt: null,
  processed: 0,
  copied: 0,
  failed: 0,
  bytesCopied: 0,
  limit: null,
  lastError: null,
  failures: [],
  failureCounts: {},
};

function trelloCredentials(): { key: string; token: string } | null {
  const key = process.env.TRELLO_API_KEY?.trim();
  const token = process.env.TRELLO_API_TOKEN?.trim();
  return key && token ? { key, token } : null;
}

type BoardBreakdownRow = {
  board: string;
  pending: bigint;
  migrated: bigint;
  native: bigint;
  external: bigint;
};

/** Anexos por quadro: ainda no Trello, já copiados, enviados direto no Conecta e links externos. */
async function getBoardBreakdown() {
  const rows = await prisma.$queryRaw<BoardBreakdownRow[]>`
    SELECT b.department_label AS board,
      COUNT(*) FILTER (WHERE a."fileUrl" LIKE 'https://trello.com/1/cards/%') AS pending,
      COUNT(*) FILTER (WHERE a."fileUrl" LIKE '/uploads/kanban-trello/%') AS migrated,
      COUNT(*) FILTER (
        WHERE a."fileKey" IS NOT NULL AND a."fileUrl" NOT LIKE '/uploads/kanban-trello/%'
      ) AS native,
      COUNT(*) FILTER (
        WHERE a."fileUrl" NOT LIKE 'https://trello.com/1/cards/%'
          AND a."fileUrl" NOT LIKE '/uploads/kanban-trello/%'
          AND a."fileKey" IS NULL
      ) AS external
    FROM kanban_card_attachments a
    JOIN kanban_cards c ON c.id = a."cardId"
    JOIN kanban_columns col ON col.id = c."columnId"
    JOIN kanban_boards b ON b.id = col."boardId"
    GROUP BY b.department_label
    ORDER BY COUNT(*) DESC`;
  return rows.map((r) => ({
    board: r.board,
    pending: Number(r.pending),
    migrated: Number(r.migrated),
    native: Number(r.native),
    external: Number(r.external),
  }));
}

export async function getTrelloMigrationStatus() {
  const [pending, migrated, byBoard] = await Promise.all([
    prisma.kanbanCardAttachment.count({ where: { fileUrl: { startsWith: TRELLO_URL_PREFIX } } }),
    prisma.kanbanCardAttachment.count({
      where: { fileUrl: { startsWith: `/uploads/${MIGRATED_FOLDER}/` } },
    }),
    getBoardBreakdown(),
  ]);
  return {
    configured: !!trelloCredentials(),
    pending,
    migrated,
    byBoard,
    job: { ...state, failures: state.failures.slice(-100) },
  };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchFromTrello(url: string, auth: { key: string; token: string }) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await fetch(url, {
      headers: { Authorization: `OAuth oauth_consumer_key="${auth.key}", oauth_token="${auth.token}"` },
      redirect: 'follow',
    });
    if (res.status === 429 || res.status >= 500) {
      // Limite de chamadas do Trello ou instabilidade: espera e tenta de novo.
      await sleep(3000 * attempt);
      continue;
    }
    return res;
  }
  throw new Error('Trello indisponível ou limitando chamadas');
}

async function copyOne(
  att: { id: string; fileName: string; fileUrl: string },
  auth: { key: string; token: string },
) {
  const res = await fetchFromTrello(att.fileUrl, auth);
  if (!res.ok || !res.body) throw new Error(`Trello respondeu ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_FILE_BYTES) throw new Error('Arquivo grande demais (acima de 300 MB)');

  const tmp = path.join(os.tmpdir(), `trello-${att.id}-${Date.now()}`);
  try {
    await pipeline(Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream), fs.createWriteStream(tmp));
    const size = fs.statSync(tmp).size;
    if (size === 0) throw new Error('Arquivo vazio');
    const mimeType = (res.headers.get('content-type') || '').split(';')[0].trim() || 'application/octet-stream';
    const saved = await savePersistentUploadFromPath({
      folder: MIGRATED_FOLDER,
      diskPath: tmp,
      originalName: att.fileName,
      mimeType,
      includeSafeOriginalName: true,
    });
    // Mesmo arquivo do Trello em vários cards: atualiza todos de uma vez.
    const updated = await prisma.kanbanCardAttachment.updateMany({
      where: { fileUrl: att.fileUrl },
      data: { fileUrl: saved.url, fileKey: saved.key, fileSize: size, mimeType },
    });
    return { size, rows: updated.count };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

async function runJob(limit: number | null) {
  const auth = trelloCredentials();
  if (!auth) return;
  const failedIds = new Set<string>();
  try {
    while (!state.stopRequested) {
      if (limit != null && state.processed >= limit) break;
      const remaining = limit != null ? Math.min(BATCH, limit - state.processed) : BATCH;
      const batch = await prisma.kanbanCardAttachment.findMany({
        where: {
          fileUrl: { startsWith: TRELLO_URL_PREFIX },
          ...(failedIds.size > 0 ? { id: { notIn: Array.from(failedIds) } } : {}),
        },
        select: { id: true, fileName: true, fileUrl: true },
        orderBy: { createdAt: 'asc' },
        take: remaining,
      });
      if (batch.length === 0) break;

      // Mesma URL repetida no lote: copia uma vez só.
      const seen = new Set<string>();
      const unique = batch.filter((a) => (seen.has(a.fileUrl) ? false : (seen.add(a.fileUrl), true)));

      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, unique.length) }, async () => {
        while (!state.stopRequested) {
          const att = unique[cursor++];
          if (!att) return;
          try {
            const r = await copyOne(att, auth);
            state.copied += r.rows;
            state.bytesCopied += r.size;
          } catch (error) {
            failedIds.add(att.id);
            state.failed += 1;
            const reason = error instanceof Error ? error.message : String(error);
            state.failureCounts[reason] = (state.failureCounts[reason] ?? 0) + 1;
            // Onde está o anexo (card e quadro), para a pessoa achar o arquivo no Trello.
            const where = await prisma.kanbanCardAttachment
              .findUnique({
                where: { id: att.id },
                select: {
                  card: { select: { title: true, column: { select: { board: { select: { departmentLabel: true } } } } } },
                },
              })
              .catch(() => null);
            state.failures.push({
              attachmentId: att.id,
              fileName: att.fileName,
              reason,
              cardTitle: where?.card.title.slice(0, 120),
              board: where?.card.column.board.departmentLabel,
            });
            if (state.failures.length > 200) state.failures.shift();
          }
          state.processed += 1;
        }
      });
      await Promise.all(workers);
      // Duplicatas do lote que ficaram sem copiar (mesma URL de um já tratado) saem do select sozinhas.
      await sleep(250);
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    state.running = false;
    state.finishedAt = new Date().toISOString();
  }
}

/** Em produção os arquivos precisam ir para o S3: o disco do servidor é apagado a cada deploy. */
function storageIsSafeForMigration(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return (
    (process.env.STORAGE_PROVIDER || '').toLowerCase() !== 'local' &&
    !!process.env.AWS_ACCESS_KEY_ID &&
    !!process.env.AWS_SECRET_ACCESS_KEY
  );
}

export function startTrelloMigration(limit: number | null): { started: boolean; reason?: string } {
  if (state.running) return { started: false, reason: 'A cópia já está em andamento.' };
  if (!trelloCredentials()) {
    return { started: false, reason: 'Configure TRELLO_API_KEY e TRELLO_API_TOKEN no servidor.' };
  }
  if (!storageIsSafeForMigration()) {
    return {
      started: false,
      reason:
        'O armazenamento em produção não está no S3 (STORAGE_PROVIDER=local ou chaves da AWS ausentes). Copiar agora gravaria no disco do servidor, que é apagado a cada deploy.',
    };
  }
  Object.assign(state, {
    running: true,
    stopRequested: false,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    processed: 0,
    copied: 0,
    failed: 0,
    bytesCopied: 0,
    limit,
    lastError: null,
    failures: [],
    failureCounts: {},
  } satisfies Partial<JobState>);
  void runJob(limit);
  return { started: true };
}

export function stopTrelloMigration(): void {
  if (state.running) state.stopRequested = true;
}

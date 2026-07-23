import { prisma } from '../lib/prisma';
import {
  fetchPncpPublicacaoPage,
  normalizePncpSearchText,
  objetoMatchesPncpKeywords,
  PNCP_MODALIDADES,
  type PncpContratacaoListItem,
} from './PncpConsultaService';

/** DF/GO/SP primeiro para a lista encher rápido; depois o restante do Brasil. */
const BRASIL_UFS = [
  'DF', 'GO', 'SP',
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'ES', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'TO',
] as const;

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_PAGE_DELAY_MS = 650;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const MAX_429_RETRIES = 5;
const MAX_PAGES_PER_COMBO = 40;
const PROGRESS_EVERY_PAGES = 3;

export type PncpSyncTrigger = 'cron' | 'manual';

export type PncpUfProgress = {
  uf: string;
  status: 'pending' | 'running' | 'done' | 'error';
  upsertedThisRun: number;
};

export type PncpSyncStatus = {
  running: boolean;
  currentUf: string | null;
  currentModalidade: string | null;
  progress: {
    totalUfs: number;
    doneUfs: number;
    pendingUfs: number;
    pagesFetched: number;
    upserted: number;
    rateLimitHits: number;
    lookbackDays: number;
    startedAt: string | null;
    ufs: PncpUfProgress[];
  } | null;
  mirror: {
    total: number;
    byUf: { uf: string; count: number }[];
  };
  lastRun: {
    id: string;
    status: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    lookbackDays: number;
    pagesFetched: number;
    upserted: number;
    pruned: number;
    rateLimitHits: number;
    errorMessage: string | null;
  } | null;
};

let running = false;
let currentRunId: string | null = null;
let currentUf: string | null = null;
let currentModalidade: string | null = null;
let liveLookbackDays = DEFAULT_LOOKBACK_DAYS;
let liveStartedAt: string | null = null;
let livePagesFetched = 0;
let liveUpserted = 0;
let liveRateLimitHits = 0;
let liveUfProgress: PncpUfProgress[] = [];
let cronStarted = false;
let cronTimer: ReturnType<typeof setInterval> | null = null;

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw == null || raw === '') return fallback;
  const s = raw.trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function envInt(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toYyyymmdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || '');
  return /limite de requisi/i.test(message);
}

async function upsertItems(
  items: PncpContratacaoListItem[],
  codigoModalidade: number,
  ufFallback: string
): Promise<number> {
  const now = new Date();
  let count = 0;

  for (const item of items) {
    const numero = item.numeroControlePNCP?.trim();
    if (!numero) continue;
    if (!objetoMatchesPncpKeywords(item.objeto)) continue;

    const uf = (item.uf || ufFallback).toUpperCase();
    const data = {
      sequencialCompra: item.sequencialCompra,
      processo: item.processo,
      objeto: item.objeto,
      objetoNorm: normalizePncpSearchText(item.objeto || ''),
      orgao: item.orgao,
      cnpjOrgao: item.cnpjOrgao,
      unidadeCompradora: item.unidadeCompradora,
      codigoUnidadeCompradora: item.codigoUnidadeCompradora,
      uf,
      municipio: item.municipio,
      modalidade: item.modalidade,
      codigoModalidade,
      situacao: item.situacao,
      modoDisputa: item.modoDisputa,
      plataforma: item.plataforma,
      srp: item.srp,
      valorEstimado: item.valorEstimado,
      valorHomologado: item.valorHomologado,
      dataInclusao: parseIsoDate(item.dataInclusao),
      dataAberturaProposta: parseIsoDate(item.dataAberturaProposta),
      dataEncerramentoProposta: parseIsoDate(item.dataEncerramentoProposta),
      amparoLegal: item.amparoLegal,
      linkSistemaOrigem: item.linkSistemaOrigem,
      linkPncp: item.linkPncp,
      syncedAt: now,
    };

    await prisma.pncpContratacao.upsert({
      where: { numeroControlePNCP: numero },
      create: { numeroControlePNCP: numero, ...data },
      update: data,
    });
    count += 1;
  }

  return count;
}

async function fetchComboWithBackoff(params: {
  dataInicial: string;
  dataFinal: string;
  uf: string;
  codigo: number;
  pagina: number;
  tamanhoPagina: number;
}): Promise<{ result: Awaited<ReturnType<typeof fetchPncpPublicacaoPage>>; rateHits: number }> {
  let rateHits = 0;
  let delay = 1000;

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    try {
      const result = await fetchPncpPublicacaoPage({
        ...params,
        timeoutMs: 40_000,
      });
      return { result, rateHits };
    } catch (err) {
      if (!isRateLimitError(err) || attempt === MAX_429_RETRIES) throw err;
      rateHits += 1;
      await sleep(delay);
      delay = Math.min(delay * 2, 30_000);
    }
  }

  throw new Error('Limite de requisições do PNCP excedido.');
}

async function persistProgress(
  runId: string,
  data: {
    pagesFetched: number;
    upserted: number;
    rateLimitHits: number;
  }
): Promise<void> {
  await prisma.pncpSyncRun.update({
    where: { id: runId },
    data,
  });
}

/** Marca runs órfãos (ex.: backend reiniciou no meio) como failed. */
export async function recoverOrphanPncpSyncRuns(): Promise<number> {
  const result = await prisma.pncpSyncRun.updateMany({
    where: { status: 'running' },
    data: {
      status: 'failed',
      finishedAt: new Date(),
      errorMessage: 'Interrompido (servidor reiniciou ou sync abortado).',
    },
  });
  if (result.count > 0) {
    console.log(`[pncp-sync] ${result.count} run(s) órfão(s) marcados como failed`);
  }
  return result.count;
}

function resetLiveProgress(lookbackDays: number): void {
  liveLookbackDays = lookbackDays;
  liveStartedAt = new Date().toISOString();
  livePagesFetched = 0;
  liveUpserted = 0;
  liveRateLimitHits = 0;
  currentUf = null;
  currentModalidade = null;
  liveUfProgress = BRASIL_UFS.map((uf) => ({
    uf,
    status: 'pending' as const,
    upsertedThisRun: 0,
  }));
}

function setUfStatus(uf: string, status: PncpUfProgress['status']): void {
  const row = liveUfProgress.find((u) => u.uf === uf);
  if (row) row.status = status;
}

function addUfUpserted(uf: string, n: number): void {
  const row = liveUfProgress.find((u) => u.uf === uf);
  if (row) row.upsertedThisRun += n;
}

export async function getPncpSyncStatus(): Promise<PncpSyncStatus> {
  const last = await prisma.pncpSyncRun.findFirst({
    orderBy: { startedAt: 'desc' },
  });

  const isRunning = running && (!last || last.id === currentRunId || last.status === 'running');

  const grouped = await prisma.pncpContratacao.groupBy({
    by: ['uf'],
    _count: { _all: true },
    orderBy: { uf: 'asc' },
  });
  const byUf = grouped.map((g) => ({ uf: g.uf, count: g._count._all }));
  const mirrorTotal = byUf.reduce((sum, r) => sum + r.count, 0);

  const ufs =
    liveUfProgress.length > 0
      ? liveUfProgress
      : BRASIL_UFS.map((uf) => ({
          uf,
          status: 'pending' as const,
          upsertedThisRun: 0,
        }));

  const doneUfs = ufs.filter((u) => u.status === 'done' || u.status === 'error').length;

  return {
    running: isRunning,
    currentUf: isRunning ? currentUf : null,
    currentModalidade: isRunning ? currentModalidade : null,
    progress: {
      totalUfs: BRASIL_UFS.length,
      doneUfs,
      pendingUfs: ufs.filter((u) => u.status === 'pending').length,
      pagesFetched: isRunning ? livePagesFetched : last?.pagesFetched ?? 0,
      upserted: isRunning ? liveUpserted : last?.upserted ?? 0,
      rateLimitHits: isRunning ? liveRateLimitHits : last?.rateLimitHits ?? 0,
      lookbackDays: isRunning ? liveLookbackDays : last?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS,
      startedAt: isRunning ? liveStartedAt : last?.startedAt?.toISOString() ?? null,
      ufs,
    },
    mirror: {
      total: mirrorTotal,
      byUf,
    },
    lastRun: last
      ? {
          id: last.id,
          status: isRunning ? 'running' : last.status === 'running' ? 'failed' : last.status,
          trigger: last.trigger,
          startedAt: last.startedAt.toISOString(),
          finishedAt: last.finishedAt?.toISOString() ?? null,
          lookbackDays: last.lookbackDays,
          pagesFetched: last.pagesFetched,
          upserted: last.upserted,
          pruned: last.pruned,
          rateLimitHits: last.rateLimitHits,
          errorMessage: last.errorMessage,
        }
      : null,
  };
}

/**
 * Ingestão Brasil × modalidades, janela recente, só keywords.
 * Não roda em paralelo — lock em memória.
 */
export async function runPncpIngest(trigger: PncpSyncTrigger = 'manual'): Promise<PncpSyncStatus> {
  if (running) {
    return getPncpSyncStatus();
  }

  running = true;
  const lookbackDays = envInt('PNCP_SYNC_LOOKBACK_DAYS', DEFAULT_LOOKBACK_DAYS);
  const pageDelayMs = envInt('PNCP_SYNC_PAGE_DELAY_MS', DEFAULT_PAGE_DELAY_MS);
  resetLiveProgress(lookbackDays);

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);
  const dataInicial = toYyyymmdd(start);
  const dataFinal = toYyyymmdd(end);

  // Limpa qualquer "running" fantasma antes de criar o novo.
  await recoverOrphanPncpSyncRuns();

  const run = await prisma.pncpSyncRun.create({
    data: {
      status: 'running',
      trigger,
      lookbackDays,
    },
  });
  currentRunId = run.id;

  let pagesFetched = 0;
  let upserted = 0;
  let pruned = 0;
  let rateLimitHits = 0;
  let hadPartialFailure = false;

  try {
    for (const uf of BRASIL_UFS) {
      currentUf = uf;
      setUfStatus(uf, 'running');
      console.log(`[pncp-sync] UF ${uf}… (upserted=${upserted}, pages=${pagesFetched})`);

      let ufHadError = false;
      for (const modalidade of PNCP_MODALIDADES) {
        currentModalidade = modalidade.nome;
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages && page <= MAX_PAGES_PER_COMBO) {
          try {
            const { result, rateHits } = await fetchComboWithBackoff({
              dataInicial,
              dataFinal,
              uf,
              codigo: modalidade.codigo,
              pagina: page,
              tamanhoPagina: 50,
            });
            rateLimitHits += rateHits;
            liveRateLimitHits = rateLimitHits;
            pagesFetched += 1;
            livePagesFetched = pagesFetched;
            totalPages = Math.max(1, result.totalPaginas || 1);
            const added = await upsertItems(result.items, modalidade.codigo, uf);
            upserted += added;
            liveUpserted = upserted;
            addUfUpserted(uf, added);

            if (pagesFetched % PROGRESS_EVERY_PAGES === 0) {
              await persistProgress(run.id, { pagesFetched, upserted, rateLimitHits });
            }
          } catch (err) {
            ufHadError = true;
            if (isRateLimitError(err)) {
              rateLimitHits += 1;
              liveRateLimitHits = rateLimitHits;
              hadPartialFailure = true;
              break;
            }
            hadPartialFailure = true;
            console.warn(
              `[pncp-sync] falha ${uf}/${modalidade.codigo} p${page}:`,
              err instanceof Error ? err.message : err
            );
            break;
          }

          page += 1;
          if (page <= totalPages && page <= MAX_PAGES_PER_COMBO) {
            await sleep(pageDelayMs);
          }
        }

        await sleep(Math.min(pageDelayMs, 400));
      }

      setUfStatus(uf, ufHadError ? 'error' : 'done');
    }

    currentModalidade = null;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const deletedOld = await prisma.pncpContratacao.deleteMany({
      where: {
        OR: [
          { dataInclusao: { lt: cutoff } },
          {
            AND: [{ dataInclusao: null }, { syncedAt: { lt: cutoff } }],
          },
        ],
      },
    });
    pruned = deletedOld.count;

    const stale = await prisma.pncpContratacao.findMany({
      select: { id: true, objeto: true },
    });
    const staleIds = stale
      .filter((row) => !objetoMatchesPncpKeywords(row.objeto))
      .map((row) => row.id);
    if (staleIds.length > 0) {
      const deletedKw = await prisma.pncpContratacao.deleteMany({
        where: { id: { in: staleIds } },
      });
      pruned += deletedKw.count;
    }

    const status = hadPartialFailure ? 'partial' : 'success';
    await prisma.pncpSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        pagesFetched,
        upserted,
        pruned,
        rateLimitHits,
        errorMessage: hadPartialFailure
          ? 'Sync concluído com falhas parciais (rate-limit ou erros pontuais).'
          : null,
      },
    });
    console.log(`[pncp-sync] fim status=${status} upserted=${upserted} pages=${pagesFetched}`);
  } catch (err) {
    const fatalError = err instanceof Error ? err.message : 'Erro desconhecido no sync PNCP';
    await prisma.pncpSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        pagesFetched,
        upserted,
        pruned,
        rateLimitHits,
        errorMessage: fatalError,
      },
    });
    console.error('[pncp-sync] failed:', fatalError);
  } finally {
    running = false;
    currentRunId = null;
    currentUf = null;
    currentModalidade = null;
    // Mantém liveUfProgress até o próximo sync para a modal mostrar o resumo.
  }

  return getPncpSyncStatus();
}

/** Dispara sync em background; retorna status imediato. */
export function startPncpIngestBackground(trigger: PncpSyncTrigger): {
  accepted: boolean;
  alreadyRunning: boolean;
} {
  if (running) {
    return { accepted: false, alreadyRunning: true };
  }
  void runPncpIngest(trigger).catch((err) => {
    console.error('[pncp-sync] erro não tratado:', err);
  });
  return { accepted: true, alreadyRunning: false };
}

export function startPncpSyncScheduler(): void {
  if (cronStarted) return;
  if (!envBool('PNCP_SYNC_ENABLED', true)) {
    console.log('[pncp-sync] desabilitado (PNCP_SYNC_ENABLED=false)');
    return;
  }

  cronStarted = true;
  const intervalMs = envInt('PNCP_SYNC_INTERVAL_MS', DEFAULT_INTERVAL_MS);
  const bootDelayMs = envInt('PNCP_SYNC_BOOT_DELAY_MS', 30_000);

  console.log(
    `[pncp-sync] agendado: primeira em ${Math.round(bootDelayMs / 1000)}s, depois a cada ${Math.round(intervalMs / 60000)} min`
  );

  void recoverOrphanPncpSyncRuns().catch((e) => {
    console.error('[pncp-sync] falha ao limpar órfãos:', e);
  });

  setTimeout(() => {
    const r = startPncpIngestBackground('cron');
    if (r.alreadyRunning) {
      console.log('[pncp-sync] já em andamento no boot');
    }
  }, bootDelayMs);

  cronTimer = setInterval(() => {
    startPncpIngestBackground('cron');
  }, intervalMs);

  if (typeof cronTimer.unref === 'function') {
    cronTimer.unref();
  }
}

export function getPncpIngestDebug(): {
  running: boolean;
  currentRunId: string | null;
  currentUf: string | null;
  currentModalidade: string | null;
} {
  return { running, currentRunId, currentUf, currentModalidade };
}

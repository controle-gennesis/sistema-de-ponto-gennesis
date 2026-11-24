import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { getTotvsRmRelatorioFinService } from './TotvsRmRelatorioFinService';

/**
 * Prévia da Folha (Métricas) — SOMENTE CONSULTA.
 * O Conecta nunca inclui, edita ou exclui nada na folha do TOTVS: aqui só existe a leitura da
 * consulta SQL FOLPAG (RealizaConsulta, GET). A última leitura fica guardada no Conecta
 * (tabela metricas_previa_folha_snapshot) para a tela abrir sem chamar o TOTVS.
 *
 * O TOTVS é consultado só: 1x ao dia de madrugada (03:30) ou quando o usuário clica em Atualizar.
 * Uma única chamada por atualização, sem caminhos alternativos (erro de login trava o usuário no RM).
 */
const FOLPAG_PATH_PADRAO = '/api/framework/v1/consultaSQLServer/RealizaConsulta/FOLPAG/1/G';
const HORARIO_MADRUGADA = '30 3 * * *';
const SNAPSHOT_ID = 'latest';

export type PreviaFolhaSnapshot = {
  fetchedAt: string | null;
  trigger: string | null;
  fetchedByName: string | null;
  rows: Record<string, unknown>[];
  rowCount: number;
  lastError: string | null;
  lastErrorAt: string | null;
};

let emAndamento: Promise<PreviaFolhaSnapshot> | null = null;
let agendado = false;

/** Login próprio da Prévia da Folha (só leitura da FOLPAG) — separado do usuário de integração. */
function folpagAuth(): { user: string; password: string } | null {
  const user = (process.env.TOTVS_RM_FOLPAG_USER || '').trim();
  const password = (process.env.TOTVS_RM_FOLPAG_PASSWORD || '').trim();
  return user && password ? { user, password } : null;
}

function folpagPath(): string {
  return (process.env.TOTVS_RM_FOLPAG_PATH || '').trim() || FOLPAG_PATH_PADRAO;
}

type SnapshotRow = {
  fetchedAt: Date | null;
  trigger: string | null;
  fetchedByName: string | null;
  rows: unknown;
  rowCount: number | null;
  lastError: string | null;
  lastErrorAt: Date | null;
};

export async function obterPreviaFolha(): Promise<PreviaFolhaSnapshot> {
  const res = await prisma.$queryRawUnsafe<SnapshotRow[]>(
    `SELECT "fetchedAt", "trigger", "fetchedByName", "rows", "rowCount", "lastError", "lastErrorAt"
       FROM "metricas_previa_folha_snapshot" WHERE "id" = $1`,
    SNAPSHOT_ID
  );
  const r = res[0];
  if (!r) {
    return { fetchedAt: null, trigger: null, fetchedByName: null, rows: [], rowCount: 0, lastError: null, lastErrorAt: null };
  }
  const rows = Array.isArray(r.rows) ? (r.rows as Record<string, unknown>[]) : [];
  return {
    fetchedAt: r.fetchedAt ? r.fetchedAt.toISOString() : null,
    trigger: r.trigger,
    fetchedByName: r.fetchedByName,
    rows,
    rowCount: r.rowCount ?? rows.length,
    lastError: r.lastError,
    lastErrorAt: r.lastErrorAt ? r.lastErrorAt.toISOString() : null,
  };
}

async function registrarErro(mensagem: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "metricas_previa_folha_snapshot" ("id", "rows", "rowCount", "lastError", "lastErrorAt")
     VALUES ($1, '[]'::jsonb, 0, $2, NOW())
     ON CONFLICT ("id") DO UPDATE SET "lastError" = EXCLUDED."lastError", "lastErrorAt" = NOW()`,
    SNAPSHOT_ID,
    mensagem.slice(0, 1000)
  );
}

async function consultarTotvs(trigger: 'cron' | 'manual', usuarioNome: string | null): Promise<PreviaFolhaSnapshot> {
  const rm = getTotvsRmRelatorioFinService();
  const auth = folpagAuth();
  if (!auth) {
    const msg = 'Login da Prévia da Folha não configurado no servidor (TOTVS_RM_FOLPAG_USER / TOTVS_RM_FOLPAG_PASSWORD).';
    await registrarErro(msg).catch(() => undefined);
    throw new Error(msg);
  }
  if (!(process.env.TOTVS_RM_BASE_URL || '').trim()) throw new Error('TOTVS RM não configurado no servidor.');
  try {
    // Leitura única (GET) da consulta FOLPAG com o login próprio da folha — nenhuma escrita no TOTVS.
    const rows = await rm.fetchRowsForPath(folpagPath(), auth);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "metricas_previa_folha_snapshot"
         ("id", "fetchedAt", "trigger", "fetchedByName", "rows", "rowCount", "lastError", "lastErrorAt")
       VALUES ($1, NOW(), $2, $3, $4::jsonb, $5, NULL, NULL)
       ON CONFLICT ("id") DO UPDATE SET
         "fetchedAt" = NOW(), "trigger" = EXCLUDED."trigger", "fetchedByName" = EXCLUDED."fetchedByName",
         "rows" = EXCLUDED."rows", "rowCount" = EXCLUDED."rowCount", "lastError" = NULL, "lastErrorAt" = NULL`,
      SNAPSHOT_ID,
      trigger,
      usuarioNome,
      JSON.stringify(rows),
      rows.length
    );
    console.log(`[previa-folha] ${rows.length} linha(s) lidas do TOTVS (${trigger})`);
    return obterPreviaFolha();
  } catch (err) {
    const bruto = err instanceof Error ? err.message : String(err);
    console.error(`[previa-folha] falha ao consultar FOLPAG (${trigger}):`, bruto);
    // Mensagem curta para a tela (o detalhe completo fica no log do servidor).
    const msg = /HTTP 401|FE005|senha inv/i.test(bruto)
      ? 'O TOTVS recusou o login da Prévia da Folha (TOTVS_RM_FOLPAG_USER / TOTVS_RM_FOLPAG_PASSWORD). Confira usuário e senha antes de tentar de novo: tentativas com senha errada podem bloquear o usuário no TOTVS.'
      : /HTTP 403/i.test(bruto)
        ? 'O usuário de integração do TOTVS não tem permissão para executar a consulta FOLPAG.'
        : /HTTP 404/i.test(bruto)
          ? 'Consulta FOLPAG não encontrada no TOTVS (código, coligada ou sistema diferentes de FOLPAG/1/G).'
          : bruto.slice(0, 300);
    await registrarErro(msg).catch(() => undefined);
    throw new Error(msg);
  }
}

/** Atualiza a prévia lendo o TOTVS. Cliques simultâneos aproveitam a mesma consulta em andamento. */
export function atualizarPreviaFolha(trigger: 'cron' | 'manual', usuarioNome: string | null): Promise<PreviaFolhaSnapshot> {
  if (emAndamento) return emAndamento;
  emAndamento = consultarTotvs(trigger, usuarioNome).finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

export function previaFolhaAtualizando(): boolean {
  return emAndamento !== null;
}

/** Agenda a leitura diária de madrugada (03:30). Fora disso, só o botão Atualizar consulta o TOTVS. */
export function startPreviaFolhaScheduler(): void {
  if (agendado) return;
  const flag = (process.env.PREVIA_FOLHA_SYNC_ENABLED || '').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') {
    console.log('[previa-folha] leitura diária desabilitada (PREVIA_FOLHA_SYNC_ENABLED)');
    return;
  }
  if (!(process.env.TOTVS_RM_BASE_URL || '').trim() || !folpagAuth()) {
    console.warn('[previa-folha] TOTVS_RM_BASE_URL ou login da folha (TOTVS_RM_FOLPAG_*) ausente — leitura diária não agendada');
    return;
  }
  agendado = true;
  const tz = process.env.TZ || 'America/Sao_Paulo';
  cron.schedule(
    HORARIO_MADRUGADA,
    () => {
      void atualizarPreviaFolha('cron', null).catch(() => {
        /* já logado */
      });
    },
    { timezone: tz }
  );
  console.log(`[previa-folha] leitura diária agendada: 03:30 (${tz}) — fora disso, só pelo botão Atualizar`);
}

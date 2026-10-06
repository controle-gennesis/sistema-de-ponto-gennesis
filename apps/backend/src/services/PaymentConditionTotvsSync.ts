import cron from 'node-cron';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { fetchRmConsultaRows, normRmKey, pickRmField } from '../lib/totvsRmConsulta';

export type PaymentConditionSyncResult = {
  created: number;
  updated: number;
  skipped: number;
  total: number;
  syncedAt: string;
};

const MIN_INTERVAL_MS = 60_000;
const MAX_COMPOSITION_GROUPS = 5;
const MAX_PARCELS = 60;

let inFlight: Promise<PaymentConditionSyncResult> | null = null;
let lastResult: PaymentConditionSyncResult | null = null;
let lastRunAt = 0;

/** Lê coluna numerada da TCPG (ex.: PRAZO1, QUANTASVEZES2) tolerando variações do sufixo do nome. */
function groupNumber(row: Record<string, unknown>, pattern: RegExp): number {
  for (const key of Object.keys(row)) {
    if (!pattern.test(normRmKey(key))) continue;
    const n = Number(String(row[key] ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Converte a composição de parcelas do RM (prazo, intervalo, nº de vezes) em dias por parcela. */
function parcelDaysFromTcpg(row: Record<string, unknown>): number[] {
  const days: number[] = [];
  for (let i = 1; i <= MAX_COMPOSITION_GROUPS; i++) {
    const times = Math.trunc(groupNumber(row, new RegExp(`^QUANTASV[A-Z]*${i}$`)));
    if (times <= 0) continue;
    const firstDue = Math.max(0, Math.round(groupNumber(row, new RegExp(`^PRAZO${i}$`))));
    const interval = Math.max(0, Math.round(groupNumber(row, new RegExp(`^PERIODOE[A-Z]*${i}$`))));
    for (let k = 0; k < times && days.length < MAX_PARCELS; k++) {
      days.push(firstDue + k * interval);
    }
  }
  return days.sort((a, b) => a - b);
}

function resolvePaymentType(label: string, days: number[]): 'AVISTA' | 'BOLETO' {
  const isSingleImmediate = days.length === 1 && days[0] === 0;
  if (isSingleImmediate && !/BOLETO/i.test(label)) return 'AVISTA';
  return 'BOLETO';
}

function sameDays(a: unknown, b: number[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return a.every((v, i) => Number(v) === b[i]);
}

async function runSync(): Promise<PaymentConditionSyncResult> {
  const rows = await fetchRmConsultaRows('CONDICOESPAGTO', 'TOTVS_RM_CONDICOESPAGTO_PATH');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const code = pickRmField(row, 'CODCPG', 'CODIGO', 'ID');
    const label = pickRmField(row, 'NOME', 'DESCRICAO');
    if (!code || !label) {
      skipped += 1;
      continue;
    }
    let days = parcelDaysFromTcpg(row);
    if (days.length === 0) days = [0];
    const paymentType = resolvePaymentType(label, days);

    const existing = await prisma.paymentCondition.findUnique({ where: { code } });
    if (!existing) {
      await prisma.paymentCondition.create({
        data: {
          code,
          label,
          paymentType,
          parcelCount: days.length,
          parcelDueDays: days as unknown as Prisma.InputJsonValue,
          sortOrder: 50,
          isSystem: false,
          isActive: true,
        },
      });
      created += 1;
      continue;
    }

    const changed =
      existing.label !== label ||
      existing.paymentType !== paymentType ||
      existing.parcelCount !== days.length ||
      !sameDays(existing.parcelDueDays, days);
    if (changed) {
      await prisma.paymentCondition.update({
        where: { id: existing.id },
        data: {
          label,
          paymentType,
          parcelCount: days.length,
          parcelDueDays: days as unknown as Prisma.InputJsonValue,
        },
      });
      updated += 1;
    }
  }

  return { created, updated, skipped, total: rows.length, syncedAt: new Date().toISOString() };
}

/** Lê CONDICOESPAGTO (TCPG) do RM e cria/atualiza payment_conditions; nunca exclui. */
export async function syncPaymentConditionsFromTotvs(
  options: { force?: boolean } = {}
): Promise<PaymentConditionSyncResult> {
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
          `[payment-conditions-sync] ${result.created} criada(s), ${result.updated} atualizada(s) de ${result.total}`
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
export function startPaymentConditionTotvsSyncScheduler(): void {
  const tz = process.env.TZ || 'America/Sao_Paulo';
  const run = () => {
    void syncPaymentConditionsFromTotvs({ force: true }).catch((err) => {
      console.error('[payment-conditions-sync] falha:', err instanceof Error ? err.message : err);
    });
  };
  run();
  cron.schedule('*/30 * * * *', run, { timezone: tz });
}

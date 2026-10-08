import { createError } from '../middleware/errorHandler';
import { prisma } from './prisma';

const SAO_PAULO_TZ = 'America/Sao_Paulo';

export type FuelQuotaBalance = {
  contractId: string;
  ownerContractId: string;
  ownerName: string;
  /** Dono da cota e os contratos agrupados nele. */
  contractNames: string[];
  weeklyTankQuota: number | null;
  tankPriceReais: number;
  weeklyBudgetReais: number | null;
  /** Acréscimo só desta semana. A cota (tanques × valor) não muda. */
  urgencyReais: number;
  usedReais: number;
  remainingReais: number | null;
  unlimited: boolean;
  weekStart: string;
  weekEnd: string;
};

export function getSaoPauloWeekRange(now = new Date()) {
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: SAO_PAULO_TZ });
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcNoon = Date.UTC(year, month - 1, day, 15, 0, 0);
  const dow = new Date(utcNoon).getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(Date.UTC(year, month - 1, day + mondayOffset, 3, 0, 0));
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekStart, weekEnd };
}

/** A urgência vale só na semana em que foi lançada (segunda em São Paulo). */
export function urgencyAppliesThisWeek(
  urgencyWeek: Date | string | null | undefined,
  weekStart: Date
): boolean {
  if (urgencyWeek == null || urgencyWeek === '') return false;
  const stored = urgencyWeek instanceof Date ? urgencyWeek : new Date(urgencyWeek);
  if (Number.isNaN(stored.getTime())) return false;
  // O banco devolve a segunda como meia-noite UTC. Comparar o dia em São Paulo
  // empurrava essa data para domingo e a urgência sumia da conta.
  const storedDay = stored.toISOString().slice(0, 10);
  const weekDay = weekStart.toLocaleDateString('en-CA', { timeZone: SAO_PAULO_TZ });
  return storedDay === weekDay;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Dinheiro em centavos (evita 525,01 / -0,00 por float). */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Gasto que conta na cota semanal.
 * Prefere o valor liberado pelo Suprimentos — o cupom (litros × R$/L) pode
 * ficar 1 centavo acima e pintava a cota de vermelho sem necessidade.
 */
function spendOfRow(row: {
  status: string;
  released: unknown;
  liters: unknown;
  ppl: unknown;
}): number {
  const released = asNumber(row.released);
  if (released != null && released > 0) {
    return roundMoney(released);
  }
  if (row.status === 'COMPLETED') {
    const liters = asNumber(row.liters);
    const ppl = asNumber(row.ppl);
    if (liters != null && ppl != null && liters > 0 && ppl > 0) {
      return roundMoney(liters * ppl);
    }
  }
  return 0;
}

type QuotaContractRow = {
  id: string;
  parentId: string | null;
  weekly: unknown;
  urgency: unknown;
  urgencyWeek: Date | null;
  name: string;
  number: string;
};

type QuotaSpendRow = {
  contractId: string | null;
  status: string;
  released: unknown;
  liters: unknown;
  ppl: unknown;
};

async function loadQuotaContracts(): Promise<QuotaContractRow[]> {
  return prisma.$queryRaw<QuotaContractRow[]>`
    SELECT id,
           "fuelQuotaParentContractId" AS "parentId",
           "weeklyFuelTankQuota" AS weekly,
           "fuelQuotaUrgencyReais" AS urgency,
           "fuelQuotaUrgencyWeekStart" AS "urgencyWeek",
           name,
           number
    FROM "contracts"
  `;
}

async function loadWeekSpendRows(weekStart: Date, weekEnd: Date): Promise<QuotaSpendRow[]> {
  return prisma.$queryRaw<QuotaSpendRow[]>`
    SELECT "contractId",
           status,
           "releasedAmountReais" AS released,
           "litersRefueled" AS liters,
           "pricePerLiter" AS ppl
    FROM "fuel_refuel_requests"
    WHERE status IN ('AWAITING_REFUEL', 'COMPLETED', 'APPROVED')
      AND COALESCE("suppliesApprovedAt", "requestedAt") >= ${weekStart}
      AND COALESCE("suppliesApprovedAt", "requestedAt") < ${weekEnd}
  `;
}

function buildQuotaResolver(contracts: QuotaContractRow[]) {
  const parentById = new Map(contracts.map((c) => [c.id, c.parentId || null] as const));
  const resolveRoot = (startId: string) => {
    const seen = new Set<string>();
    let current = startId;
    while (parentById.get(current)) {
      if (seen.has(current)) break;
      seen.add(current);
      current = parentById.get(current) as string;
    }
    return current;
  };
  return { parentById, resolveRoot };
}

function contractLabel(contract: QuotaContractRow): string {
  return contract.name.trim() || contract.number;
}

function buildBalanceForOwner(
  owner: QuotaContractRow,
  members: QuotaContractRow[],
  tankPriceReais: number,
  week: { weekStart: Date; weekEnd: Date },
  spendRows: QuotaSpendRow[],
  requestContractId: string
): FuelQuotaBalance {
  const memberIds = new Set(members.map((member) => member.id));
  const contractNames = [
    contractLabel(owner),
    ...members
      .filter((member) => member.id !== owner.id)
      .map(contractLabel)
      .sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ];
  const weeklyTankQuota = asNumber(owner.weekly);
  const unlimited = weeklyTankQuota == null || weeklyTankQuota <= 0;
  const weeklyBudgetReais = unlimited
    ? null
    : roundMoney(weeklyTankQuota * tankPriceReais);
  const urgencySameWeek = urgencyAppliesThisWeek(owner.urgencyWeek, week.weekStart);
  const urgencyReais =
    !unlimited && urgencySameWeek ? Math.max(0, roundMoney(asNumber(owner.urgency) ?? 0)) : 0;
  const usedReais = roundMoney(
    spendRows
      .filter((row) => row.contractId && memberIds.has(row.contractId))
      .reduce((sum, row) => sum + spendOfRow(row), 0)
  );
  let remainingReais: number | null =
    unlimited || weeklyBudgetReais == null
      ? null
      : roundMoney(weeklyBudgetReais + urgencyReais - usedReais);
  // Centavo residual / float: trata como zerado (não marca negativo).
  if (remainingReais != null && remainingReais > -0.01 && remainingReais < 0) {
    remainingReais = 0;
  }

  return {
    contractId: requestContractId,
    ownerContractId: owner.id,
    ownerName: contractLabel(owner),
    contractNames,
    weeklyTankQuota,
    tankPriceReais: roundMoney(tankPriceReais),
    weeklyBudgetReais,
    urgencyReais,
    usedReais,
    remainingReais,
    unlimited,
    weekStart: week.weekStart.toISOString(),
    weekEnd: week.weekEnd.toISOString(),
  };
}

export async function getFuelQuotaBalance(contractId: string): Promise<FuelQuotaBalance> {
  const id = contractId.trim();
  if (!id) throw createError('Contrato é obrigatório', 400);

  const [contracts, settings] = await Promise.all([
    loadQuotaContracts(),
    prisma.companySettings.findFirst({ select: { fuelTankPriceReais: true } }),
  ]);
  const { parentById, resolveRoot } = buildQuotaResolver(contracts);
  if (!parentById.has(id)) throw createError('Contrato não encontrado', 404);

  const ownerId = resolveRoot(id);
  const owner = contracts.find((c) => c.id === ownerId);
  if (!owner) throw createError('Contrato do grupo não encontrado', 404);

  const members = contracts.filter((c) => resolveRoot(c.id) === ownerId);
  const tankPriceReais = Number(settings?.fuelTankPriceReais ?? 350);
  const week = getSaoPauloWeekRange();
  const spendRows = await loadWeekSpendRows(week.weekStart, week.weekEnd);
  return buildBalanceForOwner(owner, members, tankPriceReais, week, spendRows, id);
}

export const WEEKLY_QUOTA_EXCEEDED_MESSAGE =
  'Este contrato já ultrapassou o limite semanal. Entre em contato com o Gestor.';

export function isWeeklyQuotaExhausted(balance: FuelQuotaBalance): boolean {
  return !balance.unlimited && (balance.remainingReais ?? 0) <= 0;
}

export async function assertWeeklyQuotaAvailable(
  contractId: string,
  amountReais = 0,
): Promise<void> {
  const balance = await getFuelQuotaBalance(contractId);
  if (balance.unlimited) return;
  const remaining = balance.remainingReais ?? 0;
  if (remaining <= 0) {
    throw createError(WEEKLY_QUOTA_EXCEEDED_MESSAGE, 400);
  }
  if (amountReais > remaining) {
    const remainingLabel = remaining.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    throw createError(
      `O valor a liberar ultrapassa o restante da cota semanal (${remainingLabel}).`,
      400,
    );
  }
}

export function formatFuelQuotaWeekLine(balance: FuelQuotaBalance): string {
  if (balance.unlimited) return 'Cota desta semana: sem limite';
  const remaining = (balance.remainingReais ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  return `Disponível nesta semana: ${remaining}`;
}

export async function tryFormatFuelQuotaWeekLine(contractId: string): Promise<string | null> {
  try {
    return formatFuelQuotaWeekLine(await getFuelQuotaBalance(contractId));
  } catch {
    return null;
  }
}

export async function tryGetFuelQuotaWeekNotice(contractId: string): Promise<{
  line: string;
  exhausted: boolean;
} | null> {
  try {
    const balance = await getFuelQuotaBalance(contractId);
    return {
      line: formatFuelQuotaWeekLine(balance),
      exhausted: isWeeklyQuotaExhausted(balance),
    };
  } catch {
    return null;
  }
}

export async function listFuelQuotaBalances(): Promise<{
  tankPriceReais: number;
  weekStart: string;
  weekEnd: string;
  groups: FuelQuotaBalance[];
}> {
  const [contracts, settings] = await Promise.all([
    loadQuotaContracts(),
    prisma.companySettings.findFirst({ select: { fuelTankPriceReais: true } }),
  ]);
  const { resolveRoot } = buildQuotaResolver(contracts);
  const tankPriceReais = Number(settings?.fuelTankPriceReais ?? 350);
  const week = getSaoPauloWeekRange();
  const spendRows = await loadWeekSpendRows(week.weekStart, week.weekEnd);

  const byOwner = new Map<string, QuotaContractRow[]>();
  contracts.forEach((c) => {
    const ownerId = resolveRoot(c.id);
    const list = byOwner.get(ownerId) || [];
    list.push(c);
    byOwner.set(ownerId, list);
  });

  const groups = Array.from(byOwner.entries())
    .map(([ownerId, members]) => {
      const owner = contracts.find((c) => c.id === ownerId) || members[0];
      return buildBalanceForOwner(owner, members, tankPriceReais, week, spendRows, owner.id);
    })
    .sort((a, b) => {
      if (a.unlimited !== b.unlimited) return a.unlimited ? 1 : -1;
      const ra = a.remainingReais ?? Number.POSITIVE_INFINITY;
      const rb = b.remainingReais ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.ownerName.localeCompare(b.ownerName, 'pt-BR');
    });

  return {
    tankPriceReais,
    weekStart: week.weekStart.toISOString(),
    weekEnd: week.weekEnd.toISOString(),
    groups,
  };
}

export type FuelUrgencyChartGroup = {
  ownerContractId: string;
  ownerName: string;
  contractNames: string[];
  urgencyReais: number;
};

function ymdUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekOverlapsRange(weekStart: Date, from?: string, to?: string): boolean {
  const start = ymdUtc(weekStart);
  const end = addDaysYmd(start, 6);
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
}

/** Grava a urgência da semana para o gráfico respeitar o filtro de datas. */
export async function saveFuelUrgencyWeek(
  contractId: string,
  weekStart: Date | null,
  amountReais: number | null
): Promise<void> {
  const week = weekStart ?? getSaoPauloWeekRange().weekStart;
  const weekDay = ymdUtc(week);
  if (amountReais == null || amountReais <= 0) {
    await prisma.$executeRawUnsafe(
      `
        DELETE FROM "fuel_quota_urgency_weeks"
        WHERE "contractId" = $1
          AND "weekStart" = $2::date
      `,
      contractId,
      weekDay
    );
    return;
  }

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "fuel_quota_urgency_weeks" ("contractId", "weekStart", "amountReais", "updatedAt")
      VALUES ($1, $2::date, $3, CURRENT_TIMESTAMP)
      ON CONFLICT ("contractId", "weekStart")
      DO UPDATE SET "amountReais" = EXCLUDED."amountReais",
                    "updatedAt" = CURRENT_TIMESTAMP
    `,
    contractId,
    weekDay,
    amountReais
  );
}

export async function listFuelUrgencyChart(
  from?: string,
  to?: string
): Promise<FuelUrgencyChartGroup[]> {
  const [rows, contracts] = await Promise.all([
    prisma.$queryRawUnsafe<
      Array<{ contractId: string; weekStart: Date; amount: unknown }>
    >(`
      SELECT "contractId",
             "weekStart",
             "amountReais" AS amount
      FROM "fuel_quota_urgency_weeks"
      WHERE "amountReais" > 0
    `),
    loadQuotaContracts(),
  ]);
  const { resolveRoot } = buildQuotaResolver(contracts);
  const byOwner = new Map<string, number>();
  for (const row of rows) {
    const weekStart = row.weekStart instanceof Date ? row.weekStart : new Date(row.weekStart);
    if (Number.isNaN(weekStart.getTime())) continue;
    if (!weekOverlapsRange(weekStart, from, to)) continue;
    const ownerId = resolveRoot(row.contractId);
    byOwner.set(ownerId, roundMoney((byOwner.get(ownerId) ?? 0) + (asNumber(row.amount) ?? 0)));
  }

  return Array.from(byOwner.entries())
    .map(([ownerId, urgencyReais]) => {
      const members = contracts.filter((contract) => resolveRoot(contract.id) === ownerId);
      const owner = contracts.find((contract) => contract.id === ownerId) || members[0];
      const contractNames = owner
        ? [
            contractLabel(owner),
            ...members
              .filter((member) => member.id !== owner.id)
              .map(contractLabel)
              .sort((a, b) => a.localeCompare(b, 'pt-BR')),
          ]
        : [ownerId];
      return {
        ownerContractId: ownerId,
        ownerName: contractNames[0],
        contractNames,
        urgencyReais,
      };
    })
    .filter((group) => group.urgencyReais > 0)
    .sort((a, b) => b.urgencyReais - a.urgencyReais || a.ownerName.localeCompare(b.ownerName, 'pt-BR'));
}

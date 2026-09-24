import { createError } from '../middleware/errorHandler';
import { prisma } from './prisma';

const SAO_PAULO_TZ = 'America/Sao_Paulo';

export type FuelQuotaBalance = {
  contractId: string;
  ownerContractId: string;
  ownerName: string;
  weeklyTankQuota: number | null;
  tankPriceReais: number;
  weeklyBudgetReais: number | null;
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

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function spendOfRow(row: {
  status: string;
  released: unknown;
  liters: unknown;
  ppl: unknown;
}): number {
  if (row.status === 'COMPLETED') {
    const liters = asNumber(row.liters);
    const ppl = asNumber(row.ppl);
    if (liters != null && ppl != null && liters > 0 && ppl > 0) {
      return liters * ppl;
    }
  }
  const released = asNumber(row.released);
  return released != null && released > 0 ? released : 0;
}

type QuotaContractRow = {
  id: string;
  parentId: string | null;
  weekly: unknown;
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

function buildBalanceForOwner(
  owner: QuotaContractRow,
  memberIds: Set<string>,
  tankPriceReais: number,
  week: { weekStart: Date; weekEnd: Date },
  spendRows: QuotaSpendRow[],
  requestContractId: string
): FuelQuotaBalance {
  const weeklyTankQuota = asNumber(owner.weekly);
  const unlimited = weeklyTankQuota == null || weeklyTankQuota <= 0;
  const weeklyBudgetReais = unlimited ? null : weeklyTankQuota * tankPriceReais;
  const usedReais = spendRows
    .filter((row) => row.contractId && memberIds.has(row.contractId))
    .reduce((sum, row) => sum + spendOfRow(row), 0);
  const remainingReais =
    unlimited || weeklyBudgetReais == null ? null : weeklyBudgetReais - usedReais;

  return {
    contractId: requestContractId,
    ownerContractId: owner.id,
    ownerName: owner.name.trim() || owner.number,
    weeklyTankQuota,
    tankPriceReais,
    weeklyBudgetReais,
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

  const memberIds = new Set(
    contracts.filter((c) => resolveRoot(c.id) === ownerId).map((c) => c.id)
  );
  const tankPriceReais = Number(settings?.fuelTankPriceReais ?? 350);
  const week = getSaoPauloWeekRange();
  const spendRows = await loadWeekSpendRows(week.weekStart, week.weekEnd);
  return buildBalanceForOwner(owner, memberIds, tankPriceReais, week, spendRows, id);
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
      const memberIds = new Set(members.map((m) => m.id));
      return buildBalanceForOwner(owner, memberIds, tankPriceReais, week, spendRows, owner.id);
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

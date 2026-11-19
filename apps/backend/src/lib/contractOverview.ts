import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

/**
 * Resumo / visão geral do contrato calculado no servidor.
 * Porte fiel de apps/frontend/src/app/ponto/contratos/[id]/page.tsx (`resumoVisaoGeral`) e
 * de apps/frontend/src/components/contract/ContratoResumoVisaoGeral.tsx (`visaoGeralKpis`).
 *
 * Datas: o web recebe tudo em JSON (ISO) e `parseDateSafe` usa só o prefixo YYYY-MM-DD, criando
 * a data ao meio-dia local. Aqui fazemos o mesmo a partir de `Date` (UTC) -> prefixo ISO.
 */

export type ContractOverview = {
  contract: { id: string; name: string; number: string; startDate: string; endDate: string };
  year: number;
  valorContratual: number;
  faturado: number;
  empenhado: number;
  saldoFaturamento: number;
  aEmpenhar: number;
  osAtivas: number;
  osFinalizadas: number;
  meses: Array<{ label: string; faturado: number; meta: number; previsao: number; decorrido: boolean }>;
  mesAtual: null | { label: string; faturado: number; meta: number; previsao: number; producao: number };
};

/** page.tsx linha 266 */
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** page.tsx linha 370 */
const PLEITO_HISTORY_MARKER = '__PLEITO_HISTORICO__';

/** lib/contractWeeklyProduction.ts: semana = preenchimento + 7 dias. */
const PRODUCTION_WEEK_OFFSET_DAYS = 7;

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** porte de page.tsx linhas 452–458 (parseDateOnlyLocal) */
function parseDateOnlyLocal(dateStr: string): Date | null {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/** porte de page.tsx linhas 461–478 (parseDateSafe); `Date` vira o prefixo ISO (como o JSON que o web recebe). */
function parseDateSafe(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  let raw: string;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    raw = input.toISOString();
  } else {
    raw = String(input).trim();
  }
  const dateOnly = parseDateOnlyLocal(raw);
  if (dateOnly) return dateOnly;
  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) return parseDateOnlyLocal(`${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** porte de lib/contractWeeklyProduction.ts (addCalendarDays / productionWeekDate) e page.tsx 327–331 (productionWeekFromFilling) */
function productionWeekFromFilling(fillingDate: string | Date | null | undefined): Date | null {
  const d = parseDateSafe(fillingDate);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + PRODUCTION_WEEK_OFFSET_DAYS, 12, 0, 0, 0);
}

// ---------------------------------------------------------------------------
// Orçamento / OS
// ---------------------------------------------------------------------------

/** porte de page.tsx linhas 914–925 (parseBudgetToNumberSafe) */
function parseBudgetToNumberSafe(v: string | null | undefined): number {
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

type BillingRow = { issueDate: Date | string | null; grossValue: number; serviceOrder: string | null };
type PleitoRow = { id: string; divSe: string | null; budget: string | null; reportsBilling: string | null };

/** porte de page.tsx linhas 1054–1057 (isPleitoHistorico) */
function isPleitoHistorico(p: PleitoRow): boolean {
  const marker = (p.reportsBilling || '').trim();
  return marker === PLEITO_HISTORY_MARKER || marker.startsWith(PLEITO_HISTORY_MARKER);
}

/** porte de lib/pleitoOsExport.ts (getOsFaturamentoAcumulado) */
function getOsFaturamentoAcumulado(p: Pick<PleitoRow, 'divSe'>, billings: BillingRow[]): number {
  const osSe = (p.divSe || '').trim();
  if (!osSe) return 0;
  return billings
    .filter((b) => (b.serviceOrder || '').trim() === osSe)
    .reduce((sum, b) => sum + Number(b.grossValue || 0), 0);
}

/** porte de lib/pleitoOsExport.ts (isOsConcluida) */
function isOsConcluida(p: Pick<PleitoRow, 'divSe' | 'budget'>, billings: BillingRow[]): boolean {
  const orcamento = parseBudgetToNumberSafe(p.budget);
  if (orcamento <= 0) return false;
  const acumulado = getOsFaturamentoAcumulado(p, billings);
  return acumulado >= orcamento - 0.01;
}

// ---------------------------------------------------------------------------
// Meta mensal (vigência, aditivos, ajuste anual)
// ---------------------------------------------------------------------------

/** porte de page.tsx linhas 540–548 (calendarMonthHasMetaMensalInVigencia) */
function calendarMonthHasMetaMensalInVigencia(
  calendarYear: number,
  calendarMonth1to12: number,
  contractStart: Date,
  contractEnd: Date
): boolean {
  const ms = new Date(calendarYear, calendarMonth1to12 - 1, 1, 12, 0, 0, 0);
  const me = new Date(calendarYear, calendarMonth1to12, 0, 12, 0, 0, 0);
  return ms.getTime() < contractEnd.getTime() && me.getTime() >= contractStart.getTime();
}

/** porte de page.tsx linhas 550–552 (toYearMonthKey) */
function toYearMonthKey(y: number, m1to12: number): string {
  return `${y}-${String(m1to12).padStart(2, '0')}`;
}

/** porte de page.tsx linhas 555–568 (countVigenciaMonthsInRange) */
function countVigenciaMonthsInRange(
  calendarYear: number,
  monthStart: number,
  monthEnd: number,
  contractStart: Date,
  contractEnd: Date
): number {
  let n = 0;
  for (let m = monthStart; m <= monthEnd; m++) {
    if (calendarMonthHasMetaMensalInVigencia(calendarYear, m, contractStart, contractEnd)) n += 1;
  }
  return n;
}

type VigenciaMonth = { y: number; m: number; key: string };

/** porte de page.tsx linhas 572–586 (listVigenciaMonthKeys) */
function listVigenciaMonthKeys(contractStart: Date, contractEnd: Date): VigenciaMonth[] {
  const months: VigenciaMonth[] = [];
  const cursor = new Date(contractStart.getFullYear(), contractStart.getMonth(), 1, 12, 0, 0, 0);
  const endCursor = new Date(contractEnd.getFullYear(), contractEnd.getMonth(), 1, 12, 0, 0, 0);
  while (cursor.getTime() <= endCursor.getTime()) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    if (calendarMonthHasMetaMensalInVigencia(y, m, contractStart, contractEnd)) {
      months.push({ y, m, key: toYearMonthKey(y, m) });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

/** porte de page.tsx linhas 748–771 (buildContractAvailableYears) */
function buildContractAvailableYears(startDate: Date | string, endDate: Date | string): number[] {
  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);
  const years = new Set<number>();
  if (start && end) {
    for (const { y } of listVigenciaMonthKeys(start, end)) years.add(y);
  }
  const yStart = start ? start.getFullYear() : null;
  const yEnd = end ? end.getFullYear() : null;
  if (yStart != null && yEnd != null) {
    for (let y = Math.min(yStart, yEnd); y <= Math.max(yStart, yEnd); y++) years.add(y);
  }
  if (years.size === 0) years.add(yStart ?? yEnd ?? new Date().getFullYear());
  return Array.from(years).sort((a, b) => a - b);
}

/** porte de page.tsx linhas 597–606 (parseContractAddendaForMeta) */
function parseContractAddendaForMeta(
  rows: Array<{ effectiveDate: Date | string; amount: number }>
): Array<{ effectiveDate: Date; amount: number }> {
  const out: Array<{ effectiveDate: Date; amount: number }> = [];
  for (const a of rows) {
    const d = parseDateSafe(a.effectiveDate);
    if (!d) continue;
    out.push({ effectiveDate: d, amount: Number(a.amount) || 0 });
  }
  return out;
}

type AnnualBudgetAdjustmentRow = { year: number; effectiveDate: Date; amount: number };

/** porte de page.tsx linhas 610–624 (parseAnnualBudgetAdjustments) */
function parseAnnualBudgetAdjustments(
  rows: Array<{ year: number; budgetAdjustmentDelta: number | null; budgetAdjustmentEffectiveDate: Date | null }>
): AnnualBudgetAdjustmentRow[] {
  const out: AnnualBudgetAdjustmentRow[] = [];
  for (const r of rows) {
    if (r.budgetAdjustmentDelta == null || !r.budgetAdjustmentEffectiveDate) continue;
    const eff = parseDateSafe(r.budgetAdjustmentEffectiveDate);
    if (!eff) continue;
    const amount = Number(r.budgetAdjustmentDelta);
    if (!Number.isFinite(amount) || Math.abs(amount) < 1e-9) continue;
    out.push({ year: r.year, effectiveDate: eff, amount });
  }
  out.sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());
  return out;
}

/** porte de page.tsx linhas 631–637 (annualAdjustmentEffectiveCivilMonth) */
function annualAdjustmentEffectiveCivilMonth(civilYear: number, effectiveDate: Date): number | null {
  const effY = effectiveDate.getFullYear();
  const effM = effectiveDate.getMonth() + 1;
  if (effY > civilYear) return null;
  if (effY === civilYear) return effM;
  return 1;
}

/** porte de page.tsx linhas 640–655 (sumGlobalMetaAllocatedInMonthRange) */
function sumGlobalMetaAllocatedInMonthRange(
  globalMap: Map<string, number>,
  civilYear: number,
  monthStart: number,
  monthEnd: number,
  contractStart: Date,
  contractEnd: Date
): number {
  let sum = 0;
  for (let m = monthStart; m <= monthEnd; m++) {
    if (!calendarMonthHasMetaMensalInVigencia(civilYear, m, contractStart, contractEnd)) continue;
    sum += globalMap.get(toYearMonthKey(civilYear, m)) ?? 0;
  }
  return sum;
}

/**
 * porte de page.tsx linhas 662–714 (buildContractMetaSchedule):
 * saldo ÷ meses restantes, recalculado a cada aditivo.
 */
function buildContractMetaSchedule(
  contractStart: Date,
  contractEnd: Date,
  initialTotal: number,
  addenda: Array<{ effectiveDate: Date; amount: number }>
): Map<string, number> {
  const months = listVigenciaMonthKeys(contractStart, contractEnd);
  const schedule = new Map<string, number>();
  if (!months.length) return schedule;

  const addSumByMonth = new Map<string, number>();
  for (const a of addenda) {
    const k = toYearMonthKey(a.effectiveDate.getFullYear(), a.effectiveDate.getMonth() + 1);
    addSumByMonth.set(k, (addSumByMonth.get(k) || 0) + a.amount);
  }

  let remaining = initialTotal;
  const firstKey = months[0].key;
  addSumByMonth.forEach((v, k) => {
    if (k < firstKey) remaining += v;
  });

  let i = 0;
  while (i < months.length) {
    const curKey = months[i].key;
    remaining += addSumByMonth.get(curKey) || 0;

    let j = i + 1;
    while (j < months.length) {
      if ((addSumByMonth.get(months[j].key) || 0) !== 0) break;
      j += 1;
    }
    const remainingMonthsToEnd = months.length - i;
    const meta = remainingMonthsToEnd > 0 ? remaining / remainingMonthsToEnd : 0;
    for (let k = i; k < j; k++) {
      schedule.set(months[k].key, meta);
      remaining -= meta;
    }
    i = j;
  }
  return schedule;
}

/** porte de page.tsx linhas 2251–2283 (metaSchedule = globalMetaSchedule + ajuste anual) */
function buildMetaScheduleWithAnnualAdjust(
  globalMetaSchedule: Map<string, number>,
  annualBudgetAdjustments: AnnualBudgetAdjustmentRow[],
  start: Date,
  end: Date
): Map<string, number> {
  const out = new Map(globalMetaSchedule);
  for (const r of annualBudgetAdjustments) {
    const effMonth = annualAdjustmentEffectiveCivilMonth(r.year, r.effectiveDate);
    if (effMonth === null) continue;

    const monthsAfter = countVigenciaMonthsInRange(r.year, effMonth, 12, start, end);
    if (monthsAfter <= 0) continue;

    const plannedRestOfYear = sumGlobalMetaAllocatedInMonthRange(globalMetaSchedule, r.year, effMonth, 12, start, end);
    const pool = plannedRestOfYear + r.amount;
    const metaY = pool / monthsAfter;
    for (let m = effMonth; m <= 12; m++) {
      if (!calendarMonthHasMetaMensalInVigencia(r.year, m, start, end)) continue;
      out.set(toYearMonthKey(r.year, m), metaY);
    }
  }
  return out;
}

/** porte de page.tsx linhas 2386–2451 (metaRealByScheduleKey): saldo pendente ÷ meses restantes (aditivos + faturamento). */
function buildMetaRealByScheduleKey(opts: {
  vigenciaMonthList: VigenciaMonth[];
  valuePlusAddenda: number;
  addendaForMeta: Array<{ effectiveDate: Date; amount: number }>;
  faturamentoPorYmKey: Map<string, number>;
  annualBudgetAdjustments: AnnualBudgetAdjustmentRow[];
  globalMetaSchedule: Map<string, number>;
  start: Date;
  end: Date;
}): Map<string, number> {
  const { vigenciaMonthList, addendaForMeta, faturamentoPorYmKey, annualBudgetAdjustments, globalMetaSchedule, start, end } = opts;
  const out = new Map<string, number>();
  if (!vigenciaMonthList.length) return out;

  const addSumByMonth = new Map<string, number>();
  for (const a of addendaForMeta) {
    const k = toYearMonthKey(a.effectiveDate.getFullYear(), a.effectiveDate.getMonth() + 1);
    addSumByMonth.set(k, (addSumByMonth.get(k) || 0) + a.amount);
  }

  const firstKey = vigenciaMonthList[0].key;
  let remaining = Number(opts.valuePlusAddenda) || 0;
  addSumByMonth.forEach((v, k) => {
    if (k < firstKey) remaining += v;
  });

  const n = vigenciaMonthList.length;
  for (let i = 0; i < n; i++) {
    const { key } = vigenciaMonthList[i];
    remaining += addSumByMonth.get(key) || 0;
    const monthsLeft = n - i;
    out.set(key, monthsLeft > 0 ? Math.max(0, remaining) / monthsLeft : 0);
    remaining -= faturamentoPorYmKey.get(key) || 0;
  }

  if (annualBudgetAdjustments.length > 0) {
    for (const r of annualBudgetAdjustments) {
      const effMonth = annualAdjustmentEffectiveCivilMonth(r.year, r.effectiveDate);
      if (effMonth === null) continue;

      const monthsAtStart = countVigenciaMonthsInRange(r.year, effMonth, 12, start, end);
      if (monthsAtStart <= 0) continue;

      let annualRemaining =
        sumGlobalMetaAllocatedInMonthRange(globalMetaSchedule, r.year, effMonth, 12, start, end) + r.amount;

      for (let m = effMonth; m <= 12; m++) {
        if (!calendarMonthHasMetaMensalInVigencia(r.year, m, start, end)) continue;
        const monthsAfter = countVigenciaMonthsInRange(r.year, m, 12, start, end);
        if (monthsAfter <= 0) continue;
        out.set(toYearMonthKey(r.year, m), Math.max(0, annualRemaining) / monthsAfter);
        annualRemaining -= faturamentoPorYmKey.get(toYearMonthKey(r.year, m)) || 0;
      }
    }
  }
  return out;
}

/** Ano/mês corrente no fuso de Brasília (o web usa o relógio do navegador). */
function nowBrasilia(): { year: number; monthIdx: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return { year, monthIdx: month - 1 };
}

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

/**
 * porte de page.tsx linhas 3603–3652 (resumoVisaoGeral) + visaoGeralKpis (ContratoResumoVisaoGeral.tsx 94–99).
 */
export async function buildContractOverview(contractId: string, year?: number): Promise<ContractOverview> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw createError('Contrato não encontrado', 404);

  const [addendaRows, billingRows, pleitoRows, productionRows, annualRows] = await Promise.all([
    prisma.contractAddendum.findMany({
      where: { contractId },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.contractBilling.findMany({ where: { contractId } }),
    prisma.pleito.findMany({
      where: { updatedContractId: contractId },
      select: { id: true, divSe: true, budget: true, reportsBilling: true },
    }),
    prisma.contractWeeklyProduction.findMany({ where: { contractId } }),
    prisma.contractAnnualValue.findMany({ where: { contractId }, orderBy: { year: 'asc' } }),
  ]);

  const valuePlusAddenda = num(contract.valuePlusAddenda);
  const addenda = addendaRows.map((a) => ({ effectiveDate: a.effectiveDate, amount: num(a.amount) }));
  const billings: BillingRow[] = billingRows.map((b) => ({
    issueDate: b.issueDate,
    grossValue: num(b.grossValue),
    serviceOrder: b.serviceOrder ?? null,
  }));
  const productions = productionRows.map((p) => ({
    fillingDate: p.fillingDate,
    weeklyProductionValue: num(p.weeklyProductionValue),
  }));

  // page.tsx 1966–1975
  const totalAddenda = addenda.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const valorMaisAditivosTotal = valuePlusAddenda + totalAddenda;

  // page.tsx 2045–2048 + 2121–2127: ano selecionado (padrão: ano corrente) validado contra os anos do contrato
  const now = nowBrasilia();
  const requestedYear = year != null && Number.isFinite(year) ? Math.trunc(year) : now.year;
  const availableYears = buildContractAvailableYears(contract.startDate, contract.endDate);
  const safeSelectedYear = availableYears.includes(requestedYear)
    ? requestedYear
    : availableYears[0] ?? now.year;

  const vigStart = parseDateSafe(contract.startDate);
  const vigEnd = parseDateSafe(contract.endDate);

  // page.tsx 2283–2296 (faturamentoPorMes: bruto por mês do ano, pela issueDate)
  const faturamentoPorMes: number[] = new Array(12).fill(0);
  // page.tsx 2379–2388 (faturamentoPorYmKey: todo o contrato, por ano-mês)
  const faturamentoPorYmKey = new Map<string, number>();
  for (const b of billings) {
    const d = parseDateSafe(b.issueDate);
    if (!d) continue;
    if (d.getFullYear() === safeSelectedYear) faturamentoPorMes[d.getMonth()] += b.grossValue;
    const k = toYearMonthKey(d.getFullYear(), d.getMonth() + 1);
    faturamentoPorYmKey.set(k, (faturamentoPorYmKey.get(k) || 0) + b.grossValue);
  }

  // page.tsx 2298–2311 (producaoPorMes)
  const producaoPorMes: number[] = new Array(12).fill(0);
  for (const p of productions) {
    const d = productionWeekFromFilling(p.fillingDate);
    if (!d) continue;
    if (d.getFullYear() === safeSelectedYear) producaoPorMes[d.getMonth()] += p.weeklyProductionValue;
  }

  // page.tsx 2815–2818 (faturamentoTotalTodosAnos)
  const faturamentoTotalTodosAnos = billings.reduce((acc, b) => acc + b.grossValue, 0);

  // Metas (page.tsx 2112–2283, 2386–2470)
  const addendaForMeta = parseContractAddendaForMeta(addenda);
  const annualBudgetAdjustments = parseAnnualBudgetAdjustments(
    annualRows.map((r) => ({
      year: r.year,
      budgetAdjustmentDelta: r.budgetAdjustmentDelta != null ? num(r.budgetAdjustmentDelta) : null,
      budgetAdjustmentEffectiveDate: r.budgetAdjustmentEffectiveDate ?? null,
    }))
  );

  let metaSchedule = new Map<string, number>();
  let metaRealByScheduleKey = new Map<string, number>();
  if (vigStart && vigEnd) {
    const globalMetaSchedule = buildContractMetaSchedule(vigStart, vigEnd, valuePlusAddenda, addendaForMeta);
    metaSchedule = buildMetaScheduleWithAnnualAdjust(globalMetaSchedule, annualBudgetAdjustments, vigStart, vigEnd);
    metaRealByScheduleKey = buildMetaRealByScheduleKey({
      vigenciaMonthList: listVigenciaMonthKeys(vigStart, vigEnd),
      valuePlusAddenda,
      addendaForMeta,
      faturamentoPorYmKey,
      annualBudgetAdjustments,
      globalMetaSchedule,
      start: vigStart,
      end: vigEnd,
    });
  }

  // page.tsx 2460–2469 (metaRealPorMes)
  const metaRealPorMes: (number | null)[] = new Array(12).fill(null);
  for (let i = 0; i < 12; i++) {
    const key = toYearMonthKey(safeSelectedYear, i + 1);
    if ((metaSchedule.get(key) ?? null) === null) continue;
    metaRealPorMes[i] = metaRealByScheduleKey.get(key) ?? (metaSchedule.get(key) ?? 0);
  }

  // page.tsx 3604–3615: empenhado / OS ativas / finalizadas (sem repetir divSe; exclui histórico)
  const osRows = pleitoRows.filter((p) => !isPleitoHistorico(p));
  const vistas = new Set<string>();
  let empenhado = 0;
  let osAtivas = 0;
  let osFinalizadas = 0;
  for (const p of osRows) {
    const chave = (p.divSe || '').trim().toLowerCase() || p.id;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    empenhado += parseBudgetToNumberSafe(p.budget);
    osAtivas += 1;
    if (isOsConcluida(p, billings)) osFinalizadas += 1;
  }

  // page.tsx 3616–3634 (meses)
  const anoAtual = now.year;
  const mesAtualIdx = now.monthIdx;
  const meses = MESES.map((label, i) => {
    const meta = metaRealPorMes[i] ?? metaSchedule.get(toYearMonthKey(safeSelectedYear, i + 1)) ?? 0;
    const decorrido = safeSelectedYear < anoAtual || (safeSelectedYear === anoAtual && i <= mesAtualIdx);
    const faturadoMes = faturamentoPorMes[i] || 0;
    const eMesAtual = safeSelectedYear === anoAtual && i === mesAtualIdx;
    return {
      label,
      faturado: faturadoMes,
      meta: Number(meta) || 0,
      previsao: eMesAtual ? Math.max(0, (producaoPorMes[i] || 0) - faturadoMes) : 0,
      decorrido,
    };
  });

  // KPIs derivados (ContratoResumoVisaoGeral.tsx 96–97)
  const saldoFaturamento = Math.max(0, empenhado - faturamentoTotalTodosAnos);
  const aEmpenhar = Math.max(0, valorMaisAditivosTotal - empenhado);

  const mesAtual =
    safeSelectedYear === anoAtual
      ? {
          label: MESES[mesAtualIdx],
          faturado: meses[mesAtualIdx].faturado,
          meta: meses[mesAtualIdx].meta,
          previsao: meses[mesAtualIdx].previsao,
          producao: producaoPorMes[mesAtualIdx] || 0,
        }
      : null;

  const iso = (d: Date) => d.toISOString();
  return {
    contract: {
      id: contract.id,
      name: contract.name,
      number: contract.number,
      startDate: iso(contract.startDate),
      endDate: iso(contract.endDate),
    },
    year: safeSelectedYear,
    valorContratual: valorMaisAditivosTotal,
    faturado: faturamentoTotalTodosAnos,
    empenhado,
    saldoFaturamento,
    aEmpenhar,
    osAtivas,
    osFinalizadas,
    meses,
    mesAtual,
  };
}

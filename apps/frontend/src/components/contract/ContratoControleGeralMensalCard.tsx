'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import api from '@/lib/api';
import { productionWeekDate } from '@/lib/contractWeeklyProduction';
import { isBudgetStatusInValorOrcadoSum } from '@/lib/pleitoForm';
import { isPleitoHistorico } from '@/lib/contractHistoricoPleitos';
import { isOsConcluida, type BillingForOsCheck } from '@/lib/pleitoOsExport';
import { usePermissions } from '@/hooks/usePermissions';
import {
  aggregateGastosNaturezaMonthlyTotals,
  filterGastosNaturezaDetailRowsForSystemContract,
  gastosMonthPeriodBounds,
} from '@/app/ponto/contratos/controle-geral/controleGeralGastosFluxo';
import { aggregateGastosNaturezaRows } from '@/app/ponto/contratos/controle-geral/buildQueryGastosRows';
import { useGastosOperacionaisTotvsQuery } from '@/app/ponto/contratos/controle-geral/useGastosOperacionaisTotvsQuery';
import {
  buildTetoOrcamentarioLookup,
  resolveMonthlyTetoOrcamentarioForLabels,
  tetoLabelsForSystemContract,
  type ControleGeralTetoOrcamentarioEntry,
} from '@/app/ponto/contratos/controle-geral/tetoOrcamentario';
import { ContractGastosResumoModal } from '@/components/contract/ContractGastosResumoModal';

const TIMEZONE_BRASILIA = 'America/Sao_Paulo';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type ContractBilling = {
  id: string;
  contractId: string;
  issueDate: string;
  grossValue: number;
};

type ContractPleito = {
  id: string;
  divSe: string | null;
  creationMonth: string | null;
  creationYear: number | null;
  startDate: string | null;
  budgetStatus: string | null;
  budget: string | null;
  reportsBilling: string | null;
  billingRequest?: number | null;
};

type ContractWeeklyProduction = {
  fillingDate: string;
  weeklyProductionValue: number;
};

type ContractAnnualValueRow = {
  year: number;
  budgetAdjustmentDelta?: number | null;
  budgetAdjustmentEffectiveDate?: string | null;
};

type ContractAddendumRow = {
  effectiveDate: string;
  amount: number;
};

type Contract = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  valuePlusAddenda: number;
  costCenter?: { id: string; code: string; name: string };
};

function parseDateOnlyLocal(dateStr: string): Date | null {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  return new Date(y, mo, day, 12, 0, 0, 0);
}

function parseDateSafe(dateStr: string | Date | null | undefined): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    if (Number.isNaN(dateStr.getTime())) return null;
    const y = dateStr.getFullYear();
    const mo = dateStr.getMonth();
    const day = dateStr.getDate();
    return new Date(y, mo, day, 12, 0, 0, 0);
  }
  const raw = String(dateStr).trim();
  const dateOnly = parseDateOnlyLocal(raw);
  if (dateOnly) return dateOnly;
  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) {
    return parseDateOnlyLocal(`${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function productionWeekFromFilling(fillingDate: string | Date | null | undefined): Date | null {
  const d = parseDateSafe(fillingDate);
  if (!d) return null;
  return productionWeekDate(d);
}

function getCalendarPartsBrasilia(d: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE_BRASILIA,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);
}

function getDateYear(dateStr: string | null | undefined): number | null {
  const d = parseDateSafe(dateStr);
  if (!d) return null;
  const y = getCalendarPartsBrasilia(d).find((p) => p.type === 'year')?.value;
  return y != null ? Number(y) : null;
}

function getDateMonth(dateStr: string | null | undefined): number | null {
  const d = parseDateSafe(dateStr);
  if (!d) return null;
  const m = getCalendarPartsBrasilia(d).find((p) => p.type === 'month')?.value;
  return m != null ? Number(m) : null;
}

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

function toYearMonthKey(y: number, m1to12: number): string {
  return `${y}-${String(m1to12).padStart(2, '0')}`;
}

function countVigenciaMonthsInRange(
  calendarYear: number,
  monthStart: number,
  monthEnd: number,
  contractStart: Date,
  contractEnd: Date
): number {
  let n = 0;
  for (let m = monthStart; m <= monthEnd; m++) {
    if (calendarMonthHasMetaMensalInVigencia(calendarYear, m, contractStart, contractEnd)) {
      n += 1;
    }
  }
  return n;
}

type VigenciaMonth = { y: number; m: number; key: string };

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

function parseContractAddendaForMeta(rows: ContractAddendumRow[]): Array<{ effectiveDate: Date; amount: number }> {
  const out: Array<{ effectiveDate: Date; amount: number }> = [];
  for (const a of rows) {
    const d = parseDateSafe(a.effectiveDate);
    if (!d) continue;
    out.push({ effectiveDate: d, amount: Number(a.amount) || 0 });
  }
  return out;
}

type AnnualBudgetAdjustmentRow = { year: number; effectiveDate: Date; amount: number };

function parseAnnualBudgetAdjustments(rows: ContractAnnualValueRow[] | undefined): AnnualBudgetAdjustmentRow[] {
  if (!rows?.length) return [];
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

function annualAdjustmentEffectiveCivilMonth(civilYear: number, effectiveDate: Date): number | null {
  const effY = effectiveDate.getFullYear();
  const effM = effectiveDate.getMonth() + 1;
  if (effY > civilYear) return null;
  if (effY === civilYear) return effM;
  return 1;
}

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
    const y = a.effectiveDate.getFullYear();
    const m = a.effectiveDate.getMonth() + 1;
    const k = toYearMonthKey(y, m);
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function signedGastosValueClassName(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-violet-800 dark:text-violet-300';
}

function buildContractAvailableYears(startDate: string, endDate: string): number[] {
  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);
  const years = new Set<number>();

  if (start && end) {
    for (const { y } of listVigenciaMonthKeys(start, end)) {
      years.add(y);
    }
  }

  const yStart = getDateYear(startDate);
  const yEnd = getDateYear(endDate);
  if (yStart != null && yEnd != null) {
    for (let y = Math.min(yStart, yEnd); y <= Math.max(yStart, yEnd); y++) {
      years.add(y);
    }
  }

  if (years.size === 0) {
    years.add(yStart ?? yEnd ?? new Date().getFullYear());
  }

  return Array.from(years).sort((a, b) => a - b);
}

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

export function ContratoControleGeralMensalCard({ contractId }: { contractId: string }) {
  const { canAccessContractOrdemServicoTab, canAccessContractProducaoSemanalTab } = usePermissions();
  const canAccessOrdemServicoModulo = canAccessContractOrdemServicoTab(contractId);
  const canAccessProducaoSemanalModulo = canAccessContractProducaoSemanalTab(contractId);
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [gastosResumoModal, setGastosResumoModal] = useState<{ kind: 'month'; mesIdx: number } | null>(
    null
  );

  const { data: contractData } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}`)).data,
    enabled: !!contractId,
  });

  const { data: billingsData } = useQuery({
    queryKey: ['contract-billings', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}/billings`)).data,
    enabled: !!contractId,
  });

  const { data: pleitosData } = useQuery({
    queryKey: ['contract-pleitos', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}/pleitos`)).data,
    enabled: !!contractId && canAccessOrdemServicoModulo,
  });

  const { data: productionsData } = useQuery({
    queryKey: ['contract-weekly-productions', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}/weekly-productions`)).data,
    enabled: !!contractId && canAccessProducaoSemanalModulo,
  });

  const { data: annualValuesResponse } = useQuery({
    queryKey: ['contract-annual-values', contractId],
    queryFn: async () =>
      (
        await api.get(`/contracts/${contractId}/annual-values`)
      ).data as { success: boolean; data: ContractAnnualValueRow[] },
    enabled: !!contractId,
  });

  const { data: addendaResponse } = useQuery({
    queryKey: ['contract-addenda', contractId],
    queryFn: async () =>
      (await api.get(`/contracts/${contractId}/addenda`)).data as {
        success: boolean;
        data: ContractAddendumRow[];
      },
    enabled: !!contractId,
  });

  const { data: tetoOrcamentarioEntries = [], isLoading: loadingTetoOrcamentario } = useQuery({
    queryKey: ['controle-geral-teto-orcamentario'],
    queryFn: async () => {
      const res = await api.get<{
        success?: boolean;
        data?: ControleGeralTetoOrcamentarioEntry[];
      }>('/controle-geral/teto-orcamentario');
      return (res.data?.data ?? []) as ControleGeralTetoOrcamentarioEntry[];
    },
    enabled: !!contractId,
  });

  const {
    data: gastosOperacionaisModuleData,
    isLoading: gastosOperacionaisModuleLoading,
    isError: gastosOperacionaisModuleIsError,
    error: gastosOperacionaisModuleError,
  } = useGastosOperacionaisTotvsQuery({ enabled: !!contractId });

  const gastosOperacionaisCarregando = gastosOperacionaisModuleLoading;
  const gastosOperacionaisNaoConfigurado =
    gastosOperacionaisModuleIsError &&
    /não configurada|nao configurada/i.test(
      gastosOperacionaisModuleError instanceof Error
        ? gastosOperacionaisModuleError.message
        : String(gastosOperacionaisModuleError ?? '')
    );
  const contract = contractData?.data as Contract | undefined;

  const availableYears = useMemo(
    () => (contract ? buildContractAvailableYears(contract.startDate, contract.endDate) : [currentYear]),
    [contract, currentYear]
  );

  useEffect(() => {
    if (availableYears.length === 0) return;
    setSelectedYear((prev) => {
      if (availableYears.includes(prev)) return prev;
      if (availableYears.includes(currentYear)) return currentYear;
      return availableYears[0];
    });
  }, [contract?.id, availableYears, currentYear]);

  const yearSelectOptions = useMemo(
    () => labeledToSelectOptions(availableYears.map((year) => ({ value: String(year), label: String(year) }))),
    [availableYears]
  );

  const safeSelectedYear = availableYears.includes(selectedYear)
    ? selectedYear
    : availableYears[0] ?? currentYear;
  const selectedYearIndex = availableYears.indexOf(safeSelectedYear);
  const canGoPrevYear = selectedYearIndex > 0;
  const canGoNextYear = selectedYearIndex >= 0 && selectedYearIndex < availableYears.length - 1;

  const addenda = ((addendaResponse?.data || []) as ContractAddendumRow[])
    .slice()
    .sort((a, b) => {
      const da = parseDateSafe(a.effectiveDate)?.getTime() || 0;
      const db = parseDateSafe(b.effectiveDate)?.getTime() || 0;
      return da - db;
    });

  const billings = (billingsData?.data || []) as ContractBilling[];
  const allPleitos = (pleitosData?.data || []) as ContractPleito[];
  const billingsForOs = billings as BillingForOsCheck[];
  const pleitos = useMemo(
    () => allPleitos.filter((p) => !isPleitoHistorico(p) && !isOsConcluida(p, billingsForOs)),
    [allPleitos, billingsForOs]
  );
  const productions = ((Array.isArray(productionsData)
    ? productionsData
    : (productionsData as { data?: ContractWeeklyProduction[] })?.data) ||
    []) as ContractWeeklyProduction[];

  const contractVigenciaDates = useMemo(() => {
    if (!contract) return null;
    const start = parseDateSafe(contract.startDate);
    const end = parseDateSafe(contract.endDate);
    if (!start || !end) return null;
    return { start, end };
  }, [contract]);

  const contractAddendaForMeta = useMemo(() => parseContractAddendaForMeta(addenda), [addenda]);

  const globalMetaSchedule = useMemo(() => {
    if (!contractVigenciaDates || !contract) return new Map<string, number>();
    return buildContractMetaSchedule(
      contractVigenciaDates.start,
      contractVigenciaDates.end,
      contract.valuePlusAddenda,
      contractAddendaForMeta
    );
  }, [contractVigenciaDates, contract, contractAddendaForMeta]);

  const annualBudgetAdjustments = useMemo(
    () => parseAnnualBudgetAdjustments(annualValuesResponse?.data),
    [annualValuesResponse]
  );

  const metaSchedule = useMemo(() => {
    const out = new Map(globalMetaSchedule);
    if (!contractVigenciaDates || !contract) return out;

    const { start, end } = contractVigenciaDates;

    for (const r of annualBudgetAdjustments) {
      const effMonth = annualAdjustmentEffectiveCivilMonth(r.year, r.effectiveDate);
      if (effMonth === null) continue;

      const monthsAfter = countVigenciaMonthsInRange(r.year, effMonth, 12, start, end);
      if (monthsAfter <= 0) continue;

      const plannedRestOfYear = sumGlobalMetaAllocatedInMonthRange(
        globalMetaSchedule,
        r.year,
        effMonth,
        12,
        start,
        end
      );
      const pool = plannedRestOfYear + r.amount;
      const metaY = pool / monthsAfter;
      for (let m = effMonth; m <= 12; m++) {
        if (!calendarMonthHasMetaMensalInVigencia(r.year, m, start, end)) continue;
        out.set(toYearMonthKey(r.year, m), metaY);
      }
    }

    return out;
  }, [globalMetaSchedule, annualBudgetAdjustments, contractVigenciaDates, contract]);

  const faturamentoPorMes = useMemo(() => {
    const porMes: number[] = new Array(12).fill(0);
    const year = safeSelectedYear;
    billings.forEach((b) => {
      const d = parseDateSafe(b.issueDate);
      if (!d) return;
      if (d.getFullYear() === year) {
        porMes[d.getMonth()] += b.grossValue;
      }
    });
    return porMes;
  }, [billings, safeSelectedYear]);

  const producaoPorMes = useMemo(() => {
    const porMes: number[] = new Array(12).fill(0);
    const year = safeSelectedYear;
    productions.forEach((p) => {
      const d = productionWeekFromFilling(p.fillingDate);
      if (!d) return;
      if (d.getFullYear() === year) {
        porMes[d.getMonth()] += p.weeklyProductionValue;
      }
    });
    return porMes;
  }, [productions, safeSelectedYear]);

  const pleitosPorMes = useMemo(() => {
    const porMes: number[] = new Array(12).fill(0);
    const year = safeSelectedYear;
    allPleitos.forEach((p) => {
      const vp = p.billingRequest ?? 0;
      if (vp <= 0) return;
      const pYear = p.creationYear ?? getDateYear(p.startDate);
      if (pYear !== year) return;
      const monthNum = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : null;
      const startMonth = getDateMonth(p.startDate);
      const mesIdx =
        monthNum != null && monthNum >= 1 && monthNum <= 12 ? monthNum - 1 : startMonth ? startMonth - 1 : null;
      if (mesIdx != null && mesIdx >= 0 && mesIdx < 12) {
        porMes[mesIdx] += vp;
      }
    });
    return porMes;
  }, [allPleitos, safeSelectedYear]);

  const valorOrcadoPorMes = useMemo(() => {
    const porMes: number[] = new Array(12).fill(0);
    const year = safeSelectedYear;
    pleitos.forEach((p) => {
      if (!isBudgetStatusInValorOrcadoSum(p.budgetStatus)) return;
      const valorOrcado = parseBudgetToNumberSafe(p.budget);
      if (valorOrcado <= 0) return;
      const pYear = p.creationYear ?? getDateYear(p.startDate);
      if (pYear !== year) return;
      const monthNum = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : null;
      const mesIdx =
        monthNum != null && monthNum >= 1 && monthNum <= 12
          ? monthNum - 1
          : (() => {
              const m = getDateMonth(p.startDate);
              return m ? m - 1 : null;
            })();
      if (mesIdx != null && mesIdx >= 0 && mesIdx < 12) {
        porMes[mesIdx] += valorOrcado;
      }
    });
    return porMes;
  }, [pleitos, safeSelectedYear]);

  const pendenteFaturamentoPorMes = useMemo(
    () => valorOrcadoPorMes.map((v, i) => v - (faturamentoPorMes[i] || 0)),
    [valorOrcadoPorMes, faturamentoPorMes]
  );

  const prodMenosFatPorMes = useMemo(
    () => producaoPorMes.map((prod, i) => prod - (faturamentoPorMes[i] || 0)),
    [producaoPorMes, faturamentoPorMes]
  );

  const faturamentoPorYmKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of billings) {
      const d = parseDateSafe(b.issueDate);
      if (!d) continue;
      const k = toYearMonthKey(d.getFullYear(), d.getMonth() + 1);
      m.set(k, (m.get(k) || 0) + b.grossValue);
    }
    return m;
  }, [billings]);

  const vigenciaMonthList = useMemo(() => {
    if (!contractVigenciaDates) return [] as VigenciaMonth[];
    return listVigenciaMonthKeys(contractVigenciaDates.start, contractVigenciaDates.end);
  }, [contractVigenciaDates]);

  const metaRealByScheduleKey = useMemo(() => {
    const out = new Map<string, number>();
    if (!vigenciaMonthList.length || !contract) return out;

    const addSumByMonth = new Map<string, number>();
    for (const a of contractAddendaForMeta) {
      const y = a.effectiveDate.getFullYear();
      const m = a.effectiveDate.getMonth() + 1;
      const k = toYearMonthKey(y, m);
      addSumByMonth.set(k, (addSumByMonth.get(k) || 0) + a.amount);
    }

    const firstKey = vigenciaMonthList[0].key;
    let remaining = Number(contract.valuePlusAddenda) || 0;
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

    if (contractVigenciaDates && annualBudgetAdjustments.length > 0) {
      const { start, end } = contractVigenciaDates;
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
  }, [
    vigenciaMonthList,
    contract,
    contractAddendaForMeta,
    annualBudgetAdjustments,
    faturamentoPorYmKey,
    contractVigenciaDates,
    globalMetaSchedule,
  ]);

  const metaRealPorMes = useMemo(() => {
    const year = safeSelectedYear;
    const result: (number | null)[] = new Array(12).fill(null);
    for (let i = 0; i < 12; i++) {
      const key = toYearMonthKey(year, i + 1);
      if ((metaSchedule.get(key) ?? null) === null) continue;
      result[i] = metaRealByScheduleKey.get(key) ?? (metaSchedule.get(key) ?? 0);
    }
    return result;
  }, [safeSelectedYear, metaSchedule, metaRealByScheduleKey]);

  const contractGastosNaturezaRows = useMemo(() => {
    if (!contract) return [];
    return filterGastosNaturezaDetailRowsForSystemContract(
      gastosOperacionaisModuleData?.naturezaDetailRows ?? [],
      {
        name: contract.name,
        costCenter: contract.costCenter,
      }
    );
  }, [contract, gastosOperacionaisModuleData?.naturezaDetailRows]);

  const gastosOperacionaisTemDados = contractGastosNaturezaRows.length > 0;

  const gastosOperacionaisPorMes = useMemo(
    () => aggregateGastosNaturezaMonthlyTotals(contractGastosNaturezaRows, safeSelectedYear),
    [contractGastosNaturezaRows, safeSelectedYear]
  );

  const tetoOrcamentarioLookup = useMemo(
    () => buildTetoOrcamentarioLookup(tetoOrcamentarioEntries),
    [tetoOrcamentarioEntries]
  );

  const tetoOrcamentarioLabels = useMemo(
    () => (contract ? tetoLabelsForSystemContract(contract) : []),
    [contract]
  );

  const tetoOrcamentarioPorMes = useMemo(
    () =>
      resolveMonthlyTetoOrcamentarioForLabels(
        tetoOrcamentarioLabels,
        tetoOrcamentarioLookup,
        safeSelectedYear
      ),
    [tetoOrcamentarioLabels, tetoOrcamentarioLookup, safeSelectedYear]
  );

  const gastosResumoModalNaturezaRows = useMemo(() => {
    if (!gastosResumoModal || !contract) return [];
    const period = gastosMonthPeriodBounds(safeSelectedYear, gastosResumoModal.mesIdx + 1);
    return aggregateGastosNaturezaRows(
      contractGastosNaturezaRows,
      period.periodFrom,
      period.periodTo
    );
  }, [gastosResumoModal, contract, contractGastosNaturezaRows, safeSelectedYear]);

  const gastosResumoModalTitle = useMemo(() => {
    if (!gastosResumoModal || !contract) return 'Gastos';
    const mes = MESES[gastosResumoModal.mesIdx] ?? '';
    return `Gastos — ${mes}/${String(safeSelectedYear).slice(-2)} · ${contract.name}`;
  }, [gastosResumoModal, contract, safeSelectedYear]);

  return (
    <>
      <Card className="w-full !rounded-2xl border-gray-200/80 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-gray-900/70">
        <CardHeader className="border-b-0 pb-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center space-x-3">
              <div className="shrink-0 rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30 sm:p-3">
                <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Controle Geral - {safeSelectedYear}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Indicadores mensais do contrato</p>
              </div>
            </div>
            {availableYears.length > 0 ? (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!canGoPrevYear) return;
                    setSelectedYear(availableYears[selectedYearIndex - 1]);
                  }}
                  disabled={!canGoPrevYear}
                  aria-label="Ano anterior"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/10"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <StringSingleSelectDropdown
                  value={String(safeSelectedYear)}
                  onChange={(v) => setSelectedYear(Number(v))}
                  options={yearSelectOptions}
                  allowEmpty={false}
                  disableSearch
                  menuAlign="end"
                  matchTriggerWidth
                  menuMinWidth={152}
                  className="min-w-[5.25rem]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!canGoNextYear) return;
                    setSelectedYear(availableYears[selectedYearIndex + 1]);
                  }}
                  disabled={!canGoNextYear}
                  aria-label="Próximo ano"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/10"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
          {!gastosOperacionaisCarregando && gastosOperacionaisNaoConfigurado ? (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
              <span className="font-medium">Gastos Operacionais:</span> integração TOTVS RM não
              configurada no servidor (
              <span className="font-mono">TOTVS_RM_*</span>).
            </p>
          ) : null}
          {!gastosOperacionaisCarregando &&
          !gastosOperacionaisModuleIsError &&
          Boolean(gastosOperacionaisModuleData) &&
          !gastosOperacionaisTemDados &&
          contract ? (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Nenhum gasto operacional encontrado no RM para este contrato/centro de custo (
              {contract.name}
              {contract.costCenter?.code ? ` · CC ${contract.costCenter.code}` : ''}).
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="table-scroll">
            <table className="w-full" data-cc-skip-column-customizer="1">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="w-36 whitespace-nowrap px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                    Indicador
                  </th>
                  {MESES.map((mes) => (
                    <th
                      key={mes}
                      className="whitespace-nowrap px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6"
                    >
                      {mes}/{safeSelectedYear.toString().slice(-2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">Meta Ideal</td>
                  {MESES.map((mes, i) => {
                    const month = i + 1;
                    const cellMeta = metaSchedule.get(toYearMonthKey(safeSelectedYear, month)) ?? null;
                    return (
                      <td
                        key={mes}
                        className="px-4 py-3 text-center text-sm font-medium text-gray-900 dark:text-gray-100"
                      >
                        {cellMeta !== null ? formatCurrency(cellMeta) : '-'}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-emerald-50/40 dark:bg-emerald-900/15">
                  <td className="px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    Meta Real
                  </td>
                  {MESES.map((mes, i) => {
                    const v = metaRealPorMes[i];
                    return (
                      <td
                        key={mes}
                        className="px-4 py-3 text-center text-sm font-medium text-emerald-800 dark:text-emerald-300"
                      >
                        {v !== null ? formatCurrency(v) : '-'}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-indigo-50/40 dark:bg-indigo-900/15">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-indigo-800 dark:text-indigo-300">
                    Teto de Gastos
                    {loadingTetoOrcamentario ? (
                      <Loader2
                        className="ml-1.5 inline h-3.5 w-3.5 shrink-0 animate-spin align-[-0.125em] text-indigo-600 dark:text-indigo-400"
                        aria-label="Carregando teto de gastos"
                      />
                    ) : null}
                  </td>
                  {MESES.map((mes, i) => {
                    const v = tetoOrcamentarioPorMes[i];
                    return (
                      <td
                        key={mes}
                        className="px-4 py-3 text-center text-sm font-medium text-indigo-800 dark:text-indigo-300"
                      >
                        {loadingTetoOrcamentario ? '…' : v != null && v > 0 ? formatCurrency(v) : '-'}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-violet-50/40 dark:bg-violet-900/15">
                  <td className="px-4 py-3 text-sm font-medium text-violet-800 dark:text-violet-300">
                    <div className="flex items-center gap-2">
                      <span>Gastos</span>
                      {gastosOperacionaisCarregando ? (
                        <Loader2
                          className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-600 dark:text-violet-400"
                          aria-label="Carregando gastos"
                        />
                      ) : null}
                    </div>
                  </td>
                  {MESES.map((mes, i) => {
                    const valor = gastosOperacionaisPorMes[i];
                    const celulaClicavel = !gastosOperacionaisCarregando && valor !== 0;
                    return (
                      <td
                        key={mes}
                        role={celulaClicavel ? 'button' : undefined}
                        tabIndex={celulaClicavel ? 0 : undefined}
                        onClick={() => {
                          if (celulaClicavel) {
                            setGastosResumoModal({ kind: 'month', mesIdx: i });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (!celulaClicavel) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setGastosResumoModal({ kind: 'month', mesIdx: i });
                          }
                        }}
                        title={celulaClicavel ? 'Ver resumo por categoria' : undefined}
                        className={`px-4 py-3 text-center text-sm font-medium ${signedGastosValueClassName(valor)} ${
                          celulaClicavel
                            ? 'cursor-pointer transition-colors hover:bg-violet-100/70 dark:hover:bg-violet-900/35'
                            : ''
                        }`}
                      >
                        {gastosOperacionaisCarregando ? '…' : valor !== 0 ? formatCurrency(Math.abs(valor)) : '-'}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-amber-50/50 dark:bg-amber-900/10">
                  <td className="px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-400">Produção</td>
                  {MESES.map((mes, i) => (
                    <td
                      key={mes}
                      className="px-4 py-3 text-center text-sm font-medium text-amber-700 dark:text-amber-400"
                    >
                      {producaoPorMes[i] > 0 ? formatCurrency(producaoPorMes[i]) : '-'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400">Pleitos</td>
                  {MESES.map((mes, i) => (
                    <td
                      key={mes}
                      className="px-4 py-3 text-center text-sm font-medium text-red-600 dark:text-red-400"
                    >
                      {pleitosPorMes[i] > 0 ? formatCurrency(pleitosPorMes[i]) : '-'}
                    </td>
                  ))}
                </tr>
                <tr className="bg-green-50/50 dark:bg-green-900/10">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">Faturamento</td>
                  {MESES.map((mes, i) => (
                    <td
                      key={mes}
                      className="px-4 py-3 text-center text-sm font-medium text-green-700 dark:text-green-400"
                    >
                      {faturamentoPorMes[i] > 0 ? formatCurrency(faturamentoPorMes[i]) : '-'}
                    </td>
                  ))}
                </tr>
                <tr className="bg-teal-50/50 dark:bg-teal-900/10">
                  <td className="px-4 py-3 text-sm font-medium text-teal-800 dark:text-teal-300">Prod. - Fat.</td>
                  {MESES.map((mes, i) => (
                    <td
                      key={mes}
                      className="px-4 py-3 text-center text-sm font-medium text-teal-700 dark:text-teal-400"
                    >
                      {prodMenosFatPorMes[i] !== 0 ? formatCurrency(prodMenosFatPorMes[i]) : '-'}
                    </td>
                  ))}
                </tr>
                <tr className="bg-sky-50/50 dark:bg-sky-900/10">
                  <td className="px-4 py-3 text-sm font-medium text-sky-700 dark:text-sky-400">Valor Orçado</td>
                  {MESES.map((mes, i) => (
                    <td
                      key={mes}
                      className="px-4 py-3 text-center text-sm font-medium text-sky-700 dark:text-sky-400"
                    >
                      {valorOrcadoPorMes[i] > 0 ? formatCurrency(valorOrcadoPorMes[i]) : '-'}
                    </td>
                  ))}
                </tr>
                <tr className="bg-orange-50/50 dark:bg-orange-900/10">
                  <td className="px-4 py-3 text-sm font-medium text-orange-700 dark:text-orange-400">
                    Pendente Faturamento
                  </td>
                  {MESES.map((mes, i) => (
                    <td
                      key={mes}
                      className="px-4 py-3 text-center text-sm font-medium text-orange-700 dark:text-orange-400"
                    >
                      {pendenteFaturamentoPorMes[i] !== 0
                        ? formatCurrency(pendenteFaturamentoPorMes[i])
                        : '-'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ContractGastosResumoModal
        isOpen={!!gastosResumoModal}
        onClose={() => setGastosResumoModal(null)}
        title={gastosResumoModalTitle}
        naturezaRows={gastosResumoModalNaturezaRows}
      />
    </>
  );
}

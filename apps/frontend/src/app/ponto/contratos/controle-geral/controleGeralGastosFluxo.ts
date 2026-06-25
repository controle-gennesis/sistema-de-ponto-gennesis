import type { QueryGastosDetailRow } from './buildQueryGastosRows';
import type { RecebidoMensalByGastosContractEntry } from './recebidoMensalTypes';
import {
  normalizeContractOrderKey,
  normalizeGastosOperacionaisContractName
} from './gastosOperacionaisContractOrder';

export type ControleGeralFluxoPoint = {
  monthKey: string;
  label: string;
  entrada: number;
  saida: number;
  valor: number;
};

export type ControleGeralFluxoDiarioPoint = {
  dayKey: string;
  label: string;
  entrada: number;
  saida: number;
  valor: number;
};

export type ControleGeralFluxoProjecaoPoint = ControleGeralFluxoPoint & {
  projetado: boolean;
};

export type ControleGeralFluxoProjecaoMeta = {
  avgEntrada: number;
  avgSaida: number;
  mesesNaMedia: number;
  mesesElegiveis: number;
  projectionYear: number;
};

export type ControleGeralFluxoProjecaoSeries = {
  points: ControleGeralFluxoProjecaoPoint[];
  meta: ControleGeralFluxoProjecaoMeta | null;
};

export type ControleGeralFluxoBuildInput = {
  gastosRows: readonly QueryGastosDetailRow[];
  recebidoMensal?: readonly RecebidoMensalByGastosContractEntry[];
};

type MonthlyPeriodoRow = {
  monthKey: string;
  label: string;
  entradaMes: number;
  saidaMes: number;
  valorMes: number;
};

const EXCLUDE_FIRST_MONTHS = 3;
const WEIGHT_WINDOW = 6;

function contractLookupKey(contract: string): string {
  return normalizeContractOrderKey(normalizeGastosOperacionaisContractName(contract));
}

/** Chave alternativa (espelha o backend) para casar nomes de contrato. */
function contractLookupKeyAlt(contract: string): string {
  return normalizeGastosOperacionaisContractName(contract)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function contractsMatch(a: string, b: string): boolean {
  const keyA = contractLookupKey(a);
  const keyB = contractLookupKey(b);
  if (keyA === keyB) return true;
  return contractLookupKeyAlt(a) === contractLookupKeyAlt(b);
}

function monthKeyFromRow(row: QueryGastosDetailRow): string {
  return `${row.year}-${String(row.month).padStart(2, '0')}`;
}

function monthKeyFromRecebido(entry: RecebidoMensalByGastosContractEntry): string {
  return `${entry.year}-${String(entry.month).padStart(2, '0')}`;
}

function formatMonthChartLabel(monthKey: string): string {
  const month = monthKey.slice(5, 7);
  const year = monthKey.slice(2, 4);
  return `${month}/${year}`;
}

export function formatControleGeralFluxoMensalTooltipLabel(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return monthKey;
  }
  const text = new Date(year, month - 1, 1).toLocaleString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function filterGastosDetailRowsForContract(
  detailRows: readonly QueryGastosDetailRow[],
  contract: string,
  filters?: { months?: number[]; years?: number[] }
): QueryGastosDetailRow[] {
  const monthFilter = filters?.months?.length ? new Set(filters.months) : null;
  const yearFilter = filters?.years?.length ? new Set(filters.years) : null;

  return detailRows.filter((row) => {
    if (!contractsMatch(row.contract, contract)) return false;
    if (monthFilter && !monthFilter.has(row.month)) return false;
    if (yearFilter && !yearFilter.has(row.year)) return false;
    return true;
  });
}

export function filterRecebidoMensalForContract(
  entries: readonly RecebidoMensalByGastosContractEntry[],
  contract: string,
  filters?: { months?: number[]; years?: number[] }
): RecebidoMensalByGastosContractEntry[] {
  const monthFilter = filters?.months?.length ? new Set(filters.months) : null;
  const yearFilter = filters?.years?.length ? new Set(filters.years) : null;

  return entries.filter((entry) => {
    if (!contractsMatch(entry.contract, contract)) return false;
    if (monthFilter && !monthFilter.has(entry.month)) return false;
    if (yearFilter && !yearFilter.has(entry.year)) return false;
    return true;
  });
}

function buildMonthlyPeriodoRows(input: ControleGeralFluxoBuildInput): MonthlyPeriodoRow[] {
  const map = new Map<string, { entrada: number; saida: number }>();

  for (const row of input.gastosRows) {
    const key = monthKeyFromRow(row);
    const cur = map.get(key) ?? { entrada: 0, saida: 0 };
    cur.saida += Math.abs(row.total);
    map.set(key, cur);
  }

  for (const entry of input.recebidoMensal ?? []) {
    const key = monthKeyFromRecebido(entry);
    const cur = map.get(key) ?? { entrada: 0, saida: 0 };
    cur.entrada += entry.recebido;
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, totals]) => ({
      monthKey,
      label: formatMonthChartLabel(monthKey),
      entradaMes: totals.entrada,
      saidaMes: totals.saida,
      valorMes: totals.entrada - totals.saida
    }));
}

export function buildControleGeralFluxoMensalPeriodoSeries(
  input: ControleGeralFluxoBuildInput
): ControleGeralFluxoPoint[] {
  return buildMonthlyPeriodoRows(input).map((row) => ({
    monthKey: row.monthKey,
    label: row.label,
    entrada: row.entradaMes,
    saida: row.saidaMes,
    valor: row.valorMes
  }));
}

export function buildControleGeralFluxoMensalSeries(
  input: ControleGeralFluxoBuildInput
): ControleGeralFluxoPoint[] {
  const monthly = buildMonthlyPeriodoRows(input);

  let entradaAcumulada = 0;
  let saidaAcumulada = 0;
  let valorAcumulado = 0;

  return monthly.map((row) => {
    entradaAcumulada += row.entradaMes;
    saidaAcumulada += row.saidaMes;
    valorAcumulado += row.valorMes;
    return {
      monthKey: row.monthKey,
      label: row.label,
      entrada: entradaAcumulada,
      saida: saidaAcumulada,
      valor: valorAcumulado
    };
  });
}

export function buildControleGeralFluxoDiarioSeries(
  input: ControleGeralFluxoBuildInput
): ControleGeralFluxoDiarioPoint[] {
  const monthly = buildMonthlyPeriodoRows(input);

  let entradaAcumulada = 0;
  let saidaAcumulada = 0;
  let valorAcumulado = 0;

  return monthly.map((row) => {
    entradaAcumulada += row.entradaMes;
    saidaAcumulada += row.saidaMes;
    valorAcumulado += row.valorMes;
    return {
      dayKey: `${row.monthKey}-01`,
      label: row.label,
      entrada: entradaAcumulada,
      saida: saidaAcumulada,
      valor: valorAcumulado
    };
  });
}

function inferProjectionYear(periodSeries: readonly ControleGeralFluxoPoint[]): number {
  let maxYear = new Date().getFullYear();
  for (const row of periodSeries) {
    const year = Number(row.monthKey.slice(0, 4));
    if (Number.isFinite(year) && year > maxYear) maxYear = year;
  }
  return maxYear;
}

function monthKeysThroughDecember(year: number): string[] {
  const keys: string[] = [];
  for (let m = 1; m <= 12; m += 1) {
    keys.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return keys;
}

function computeWeightedMonthlyAverages(
  periodSeries: readonly ControleGeralFluxoPoint[]
): { avgEntrada: number; avgSaida: number; mesesNaMedia: number; mesesElegiveis: number } | null {
  const sorted = [...periodSeries].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const eligible = sorted.slice(EXCLUDE_FIRST_MONTHS);
  if (eligible.length === 0) return null;

  const window = eligible.slice(-WEIGHT_WINDOW);
  const n = window.length;

  let weightedEntrada = 0;
  let weightedSaida = 0;
  let weightSum = 0;

  for (let i = 0; i < n; i += 1) {
    const weight = 7 - n + i;
    weightedEntrada += window[i]!.entrada * weight;
    weightedSaida += window[i]!.saida * weight;
    weightSum += weight;
  }

  return {
    avgEntrada: weightedEntrada / weightSum,
    avgSaida: weightedSaida / weightSum,
    mesesNaMedia: n,
    mesesElegiveis: eligible.length
  };
}

export function buildControleGeralFluxoProjecaoAnualSeries(
  input: ControleGeralFluxoBuildInput
): ControleGeralFluxoProjecaoSeries {
  if (input.gastosRows.length === 0 && !(input.recebidoMensal?.length ?? 0)) {
    return { points: [], meta: null };
  }

  const periodSeries = buildControleGeralFluxoMensalPeriodoSeries(input);
  if (periodSeries.length === 0) {
    return { points: [], meta: null };
  }

  const averages = computeWeightedMonthlyAverages(periodSeries);
  if (!averages) {
    return { points: [], meta: null };
  }

  const cumulativeSeries = buildControleGeralFluxoMensalSeries(input);
  const cumulativeByMonth = new Map(cumulativeSeries.map((row) => [row.monthKey, row]));
  const periodByMonth = new Map(periodSeries.map((row) => [row.monthKey, row]));

  const projectionYear = inferProjectionYear(periodSeries);
  const yearMonthKeys = monthKeysThroughDecember(projectionYear);

  const lastActualInYear = Array.from(periodByMonth.keys())
    .filter((key) => key.startsWith(`${projectionYear}-`))
    .sort()
    .at(-1);

  if (!lastActualInYear) {
    return { points: [], meta: null };
  }

  const lastActualCumulative = cumulativeByMonth.get(lastActualInYear);
  if (!lastActualCumulative) {
    return { points: [], meta: null };
  }

  const points: ControleGeralFluxoProjecaoPoint[] = [];
  let projEntrada = lastActualCumulative.entrada;
  let projSaida = lastActualCumulative.saida;
  let projValor = lastActualCumulative.valor;
  let projecting = false;

  for (const monthKey of yearMonthKeys) {
    const actualCumulative = cumulativeByMonth.get(monthKey);
    const hasPeriod = periodByMonth.has(monthKey);

    if (hasPeriod && actualCumulative && !projecting) {
      points.push({
        monthKey,
        label: formatMonthChartLabel(monthKey),
        entrada: actualCumulative.entrada,
        saida: actualCumulative.saida,
        valor: actualCumulative.valor,
        projetado: false
      });
      projEntrada = actualCumulative.entrada;
      projSaida = actualCumulative.saida;
      projValor = actualCumulative.valor;

      if (monthKey === lastActualInYear) {
        projecting = true;
      }
      continue;
    }

    if (!projecting) continue;

    projEntrada += averages.avgEntrada;
    projSaida += averages.avgSaida;
    projValor += averages.avgEntrada - averages.avgSaida;

    points.push({
      monthKey,
      label: formatMonthChartLabel(monthKey),
      entrada: projEntrada,
      saida: projSaida,
      valor: projValor,
      projetado: true
    });
  }

  if (points.length === 0 || !points.some((p) => p.projetado)) {
    return { points: [], meta: null };
  }

  return {
    points,
    meta: {
      avgEntrada: averages.avgEntrada,
      avgSaida: averages.avgSaida,
      mesesNaMedia: averages.mesesNaMedia,
      mesesElegiveis: averages.mesesElegiveis,
      projectionYear
    }
  };
}

export function summarizeControleGeralGastosFluxo(
  input: ControleGeralFluxoBuildInput,
  nfsTotals?: { faturamento: number; recebido: number }
) {
  const totalGastos = input.gastosRows.reduce((sum, row) => sum + Math.abs(row.total), 0);
  const totalRecebidoSerie = (input.recebidoMensal ?? []).reduce(
    (sum, entry) => sum + entry.recebido,
    0
  );
  const totalEntrada =
    totalRecebidoSerie > 0 ? totalRecebidoSerie : (nfsTotals?.recebido ?? nfsTotals?.faturamento ?? 0);

  return {
    totalSaida: totalGastos,
    totalEntrada,
    totalValor: totalEntrada - totalGastos
  };
}

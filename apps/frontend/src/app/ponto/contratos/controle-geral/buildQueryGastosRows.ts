import type { GastosOperacionaisRow } from './ControleGeralGastosOperacionaisPanel';
import {
  GASTOS_OPERACIONAIS_LOCALITIES,
  isContractExcludedFromPresentation,
  normalizeGastosOperacionaisContractName,
  resolveVisibleLocalityItems,
  sortContractNamesByCustomOrder,
  sortContractsByCustomOrder,
  type GastosOperacionaisLocality
} from './gastosOperacionaisContractOrder';
import {
  contractMatchesLocalitiesWithOverrides,
  getEffectiveContractLocality,
  isContractInVisibleLocalities,
  type GastosOperacionaisLocalityOverrideMap
} from './gastosOperacionaisLocalityOverrides';

export type QueryGastosDetailRow = {
  month: number;
  year: number;
  contract: string;
  total: number;
};

export type GastosOperacionaisFilters = {
  localities: GastosOperacionaisLocality[];
  months: number[];
  years: number[];
  contracts: string[];
};

export const EMPTY_GASTOS_OPERACIONAIS_FILTERS: GastosOperacionaisFilters = {
  localities: [],
  months: [],
  years: [],
  contracts: []
};

type QueryContractPayload = {
  contract: string;
  mesesApuracao?: number;
  anoMin?: number;
  anoMax?: number;
  totalAcumulado?: number;
  gastosAcumulado?: number;
};

type GastosApiPayload = {
  queryContractRows?: QueryContractPayload[];
  byQueryContract?: QueryContractPayload[];
  byCostCenter?: Array<{ contract: string; gastosAcumulado: number }>;
  rows?: QueryContractPayload[];
  fetchedAt?: string;
};

function parseSheetCurrency(value: string): number {
  const text = (value ?? '').trim();
  if (!text || text === '-') return 0;

  const normalized = text.replace(/[R$\s]/g, '');
  const parsed = normalized.includes(',')
    ? Number.parseFloat(normalized.replace(/\./g, '').replace(',', '.'))
    : Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function isHeaderContract(contract: string): boolean {
  const key = contract.trim().toLowerCase();
  return !key || key === 'contrato' || key.includes('mes de apuracao');
}

export function buildGastosDetailRowsFromSheetRows(rows: string[][]): QueryGastosDetailRow[] {
  const parsed: QueryGastosDetailRow[] = [];

  for (const row of rows) {
    const contract = normalizeGastosOperacionaisContractName((row[2] ?? '').trim());
    if (!contract || isHeaderContract(contract) || isContractExcludedFromPresentation(contract)) {
      continue;
    }

    const month = Number.parseInt((row[0] ?? '').trim(), 10);
    const year = Number.parseInt((row[1] ?? '').trim(), 10);
    const total = parseSheetCurrency(row[3] ?? '');
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    if (!Number.isFinite(year) || year < 1900 || year > 2100) continue;
    if (total === 0) continue;

    parsed.push({ month, year, contract, total });
  }

  return parsed;
}

export function getGastosFilterOptions(
  detailRows: QueryGastosDetailRow[],
  filters?: Pick<GastosOperacionaisFilters, 'localities'>,
  localityOverrides: GastosOperacionaisLocalityOverrideMap = {},
  visibleLocalities?: readonly GastosOperacionaisLocality[]
) {
  const years = Array.from(new Set(detailRows.map((row) => row.year))).sort((a, b) => b - a);
  const allContracts = Array.from(new Set(detailRows.map((row) => row.contract)));
  const contracts = sortContractNamesByCustomOrder(
    allContracts.filter((contract) => {
      if (!isContractInVisibleLocalities(contract, visibleLocalities, localityOverrides)) {
        return false;
      }
      if (!filters?.localities?.length) return true;
      return contractMatchesLocalitiesWithOverrides(contract, filters.localities, localityOverrides);
    })
  );

  return { years, contracts };
}

export function filterGastosDetailRows(
  detailRows: QueryGastosDetailRow[],
  filters: GastosOperacionaisFilters,
  localityOverrides: GastosOperacionaisLocalityOverrideMap = {},
  visibleLocalities?: readonly GastosOperacionaisLocality[]
): QueryGastosDetailRow[] {
  return detailRows.filter((row) => {
    if (!isContractInVisibleLocalities(row.contract, visibleLocalities, localityOverrides)) {
      return false;
    }
    if (
      filters.localities.length &&
      !contractMatchesLocalitiesWithOverrides(row.contract, filters.localities, localityOverrides)
    ) {
      return false;
    }
    if (filters.months.length && !filters.months.includes(row.month)) return false;
    if (filters.years.length && !filters.years.includes(row.year)) return false;
    if (filters.contracts.length && !filters.contracts.includes(row.contract)) return false;
    return true;
  });
}

export function aggregateGastosDetailRows(detailRows: QueryGastosDetailRow[]): GastosOperacionaisRow[] {
  const aggregates = new Map<
    string,
    { totalAcumulado: number; months: Set<string>; years: Set<number> }
  >();

  for (const row of detailRows) {
    const current = aggregates.get(row.contract) ?? {
      totalAcumulado: 0,
      months: new Set<string>(),
      years: new Set<number>()
    };
    current.totalAcumulado += row.total;
    current.months.add(`${row.year}-${row.month}`);
    current.years.add(row.year);
    aggregates.set(row.contract, current);
  }

  const result = Array.from(aggregates.entries())
    .map(([contract, data]) => {
      const years = Array.from(data.years).sort((a, b) => a - b);
      return {
        rowKey: contract,
        contract,
        mesesApuracao: data.months.size,
        anoMin: years[0] ?? 0,
        anoMax: years[years.length - 1] ?? 0,
        totalAcumulado: data.totalAcumulado
      };
    })
    .filter((row) => row.totalAcumulado !== 0);

  return sortContractsByCustomOrder(result);
}

export function buildGastosRowsFromSheetRows(rows: string[][]): GastosOperacionaisRow[] {
  return aggregateGastosDetailRows(buildGastosDetailRowsFromSheetRows(rows));
}

export type GastosLocalityGroup = {
  localityKey: GastosOperacionaisLocality | 'OUTROS';
  localityLabel: string;
  rows: GastosOperacionaisRow[];
  subtotal: number;
};

export function groupGastosRowsByLocality(
  rows: GastosOperacionaisRow[],
  localityOverrides: GastosOperacionaisLocalityOverrideMap = {},
  visibleLocalities?: readonly GastosOperacionaisLocality[]
): GastosLocalityGroup[] {
  const buckets = new Map<GastosOperacionaisLocality | 'OUTROS', GastosOperacionaisRow[]>();

  for (const row of rows) {
    const locality = getEffectiveContractLocality(row.contract, localityOverrides);
    const current = buckets.get(locality) ?? [];
    current.push(row);
    buckets.set(locality, current);
  }

  const groups: GastosLocalityGroup[] = [];

  for (const locality of resolveVisibleLocalityItems(visibleLocalities)) {
    const groupRows = buckets.get(locality.key);
    if (!groupRows?.length) continue;

    groups.push({
      localityKey: locality.key,
      localityLabel: locality.label,
      rows: sortContractsByCustomOrder(groupRows),
      subtotal: Math.abs(groupRows.reduce((sum, row) => sum + row.totalAcumulado, 0))
    });
  }

  if (!visibleLocalities?.length) {
    const outros = buckets.get('OUTROS');
    if (outros?.length) {
      groups.push({
        localityKey: 'OUTROS',
        localityLabel: 'Outros',
        rows: sortContractsByCustomOrder(outros),
        subtotal: Math.abs(outros.reduce((sum, row) => sum + row.totalAcumulado, 0))
      });
    }
  }

  return groups;
}

export function buildGastosRowsFromApiPayload(payload?: GastosApiPayload): GastosOperacionaisRow[] {
  if (!payload) return [];

  const source: QueryContractPayload[] = payload.queryContractRows?.length
    ? payload.queryContractRows
    : payload.byQueryContract?.length
      ? payload.byQueryContract
      : payload.rows?.length
        ? payload.rows
        : (payload.byCostCenter ?? []).map((item) => ({
            contract: item.contract,
            totalAcumulado: item.gastosAcumulado
          }));

  return sortContractsByCustomOrder(
    source
      .map((item) => ({
        rowKey: normalizeGastosOperacionaisContractName(item.contract),
        contract: normalizeGastosOperacionaisContractName(item.contract),
        mesesApuracao: item.mesesApuracao ?? 0,
        anoMin: item.anoMin ?? 0,
        anoMax: item.anoMax ?? 0,
        totalAcumulado: item.totalAcumulado ?? item.gastosAcumulado ?? 0
      }))
      .filter(
        (row) => row.totalAcumulado !== 0 && !isContractExcludedFromPresentation(row.contract)
      )
  );
}

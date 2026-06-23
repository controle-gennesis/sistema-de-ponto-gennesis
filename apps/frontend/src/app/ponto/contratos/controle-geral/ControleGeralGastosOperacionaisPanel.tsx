'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  EyeOff,
  Filter,
  Loader2,
  RefreshCw,
  RotateCcw,
  Wallet,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { exportGastosOperacionaisPdf } from '@/lib/exportGastosOperacionaisPdf';
import { exportControleGeralContratosPdf } from '@/lib/exportControleGeralContratosPdf';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Modal } from '@/components/ui/Modal';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  aggregateGastosDetailRows,
  aggregateGastosNaturezaForContract,
  deriveEmissaoMonthYearFromPeriod,
  EMPTY_GASTOS_OPERACIONAIS_FILTERS,
  filterGastosDetailRows,
  filterGastosDetailRowsByPolo,
  formatGastosPeriodFilterLabel,
  getGastosFilterOptions,
  getGastosPoloFilterOptions,
  getSingleCalendarMonthFromPeriod,
  getSingleYearFromPeriod,
  type GastosOperacionaisPoloFilterOptions,
  groupGastosRowsByLocality,
  groupGastosRowsByPolo,
  type GastosOperacionaisFilters,
  type QueryGastosDetailRow,
  type QueryGastosNaturezaDetailRow
} from './buildQueryGastosRows';
import {
  getLocalityLabel,
  resolveVisibleLocalityItems,
  type GastosOperacionaisLocality
} from './gastosOperacionaisContractOrder';
import {
  applyContractLocalityOverride,
  contractMatchesLocalitiesWithOverrides,
  getEffectiveContractLocality,
  loadGastosLocalityOverridesWithCatalogSeed,
  saveGastosLocalityOverrides,
  type EffectiveContractLocality,
  type GastosOperacionaisLocalityOverrideMap
} from './gastosOperacionaisLocalityOverrides';
import {
  addControleGeralExcludedContracts,
  clearControleGeralExcludedContracts,
  isContractExcludedFromControleGeralView,
  loadControleGeralExcludedContracts,
  removeControleGeralExcludedContract
} from './controleGeralExcludedContracts';
import {
  buildFaturamentoByContractLookup,
  resolveContractFaturamento,
  resolveContractLiquido,
  resolveContractRecebido,
  type FaturamentoByGastosContractEntry
} from './buildFaturamentoByContractLookup';
import {
  buildGastosContractDetailLookup,
  resolveGastosContractDetailPath,
  type ContractDetailLookupSource
} from './buildGastosContractDetailLookup';
import { normalizeContractOrderKey } from './gastosOperacionaisContractOrder';

export type GastosOperacionaisRow = {
  rowKey: string;
  contract: string;
  mesesApuracao: number;
  anoMin: number;
  anoMax: number;
  totalAcumulado: number;
  polo?: string | null;
  faturamentoAcumulado?: number;
  liquidoAcumulado?: number;
  recebidoAcumulado?: number;
};

const MONTH_OPTIONS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' }
];

type ControleGeralGastosOperacionaisPanelProps = {
  detailRows: QueryGastosDetailRow[];
  /** Detalhe por natureza (TOTVS RM) para drill-down ao clicar na linha. */
  naturezaDetailRows?: QueryGastosNaturezaDetailRow[];
  isLoading: boolean;
  fetchedAt?: string;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** Quando definido, oculta contratos e grupos das demais localidades. */
  visibleLocalities?: readonly GastosOperacionaisLocality[];
  /** Exibe botão de exportação em PDF (módulo Gastos Operacionais). */
  showPdfExport?: boolean;
  /** Permite ocultar linhas da visualização (somente Controle Geral de Contratos). */
  enableRowExclusion?: boolean;
  /** Oculta a coluna de localidade na tabela. */
  hideLocalityColumn?: boolean;
  /** Exibe polo vindo da API (somente leitura) em vez de localidade editável. */
  readOnlyPoloColumn?: boolean;
  panelTitle?: string;
  panelDescription?: string;
  totalColumnLabel?: string;
  /** Exibe faturamento bruto (NF's) por contrato — somente Controle Geral de Contratos. */
  showFaturamentoColumn?: boolean;
  /** Incrementa para forçar atualização dos dados da planilha e das NF's. */
  dataRefreshNonce?: number;
  /** Permite abrir a página de detalhes do contrato cadastrado. */
  showContractDetails?: boolean;
  contractsForDetailLookup?: readonly ContractDetailLookupSource[];
  /** Oculta "Atualizado em" e botão "Atualizar planilha" no cabeçalho. */
  hideDataRefreshControls?: boolean;
  /** Filtros em linha (padrão histórico OS / contratos), sem caixa cinza. */
  inlineFilters?: boolean;
  /** @deprecated Exportação no cabeçalho usa estilo outline quando inlineFilters está ativo. */
  primaryExportButton?: boolean;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function calcGastoFaturamentoPercent(gastos: number, faturamento: number): number | null {
  if (!Number.isFinite(faturamento) || faturamento <= 0) return null;
  return (Math.abs(gastos) / faturamento) * 100;
}

function formatGastoFaturamentoPercent(gastos: number, faturamento: number): string {
  const percent = calcGastoFaturamentoPercent(gastos, faturamento);
  if (percent == null) return '—';
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(percent)}%`;
}

function gastoFaturamentoPercentClassName(gastos: number, faturamento: number): string {
  const percent = calcGastoFaturamentoPercent(gastos, faturamento);
  if (percent == null) return 'text-gray-500 dark:text-gray-400';
  if (percent >= 70) return 'text-red-600 dark:text-red-400';
  return 'text-green-600 dark:text-green-400';
}

function calcGastoRecebidoPercent(gastos: number, recebido: number): number | null {
  if (!Number.isFinite(recebido) || recebido <= 0) return null;
  return (Math.abs(gastos) / recebido) * 100;
}

function formatGastoRecebidoPercent(gastos: number, recebido: number): string {
  const percent = calcGastoRecebidoPercent(gastos, recebido);
  if (percent == null) return '—';
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(percent)}%`;
}

function gastoRecebidoPercentClassName(gastos: number, recebido: number): string {
  const percent = calcGastoRecebidoPercent(gastos, recebido);
  if (percent == null) return 'text-gray-500 dark:text-gray-400';
  if (percent >= 85) return 'text-red-600 dark:text-red-400';
  return 'text-green-600 dark:text-green-400';
}

function calcLucroLiquido(recebido: number, gastos: number): number {
  return recebido - Math.abs(gastos);
}

function lucroLiquidoClassName(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-300';
}

type GastosPanelFinancialSummary = {
  faturamento: number;
  liquido: number;
  recebido: number;
  gastos: number;
  lucroLiquido: number;
};

function summarizeGastosPanelRows(rows: readonly GastosOperacionaisRow[]): GastosPanelFinancialSummary {
  const faturamento = rows.reduce((sum, row) => sum + (row.faturamentoAcumulado ?? 0), 0);
  const liquido = rows.reduce((sum, row) => sum + (row.liquidoAcumulado ?? 0), 0);
  const recebido = rows.reduce((sum, row) => sum + (row.recebidoAcumulado ?? 0), 0);
  const gastos = Math.abs(rows.reduce((sum, row) => sum + row.totalAcumulado, 0));

  return {
    faturamento,
    liquido,
    recebido,
    gastos,
    lucroLiquido: calcLucroLiquido(recebido, gastos)
  };
}

/** Evita quebra do sinal negativo em valores monetários longos (ex.: -R$ 1.554.904,49). */
const amountCurrencyCellClassName =
  'px-3 py-3 text-center tabular-nums whitespace-nowrap min-w-[9.25rem] font-medium';
const amountCurrencyTotalCellClassName =
  'px-3 py-2.5 text-center tabular-nums whitespace-nowrap min-w-[9.25rem] font-semibold';
const amountGrandTotalCellClassName =
  'px-3 py-3 text-center tabular-nums whitespace-nowrap min-w-[9.25rem] font-semibold';
const amountPercentCellClassName =
  'px-3 py-3 text-center tabular-nums whitespace-nowrap min-w-[4.75rem] font-medium';
const amountPercentTotalCellClassName =
  'px-3 py-2.5 text-center tabular-nums whitespace-nowrap min-w-[4.75rem] font-semibold';
const amountCurrencyThClassName =
  'px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap min-w-[9.25rem]';
const amountPercentThClassName =
  'px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap min-w-[4.75rem]';
const dataCenterThClassName =
  'px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap';
const dataCenterCellClassName =
  'px-3 py-3 text-center tabular-nums text-gray-600 dark:text-gray-300 whitespace-nowrap';
const contractThClassName =
  'px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400';
const contractCellClassName =
  'px-3 py-3 text-left font-medium text-gray-900 dark:text-gray-100';

function FinancialTotalsTableRow({
  title,
  contractCount,
  summary,
  showNfsMetrics,
  tableLabelColSpan,
  variant = 'locality'
}: {
  title: string;
  contractCount: number;
  summary: GastosPanelFinancialSummary;
  showNfsMetrics: boolean;
  tableLabelColSpan: number;
  variant?: 'locality' | 'grand';
}) {
  const isGrand = variant === 'grand';
  const rowClassName = isGrand
    ? 'border-t-2 border-amber-300 bg-amber-50/80 font-semibold dark:border-amber-700 dark:bg-amber-950/30'
    : 'border-t border-gray-200 bg-gray-50/90 font-semibold dark:border-gray-600 dark:bg-gray-800/70';
  const labelClassName = isGrand
    ? 'px-3 py-3 text-amber-900 dark:text-amber-200'
    : 'px-3 py-2.5 text-gray-700 dark:text-gray-300';
  const currencyCellClassName = isGrand ? amountGrandTotalCellClassName : amountCurrencyTotalCellClassName;
  const percentCellClassName = amountPercentTotalCellClassName;

  return (
    <tr className={rowClassName}>
      <td colSpan={tableLabelColSpan} className={labelClassName}>
        {title}
        <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
          ({contractCount} {contractCount === 1 ? 'contrato' : 'contratos'})
        </span>
      </td>
      {showNfsMetrics ? (
        <td className={`${currencyCellClassName} text-green-600 dark:text-green-400`}>
          {formatCurrency(summary.faturamento)}
        </td>
      ) : null}
      {showNfsMetrics ? (
        <td className={`${currencyCellClassName} text-blue-600 dark:text-blue-400`}>
          {formatCurrency(summary.liquido)}
        </td>
      ) : null}
      {showNfsMetrics ? (
        <td className={`${currencyCellClassName} text-sky-600 dark:text-sky-400`}>
          {formatCurrency(summary.recebido)}
        </td>
      ) : null}
      <td className={`${currencyCellClassName} text-red-600 dark:text-red-400`}>
        {formatCurrency(summary.gastos)}
      </td>
      {showNfsMetrics ? (
        <td className={`${currencyCellClassName} ${lucroLiquidoClassName(summary.lucroLiquido)}`}>
          {formatCurrency(summary.lucroLiquido)}
        </td>
      ) : null}
      {showNfsMetrics ? (
        <td
          className={`${percentCellClassName} ${gastoFaturamentoPercentClassName(
            summary.gastos,
            summary.faturamento
          )}`}
        >
          {formatGastoFaturamentoPercent(summary.gastos, summary.faturamento)}
        </td>
      ) : null}
      {showNfsMetrics ? (
        <td
          className={`${percentCellClassName} ${gastoRecebidoPercentClassName(
            summary.gastos,
            summary.recebido
          )}`}
        >
          {formatGastoRecebidoPercent(summary.gastos, summary.recebido)}
        </td>
      ) : null}
    </tr>
  );
}

function formatAnoApuracao(anoMin: number, anoMax: number) {
  if (!anoMin && !anoMax) return '—';
  if (anoMin === anoMax) return String(anoMin);
  return `${anoMin}–${anoMax}`;
}

const filterLabelClassName =
  'mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400';

const filterFieldLabelClassName =
  'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

const localitySelectClassName =
  'w-full min-w-[10rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const FILTER_DROPDOWN_LIST_MAX_HEIGHT = 320;

const rowCheckboxClassName =
  'h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-800 dark:focus:ring-amber-400';

function RowSelectCheckbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className={rowCheckboxClassName}
    />
  );
}

export function ControleGeralGastosOperacionaisPanel({
  detailRows,
  naturezaDetailRows = [],
  isLoading,
  fetchedAt,
  isError = false,
  errorMessage,
  onRetry,
  visibleLocalities,
  showPdfExport = false,
  enableRowExclusion = false,
  hideLocalityColumn = false,
  readOnlyPoloColumn = false,
  panelTitle = 'Gastos operacionais por contrato',
  panelDescription = 'QUERY BASE DE GASTOS — mês, ano, contrato e total (somatório por contrato)',
  totalColumnLabel = 'Total',
  showFaturamentoColumn = false,
  dataRefreshNonce = 0,
  showContractDetails = false,
  contractsForDetailLookup = [],
  hideDataRefreshControls = false,
  inlineFilters = false,
  primaryExportButton = false
}: ControleGeralGastosOperacionaisPanelProps) {
  const nfsMetricColumnCount = showFaturamentoColumn ? 3 : 0;
  const lucroLiquidoColumnCount = showFaturamentoColumn ? 1 : 0;
  const gastoRatioColumnCount = showFaturamentoColumn ? 2 : 0;
  const tableColumnCount =
    4 +
    nfsMetricColumnCount +
    lucroLiquidoColumnCount +
    gastoRatioColumnCount +
    (hideLocalityColumn ? 0 : 1) +
    (enableRowExclusion ? 1 : 0);
  const tableAmountColumnCount =
    1 + nfsMetricColumnCount + lucroLiquidoColumnCount + gastoRatioColumnCount;
  const tableLabelColSpan = tableColumnCount - tableAmountColumnCount;
  const [filters, setFilters] = useState<GastosOperacionaisFilters>(
    EMPTY_GASTOS_OPERACIONAIS_FILTERS
  );
  const [exportingPdf, setExportingPdf] = useState(false);
  const [localityOverrides, setLocalityOverrides] = useState<GastosOperacionaisLocalityOverrideMap>(
    () => loadGastosLocalityOverridesWithCatalogSeed()
  );
  const [excludedContracts, setExcludedContracts] = useState<Set<string>>(() =>
    enableRowExclusion ? loadControleGeralExcludedContracts() : new Set()
  );
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [hiddenContractsListMinimized, setHiddenContractsListMinimized] = useState(false);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [naturezaModalContract, setNaturezaModalContract] = useState<GastosOperacionaisRow | null>(
    null
  );

  const enableNaturezaBreakdown = naturezaDetailRows.length > 0;

  const emissaoFilter = useMemo(
    () => deriveEmissaoMonthYearFromPeriod(filters.periodFrom, filters.periodTo),
    [filters.periodFrom, filters.periodTo]
  );
  const emissaoFilterMonths = emissaoFilter.months;
  const emissaoFilterYears = emissaoFilter.years;

  const {
    data: faturamentoByContract = [],
    isFetching: fetchingFaturamento,
    isLoading: loadingFaturamento
  } = useQuery({
    enabled: showFaturamentoColumn,
    queryKey: [
      'controle-geral-faturamento-by-contract-v18-recebido-filter',
      emissaoFilterMonths,
      emissaoFilterYears,
      dataRefreshNonce
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (dataRefreshNonce > 0) params.refresh = 1;
      if (emissaoFilterMonths.length > 0) {
        params.months = emissaoFilterMonths.join(',');
      }
      if (emissaoFilterYears.length > 0) {
        params.years = emissaoFilterYears.join(',');
      }

      const res = await api.get<{
        success: boolean;
        data?: { entries?: FaturamentoByGastosContractEntry[] };
      }>('/controle-nfs/summary/faturamento-by-gastos-contract', {
        params,
        timeout: 120_000
      });

      return res.data?.data?.entries ?? [];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    placeholderData: (previousData) => previousData
  });

  const isPanelLoading =
    isLoading || (showFaturamentoColumn && loadingFaturamento && faturamentoByContract.length === 0);

  const visibleLocalityItems = useMemo(
    () => resolveVisibleLocalityItems(visibleLocalities),
    [visibleLocalities]
  );

  const filterOptions = useMemo(
    () =>
      readOnlyPoloColumn
        ? getGastosPoloFilterOptions(detailRows, { polos: filters.polos })
        : getGastosFilterOptions(
            detailRows,
            { localities: filters.localities },
            localityOverrides,
            visibleLocalities
          ),
    [
      detailRows,
      filters.localities,
      filters.polos,
      localityOverrides,
      readOnlyPoloColumn,
      visibleLocalities
    ]
  );

  const localityFilterOptions = useMemo(
    () =>
      visibleLocalityItems.map((locality) => ({
        value: locality.key,
        label: locality.label
      })),
    [visibleLocalityItems]
  );

  const localityTableSelectOptions = useMemo(
    () =>
      !visibleLocalities?.length
        ? labeledToSelectOptions([{ value: 'OUTROS', label: 'Outros' }])
        : labeledToSelectOptions(localityFilterOptions),
    [visibleLocalities, localityFilterOptions]
  );

  const poloFilterOptions = useMemo(
    () =>
      (readOnlyPoloColumn
        ? (filterOptions as GastosOperacionaisPoloFilterOptions).polos
        : []
      ).map((polo) => ({
        value: polo,
        label: polo === '—' ? 'Sem polo' : polo
      })),
    [filterOptions, readOnlyPoloColumn]
  );

  const contractFilterOptions = useMemo(
    () =>
      filterOptions.contracts.map((contract) => ({
        value: contract,
        label: contract,
        searchText: contract
      })),
    [filterOptions.contracts]
  );

  const hasActiveFilters =
    (readOnlyPoloColumn ? filters.polos.length > 0 : filters.localities.length > 0) ||
    Boolean(filters.periodFrom || filters.periodTo) ||
    filters.contracts.length > 0;

  const displayRows = useMemo(() => {
    const filtered = readOnlyPoloColumn
      ? filterGastosDetailRowsByPolo(detailRows, filters)
      : filterGastosDetailRows(detailRows, filters, localityOverrides, visibleLocalities);
    return aggregateGastosDetailRows(filtered);
  }, [detailRows, filters, localityOverrides, readOnlyPoloColumn, visibleLocalities]);

  const visibleRows = useMemo(() => {
    if (!enableRowExclusion) return displayRows;
    return displayRows.filter(
      (row) => !isContractExcludedFromControleGeralView(row.contract, excludedContracts)
    );
  }, [displayRows, excludedContracts, enableRowExclusion]);

  const faturamentoLookup = useMemo(
    () => buildFaturamentoByContractLookup(faturamentoByContract),
    [faturamentoByContract]
  );

  const contractDetailLookup = useMemo(
    () => buildGastosContractDetailLookup(contractsForDetailLookup),
    [contractsForDetailLookup]
  );

  const resolveContractDetailPath = useCallback(
    (contract: string) => {
      if (!showContractDetails) return null;
      return resolveGastosContractDetailPath(contract, contractDetailLookup, contractsForDetailLookup);
    },
    [showContractDetails, contractDetailLookup, contractsForDetailLookup]
  );

  const visibleRowsWithFaturamento = useMemo(
    () =>
      visibleRows.map((row) => ({
        ...row,
        faturamentoAcumulado: showFaturamentoColumn
          ? resolveContractFaturamento(row.contract, faturamentoLookup)
          : undefined,
        liquidoAcumulado: showFaturamentoColumn
          ? resolveContractLiquido(row.contract, faturamentoLookup)
          : undefined,
        recebidoAcumulado: showFaturamentoColumn
          ? resolveContractRecebido(row.contract, faturamentoLookup)
          : undefined
      })),
    [visibleRows, faturamentoLookup, showFaturamentoColumn]
  );

  const excludedContractLabels = useMemo(() => {
    if (!enableRowExclusion) return [];
    const labels = new Map<string, string>();
    for (const row of displayRows) {
      const key = normalizeContractOrderKey(row.contract);
      if (excludedContracts.has(key)) {
        labels.set(key, row.contract);
      }
    }
    return Array.from(labels.values());
  }, [displayRows, excludedContracts, enableRowExclusion]);

  const localityGroups = useMemo(() => {
    if (readOnlyPoloColumn) {
      return groupGastosRowsByPolo(visibleRowsWithFaturamento).map((group) => ({
        localityKey: group.poloKey,
        localityLabel: group.poloLabel,
        rows: group.rows,
        subtotal: group.subtotal
      }));
    }
    return groupGastosRowsByLocality(visibleRowsWithFaturamento, localityOverrides, visibleLocalities);
  }, [visibleRowsWithFaturamento, localityOverrides, readOnlyPoloColumn, visibleLocalities]);

  const grandSummary = useMemo(
    () => summarizeGastosPanelRows(visibleRowsWithFaturamento),
    [visibleRowsWithFaturamento]
  );

  const naturezaModalRows = useMemo(() => {
    if (!naturezaModalContract) return [];
    return aggregateGastosNaturezaForContract(
      naturezaDetailRows,
      naturezaModalContract.contract,
      filters.periodFrom,
      filters.periodTo
    );
  }, [
    naturezaDetailRows,
    naturezaModalContract,
    filters.periodFrom,
    filters.periodTo
  ]);

  const naturezaModalTotal = useMemo(
    () => naturezaModalRows.reduce((sum, row) => sum + row.total, 0),
    [naturezaModalRows]
  );

  const naturezaModalPeriodLabel = useMemo(
    () => formatGastosPeriodFilterLabel(filters.periodFrom, filters.periodTo),
    [filters.periodFrom, filters.periodTo]
  );

  const totalGastos = grandSummary.gastos;

  const selectedRows = useMemo(
    () => visibleRowsWithFaturamento.filter((row) => selectedRowKeys.has(row.rowKey)),
    [visibleRowsWithFaturamento, selectedRowKeys]
  );

  const allVisibleSelected =
    visibleRowsWithFaturamento.length > 0 &&
    visibleRowsWithFaturamento.every((row) => selectedRowKeys.has(row.rowKey));
  const someVisibleSelected = visibleRowsWithFaturamento.some((row) =>
    selectedRowKeys.has(row.rowKey)
  );

  useEffect(() => {
    setSelectedRowKeys((prev) => {
      const visibleKeys = new Set(visibleRowsWithFaturamento.map((row) => row.rowKey));
      const next = new Set(Array.from(prev).filter((key) => visibleKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleRowsWithFaturamento]);

  const clearFilters = () => {
    setFilters(EMPTY_GASTOS_OPERACIONAIS_FILTERS);
  };

  const toggleRowSelection = (rowKey: string) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const row of visibleRowsWithFaturamento) next.delete(row.rowKey);
      } else {
        for (const row of visibleRowsWithFaturamento) next.add(row.rowKey);
      }
      return next;
    });
  };

  const clearRowSelection = () => {
    setSelectedRowKeys(new Set());
  };

  const handleExcludeSelected = () => {
    if (!selectedRows.length) return;

    const contracts = selectedRows.map((row) => row.contract);
    setExcludedContracts((prev) => addControleGeralExcludedContracts(contracts, prev));
    setSelectedRowKeys(new Set());

    toast.success(
      contracts.length === 1
        ? `"${contracts[0]}" ocultado da visualização.`
        : `${contracts.length} contratos ocultados da visualização.`
    );
  };

  const handleRestoreExcluded = (contract: string) => {
    setExcludedContracts((prev) => removeControleGeralExcludedContract(contract, prev));
    toast.success(`"${contract}" restaurado na visualização.`);
  };

  const handleRestoreAllExcluded = () => {
    setExcludedContracts(clearControleGeralExcludedContracts());
    toast.success('Contratos ocultos restaurados.');
  };

  const handleLocalitiesChange = (selected: string[]) => {
    const localities = selected as GastosOperacionaisLocality[];
    setFilters((prev) => ({
      ...prev,
      localities,
      contracts:
        localities.length > 0
          ? prev.contracts.filter((contract) =>
              contractMatchesLocalitiesWithOverrides(contract, localities, localityOverrides)
            )
          : prev.contracts
    }));
  };

  const handlePolosChange = (selected: string[]) => {
    const polos = selected;
    const poloByContract = new Map<string, string>();
    for (const row of detailRows) {
      if (!poloByContract.has(row.contract)) {
        poloByContract.set(row.contract, (row.polo ?? '').trim() || '—');
      }
    }
    setFilters((prev) => ({
      ...prev,
      polos,
      contracts:
        polos.length > 0
          ? prev.contracts.filter((contract) => polos.includes(poloByContract.get(contract) ?? '—'))
          : prev.contracts
    }));
  };

  const handleContractLocalityChange = (contract: string, value: string) => {
    const locality = (value || 'OUTROS') as EffectiveContractLocality;
    setLocalityOverrides((prev) => {
      const next = applyContractLocalityOverride(contract, locality, prev);
      saveGastosLocalityOverrides(next);
      return next;
    });
  };

  const handlePeriodFromChange = (value: string) => {
    setFilters((prev) => {
      const periodFrom = value;
      let periodTo = prev.periodTo;
      if (periodFrom && periodTo && periodFrom > periodTo) {
        periodTo = periodFrom;
      }
      return { ...prev, periodFrom, periodTo };
    });
  };

  const handlePeriodToChange = (value: string) => {
    setFilters((prev) => {
      let periodFrom = prev.periodFrom;
      const periodTo = value;
      if (periodFrom && periodTo && periodFrom > periodTo) {
        periodFrom = periodTo;
      }
      return { ...prev, periodFrom, periodTo };
    });
  };

  const gastosFiltersFields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <span className={filterLabelClassName}>Contrato</span>
        <MultiSelectSearchDropdown
          options={contractFilterOptions}
          selected={filters.contracts}
          onChange={(contracts) => setFilters((prev) => ({ ...prev, contracts }))}
          placeholder="Todos os contratos"
          searchPlaceholder="Pesquisar contrato..."
          emptyOptionsMessage="Nenhum contrato disponível."
          emptySearchMessage="Nenhum contrato encontrado."
          listMaxHeight={FILTER_DROPDOWN_LIST_MAX_HEIGHT}
          menuOverlapContent
          noFocusRing
        />
      </div>

      <div>
        <span className={filterLabelClassName}>
          {readOnlyPoloColumn ? 'Polo' : 'Localidade'}
        </span>
        <MultiSelectSearchDropdown
          options={readOnlyPoloColumn ? poloFilterOptions : localityFilterOptions}
          selected={readOnlyPoloColumn ? filters.polos : filters.localities}
          onChange={readOnlyPoloColumn ? handlePolosChange : handleLocalitiesChange}
          placeholder={readOnlyPoloColumn ? 'Todos os polos' : 'Todas as localidades'}
          searchPlaceholder={
            readOnlyPoloColumn ? 'Pesquisar polo...' : 'Pesquisar localidade...'
          }
          emptyOptionsMessage={
            readOnlyPoloColumn ? 'Nenhum polo disponível.' : 'Nenhuma localidade disponível.'
          }
          emptySearchMessage={
            readOnlyPoloColumn ? 'Nenhum polo encontrado.' : 'Nenhuma localidade encontrada.'
          }
          listMaxHeight={FILTER_DROPDOWN_LIST_MAX_HEIGHT}
          menuOverlapContent
          noFocusRing
        />
      </div>

      <div>
        <label className={filterFieldLabelClassName}>Data inicial</label>
        <DatePickerField
          value={filters.periodFrom}
          onChange={handlePeriodFromChange}
          placeholder="dd/mm/aaaa"
          noFocusRing
          aria-label="Data inicial"
        />
      </div>

      <div>
        <label className={filterFieldLabelClassName}>Data final</label>
        <DatePickerField
          value={filters.periodTo}
          onChange={handlePeriodToChange}
          placeholder="dd/mm/aaaa"
          noFocusRing
          aria-label="Data final"
        />
      </div>
    </div>
  );

  const buildMesesLabel = useCallback(
    (row: GastosOperacionaisRow) => {
      const singleMonth = getSingleCalendarMonthFromPeriod(filters.periodFrom, filters.periodTo);
      if (singleMonth) {
        return (
          MONTH_OPTIONS.find((month) => month.value === singleMonth.month)?.label ??
          String(singleMonth.month)
        );
      }
      return `${row.mesesApuracao} ${row.mesesApuracao === 1 ? 'mês' : 'meses'}`;
    },
    [filters.periodFrom, filters.periodTo]
  );

  const buildAnoLabel = useCallback(
    (row: GastosOperacionaisRow) => {
      const singleYear = getSingleYearFromPeriod(filters.periodFrom, filters.periodTo);
      if (singleYear != null) {
        return String(singleYear);
      }
      return formatAnoApuracao(row.anoMin, row.anoMax);
    },
    [filters.periodFrom, filters.periodTo]
  );

  const buildPdfFilterLines = useCallback((): string[] => {
    const lines: string[] = [];

    if (readOnlyPoloColumn) {
      if (filters.polos.length) {
        lines.push(`Polos: ${filters.polos.join(', ')}`);
      }
    } else if (filters.localities.length) {
      lines.push(
        `Localidades: ${filters.localities
          .map((key) => getLocalityLabel(key))
          .join(', ')}`
      );
    }
    const periodLabel = formatGastosPeriodFilterLabel(filters.periodFrom, filters.periodTo);
    if (periodLabel) {
      lines.push(`Período: ${periodLabel}`);
    }
    if (filters.contracts.length) {
      lines.push(`Contratos: ${filters.contracts.join(', ')}`);
    }
    if (excludedContractLabels.length) {
      lines.push(`Ocultos da visualização: ${excludedContractLabels.join(', ')}`);
    }
    if (hasActiveFilters) {
      lines.push(`Total filtrado: ${formatCurrency(totalGastos)}`);
    }

    return lines;
  }, [filters, hasActiveFilters, totalGastos, excludedContractLabels, readOnlyPoloColumn]);

  const handleExportPdf = useCallback(async () => {
    if (visibleRows.length === 0) {
      toast.error('Nenhum dado para exportar com os filtros atuais.');
      return;
    }

    setExportingPdf(true);
    try {
      const sheetUpdatedAt = fetchedAt
        ? new Date(fetchedAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : undefined;

      if (showFaturamentoColumn) {
        const buildPdfSummary = (rows: readonly GastosOperacionaisRow[]) => {
          const summary = summarizeGastosPanelRows(rows);
          return {
            ...summary,
            gastoFatPercent: formatGastoFaturamentoPercent(summary.gastos, summary.faturamento),
            gastoRecPercent: formatGastoRecebidoPercent(summary.gastos, summary.recebido)
          };
        };

        await exportControleGeralContratosPdf({
          filterLines: buildPdfFilterLines(),
          contractCount: visibleRowsWithFaturamento.length,
          sheetUpdatedAt,
          groups: localityGroups.map((group) => ({
            localityLabel: group.localityLabel,
            contractCount: group.rows.length,
            summary: buildPdfSummary(group.rows),
            rows: group.rows.map((row) => {
              const gastos = Math.abs(row.totalAcumulado);
              const faturamento = row.faturamentoAcumulado ?? 0;
              const recebido = row.recebidoAcumulado ?? 0;
              return {
                contract: row.contract,
                mesesLabel: buildMesesLabel(row),
                anoLabel: buildAnoLabel(row),
                faturamento,
                liquido: row.liquidoAcumulado ?? 0,
                recebido,
                gastos,
                lucroLiquido: calcLucroLiquido(recebido, row.totalAcumulado),
                gastoFatPercent: formatGastoFaturamentoPercent(row.totalAcumulado, faturamento),
                gastoRecPercent: formatGastoRecebidoPercent(row.totalAcumulado, recebido)
              };
            })
          })),
          grandSummary: buildPdfSummary(visibleRowsWithFaturamento)
        });
      } else {
        await exportGastosOperacionaisPdf({
          filterLines: buildPdfFilterLines(),
          totalGastos,
          contractCount: visibleRows.length,
          localityCount: localityGroups.length,
          groups: localityGroups.map((group) => ({
            localityLabel: group.localityLabel,
            contractCount: group.rows.length,
            subtotal: group.subtotal,
            rows: group.rows.map((row) => ({
              contract: row.contract,
              mesesLabel: buildMesesLabel(row),
              anoLabel: buildAnoLabel(row),
              total: row.totalAcumulado
            }))
          })),
          sheetUpdatedAt
        });
      }

      toast.success('PDF exportado com sucesso.');
    } catch {
      toast.error('Erro ao gerar o PDF. Tente novamente.');
    } finally {
      setExportingPdf(false);
    }
  }, [
    buildAnoLabel,
    buildMesesLabel,
    buildPdfFilterLines,
    fetchedAt,
    localityGroups,
    showFaturamentoColumn,
    totalGastos,
    visibleRows.length,
    visibleRowsWithFaturamento
  ]);

  return (
    <Card>
      <CardHeader className="border-b-0 pb-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 p-2 sm:p-3 dark:bg-amber-900/30">
              <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {panelTitle}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {panelDescription}
              </p>
            </div>
          </div>
          {(inlineFilters && (showPdfExport || showFaturamentoColumn)) ? (
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(true)}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  hasActiveFilters
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtro"
                title={hasActiveFilters ? 'Filtro (ativo)' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {hasActiveFilters ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={isPanelLoading || exportingPdf || visibleRows.length === 0}
                className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                {exportingPdf ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4 shrink-0" aria-hidden />
                )}
                <span>{exportingPdf ? 'Gerando PDF…' : 'Exportar'}</span>
              </button>
            </div>
          ) : (showPdfExport || showFaturamentoColumn) && !hideDataRefreshControls ? (
            <div className="flex flex-col items-end gap-2">
              {fetchedAt ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Atualizado em{' '}
                  {new Date(fetchedAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  disabled={isPanelLoading || exportingPdf || visibleRows.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {exportingPdf ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {exportingPdf ? 'Gerando PDF…' : 'Exportar PDF'}
                </button>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    disabled={isPanelLoading || fetchingFaturamento}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isPanelLoading || fetchingFaturamento ? 'animate-spin' : ''}`}
                      aria-hidden
                    />
                    Atualizar planilha
                  </button>
                ) : null}
              </div>
            </div>
          ) : (showPdfExport || showFaturamentoColumn) && primaryExportButton ? (
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={isPanelLoading || exportingPdf || visibleRows.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              {exportingPdf ? 'Gerando PDF…' : 'Exportar PDF'}
            </button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        {isPanelLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span>Carregando dados do controle...</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" aria-hidden />
            <p className="max-w-md text-sm text-red-700 dark:text-red-300">
              {errorMessage ?? 'Erro ao carregar dados da planilha.'}
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : detailRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum gasto operacional encontrado.
          </div>
        ) : (
          <>
            {!inlineFilters ? (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Filter className="h-4 w-4" aria-hidden />
                  Filtros
                </div>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Limpar filtros
                  </button>
                ) : null}
              </div>

              {gastosFiltersFields}
            </div>
            ) : null}

            {displayRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum gasto encontrado para os filtros selecionados.
              </div>
            ) : enableRowExclusion && visibleRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                <p>Todos os contratos visíveis foram ocultados.</p>
                <button
                  type="button"
                  onClick={handleRestoreAllExcluded}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Restaurar todos
                </button>
              </div>
            ) : (
              <>
                {enableRowExclusion && excludedContractLabels.length > 0 ? (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 ${
                        hiddenContractsListMinimized ? '' : 'mb-2'
                      }`}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
                        {excludedContractLabels.length}{' '}
                        {excludedContractLabels.length === 1 ? 'contrato oculto' : 'contratos ocultos'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setHiddenContractsListMinimized((prev) => !prev)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
                          aria-expanded={!hiddenContractsListMinimized}
                        >
                          {hiddenContractsListMinimized ? (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                              Expandir
                            </>
                          ) : (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                              Minimizar
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleRestoreAllExcluded}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          Restaurar todos
                        </button>
                      </div>
                    </div>
                    {!hiddenContractsListMinimized ? (
                      <div className="flex flex-wrap gap-2">
                        {excludedContractLabels.map((contract) => (
                          <button
                            key={contract}
                            type="button"
                            onClick={() => handleRestoreExcluded(contract)}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
                            title="Restaurar na visualização"
                          >
                            {contract}
                            <RotateCcw className="h-3 w-3 shrink-0" aria-hidden />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {enableRowExclusion && selectedRows.length > 0 ? (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/20">
                    <p className="text-sm text-blue-900 dark:text-blue-200">
                      {selectedRows.length}{' '}
                      {selectedRows.length === 1 ? 'contrato selecionado' : 'contratos selecionados'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={clearRowSelection}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        Desmarcar todos
                      </button>
                      <button
                        type="button"
                        onClick={handleExcludeSelected}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                        Excluir da visualização
                      </button>
                    </div>
                  </div>
                ) : enableRowExclusion ? (
                  <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    Marque os contratos com o checkbox e use &quot;Excluir da visualização&quot; para
                    ocultá-los.
                  </p>
                ) : null}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        {enableRowExclusion ? (
                          <th className="w-10 px-3 py-3 text-center">
                            <RowSelectCheckbox
                              checked={allVisibleSelected}
                              indeterminate={someVisibleSelected && !allVisibleSelected}
                              onChange={toggleSelectAllVisible}
                              ariaLabel="Selecionar todos os contratos visíveis"
                            />
                          </th>
                        ) : null}
                        <th className={contractThClassName}>Contrato</th>
                        <th className={dataCenterThClassName}>Mês de apuração</th>
                        <th className={dataCenterThClassName}>Ano de apuração</th>
                        {!hideLocalityColumn ? (
                          <th className={dataCenterThClassName}>
                            {readOnlyPoloColumn ? 'Polo' : 'Localidade'}
                          </th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountCurrencyThClassName}>Faturamento</th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountCurrencyThClassName}>Líquido</th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountCurrencyThClassName}>Recebido</th>
                        ) : null}
                        <th className={amountCurrencyThClassName}>{totalColumnLabel}</th>
                        {showFaturamentoColumn ? (
                          <th className={amountCurrencyThClassName}>Lucro líquido</th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountPercentThClassName}>GASTO / FAT (%)</th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountPercentThClassName}>GASTO / REC (%)</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {localityGroups.map((group) => {
                        const groupSummary = summarizeGastosPanelRows(group.rows);

                        return (
                        <React.Fragment key={group.localityKey}>
                          <tr className="bg-amber-50 dark:bg-amber-950/30">
                            <td
                              colSpan={tableColumnCount}
                              className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300"
                            >
                              {group.localityLabel}
                            </td>
                          </tr>
                          {group.rows.map((row) => (
                            <tr
                              key={row.rowKey}
                              role={enableNaturezaBreakdown ? 'button' : undefined}
                              tabIndex={enableNaturezaBreakdown ? 0 : undefined}
                              title={
                                enableNaturezaBreakdown
                                  ? 'Clique para ver naturezas e valores'
                                  : undefined
                              }
                              onClick={
                                enableNaturezaBreakdown
                                  ? () => setNaturezaModalContract(row)
                                  : undefined
                              }
                              onKeyDown={
                                enableNaturezaBreakdown
                                  ? (event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        setNaturezaModalContract(row);
                                      }
                                    }
                                  : undefined
                              }
                              className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                                enableNaturezaBreakdown
                                  ? 'cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-950/20'
                                  : ''
                              } ${
                                enableRowExclusion && selectedRowKeys.has(row.rowKey)
                                  ? 'bg-blue-50/70 dark:bg-blue-950/20'
                                  : ''
                              }`}
                            >
                              {enableRowExclusion ? (
                                <td className="px-3 py-3 text-center">
                                  <div
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => event.stopPropagation()}
                                  >
                                    <RowSelectCheckbox
                                      checked={selectedRowKeys.has(row.rowKey)}
                                      onChange={() => toggleRowSelection(row.rowKey)}
                                      ariaLabel={`Selecionar ${row.contract}`}
                                    />
                                  </div>
                                </td>
                              ) : null}
                              <td className={contractCellClassName}>
                                {(() => {
                                  const detailPath = resolveContractDetailPath(row.contract);
                                  if (!detailPath) return row.contract;

                                  return (
                                    <Link
                                      href={detailPath}
                                      onClick={(event) => event.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                    >
                                      <span>{row.contract}</span>
                                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                                    </Link>
                                  );
                                })()}
                              </td>
                              <td className={dataCenterCellClassName}>
                                {buildMesesLabel(row)}
                              </td>
                              <td className={dataCenterCellClassName}>
                                {buildAnoLabel(row)}
                              </td>
                              {!hideLocalityColumn ? (
                                <td className={`${dataCenterCellClassName} text-gray-700 dark:text-gray-300`}>
                                  {readOnlyPoloColumn ? (
                                    row.polo?.trim() || '—'
                                  ) : (
                                    <StringSingleSelectDropdown
                                      value={getEffectiveContractLocality(row.contract, localityOverrides)}
                                      onChange={(value) =>
                                        handleContractLocalityChange(row.contract, value)
                                      }
                                      options={localityTableSelectOptions}
                                      allowEmpty={false}
                                      className={`${localitySelectClassName} mx-auto`}
                                    />
                                  )}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td className={`${amountCurrencyCellClassName} text-green-600 dark:text-green-400`}>
                                  {formatCurrency(row.faturamentoAcumulado ?? 0)}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td className={`${amountCurrencyCellClassName} text-blue-600 dark:text-blue-400`}>
                                  {formatCurrency(row.liquidoAcumulado ?? 0)}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td className={`${amountCurrencyCellClassName} text-sky-600 dark:text-sky-400`}>
                                  {formatCurrency(row.recebidoAcumulado ?? 0)}
                                </td>
                              ) : null}
                              <td className={`${amountCurrencyCellClassName} text-red-600 dark:text-red-400`}>
                                {formatCurrency(Math.abs(row.totalAcumulado))}
                              </td>
                              {showFaturamentoColumn ? (
                                <td
                                  className={`${amountCurrencyCellClassName} ${lucroLiquidoClassName(
                                    calcLucroLiquido(
                                      row.recebidoAcumulado ?? 0,
                                      row.totalAcumulado
                                    )
                                  )}`}
                                >
                                  {formatCurrency(
                                    calcLucroLiquido(
                                      row.recebidoAcumulado ?? 0,
                                      row.totalAcumulado
                                    )
                                  )}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td
                                  className={`${amountPercentCellClassName} ${gastoFaturamentoPercentClassName(
                                    row.totalAcumulado,
                                    row.faturamentoAcumulado ?? 0
                                  )}`}
                                >
                                  {formatGastoFaturamentoPercent(
                                    row.totalAcumulado,
                                    row.faturamentoAcumulado ?? 0
                                  )}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td
                                  className={`${amountPercentCellClassName} ${gastoRecebidoPercentClassName(
                                    row.totalAcumulado,
                                    row.recebidoAcumulado ?? 0
                                  )}`}
                                >
                                  {formatGastoRecebidoPercent(
                                    row.totalAcumulado,
                                    row.recebidoAcumulado ?? 0
                                  )}
                                </td>
                              ) : null}
                            </tr>
                          ))}
                          <FinancialTotalsTableRow
                            title={`Total — ${group.localityLabel}`}
                            contractCount={group.rows.length}
                            summary={groupSummary}
                            showNfsMetrics={showFaturamentoColumn}
                            tableLabelColSpan={tableLabelColSpan}
                          />
                        </React.Fragment>
                        );
                      })}
                      {localityGroups.length > 0 ? (
                        <FinancialTotalsTableRow
                          title={
                            readOnlyPoloColumn
                              ? 'Total geral — todos os polos'
                              : 'Total geral — todas as localidades'
                          }
                          contractCount={visibleRowsWithFaturamento.length}
                          summary={grandSummary}
                          showNfsMetrics={showFaturamentoColumn}
                          tableLabelColSpan={tableLabelColSpan}
                          variant="grand"
                        />
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>

      {inlineFilters && isFiltersModalOpen ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsFiltersModalOpen(false)}
          />
          <div className="relative mx-4 w-full max-w-3xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Fechar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{gastosFiltersFields}</div>
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={naturezaModalContract != null}
        onClose={() => setNaturezaModalContract(null)}
        title={
          naturezaModalContract
            ? `Naturezas — ${naturezaModalContract.contract}`
            : 'Naturezas'
        }
        size="lg"
      >
        {naturezaModalContract ? (
          <>
            <p className="mb-1 text-sm text-gray-600 dark:text-gray-400">
              Gastos por natureza no centro de custo, conforme filtros atuais.
            </p>
            {naturezaModalPeriodLabel ? (
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                Período: {naturezaModalPeriodLabel}
              </p>
            ) : (
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                Sem filtro de período — todos os meses disponíveis.
              </p>
            )}
            {naturezaModalRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhuma natureza encontrada para este contrato no período selecionado.
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-x-auto overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Natureza
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {naturezaModalRows.map((row) => (
                      <tr
                        key={row.natureza}
                        className={
                          row.excludedFromOperationalTotal
                            ? 'bg-gray-50/60 dark:bg-gray-800/40'
                            : undefined
                        }
                      >
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {row.natureza}
                          {row.excludedFromOperationalTotal ? (
                            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                              (mov. financeira)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums font-medium text-red-600 dark:text-red-400">
                          {formatCurrency(Math.abs(row.total))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50 font-semibold dark:border-gray-700 dark:bg-gray-800/80">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">Total</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-red-600 dark:text-red-400">
                        {formatCurrency(Math.abs(naturezaModalTotal))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        ) : null}
      </Modal>
    </Card>
  );
}

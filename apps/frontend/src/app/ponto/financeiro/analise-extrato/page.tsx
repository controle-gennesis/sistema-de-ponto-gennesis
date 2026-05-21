'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  Filter,
  BookOpen,
  ListPlus,
  Loader2,
  Search,
  Building2,
  FileText,
  Wallet,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { extratoMatchesAnyNatureCodes, normalizeBudgetNatureCode } from '@/lib/budgetNatureMatch';
type ExtratoCaixaItem = {
  idxcx: number | null;
  codColigada: number | null;
  historico: string;
  codCxa: string;
  codCCusto: string;
  ccusto: string;
  valor: number;
  valorBaixa: number;
  entrada: number;
  saida: number;
  codFilial: number | null;
  data: string | null;
  dataCompensacao: string | null;
  codNatFinanceira: string;
  natureza: string;
  numeroDocumento: string;
  fornecedor: string;
  tipoOperacao: string;
};

type ExtratoCaixaPathFailure = {
  path: string;
  error: string;
};

type ExtratoCaixaApiResponse = {
  success: boolean;
  message?: string;
  data: {
    configured: boolean;
    items: ExtratoCaixaItem[];
    total: number;
    configuredYears?: number[];
    pathFailures?: ExtratoCaixaPathFailure[];
    message?: string | null;
  };
};

const EXTRATO_ITEMS_PER_PAGE = 50;

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyOrDash(value: number): string {
  if (value === 0) return '—';
  return formatCurrency(value);
}

function parseCalendarDateParts(value: string): { y: number; m: number; d: number } | null {
  const s = value.trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
  }

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return { y: Number(br[3]), m: Number(br[2]), d: Number(br[1]) };
  }

  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  return {
    y: parsed.getFullYear(),
    m: parsed.getMonth() + 1,
    d: parsed.getDate()
  };
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parts = parseCalendarDateParts(value);
  if (!parts) return value;
  const dd = String(parts.d).padStart(2, '0');
  const mm = String(parts.m).padStart(2, '0');
  return `${dd}/${mm}/${parts.y}`;
}

function localDayKey(data: string | null): number | null {
  if (!data) return null;
  const parts = parseCalendarDateParts(data);
  if (!parts) return null;
  return new Date(parts.y, parts.m - 1, parts.d).getTime();
}

function parseDateInputToDayKey(value: string): number | null {
  const s = value.trim();
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

/** Todos marcados (ou lista vazia) = sem filtro restritivo nesse campo. */
function multiselectFilterShowsAll(selected: string[], allValues: string[]): boolean {
  if (allValues.length === 0) return true;
  return selected.length === 0 || selected.length >= allValues.length;
}

function isMultiselectFilterActive(selected: string[], allValues: string[]): boolean {
  if (allValues.length === 0) return false;
  return selected.length > 0 && selected.length < allValues.length;
}

function extratoMatchesAnyFilialIds(
  codFilial: number | null,
  selectedFilialIds: string[],
  allFilialIds: string[]
): boolean {
  if (multiselectFilterShowsAll(selectedFilialIds, allFilialIds)) return true;
  if (codFilial == null) return false;
  return selectedFilialIds.includes(String(codFilial));
}

function extratoMatchesAnyCcCodes(
  codCCusto: string,
  selectedCcCodes: string[],
  allCcCodes: string[]
): boolean {
  if (multiselectFilterShowsAll(selectedCcCodes, allCcCodes)) return true;
  const code = codCCusto.trim();
  if (!code) return false;
  return selectedCcCodes.includes(code);
}

function extratoMatchesAnyFornecedor(
  fornecedor: string,
  selected: string[],
  allFornecedores: string[]
): boolean {
  if (multiselectFilterShowsAll(selected, allFornecedores)) return true;
  const v = fornecedor.trim();
  if (!v) return false;
  return selected.includes(v);
}

function extratoMatchesAnyHistorico(
  historico: string,
  selected: string[],
  allHistoricos: string[]
): boolean {
  if (multiselectFilterShowsAll(selected, allHistoricos)) return true;
  const v = historico.trim();
  if (!v) return false;
  return selected.includes(v);
}

function extratoMatchesAnyTipoOperacao(
  tipoOperacao: string,
  selected: string[],
  allTipos: string[]
): boolean {
  if (multiselectFilterShowsAll(selected, allTipos)) return true;
  const v = tipoOperacao.trim();
  if (!v) return false;
  return selected.includes(v);
}

function extratoMatchesAnyNatureCodesFiltered(
  codNatFinanceira: string,
  selectedNatureCodes: string[],
  allNatureCodes: string[]
): boolean {
  if (multiselectFilterShowsAll(selectedNatureCodes, allNatureCodes)) return true;
  return extratoMatchesAnyNatureCodes(codNatFinanceira, selectedNatureCodes);
}

function displayCcLabel(item: ExtratoCaixaItem): string {
  return item.ccusto?.trim() || item.codCCusto?.trim() || '—';
}

function displayNatLabel(item: ExtratoCaixaItem): string {
  return item.natureza?.trim() || item.codNatFinanceira?.trim() || '—';
}

function itemEntrada(item: ExtratoCaixaItem): number {
  return item.entrada > 0 ? item.entrada : 0;
}

/** SAÍDA vem negativa do SQL (VALORBAIXA*-1 ou VALOR*-1). */
function itemSaidaAbs(item: ExtratoCaixaItem): number {
  if (item.saida < 0) return Math.abs(item.saida);
  return item.saida > 0 ? item.saida : 0;
}

function itemHasSaida(item: ExtratoCaixaItem): boolean {
  return item.saida !== 0;
}

/** Saldo da linha: entrada + saída (saída já vem negativa do SQL). */
function itemSaldoLinha(item: ExtratoCaixaItem): number {
  return item.entrada + item.saida;
}

const MOVIMENTO_TIPO_FILTER_OPTIONS = [
  { value: 'entrada', label: 'Entradas', searchText: 'entradas entrada crédito' },
  { value: 'saida', label: 'Saídas', searchText: 'saídas saida débito' }
] as const;

const MOVIMENTO_TIPO_ALL_VALUES = MOVIMENTO_TIPO_FILTER_OPTIONS.map((o) => o.value);

function extratoMatchesMovimentoTipo(
  item: ExtratoCaixaItem,
  selected: string[],
  allMovimentoTipos: string[] = MOVIMENTO_TIPO_ALL_VALUES
): boolean {
  if (multiselectFilterShowsAll(selected, allMovimentoTipos)) return true;
  if (selected.length === 0) return false;
  const wantEntrada = selected.includes('entrada');
  const wantSaida = selected.includes('saida');
  const isEntrada = itemEntrada(item) > 0;
  const isSaida = itemHasSaida(item);
  if (wantEntrada && isEntrada) return true;
  if (wantSaida && isSaida) return true;
  return false;
}

function itemMatchesDateRange(
  data: string | null,
  periodFrom: string,
  periodTo: string
): boolean {
  if (!periodFrom && !periodTo) return true;
  const day = localDayKey(data);
  if (day == null) return false;

  let fromKey = parseDateInputToDayKey(periodFrom);
  let toKey = parseDateInputToDayKey(periodTo);
  if (fromKey != null && toKey != null && fromKey > toKey) {
    [fromKey, toKey] = [toKey, fromKey];
  }
  if (fromKey != null && day < fromKey) return false;
  if (toKey != null && day > toKey) return false;
  return true;
}

function itemMatchesCompensacaoPeriod(
  item: ExtratoCaixaItem,
  periodFrom: string,
  periodTo: string
): boolean {
  return itemMatchesDateRange(item.dataCompensacao, periodFrom, periodTo);
}

function sortItemsByDateDesc(items: ExtratoCaixaItem[]): ExtratoCaixaItem[] {
  return [...items].sort((a, b) => {
    const ta = localDayKey(a.dataCompensacao) ?? localDayKey(a.data) ?? Number.NEGATIVE_INFINITY;
    const tb = localDayKey(b.dataCompensacao) ?? localDayKey(b.data) ?? Number.NEGATIVE_INFINITY;
    return tb - ta;
  });
}

function extratoItemMatchesSearch(item: ExtratoCaixaItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const ccLabel = displayCcLabel(item);
  const natLabel = displayNatLabel(item);

  const haystack = [
    item.idxcx != null ? String(item.idxcx) : '',
    item.historico,
    item.codCxa,
    item.codCCusto,
    ccLabel,
    item.codNatFinanceira,
    natLabel,
    item.natureza,
    item.fornecedor,
    item.tipoOperacao,
    item.numeroDocumento,
    item.codFilial != null ? String(item.codFilial) : '',
    formatDate(item.data),
    formatDate(item.dataCompensacao),
    formatCurrency(itemSaldoLinha(item)),
    String(itemSaldoLinha(item))
  ];

  return haystack.some((part) => part && part.toLowerCase().includes(q));
}

const FILTER_SELECT_CLASS =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:ring-red-400';

type ExtratoFilterDraft = {
  ccFilterCodes: string[];
  natureFilterCodes: string[];
  filialFilterIds: string[];
  fornecedorFilterValues: string[];
  historicoFilterValues: string[];
  tipoOperacaoFilterValues: string[];
  movimentoTipoFilter: string[];
  periodFrom: string;
  periodTo: string;
};

const EMPTY_FILTER_DRAFT: ExtratoFilterDraft = {
  ccFilterCodes: [],
  natureFilterCodes: [],
  filialFilterIds: [],
  fornecedorFilterValues: [],
  historicoFilterValues: [],
  tipoOperacaoFilterValues: [],
  movimentoTipoFilter: [],
  periodFrom: '',
  periodTo: ''
};

const EXTRATO_TH_CENTER =
  'whitespace-nowrap px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4';
const EXTRATO_TH_HISTORICO =
  'min-w-[14rem] px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4';
const EXTRATO_TD_CENTER = 'px-3 py-3 text-center sm:px-4';
const EXTRATO_TD_HISTORICO =
  'max-w-[16rem] truncate px-3 py-3 text-left text-gray-700 dark:text-gray-300 sm:px-4';

const skeletonPulse = 'animate-pulse rounded-md bg-gray-200/90 dark:bg-gray-700/80';

function ExtratoCaixaLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando extrato de caixa">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`h-11 w-11 shrink-0 rounded-lg sm:h-12 sm:w-12 ${skeletonPulse}`} />
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className={`h-3.5 w-24 ${skeletonPulse}`} />
                  <div className={`h-7 w-36 max-w-full ${skeletonPulse}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-gray-100 dark:border-gray-700/80">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 shrink-0 rounded-lg ${skeletonPulse}`} />
              <div className="space-y-2">
                <div className={`h-5 w-36 ${skeletonPulse}`} />
                <div className={`h-4 w-28 ${skeletonPulse}`} />
              </div>
            </div>
            <div className="flex gap-2 sm:justify-end">
              <div className={`h-10 min-w-[240px] flex-1 sm:w-72 ${skeletonPulse}`} />
              <div className={`h-10 w-10 shrink-0 ${skeletonPulse}`} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          <div className={`mx-3 mb-3 mt-4 h-4 w-48 sm:mx-6 ${skeletonPulse}`} />
          <div className="space-y-0 border-t border-gray-100 dark:border-gray-700/80">
            <div className={`mx-3 my-3 h-9 rounded-lg sm:mx-4 ${skeletonPulse}`} />
            {Array.from({ length: 8 }).map((_, row) => (
              <div
                key={row}
                className="flex gap-3 border-b border-gray-100 px-3 py-3 last:border-0 dark:border-gray-700/60 sm:px-4"
              >
                <div className={`h-4 w-12 shrink-0 ${skeletonPulse}`} />
                <div className={`h-4 min-w-[8rem] flex-1 ${skeletonPulse}`} />
                <div className={`hidden h-4 w-20 sm:block ${skeletonPulse}`} />
                <div className={`hidden h-4 w-24 md:block ${skeletonPulse}`} />
                <div className={`hidden h-4 w-16 lg:block ${skeletonPulse}`} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-gray-100 px-4 py-4 dark:border-gray-700/80 sm:px-6">
            <div className={`h-4 w-40 ${skeletonPulse}`} />
            <div className="flex gap-2">
              <div className={`h-9 w-20 ${skeletonPulse}`} />
              <div className={`h-9 w-20 ${skeletonPulse}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExtratoCaixaRefetchBar() {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-red-200/80 bg-red-50/90 px-4 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      <span>Atualizando movimentações do extrato…</span>
    </div>
  );
}

interface ExtratoItemsListProps {
  items: ExtratoCaixaItem[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onOpenFilters: () => void;
  hasActiveFilters: boolean;
  emptyMessage: string;
}

function ExtratoItemsList({
  items,
  searchQuery,
  onSearchQueryChange,
  searchInputRef,
  onOpenFilters,
  hasActiveFilters,
  emptyMessage
}: ExtratoItemsListProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / EXTRATO_ITEMS_PER_PAGE));
  const showPagination = items.length > EXTRATO_ITEMS_PER_PAGE;

  useEffect(() => {
    setCurrentPage(1);
  }, [items]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * EXTRATO_ITEMS_PER_PAGE;
    return items.slice(start, start + EXTRATO_ITEMS_PER_PAGE);
  }, [items, currentPage]);

  const rangeStart = showPagination ? (currentPage - 1) * EXTRATO_ITEMS_PER_PAGE + 1 : 1;
  const rangeEnd = showPagination
    ? Math.min(currentPage * EXTRATO_ITEMS_PER_PAGE, items.length)
    : items.length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b-0 !pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
              <CalendarDays className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Movimentações
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {items.length} {items.length === 1 ? 'movimentação' : 'movimentações'}
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Pesquisar movimentação..."
                className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => onSearchQueryChange('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onOpenFilters}
              className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                hasActiveFilters
                  ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
              aria-label="Abrir filtro"
              title={hasActiveFilters ? 'Filtros ativos' : 'Filtro'}
            >
              <Filter className="h-4 w-4" />
              {hasActiveFilters ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
              ) : null}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="!pt-0 px-0 pb-0">
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Wallet className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
              <p className="text-gray-600 dark:text-gray-400">{emptyMessage}</p>
            </div>
          ) : (
            <>
            <div className="mb-2 flex flex-col gap-1 px-3 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-6">
              <span>
                Mostrando {rangeStart} a {rangeEnd} de {items.length} movimentações
              </span>
              <span>
                Página {currentPage} de {totalPages}
              </span>
            </div>
          <div className="overflow-x-auto">
            <table className="min-w-[64rem] w-full text-sm">
              <thead className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <tr>
                  <th className={EXTRATO_TH_CENTER}>ID</th>
                  <th className={EXTRATO_TH_HISTORICO}>Histórico</th>
                  <th className={EXTRATO_TH_CENTER}>Centro de Custo</th>
                  <th className={EXTRATO_TH_CENTER}>Natureza Financeira</th>
                  <th className={EXTRATO_TH_CENTER}>Data de Compensação</th>
                  <th className={EXTRATO_TH_CENTER}>Fornecedor</th>
                  <th className={EXTRATO_TH_CENTER}>Filial</th>
                  <th className={EXTRATO_TH_CENTER}>Tipo operação</th>
                  <th className={EXTRATO_TH_CENTER}>Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {paginatedItems.map((item, index) => {
                  const ccLabel = displayCcLabel(item);
                  const natLabel = displayNatLabel(item);
                  const rowIndex = (currentPage - 1) * EXTRATO_ITEMS_PER_PAGE + index;
                  return (
                  <tr
                    key={`${item.idxcx ?? ''}-${item.data}-${item.dataCompensacao}-${rowIndex}`}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td
                      className={`${EXTRATO_TD_CENTER} whitespace-nowrap font-mono text-gray-500 dark:text-gray-400`}
                    >
                      {item.idxcx ?? '—'}
                    </td>
                    <td className={EXTRATO_TD_HISTORICO} title={item.historico || undefined}>
                      {item.historico || '—'}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} max-w-[12rem] truncate text-gray-900 dark:text-gray-100`}
                      title={
                        item.codCCusto && ccLabel !== item.codCCusto
                          ? `${ccLabel} (${item.codCCusto})`
                          : ccLabel || item.codCCusto || undefined
                      }
                    >
                      {ccLabel}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} max-w-[14rem] truncate text-gray-900 dark:text-gray-100`}
                      title={
                        item.codNatFinanceira && natLabel !== item.codNatFinanceira
                          ? item.codNatFinanceira
                          : undefined
                      }
                    >
                      {natLabel}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} whitespace-nowrap text-gray-900 dark:text-gray-100`}
                    >
                      {formatDate(item.dataCompensacao)}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} max-w-[12rem] truncate text-gray-700 dark:text-gray-300`}
                      title={item.fornecedor || undefined}
                    >
                      {item.fornecedor || '—'}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} whitespace-nowrap text-gray-700 dark:text-gray-300`}
                    >
                      {item.codFilial ?? '—'}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} max-w-[10rem] truncate text-gray-700 dark:text-gray-300`}
                      title={item.tipoOperacao || undefined}
                    >
                      {item.tipoOperacao || '—'}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} whitespace-nowrap font-medium ${
                        itemSaldoLinha(item) > 0
                          ? 'text-green-600 dark:text-green-400'
                          : itemSaldoLinha(item) < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {formatCurrency(itemSaldoLinha(item))}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {showPagination ? (
            <div className="border-t border-gray-200 px-3 py-4 dark:border-gray-700 sm:px-6">
              <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Anterior
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNumber: number;
                    if (totalPages <= 5) {
                      pageNumber = i + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
                    } else {
                      pageNumber = currentPage - 2 + i;
                    }
                    const isActive = pageNumber === currentPage;
                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setCurrentPage(pageNumber)}
                        className={`min-w-[2.25rem] rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-red-600 text-white'
                            : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Próxima
                  </button>
              </div>
            </div>
          ) : null}
            </>
          )}
      </CardContent>
    </Card>
  );
}

export default function AnaliseExtratoPage() {
  const pageTitle = 'Extrato de Caixa';
  const pageSubtitle = 'Movimentações do extrato de caixa integradas ao TOTVS RM';

  const { isDepartmentFinanceiro, userPosition, can, user } = usePermissions();
  const isAdministrator = userPosition === 'Administrador';
  const canAccess =
    isAdministrator ||
    isDepartmentFinanceiro ||
    can(pathToModuleKey('/ponto/financeiro/analise-extrato'));

  const [ccFilterCodes, setCcFilterCodes] = useState<string[]>([]);
  const [natureFilterCodes, setNatureFilterCodes] = useState<string[]>([]);
  const [filialFilterIds, setFilialFilterIds] = useState<string[]>([]);
  const [fornecedorFilterValues, setFornecedorFilterValues] = useState<string[]>([]);
  const [historicoFilterValues, setHistoricoFilterValues] = useState<string[]>([]);
  const [tipoOperacaoFilterValues, setTipoOperacaoFilterValues] = useState<string[]>([]);
  const [movimentoTipoFilter, setMovimentoTipoFilter] = useState<string[]>([]);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<ExtratoFilterDraft>(EMPTY_FILTER_DRAFT);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filtersInitializedRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => searchInputRef.current?.blur());
    return () => cancelAnimationFrame(id);
  }, []);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['extrato-caixa'],
    queryFn: async () => {
      const res = await api.get<ExtratoCaixaApiResponse>('/extrato-caixa', { timeout: 180000 });
      return res.data;
    },
    enabled: canAccess,
  });

  const items = data?.data?.items ?? [];

  const filialFilterOptions = useMemo(() => {
    const codes = new Set<number>();
    for (const item of items) {
      if (item.codFilial != null) codes.add(item.codFilial);
    }
    return Array.from(codes)
      .sort((a, b) => a - b)
      .map((code) => ({
        value: String(code),
        label: `Filial ${code}`,
        searchText: String(code),
      }));
  }, [items]);

  const ccFilterOptions = useMemo(() => {
    const byCode = new Map<string, { value: string; label: string; searchText: string }>();
    for (const item of items) {
      const code = item.codCCusto.trim();
      if (!code) continue;
      const key = code.toUpperCase();
      if (byCode.has(key)) continue;
      const label = item.ccusto.trim() || code;
      byCode.set(key, { value: code, label, searchText: `${code} ${label}` });
    }
    return Array.from(byCode.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [items]);

  const natureFilterOptions = useMemo(() => {
    const byCode = new Map<string, { value: string; label: string; searchText: string }>();
    for (const item of items) {
      const code = normalizeBudgetNatureCode(item.codNatFinanceira);
      if (!code) continue;
      const label = item.natureza.trim() || code;
      const key = code.toUpperCase();
      if (byCode.has(key)) continue;
      byCode.set(key, { value: code, label, searchText: `${code} ${label}` });
    }
    return Array.from(byCode.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [items]);

  const fornecedorFilterOptions = useMemo(() => {
    const names = new Set<string>();
    for (const item of items) {
      const n = item.fornecedor.trim();
      if (n) names.add(n);
    }
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((name) => ({ value: name, label: name, searchText: name }));
  }, [items]);

  const historicoFilterOptions = useMemo(() => {
    const textos = new Set<string>();
    for (const item of items) {
      const h = item.historico.trim();
      if (h) textos.add(h);
    }
    return Array.from(textos)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((texto) => ({ value: texto, label: texto, searchText: texto }));
  }, [items]);

  const tipoOperacaoFilterOptions = useMemo(() => {
    const tipos = new Set<string>();
    for (const item of items) {
      const t = item.tipoOperacao.trim();
      if (t) tipos.add(t);
    }
    return Array.from(tipos)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((tipo) => ({ value: tipo, label: tipo, searchText: tipo }));
  }, [items]);

  const filialAllValues = useMemo(
    () => filialFilterOptions.map((o) => o.value),
    [filialFilterOptions]
  );
  const ccAllValues = useMemo(() => ccFilterOptions.map((o) => o.value), [ccFilterOptions]);
  const natureAllValues = useMemo(
    () => natureFilterOptions.map((o) => o.value),
    [natureFilterOptions]
  );
  const fornecedorAllValues = useMemo(
    () => fornecedorFilterOptions.map((o) => o.value),
    [fornecedorFilterOptions]
  );
  const historicoAllValues = useMemo(
    () => historicoFilterOptions.map((o) => o.value),
    [historicoFilterOptions]
  );
  const tipoOperacaoAllValues = useMemo(
    () => tipoOperacaoFilterOptions.map((o) => o.value),
    [tipoOperacaoFilterOptions]
  );

  const buildDefaultFilters = useCallback(
    (): ExtratoFilterDraft => ({
      ccFilterCodes: [...ccAllValues],
      natureFilterCodes: [...natureAllValues],
      filialFilterIds: [...filialAllValues],
      fornecedorFilterValues: [...fornecedorAllValues],
      historicoFilterValues: [...historicoAllValues],
      tipoOperacaoFilterValues: [...tipoOperacaoAllValues],
      movimentoTipoFilter: [...MOVIMENTO_TIPO_ALL_VALUES],
      periodFrom: '',
      periodTo: ''
    }),
    [
      ccAllValues,
      natureAllValues,
      filialAllValues,
      fornecedorAllValues,
      historicoAllValues,
      tipoOperacaoAllValues
    ]
  );

  useEffect(() => {
    if (items.length === 0) return;
    if (filtersInitializedRef.current) return;
    const defaults = buildDefaultFilters();
    setCcFilterCodes(defaults.ccFilterCodes);
    setNatureFilterCodes(defaults.natureFilterCodes);
    setFilialFilterIds(defaults.filialFilterIds);
    setFornecedorFilterValues(defaults.fornecedorFilterValues);
    setHistoricoFilterValues(defaults.historicoFilterValues);
    setTipoOperacaoFilterValues(defaults.tipoOperacaoFilterValues);
    setMovimentoTipoFilter(defaults.movimentoTipoFilter);
    filtersInitializedRef.current = true;
  }, [items.length, buildDefaultFilters]);

  const openFiltersModal = () => {
    const withAllIfEmpty = (applied: string[], all: string[]) =>
      applied.length === 0 && all.length > 0 ? [...all] : [...applied];

    setFilterDraft({
      ccFilterCodes: withAllIfEmpty(ccFilterCodes, ccAllValues),
      natureFilterCodes: withAllIfEmpty(natureFilterCodes, natureAllValues),
      filialFilterIds: withAllIfEmpty(filialFilterIds, filialAllValues),
      fornecedorFilterValues: withAllIfEmpty(fornecedorFilterValues, fornecedorAllValues),
      historicoFilterValues: withAllIfEmpty(historicoFilterValues, historicoAllValues),
      tipoOperacaoFilterValues: withAllIfEmpty(
        tipoOperacaoFilterValues,
        tipoOperacaoAllValues
      ),
      movimentoTipoFilter: withAllIfEmpty(movimentoTipoFilter, MOVIMENTO_TIPO_ALL_VALUES),
      periodFrom,
      periodTo
    });
    setIsFiltersModalOpen(true);
  };

  const closeFiltersModal = () => setIsFiltersModalOpen(false);

  const applyFiltersModal = () => {
    setCcFilterCodes(filterDraft.ccFilterCodes);
    setNatureFilterCodes(filterDraft.natureFilterCodes);
    setFilialFilterIds(filterDraft.filialFilterIds);
    setFornecedorFilterValues(filterDraft.fornecedorFilterValues);
    setHistoricoFilterValues(filterDraft.historicoFilterValues);
    setTipoOperacaoFilterValues(filterDraft.tipoOperacaoFilterValues);
    setMovimentoTipoFilter(filterDraft.movimentoTipoFilter);
    setPeriodFrom(filterDraft.periodFrom);
    setPeriodTo(filterDraft.periodTo);
    setIsFiltersModalOpen(false);
  };

  const clearFilterDraft = () => setFilterDraft(buildDefaultFilters());

  const hasCcFilter = isMultiselectFilterActive(ccFilterCodes, ccAllValues);
  const hasNatureFilter = isMultiselectFilterActive(natureFilterCodes, natureAllValues);
  const hasFilialFilter = isMultiselectFilterActive(filialFilterIds, filialAllValues);
  const hasFornecedorFilter = isMultiselectFilterActive(fornecedorFilterValues, fornecedorAllValues);
  const hasHistoricoFilter = isMultiselectFilterActive(historicoFilterValues, historicoAllValues);
  const hasTipoOperacaoFilter = isMultiselectFilterActive(
    tipoOperacaoFilterValues,
    tipoOperacaoAllValues
  );
  const hasMovimentoTipoFilter = isMultiselectFilterActive(
    movimentoTipoFilter,
    MOVIMENTO_TIPO_ALL_VALUES
  );
  const hasPeriodFilter = Boolean(periodFrom || periodTo);
  const hasSearchQuery = searchQuery.trim().length > 0;

  const hasActiveFilters =
    hasCcFilter ||
    hasNatureFilter ||
    hasFilialFilter ||
    hasFornecedorFilter ||
    hasHistoricoFilter ||
    hasTipoOperacaoFilter ||
    hasMovimentoTipoFilter ||
    hasPeriodFilter;
  const hasListRefinement = hasActiveFilters || hasSearchQuery;

  const configured = data?.data?.configured ?? false;
  const pathFailures = data?.data?.pathFailures ?? [];
  const apiMessage = data?.message || data?.data?.message || null;
  const loadFailed = data?.success === false;

  const filteredItems = useMemo(
    () =>
      sortItemsByDateDesc(
        items.filter(
          (item) =>
            extratoMatchesAnyCcCodes(item.codCCusto, ccFilterCodes, ccAllValues) &&
            extratoMatchesAnyNatureCodesFiltered(
              item.codNatFinanceira,
              natureFilterCodes,
              natureAllValues
            ) &&
            extratoMatchesAnyFilialIds(item.codFilial, filialFilterIds, filialAllValues) &&
            extratoMatchesAnyFornecedor(item.fornecedor, fornecedorFilterValues, fornecedorAllValues) &&
            extratoMatchesAnyHistorico(item.historico, historicoFilterValues, historicoAllValues) &&
            extratoMatchesAnyTipoOperacao(
              item.tipoOperacao,
              tipoOperacaoFilterValues,
              tipoOperacaoAllValues
            ) &&
            extratoMatchesMovimentoTipo(item, movimentoTipoFilter, MOVIMENTO_TIPO_ALL_VALUES) &&
            itemMatchesCompensacaoPeriod(item, periodFrom, periodTo) &&
            extratoItemMatchesSearch(item, searchQuery)
        )
      ),
    [
      items,
      ccFilterCodes,
      natureFilterCodes,
      filialFilterIds,
      fornecedorFilterValues,
      historicoFilterValues,
      tipoOperacaoFilterValues,
      movimentoTipoFilter,
      periodFrom,
      periodTo,
      searchQuery,
      ccAllValues,
      natureAllValues,
      filialAllValues,
      fornecedorAllValues,
      historicoAllValues,
      tipoOperacaoAllValues
    ]
  );

  const extratoStats = useMemo(() => {
    let totalEntrada = 0;
    let totalSaida = 0;
    let qtdEntrada = 0;
    let qtdSaida = 0;
    for (const item of filteredItems) {
      const ent = itemEntrada(item);
      const sai = itemSaidaAbs(item);
      if (ent > 0) {
        totalEntrada += ent;
        qtdEntrada += 1;
      }
      if (itemHasSaida(item)) {
        totalSaida += sai;
        qtdSaida += 1;
      }
    }
    return {
      totalEntrada,
      totalSaida,
      qtdEntrada,
      qtdSaida,
      saldoLiquido: totalEntrada - totalSaida
    };
  }, [filteredItems]);

  const showDashboards =
    !isLoading && !isError && configured && !loadFailed;

  return (
    <ProtectedRoute route="/ponto/financeiro/analise-extrato">
      <MainLayout userRole="EMPLOYEE" userName={user?.name ?? ''}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
              {pageTitle}
            </h1>
            <p className="mt-2 text-sm text-gray-600 sm:text-base dark:text-gray-400">
              {pageSubtitle}
            </p>
          </div>

          {pathFailures.length > 0 ? (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 text-sm text-amber-800 dark:text-amber-200">
                    <p className="font-medium">
                      Algumas consultas do extrato no TOTVS RM não retornaram dados.
                    </p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-amber-700 dark:text-amber-300">
                      {pathFailures.map((f) => (
                        <li key={f.path} className="break-all">
                          <span className="font-mono text-xs">{f.path}</span>
                          {f.error ? ` — ${f.error}` : null}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-amber-700 dark:text-amber-300">
                      O ano pode aparecer no filtro mesmo sem movimentações se a consulta falhou.
                      Verifique no RM se a consulta SQL EXTRATOCX2026 existe e está publicada.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {showDashboards ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-green-100 p-2 sm:p-3 dark:bg-green-900/30">
                      <ArrowDownLeft className="h-5 w-5 text-green-600 dark:text-green-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Entradas{' '}
                        <span className="text-gray-400 dark:text-gray-500">
                          ({extratoStats.qtdEntrada})
                        </span>
                      </p>
                      <p className="mt-1 truncate text-lg font-bold text-green-700 dark:text-green-300 sm:text-2xl">
                        {formatCurrency(extratoStats.totalEntrada)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                      <ArrowUpRight className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Saídas{' '}
                        <span className="text-gray-400 dark:text-gray-500">
                          ({extratoStats.qtdSaida})
                        </span>
                      </p>
                      <p className="mt-1 truncate text-lg font-bold text-red-700 dark:text-red-300 sm:text-2xl">
                        {formatCurrency(extratoStats.totalSaida)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-yellow-100 p-2 sm:p-3 dark:bg-yellow-900/30">
                      <Wallet className="h-5 w-5 text-yellow-600 dark:text-yellow-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Saldo líquido
                      </p>
                      <p
                        className={`mt-1 truncate text-lg font-bold sm:text-2xl ${
                          extratoStats.saldoLiquido >= 0
                            ? 'text-gray-900 dark:text-gray-100'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {formatCurrency(extratoStats.saldoLiquido)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {isLoading ? (
            <ExtratoCaixaLoadingSkeleton />
          ) : isError ? (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
                <p className="text-gray-600 dark:text-gray-400">Erro ao carregar extrato de caixa</p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                  {(error as Error)?.message || 'Tente novamente.'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-4 text-sm font-medium text-red-600 underline dark:text-red-400"
                >
                  Tentar novamente
                </button>
              </CardContent>
            </Card>
          ) : !configured ? (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-400" />
                <p className="text-gray-600 dark:text-gray-400">
                  {apiMessage || 'Integração TOTVS RM não configurada no servidor.'}
                </p>
              </CardContent>
            </Card>
          ) : loadFailed ? (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
                <p className="text-gray-600 dark:text-gray-400">Falha ao consultar o TOTVS RM</p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">{apiMessage}</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-4 text-sm font-medium text-red-600 underline dark:text-red-400"
                >
                  Tentar novamente
                </button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {isFetching ? <ExtratoCaixaRefetchBar /> : null}
              <ExtratoItemsList
                items={filteredItems}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                searchInputRef={searchInputRef}
                onOpenFilters={openFiltersModal}
                hasActiveFilters={hasActiveFilters}
                emptyMessage={
                  hasListRefinement
                    ? 'Nenhuma movimentação encontrada com os filtros ou termo de busca aplicados.'
                    : 'Nenhuma movimentação encontrada no extrato.'
                }
              />
            </div>
          )}
        </div>

        <Modal
          isOpen={isFiltersModalOpen}
          onClose={closeFiltersModal}
          title="Filtros"
          size="lg"
        >
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Período (data de compensação)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="extrato-filter-from"
                    className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    De
                  </label>
                  <input
                    id="extrato-filter-from"
                    type="date"
                    value={filterDraft.periodFrom}
                    onChange={(e) =>
                      setFilterDraft((d) => ({ ...d, periodFrom: e.target.value }))
                    }
                    className={FILTER_SELECT_CLASS}
                  />
                </div>
                <div>
                  <label
                    htmlFor="extrato-filter-to"
                    className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Até
                  </label>
                  <input
                    id="extrato-filter-to"
                    type="date"
                    value={filterDraft.periodTo}
                    onChange={(e) =>
                      setFilterDraft((d) => ({ ...d, periodTo: e.target.value }))
                    }
                    min={filterDraft.periodFrom || undefined}
                    className={FILTER_SELECT_CLASS}
                  />
                </div>
              </div>
            </div>

            <div>
              <MultiSelectSearchDropdown
                label="Entradas e Saídas"
                options={[...MOVIMENTO_TIPO_FILTER_OPTIONS]}
                selected={filterDraft.movimentoTipoFilter}
                onChange={(ids) =>
                  setFilterDraft((d) => ({ ...d, movimentoTipoFilter: ids }))
                }
                disabled={isLoading}
                placeholder="Entradas e saídas"
                searchPlaceholder="Pesquisar..."
                emptyOptionsMessage="Nenhuma opção disponível."
                emptySearchMessage="Nenhuma opção encontrada."
                icon={<Wallet className="h-4 w-4" aria-hidden />}
                menuInline
              />
            </div>

            <div>
              <MultiSelectSearchDropdown
                label="Filial"
                options={filialFilterOptions}
                selected={filterDraft.filialFilterIds}
                onChange={(ids) => setFilterDraft((d) => ({ ...d, filialFilterIds: ids }))}
                disabled={isLoading}
                placeholder="Todas as filiais"
                searchPlaceholder="Pesquisar filial..."
                emptyOptionsMessage="Nenhuma filial no extrato carregado."
                emptySearchMessage="Nenhuma filial encontrada."
                icon={<Building2 className="h-4 w-4" aria-hidden />}
                menuInline
              />
            </div>

            <div>
              <MultiSelectSearchDropdown
                label="Centro de Custo"
                options={ccFilterOptions}
                selected={filterDraft.ccFilterCodes}
                onChange={(ids) => setFilterDraft((d) => ({ ...d, ccFilterCodes: ids }))}
                disabled={isLoading}
                placeholder="Todos os centros de custo"
                searchPlaceholder="Pesquisar centro de custo..."
                emptyOptionsMessage="Nenhum centro de custo no extrato carregado."
                emptySearchMessage="Nenhum centro de custo encontrado."
                icon={<ListPlus className="h-4 w-4" aria-hidden />}
                menuInline
              />
            </div>
            <div>
              <MultiSelectSearchDropdown
                label="Natureza Financeira"
                options={natureFilterOptions}
                selected={filterDraft.natureFilterCodes}
                onChange={(ids) => setFilterDraft((d) => ({ ...d, natureFilterCodes: ids }))}
                disabled={isLoading}
                placeholder="Todas as naturezas financeiras"
                searchPlaceholder="Pesquisar natureza ou código..."
                emptyOptionsMessage="Nenhuma natureza no extrato carregado."
                emptySearchMessage="Nenhuma natureza encontrada."
                icon={<BookOpen className="h-4 w-4" aria-hidden />}
                menuInline
              />
            </div>

            <div>
              <MultiSelectSearchDropdown
                label="Fornecedor"
                options={fornecedorFilterOptions}
                selected={filterDraft.fornecedorFilterValues}
                onChange={(ids) =>
                  setFilterDraft((d) => ({ ...d, fornecedorFilterValues: ids }))
                }
                disabled={isLoading}
                placeholder="Todos os fornecedores"
                searchPlaceholder="Pesquisar fornecedor..."
                emptyOptionsMessage="Nenhum fornecedor no extrato carregado."
                emptySearchMessage="Nenhum fornecedor encontrado."
                icon={<Building2 className="h-4 w-4" aria-hidden />}
                menuInline
              />
            </div>

            <div>
              <MultiSelectSearchDropdown
                label="Histórico"
                options={historicoFilterOptions}
                selected={filterDraft.historicoFilterValues}
                onChange={(ids) =>
                  setFilterDraft((d) => ({ ...d, historicoFilterValues: ids }))
                }
                disabled={isLoading}
                placeholder="Todos os históricos"
                searchPlaceholder="Pesquisar histórico..."
                emptyOptionsMessage="Nenhum histórico no extrato carregado."
                emptySearchMessage="Nenhum histórico encontrado."
                icon={<FileText className="h-4 w-4" aria-hidden />}
                menuInline
              />
            </div>

            <div>
              <MultiSelectSearchDropdown
                label="Tipo de Operação"
                options={tipoOperacaoFilterOptions}
                selected={filterDraft.tipoOperacaoFilterValues}
                onChange={(ids) =>
                  setFilterDraft((d) => ({ ...d, tipoOperacaoFilterValues: ids }))
                }
                disabled={isLoading}
                placeholder="Todos os tipos de operação"
                searchPlaceholder="Pesquisar tipo..."
                emptyOptionsMessage="Nenhum tipo de operação no extrato carregado."
                emptySearchMessage="Nenhum tipo encontrado."
                icon={<ClipboardList className="h-4 w-4" aria-hidden />}
                menuInline
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={clearFilterDraft}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={applyFiltersModal}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

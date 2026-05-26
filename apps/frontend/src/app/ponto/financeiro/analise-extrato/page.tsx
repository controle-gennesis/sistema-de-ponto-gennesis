'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  Eye,
  Filter,
  BookOpen,
  ListPlus,
  Loader2,
  Search,
  Building2,
  FileDown,
  FileText,
  Wallet,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import {
  SEM_CENTRO_CUSTO_KEY,
  SEM_FORNECEDOR_KEY,
  SEM_NATUREZA_KEY,
  ajusteToExtratoItem,
  isExtratoAjusteManual
} from '@/lib/extratoCaixaAjuste';
import { extratoMatchesAnyNatureCodes, normalizeBudgetNatureCode } from '@/lib/budgetNatureMatch';
import {
  exportExtratoCaixaPdf,
  EXTRATO_RESUMO_TOP_SAIDA,
  getTopSaidaKeys,
  pickResumoRowsForPdf,
  type ExtratoCaixaPdfAjusteRow
} from '@/lib/exportExtratoCaixaPdf';
import {
  buildExtratoResumoPolo,
  comparePoloKeys,
  extratoMatchesAnyPoloKeys,
  poloGroupKey,
  resolveExtratoPolo
} from '@/lib/extratoCaixaPolo';
import {
  buildExtratoFiltrosDesmarcados,
  findMatchingExtratoFiltroSalvo,
  type ExtratoCaixaFiltroPayload,
  type ExtratoCaixaFiltroSalvo,
  type ExtratoFiltroAllValues,
  type ExtratoFiltroLabelMaps
} from '@/lib/extratoCaixaFiltrosSalvos';
import { ExtratoCaixaAjustesPanel } from './ExtratoCaixaAjustesPanel';
import { ExtratoFiltrosDesmarcadosResumo } from './ExtratoFiltrosDesmarcadosResumo';
import { ExtratoFiltrosSalvosPanel } from './ExtratoFiltrosSalvosPanel';
import {
  ExtratoExportPdfModal,
  type ExtratoPdfNatureMode
} from './ExtratoExportPdfModal';
import type { ExtratoCaixaApiResponse, ExtratoCaixaItem } from './extratoCaixaTypes';

const EXTRATO_ITEMS_PER_PAGE = 50;

/** Código da filial no RM → UF exibida no extrato. */
const FILIAL_UF_POR_CODIGO: Record<number, string> = {
  1: 'DF',
  2: 'RS',
  3: 'RN',
  4: 'PB',
  5: 'GO'
};

function formatFilialLabel(codFilial: number | null): string {
  if (codFilial == null) return 'Sem filial';
  const uf = FILIAL_UF_POR_CODIGO[codFilial];
  if (uf) return `FILIAL ${codFilial} - ${uf}`;
  return `Filial ${codFilial}`;
}

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

function formatIsoDateInputBr(value: string): string {
  const s = value.trim();
  if (!s) return '';
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
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

function extratoMatchesAnyCcCodes(
  codCCusto: string,
  selectedCcCodes: string[],
  allCcCodes: string[]
): boolean {
  if (multiselectFilterShowsAll(selectedCcCodes, allCcCodes)) return true;
  const code = codCCusto.trim();
  if (!code) return selectedCcCodes.includes(SEM_CENTRO_CUSTO_KEY);
  return selectedCcCodes.includes(code);
}

function extratoMatchesAnyFornecedor(
  fornecedor: string,
  selected: string[],
  allFornecedores: string[]
): boolean {
  if (multiselectFilterShowsAll(selected, allFornecedores)) return true;
  const v = fornecedor.trim();
  if (!v) return selected.includes(SEM_FORNECEDOR_KEY);
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
  const code = normalizeBudgetNatureCode(codNatFinanceira);
  if (!code) {
    return selectedNatureCodes.includes(SEM_NATUREZA_KEY);
  }
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

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez'
] as const;

type ExtratoResumoRow = {
  key: string;
  label: string;
  totalEntrada: number;
  totalSaida: number;
  totalValor: number;
};

function itemCompensacaoMonthKey(item: ExtratoCaixaItem): string | null {
  const data = item.dataCompensacao ?? item.data;
  if (!data) return null;
  const parts = parseCalendarDateParts(data);
  if (!parts) return null;
  return `${parts.y}-${String(parts.m).padStart(2, '0')}`;
}

function buildExtratoResumoMensal(items: ExtratoCaixaItem[]): ExtratoResumoRow[] {
  const map = new Map<string, { entrada: number; saida: number; valor: number }>();

  for (const item of items) {
    const key = itemCompensacaoMonthKey(item);
    if (!key) continue;
    const cur = map.get(key) ?? { entrada: 0, saida: 0, valor: 0 };
    cur.entrada += itemEntrada(item);
    cur.saida += item.saida;
    cur.valor += itemSaldoLinha(item);
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, totals]) => {
      const month = Number(monthKey.slice(5, 7));
      const year = monthKey.slice(0, 4);
      const short = MESES_CURTOS[month - 1] ?? monthKey;
      const label = `${short} / ${year}`;
      return {
        key: monthKey,
        label,
        totalEntrada: totals.entrada,
        totalSaida: totals.saida,
        totalValor: totals.valor
      };
    });
}

function ccGroupKey(item: ExtratoCaixaItem): string {
  const code = item.codCCusto.trim();
  return code ? code.toUpperCase() : SEM_CENTRO_CUSTO_KEY;
}

function ccGroupLabel(item: ExtratoCaixaItem): string {
  const name = item.ccusto.trim();
  if (name) return name;
  const code = item.codCCusto.trim();
  if (!code) return 'Sem centro de custo';
  return code;
}

function buildExtratoResumoCentroCusto(items: ExtratoCaixaItem[]): ExtratoResumoRow[] {
  const map = new Map<
    string,
    { label: string; entrada: number; saida: number; valor: number }
  >();

  for (const item of items) {
    const key = ccGroupKey(item);
    const cur = map.get(key) ?? {
      label: ccGroupLabel(item),
      entrada: 0,
      saida: 0,
      valor: 0
    };
    cur.entrada += itemEntrada(item);
    cur.saida += item.saida;
    cur.valor += itemSaldoLinha(item);
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .sort(([, a], [, b]) => a.label.localeCompare(b.label, 'pt-BR'))
    .map(([key, totals]) => ({
      key,
      label: totals.label,
      totalEntrada: totals.entrada,
      totalSaida: totals.saida,
      totalValor: totals.valor
    }));
}

function natureGroupKey(item: ExtratoCaixaItem): string {
  const code =
    normalizeBudgetNatureCode(item.codNatFinanceira) || item.codNatFinanceira.trim();
  return code ? code.toUpperCase() : SEM_NATUREZA_KEY;
}

function natureGroupLabel(item: ExtratoCaixaItem): string {
  const name = item.natureza.trim();
  if (name) return name;
  const code = item.codNatFinanceira.trim();
  if (!code) return 'Sem natureza financeira';
  return code;
}

function buildExtratoResumoNatureza(items: ExtratoCaixaItem[]): ExtratoResumoRow[] {
  const map = new Map<
    string,
    { label: string; entrada: number; saida: number; valor: number }
  >();

  for (const item of items) {
    const key = natureGroupKey(item);
    const cur = map.get(key) ?? {
      label: natureGroupLabel(item),
      entrada: 0,
      saida: 0,
      valor: 0
    };
    cur.entrada += itemEntrada(item);
    cur.saida += item.saida;
    cur.valor += itemSaldoLinha(item);
    map.set(key, cur);
  }

  return Array.from(map.entries()).map(([key, totals]) => ({
    key,
    label: totals.label,
    totalEntrada: totals.entrada,
    totalSaida: totals.saida,
    totalValor: totals.valor
  }));
}

type ExtratoResumoTopExpandLabels = {
  title: string;
  rowLabelHeader: string;
  entityPlural: string;
  addDropdownLabel: string;
  addPlaceholder: string;
  addSearchPlaceholder: string;
  emptyOptionsMessage: string;
  emptySearchMessage: string;
  allVisibleMessage: string;
  clearAddedLabel: string;
};

function ExtratoResumoTopExpandSection({
  allRows,
  detailItems,
  getItemGroupKey,
  labels,
  icon,
  dropdownIcon,
  topLimit = EXTRATO_RESUMO_TOP_SAIDA
}: {
  allRows: ExtratoResumoRow[];
  detailItems: ExtratoCaixaItem[];
  getItemGroupKey: (item: ExtratoCaixaItem) => string | null;
  labels: ExtratoResumoTopExpandLabels;
  icon: React.ReactNode;
  dropdownIcon: React.ReactNode;
  topLimit?: number;
}) {
  const [extraKeys, setExtraKeys] = useState<string[]>([]);

  const defaultKeys = useMemo(() => getTopSaidaKeys(allRows, topLimit), [allRows, topLimit]);

  useEffect(() => {
    setExtraKeys((prev) => prev.filter((key) => allRows.some((row) => row.key === key)));
  }, [allRows]);

  const defaultKeySet = useMemo(() => new Set(defaultKeys), [defaultKeys]);

  const visibleKeySet = useMemo(() => {
    const keys = new Set(defaultKeys);
    for (const key of extraKeys) keys.add(key);
    return keys;
  }, [defaultKeys, extraKeys]);

  const visibleRows = useMemo(() => {
    const byKey = new Map(allRows.map((row) => [row.key, row]));
    const defaultRows = defaultKeys
      .map((key) => byKey.get(key))
      .filter((row): row is ExtratoResumoRow => row != null);
    const extraRows = extraKeys
      .filter((key) => !defaultKeySet.has(key))
      .map((key) => byKey.get(key))
      .filter((row): row is ExtratoResumoRow => row != null)
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    return [...defaultRows, ...extraRows];
  }, [allRows, defaultKeys, defaultKeySet, extraKeys]);

  const extraKeySet = useMemo(() => new Set(extraKeys), [extraKeys]);

  /** Inclui itens já adicionados (para desmarcar) e os que ainda podem ser incluídos. */
  const dropdownOptions = useMemo(
    () =>
      allRows
        .filter((row) => extraKeySet.has(row.key) || !visibleKeySet.has(row.key))
        .map((row) => ({
          value: row.key,
          label: row.label,
          searchText: row.label
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [allRows, extraKeySet, visibleKeySet]
  );

  const canAddMore = useMemo(
    () => allRows.some((row) => !visibleKeySet.has(row.key)),
    [allRows, visibleKeySet]
  );

  const showDropdown = extraKeys.length > 0 || canAddMore;

  const handleExtraChange = useCallback(
    (ids: string[]) => {
      setExtraKeys(ids.filter((id) => !defaultKeySet.has(id)));
    },
    [defaultKeySet]
  );

  const handleClearAdded = useCallback(() => {
    setExtraKeys([]);
  }, []);

  if (allRows.length === 0) return null;

  const hiddenCount = Math.max(0, allRows.length - visibleRows.length);
  const topSaidaShown = defaultKeys.length;

  return (
    <ExtratoResumoTable
      title={labels.title}
      detailItems={detailItems}
      getItemGroupKey={getItemGroupKey}
      subtitle={`Exibindo as ${topSaidaShown} maiores saídas${
        extraKeys.length > 0 ? ` e mais ${extraKeys.length} adicionado(s).` : '.'
      }${
        hiddenCount > 0 ? ` ${hiddenCount} ${labels.entityPlural} oculto(s).` : ' '
      }Use o menu abaixo para incluir ou remover itens adicionados (desmarque no menu ou use Limpar adicionados).`}
      icon={icon}
      rowLabelHeader={labels.rowLabelHeader}
      rows={visibleRows}
      totalRowLabel="Total exibido"
      headerActions={
        showDropdown ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <MultiSelectSearchDropdown
                label={labels.addDropdownLabel}
                options={dropdownOptions}
                selected={extraKeys}
                onChange={handleExtraChange}
                placeholder={labels.addPlaceholder}
                searchPlaceholder={labels.addSearchPlaceholder}
                emptyOptionsMessage={labels.emptyOptionsMessage}
                emptySearchMessage={labels.emptySearchMessage}
                icon={dropdownIcon}
                menuInline
              />
            </div>
            {extraKeys.length > 0 ? (
              <button
                type="button"
                onClick={handleClearAdded}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {labels.clearAddedLabel}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">{labels.allVisibleMessage}</p>
        )
      }
    />
  );
}

function fornecedorGroupKey(item: ExtratoCaixaItem): string {
  const name = item.fornecedor.trim();
  return name ? name.toUpperCase() : SEM_FORNECEDOR_KEY;
}

function fornecedorGroupLabel(item: ExtratoCaixaItem): string {
  return item.fornecedor.trim() || 'Sem fornecedor';
}

function buildExtratoResumoFornecedor(items: ExtratoCaixaItem[]): ExtratoResumoRow[] {
  const map = new Map<
    string,
    { label: string; entrada: number; saida: number; valor: number }
  >();

  for (const item of items) {
    const key = fornecedorGroupKey(item);
    const cur = map.get(key) ?? {
      label: fornecedorGroupLabel(item),
      entrada: 0,
      saida: 0,
      valor: 0
    };
    cur.entrada += itemEntrada(item);
    cur.saida += item.saida;
    cur.valor += itemSaldoLinha(item);
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .sort(([, a], [, b]) => a.label.localeCompare(b.label, 'pt-BR'))
    .map(([key, totals]) => ({
      key,
      label: totals.label,
      totalEntrada: totals.entrada,
      totalSaida: totals.saida,
      totalValor: totals.valor
    }));
}

function valorCellClass(value: number): string {
  if (value > 0) return 'text-green-700 dark:text-green-300';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-700 dark:text-gray-300';
}

const RESUMO_DETALHE_LIMITE = 150;

function itemDetailSortKey(item: ExtratoCaixaItem): number {
  const d = item.dataCompensacao ?? item.data;
  if (!d) return Number.NEGATIVE_INFINITY;
  const parts = parseCalendarDateParts(d);
  if (!parts) return Number.NEGATIVE_INFINITY;
  return new Date(parts.y, parts.m - 1, parts.d).getTime();
}

function sortItemsForResumoDetalhe(items: ExtratoCaixaItem[]): ExtratoCaixaItem[] {
  return [...items].sort((a, b) => itemDetailSortKey(b) - itemDetailSortKey(a));
}

function ExtratoResumoDetalheModal({
  isOpen,
  onClose,
  rowLabelHeader,
  row,
  items
}: {
  isOpen: boolean;
  onClose: () => void;
  rowLabelHeader: string;
  row: ExtratoResumoRow | null;
  items: ExtratoCaixaItem[];
}) {
  const sorted = useMemo(() => sortItemsForResumoDetalhe(items), [items]);
  const visiveis = sorted.slice(0, RESUMO_DETALHE_LIMITE);
  const restante = sorted.length - visiveis.length;

  if (!row) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${rowLabelHeader}: ${row.label}`}
      size="xl"
    >
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-900/50 sm:grid-cols-3">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Saída</p>
          <p className={`font-semibold tabular-nums ${valorCellClass(row.totalSaida)}`}>
            {formatCurrency(row.totalSaida)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Entrada</p>
          <p className={`font-semibold tabular-nums ${valorCellClass(row.totalEntrada)}`}>
            {formatCurrency(row.totalEntrada)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Valor</p>
          <p className={`font-semibold tabular-nums ${valorCellClass(row.totalValor)}`}>
            {formatCurrency(row.totalValor)}
          </p>
        </div>
      </div>

      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {sorted.length} movimentação(ões) com os filtros atuais
        {restante > 0 ? ` — exibindo ${visiveis.length}` : null}.
      </p>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhuma movimentação neste grupo.
        </p>
      ) : (
        <div className="max-h-[min(60vh,32rem)] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Data
                </th>
                <th className="min-w-[12rem] px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Histórico
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Centro de custo
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Natureza
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Fornecedor
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Filial
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                  Saída
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                  Entrada
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {visiveis.map((item, index) => (
                <tr
                  key={item.ajusteId ?? `det-${index}-${item.dataCompensacao}`}
                  className={item.isAjusteManual ? 'bg-amber-50/40 dark:bg-amber-950/15' : ''}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-gray-900 dark:text-gray-100">
                    {formatDate(item.dataCompensacao)}
                  </td>
                  <td className="max-w-[14rem] px-3 py-2">
                    <span className="line-clamp-2 text-gray-700 dark:text-gray-300" title={item.historico}>
                      {item.historico || '—'}
                    </span>
                    {item.isAjusteManual ? (
                      <span className="mt-0.5 inline-block rounded bg-amber-200 px-1 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                        Ajuste
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-2 text-gray-700 dark:text-gray-300" title={displayCcLabel(item)}>
                    {displayCcLabel(item)}
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-2 text-gray-700 dark:text-gray-300" title={displayNatLabel(item)}>
                    {displayNatLabel(item)}
                  </td>
                  <td className="max-w-[8rem] truncate px-3 py-2 text-gray-700 dark:text-gray-300">
                    {item.fornecedor || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">
                    {item.codFilial != null ? formatFilialLabel(item.codFilial) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${valorCellClass(item.saida)}`}>
                    {item.saida !== 0 ? formatCurrency(item.saida) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${valorCellClass(itemEntrada(item))}`}>
                    {itemEntrada(item) > 0 ? formatCurrency(itemEntrada(item)) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${valorCellClass(itemSaldoLinha(item))}`}>
                    {formatCurrency(itemSaldoLinha(item))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {restante > 0 ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          + {restante} movimentação(ões) não exibida(s). Refine os filtros para reduzir o volume.
        </p>
      ) : null}
    </Modal>
  );
}

function ExtratoResumoTable({
  title,
  subtitle,
  icon,
  rowLabelHeader,
  rows,
  detailItems,
  getItemGroupKey,
  labelClassName = '',
  headerActions,
  totalRowLabel = 'Total geral'
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  rowLabelHeader: string;
  rows: ExtratoResumoRow[];
  detailItems: ExtratoCaixaItem[];
  getItemGroupKey: (item: ExtratoCaixaItem) => string | null;
  labelClassName?: string;
  headerActions?: React.ReactNode;
  totalRowLabel?: string;
}) {
  const [detalheRow, setDetalheRow] = useState<ExtratoResumoRow | null>(null);

  const detailsByKey = useMemo(() => {
    const map = new Map<string, ExtratoCaixaItem[]>();
    for (const item of detailItems) {
      const key = getItemGroupKey(item);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [detailItems, getItemGroupKey]);

  const totais = useMemo(() => {
    let totalEntrada = 0;
    let totalSaida = 0;
    let totalValor = 0;
    for (const row of rows) {
      totalEntrada += row.totalEntrada;
      totalSaida += row.totalSaida;
      totalValor += row.totalValor;
    }
    return { totalEntrada, totalSaida, totalValor };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="border-b border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">{icon}</span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Clique em uma linha ou no ícone para abrir os detalhes em um modal.
        </p>
        {headerActions ? <div className="mt-4 max-w-xl">{headerActions}</div> : null}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[36rem] w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[38%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
              <tr>
                <th className={`${EXTRATO_TH_CENTER} text-left sm:pl-6`}>{rowLabelHeader}</th>
                <th className={EXTRATO_TH_CENTER}>Saída</th>
                <th className={EXTRATO_TH_CENTER}>Entrada</th>
                <th className={EXTRATO_TH_CENTER}>Valor</th>
                <th className={`${EXTRATO_TH_CENTER} sm:pr-6`}>
                  <span className="sr-only">Detalhes</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {rows.map((row) => {
                const detalhes = detailsByKey.get(row.key) ?? [];
                const qtd = detalhes.length;
                return (
                  <tr
                    key={row.key}
                    className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    onClick={() => setDetalheRow(row)}
                  >
                    <td
                      className={`overflow-hidden px-4 py-3 font-medium text-gray-900 dark:text-gray-100 sm:pl-6 ${labelClassName}`}
                      title={row.label}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate">{row.label}</span>
                        <span className="shrink-0 text-xs font-normal text-gray-400 dark:text-gray-500">
                          ({qtd})
                        </span>
                      </div>
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} tabular-nums ${valorCellClass(row.totalSaida)}`}
                    >
                      {formatCurrency(row.totalSaida)}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} tabular-nums ${valorCellClass(row.totalEntrada)}`}
                    >
                      {formatCurrency(row.totalEntrada)}
                    </td>
                    <td className={`${EXTRATO_TD_CENTER} tabular-nums ${valorCellClass(row.totalValor)}`}>
                      {formatCurrency(row.totalValor)}
                    </td>
                    <td className={`${EXTRATO_TD_CENTER} sm:pr-6`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetalheRow(row);
                        }}
                        className="inline-flex rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700 dark:hover:text-red-400"
                        title="Ver detalhes"
                        aria-label={`Ver detalhes de ${row.label}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-semibold dark:bg-gray-900/60">
                <td className="px-4 py-3 text-gray-900 dark:text-gray-100 sm:pl-6">{totalRowLabel}</td>
                <td className={`${EXTRATO_TD_CENTER} tabular-nums ${valorCellClass(totais.totalSaida)}`}>
                  {formatCurrency(totais.totalSaida)}
                </td>
                <td
                  className={`${EXTRATO_TD_CENTER} tabular-nums ${valorCellClass(totais.totalEntrada)}`}
                >
                  {formatCurrency(totais.totalEntrada)}
                </td>
                <td className={`${EXTRATO_TD_CENTER} tabular-nums ${valorCellClass(totais.totalValor)}`}>
                  {formatCurrency(totais.totalValor)}
                </td>
                <td className="sm:pr-6" />
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>

      <ExtratoResumoDetalheModal
        isOpen={detalheRow != null}
        onClose={() => setDetalheRow(null)}
        rowLabelHeader={rowLabelHeader}
        row={detalheRow}
        items={detalheRow ? (detailsByKey.get(detalheRow.key) ?? []) : []}
      />
    </Card>
  );
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
    item.codFilial != null ? formatFilialLabel(item.codFilial) : '',
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

type ExtratoFilterDraft = ExtratoCaixaFiltroPayload;

const EMPTY_FILTER_DRAFT: ExtratoFilterDraft = {
  ccFilterCodes: [],
  natureFilterCodes: [],
  poloFilterIds: [],
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

function ExtratoSearchFilterBar({
  searchQuery,
  onSearchQueryChange,
  searchInputRef,
  onOpenFilters,
  hasActiveFilters,
  disabled = false
}: {
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
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
      <div className="relative min-w-0 w-full sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Pesquisar movimentação..."
          disabled={disabled}
          className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchQueryChange('')}
            disabled={disabled}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:pointer-events-none dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onOpenFilters}
        disabled={disabled}
        className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
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
  );
}

interface ExtratoItemsListProps {
  items: ExtratoCaixaItem[];
  emptyMessage: string;
}

function ExtratoItemsList({ items, emptyMessage }: ExtratoItemsListProps) {
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
      <CardHeader className="border-b-0 !pb-4">
        <div className="flex items-center space-x-3">
          <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
            <CalendarDays className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Movimentações</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {items.length} {items.length === 1 ? 'movimentação' : 'movimentações'}
            </p>
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
                  <th className={EXTRATO_TH_CENTER}>Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {paginatedItems.map((item, index) => {
                  const ccLabel = displayCcLabel(item);
                  const natLabel = displayNatLabel(item);
                  const rowIndex = (currentPage - 1) * EXTRATO_ITEMS_PER_PAGE + index;
                  return (
                  <tr
                    key={
                      item.ajusteId ??
                      `${item.idxcx ?? ''}-${item.data}-${item.dataCompensacao}-${rowIndex}`
                    }
                    className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                      item.isAjusteManual ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                    }`}
                  >
                    <td
                      className={`${EXTRATO_TD_CENTER} whitespace-nowrap font-mono text-gray-500 dark:text-gray-400`}
                    >
                      {item.idxcx ?? '—'}
                    </td>
                    <td className={EXTRATO_TD_HISTORICO} title={item.historico || undefined}>
                      <span className="inline-flex max-w-full items-center gap-2">
                        <span className="truncate">{item.historico || '—'}</span>
                        {item.isAjusteManual ? (
                          <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                            Ajuste
                          </span>
                        ) : null}
                      </span>
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
                      {item.codFilial != null ? formatFilialLabel(item.codFilial) : '—'}
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
  const [poloFilterIds, setPoloFilterIds] = useState<string[]>([]);
  const [fornecedorFilterValues, setFornecedorFilterValues] = useState<string[]>([]);
  const [historicoFilterValues, setHistoricoFilterValues] = useState<string[]>([]);
  const [tipoOperacaoFilterValues, setTipoOperacaoFilterValues] = useState<string[]>([]);
  const [movimentoTipoFilter, setMovimentoTipoFilter] = useState<string[]>([]);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [exportPdfModalOpen, setExportPdfModalOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
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

  const rmItems = data?.data?.items ?? [];

  const { data: filtrosSalvos = [] } = useQuery({
    queryKey: ['extrato-caixa-filtros-salvos'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ExtratoCaixaFiltroSalvo[] }>(
        '/extrato-caixa/filtros-salvos'
      );
      return res.data?.data ?? [];
    },
    enabled: canAccess
  });

  const { data: ajustesResponse } = useQuery({
    queryKey: ['extrato-caixa-ajustes'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: import('@/lib/extratoCaixaAjuste').ExtratoCaixaAjuste[];
      }>('/extrato-caixa/ajustes');
      return res.data;
    },
    enabled: canAccess
  });

  const ajustes = ajustesResponse?.data ?? [];

  const items = useMemo(() => {
    const manual = ajustes.map(ajusteToExtratoItem);
    return sortItemsByDateDesc([...rmItems, ...manual]);
  }, [rmItems, ajustes]);

  const poloFilterOptions = useMemo(() => {
    const byKey = new Map<string, { value: string; label: string; searchText: string }>();
    for (const item of items) {
      const { key, label } = resolveExtratoPolo(item);
      if (!byKey.has(key)) {
        byKey.set(key, { value: key, label, searchText: `${key} ${label}` });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => comparePoloKeys(a.value, b.value));
  }, [items]);

  const ccFilterOptions = useMemo(() => {
    const byCode = new Map<string, { value: string; label: string; searchText: string }>();
    let hasSemCc = false;
    for (const item of items) {
      const code = item.codCCusto.trim();
      if (!code) {
        hasSemCc = true;
        continue;
      }
      const key = code.toUpperCase();
      if (byCode.has(key)) continue;
      const label = item.ccusto.trim() || code;
      byCode.set(key, { value: code, label, searchText: `${code} ${label}` });
    }
    const options = Array.from(byCode.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR')
    );
    if (hasSemCc) {
      options.unshift({
        value: SEM_CENTRO_CUSTO_KEY,
        label: 'Sem centro de custo',
        searchText: 'sem centro de custo vazio'
      });
    }
    return options;
  }, [items]);

  const natureFilterOptions = useMemo(() => {
    const byCode = new Map<string, { value: string; label: string; searchText: string }>();
    let hasSemNatureza = false;
    for (const item of items) {
      const code = normalizeBudgetNatureCode(item.codNatFinanceira);
      if (!code) {
        hasSemNatureza = true;
        continue;
      }
      const label = item.natureza.trim() || code;
      const key = code.toUpperCase();
      if (byCode.has(key)) continue;
      byCode.set(key, { value: code, label, searchText: `${code} ${label}` });
    }
    const options = Array.from(byCode.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR')
    );
    if (hasSemNatureza) {
      options.unshift({
        value: SEM_NATUREZA_KEY,
        label: 'Sem natureza financeira',
        searchText: 'sem natureza financeira vazio'
      });
    }
    return options;
  }, [items]);

  const fornecedorFilterOptions = useMemo(() => {
    const names = new Set<string>();
    let hasSemFornecedor = false;
    for (const item of items) {
      const n = item.fornecedor.trim();
      if (n) names.add(n);
      else hasSemFornecedor = true;
    }
    const options = Array.from(names)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((name) => ({ value: name, label: name, searchText: name }));
    if (hasSemFornecedor) {
      options.unshift({
        value: SEM_FORNECEDOR_KEY,
        label: 'Sem fornecedor',
        searchText: 'sem fornecedor vazio'
      });
    }
    return options;
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

  const poloAllValues = useMemo(
    () => poloFilterOptions.map((o) => o.value),
    [poloFilterOptions]
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

  const filtroAllValues: ExtratoFiltroAllValues = useMemo(
    () => ({
      cc: ccAllValues,
      nature: natureAllValues,
      polo: poloAllValues,
      fornecedor: fornecedorAllValues,
      historico: historicoAllValues,
      tipoOperacao: tipoOperacaoAllValues,
      movimento: [...MOVIMENTO_TIPO_ALL_VALUES]
    }),
    [
      ccAllValues,
      natureAllValues,
      poloAllValues,
      fornecedorAllValues,
      historicoAllValues,
      tipoOperacaoAllValues
    ]
  );

  const buildDefaultFilters = useCallback(
    (): ExtratoFilterDraft => ({
      ccFilterCodes: [...ccAllValues],
      natureFilterCodes: [...natureAllValues],
      poloFilterIds: [...poloAllValues],
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
      poloAllValues,
      fornecedorAllValues,
      historicoAllValues,
      tipoOperacaoAllValues
    ]
  );

  useEffect(() => {
    if (rmItems.length === 0) return;
    if (filtersInitializedRef.current) return;
    const defaults = buildDefaultFilters();
    setCcFilterCodes(defaults.ccFilterCodes);
    setNatureFilterCodes(defaults.natureFilterCodes);
    setPoloFilterIds(defaults.poloFilterIds);
    setFornecedorFilterValues(defaults.fornecedorFilterValues);
    setHistoricoFilterValues(defaults.historicoFilterValues);
    setTipoOperacaoFilterValues(defaults.tipoOperacaoFilterValues);
    setMovimentoTipoFilter(defaults.movimentoTipoFilter);
    filtersInitializedRef.current = true;
  }, [rmItems.length, buildDefaultFilters]);

  const openFiltersModal = () => {
    const withAllIfEmpty = (applied: string[], all: string[]) =>
      applied.length === 0 && all.length > 0 ? [...all] : [...applied];

    setFilterDraft({
      ccFilterCodes: withAllIfEmpty(ccFilterCodes, ccAllValues),
      natureFilterCodes: withAllIfEmpty(natureFilterCodes, natureAllValues),
      poloFilterIds: withAllIfEmpty(poloFilterIds, poloAllValues),
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
    setPoloFilterIds(filterDraft.poloFilterIds);
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
  const hasPoloFilter = isMultiselectFilterActive(poloFilterIds, poloAllValues);
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
    hasPoloFilter ||
    hasFornecedorFilter ||
    hasHistoricoFilter ||
    hasTipoOperacaoFilter ||
    hasMovimentoTipoFilter ||
    hasPeriodFilter;
  const hasListRefinement = hasActiveFilters || hasSearchQuery;

  const appliedFiltroPayload: ExtratoCaixaFiltroPayload = useMemo(
    () => ({
      ccFilterCodes,
      natureFilterCodes,
      poloFilterIds,
      fornecedorFilterValues,
      historicoFilterValues,
      tipoOperacaoFilterValues,
      movimentoTipoFilter,
      periodFrom,
      periodTo
    }),
    [
      ccFilterCodes,
      natureFilterCodes,
      poloFilterIds,
      fornecedorFilterValues,
      historicoFilterValues,
      tipoOperacaoFilterValues,
      movimentoTipoFilter,
      periodFrom,
      periodTo
    ]
  );

  const filtroLabelMaps: ExtratoFiltroLabelMaps = useMemo(
    () => ({
      cc: ccFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      nature: natureFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      polo: poloFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      fornecedor: fornecedorFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      historico: historicoFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      tipoOperacao: tipoOperacaoFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      movimento: MOVIMENTO_TIPO_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
    }),
    [
      ccFilterOptions,
      natureFilterOptions,
      poloFilterOptions,
      fornecedorFilterOptions,
      historicoFilterOptions,
      tipoOperacaoFilterOptions
    ]
  );

  const filtrosDesmarcados = useMemo(
    () => buildExtratoFiltrosDesmarcados(appliedFiltroPayload, filtroLabelMaps, filtroAllValues),
    [appliedFiltroPayload, filtroLabelMaps, filtroAllValues]
  );

  const activeFiltroSalvo = useMemo(
    () => findMatchingExtratoFiltroSalvo(appliedFiltroPayload, filtrosSalvos, filtroAllValues),
    [appliedFiltroPayload, filtrosSalvos, filtroAllValues]
  );

  const hasMultiselectFilters =
    hasCcFilter ||
    hasNatureFilter ||
    hasPoloFilter ||
    hasFornecedorFilter ||
    hasHistoricoFilter ||
    hasTipoOperacaoFilter ||
    hasMovimentoTipoFilter;

  const showFiltrosResumo = hasMultiselectFilters || hasPeriodFilter;

  const configured = data?.data?.configured ?? false;
  const pathFailures = data?.data?.pathFailures ?? [];
  const apiMessage = data?.message || data?.data?.message || null;
  const loadFailed = data?.success === false;

  const filteredItems = useMemo(
    () =>
      sortItemsByDateDesc(
        items.filter((item) => {
          const matchesPeriod = itemMatchesCompensacaoPeriod(item, periodFrom, periodTo);
          const matchesSearch = extratoItemMatchesSearch(item, searchQuery);

          /** Ajustes manuais são sempre somados ao extrato (período e busca ainda aplicam). */
          if (isExtratoAjusteManual(item)) {
            return matchesPeriod && matchesSearch;
          }

          return (
            extratoMatchesAnyCcCodes(item.codCCusto, ccFilterCodes, ccAllValues) &&
            extratoMatchesAnyNatureCodesFiltered(
              item.codNatFinanceira,
              natureFilterCodes,
              natureAllValues
            ) &&
            extratoMatchesAnyPoloKeys(item, poloFilterIds, poloAllValues) &&
            extratoMatchesAnyFornecedor(
              item.fornecedor,
              fornecedorFilterValues,
              fornecedorAllValues
            ) &&
            extratoMatchesAnyHistorico(
              item.historico,
              historicoFilterValues,
              historicoAllValues
            ) &&
            extratoMatchesAnyTipoOperacao(
              item.tipoOperacao,
              tipoOperacaoFilterValues,
              tipoOperacaoAllValues
            ) &&
            extratoMatchesMovimentoTipo(item, movimentoTipoFilter, MOVIMENTO_TIPO_ALL_VALUES) &&
            matchesPeriod &&
            matchesSearch
          );
        })
      ),
    [
      items,
      ccFilterCodes,
      natureFilterCodes,
      poloFilterIds,
      fornecedorFilterValues,
      historicoFilterValues,
      tipoOperacaoFilterValues,
      movimentoTipoFilter,
      periodFrom,
      periodTo,
      searchQuery,
      ccAllValues,
      natureAllValues,
      poloAllValues,
      fornecedorAllValues,
      historicoAllValues,
      tipoOperacaoAllValues
    ]
  );

  const ajustesManuaisPdf = useMemo((): ExtratoCaixaPdfAjusteRow[] => {
    return filteredItems
      .filter(isExtratoAjusteManual)
      .sort(
        (a, b) =>
          (localDayKey(b.dataCompensacao) ?? 0) - (localDayKey(a.dataCompensacao) ?? 0)
      )
      .map((item) => ({
        data: formatDate(item.dataCompensacao),
        centroCusto: item.ccusto?.trim() || item.codCCusto?.trim() || '—',
        natureza: item.natureza?.trim() || '—',
        polo: resolveExtratoPolo(item).label,
        observacao: item.historico?.trim() || 'Ajuste manual',
        valor: item.valor
      }));
  }, [filteredItems]);

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

  const extratoResumoMensal = useMemo(
    () => buildExtratoResumoMensal(filteredItems),
    [filteredItems]
  );

  const extratoResumoCentroCusto = useMemo(
    () => buildExtratoResumoCentroCusto(filteredItems),
    [filteredItems]
  );

  const extratoResumoNatureza = useMemo(
    () => buildExtratoResumoNatureza(filteredItems),
    [filteredItems]
  );

  const extratoResumoPolo = useMemo(
    () =>
      buildExtratoResumoPolo(filteredItems, {
        entrada: itemEntrada,
        saida: (item) => item.saida,
        valor: itemSaldoLinha
      }),
    [filteredItems]
  );

  const extratoResumoFornecedor = useMemo(
    () => buildExtratoResumoFornecedor(filteredItems),
    [filteredItems]
  );

  const showDashboards =
    !isLoading && !isError && configured && !loadFailed;

  const buildPdfFilterLines = useCallback((): string[] => {
    const lines: string[] = [];

    if (activeFiltroSalvo) {
      lines.push(`Filtro salvo: ${activeFiltroSalvo.nome}`);
    }

    if (periodFrom || periodTo) {
      const de = periodFrom ? formatIsoDateInputBr(periodFrom) : '—';
      const ate = periodTo ? formatIsoDateInputBr(periodTo) : '—';
      lines.push(`Período de compensação: de ${de} até ${ate}`);
    }

    if (hasSearchQuery) {
      lines.push(`Busca: "${searchQuery.trim()}"`);
    }

    if (ajustes.length > 0) {
      lines.push(
        'Ajustes manuais: sempre incluídos nos totais e resumos (independente dos filtros de lista).'
      );
    }

    for (const campo of filtrosDesmarcados) {
      const qtd = campo.desmarcados.length;
      const lista = campo.desmarcados.join(' · ');
      lines.push(
        `${campo.campo} (${qtd} excluído${qtd !== 1 ? 's' : ''}): ${lista}`
      );
    }

    if (
      !periodFrom &&
      !periodTo &&
      !hasSearchQuery &&
      filtrosDesmarcados.length === 0 &&
      !hasMultiselectFilters
    ) {
      lines.push('Todos os itens marcados nos filtros de lista (sem restrição por campo).');
    }

    lines.push(`Movimentações no recorte: ${filteredItems.length.toLocaleString('pt-BR')}`);

    return lines;
  }, [
    activeFiltroSalvo,
    periodFrom,
    periodTo,
    hasSearchQuery,
    searchQuery,
    filtrosDesmarcados,
    hasMultiselectFilters,
    filteredItems.length,
    ajustes.length
  ]);

  const handleExportPdf = useCallback(
    async (mode: ExtratoPdfNatureMode) => {
      setExportingPdf(true);
      try {
        const includeAllNature = mode === 'all';
        const natureRows = pickResumoRowsForPdf(
          extratoResumoNatureza,
          includeAllNature,
          EXTRATO_RESUMO_TOP_SAIDA
        );

        await exportExtratoCaixaPdf({
          title: 'Extrato de Caixa',
          subtitle: pageSubtitle,
          stats: {
            totalEntrada: extratoStats.totalEntrada,
            totalSaida: extratoStats.totalSaida,
            saldoLiquido: extratoStats.saldoLiquido,
            qtdEntrada: extratoStats.qtdEntrada,
            qtdSaida: extratoStats.qtdSaida
          },
          movimentacoesFiltradas: filteredItems.length,
          filterLines: buildPdfFilterLines(),
          ajustesManuais: ajustesManuaisPdf,
          sections: [
            {
              title: 'Resumo por mês',
              rowLabelHeader: 'Mês',
              rows: extratoResumoMensal,
              totalRowLabel: 'Total',
              preserveRowOrder: true
            },
            {
              title: 'Resumo por polo',
              rowLabelHeader: 'Polo',
              rows: extratoResumoPolo,
              totalRowLabel: 'Total',
              preserveRowOrder: true
            },
            {
              title: 'Resumo por centro de custo',
              rowLabelHeader: 'Centro de custo',
              rows: extratoResumoCentroCusto,
              totalRowLabel: 'Total'
            },
            {
              title: 'Resumo por natureza financeira',
              rowLabelHeader: 'Natureza financeira',
              rows: natureRows,
              totalRowLabel: 'Total exibido',
              preserveRowOrder: !includeAllNature,
              footnote: includeAllNature
                ? 'Todas as naturezas'
                : `Top ${EXTRATO_RESUMO_TOP_SAIDA} maiores saídas`
            }
          ]
        });

        toast.success('PDF exportado com sucesso.');
        setExportPdfModalOpen(false);
      } catch {
        toast.error('Erro ao gerar o PDF. Tente novamente.');
      } finally {
        setExportingPdf(false);
      }
    },
    [
      buildPdfFilterLines,
      ajustesManuaisPdf,
      extratoResumoMensal,
      extratoResumoCentroCusto,
      extratoResumoPolo,
      extratoResumoNatureza,
      extratoStats,
      filteredItems.length,
      pageSubtitle
    ]
  );

  if (!canAccess) {
    return (
      <ProtectedRoute route="/ponto/financeiro/analise-extrato">
        <MainLayout userRole="EMPLOYEE" userName="" onLogout={() => {}}>
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-1 h-6 w-6 flex-shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-red-800 dark:text-red-200">
                    Acesso Negado
                  </h3>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Você não tem permissão para acessar esta página. Apenas administradores e
                    membros do departamento financeiro podem acessar.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/financeiro/analise-extrato">
      <MainLayout userRole="EMPLOYEE" userName={user?.name ?? ''}>
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
                {pageTitle}
              </h1>
              <p className="mt-2 text-sm text-gray-600 sm:text-base dark:text-gray-400">
                {pageSubtitle}
              </p>
            </div>
            {showDashboards ? (
              <button
                type="button"
                onClick={() => setExportPdfModalOpen(true)}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <FileDown className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />
                Exportar PDF
              </button>
            ) : null}
          </div>

          {canAccess ? (
            <ExtratoCaixaAjustesPanel enabled={canAccess} sourceItems={rmItems} />
          ) : null}

          {configured && !loadFailed ? (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              {showFiltrosResumo ? (
                <ExtratoFiltrosDesmarcadosResumo
                  presetNome={activeFiltroSalvo?.nome ?? null}
                  camposDesmarcados={filtrosDesmarcados}
                  periodFrom={periodFrom}
                  periodTo={periodTo}
                  hasActiveFilters={hasMultiselectFilters}
                  temAjustesManuais={ajustes.length > 0}
                />
              ) : null}
              <ExtratoSearchFilterBar
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                searchInputRef={searchInputRef}
                onOpenFilters={openFiltersModal}
                hasActiveFilters={hasActiveFilters}
                disabled={isLoading || isFetching}
              />
            </div>
          ) : null}

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
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
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

              <ExtratoResumoTable
                title="Resumo por mês"
                subtitle="Totais de entrada, saída e valor agrupados pela data de compensação (mesmos filtros da listagem)."
                icon={<CalendarDays className="h-5 w-5" aria-hidden />}
                rowLabelHeader="Mês"
                rows={extratoResumoMensal}
                detailItems={filteredItems}
                getItemGroupKey={itemCompensacaoMonthKey}
              />

              <ExtratoResumoTable
                title="Resumo por polo"
                subtitle="Totais de entrada, saída e valor agrupados por polo, conforme o centro de custo da movimentação (mesmos filtros da listagem)."
                icon={<Building2 className="h-5 w-5" aria-hidden />}
                rowLabelHeader="Polo"
                rows={extratoResumoPolo}
                detailItems={filteredItems}
                getItemGroupKey={poloGroupKey}
              />

              <ExtratoResumoTable
                title="Resumo por centro de custo"
                subtitle="Totais de entrada, saída e valor agrupados por centro de custo (mesmos filtros da listagem)."
                icon={<ListPlus className="h-5 w-5" aria-hidden />}
                rowLabelHeader="Centro de custo"
                rows={extratoResumoCentroCusto}
                detailItems={filteredItems}
                getItemGroupKey={ccGroupKey}
              />

              <ExtratoResumoTopExpandSection
                allRows={extratoResumoNatureza}
                detailItems={filteredItems}
                getItemGroupKey={natureGroupKey}
                icon={<BookOpen className="h-5 w-5" aria-hidden />}
                dropdownIcon={<BookOpen className="h-4 w-4" aria-hidden />}
                labels={{
                  title: 'Resumo por natureza financeira',
                  rowLabelHeader: 'Natureza financeira',
                  entityPlural: 'naturezas',
                  addDropdownLabel: 'Gerenciar naturezas exibidas',
                  addPlaceholder: 'Selecione naturezas para exibir...',
                  addSearchPlaceholder: 'Pesquisar natureza ou código...',
                  emptyOptionsMessage: 'Nenhuma natureza disponível para adicionar.',
                  emptySearchMessage: 'Nenhuma natureza encontrada.',
                  allVisibleMessage:
                    `As ${EXTRATO_RESUMO_TOP_SAIDA} maiores saídas estão exibidas. Nenhuma adicional selecionada.`,
                  clearAddedLabel: 'Limpar adicionados'
                }}
              />

              <ExtratoResumoTopExpandSection
                allRows={extratoResumoFornecedor}
                detailItems={filteredItems}
                getItemGroupKey={fornecedorGroupKey}
                icon={<Building2 className="h-5 w-5" aria-hidden />}
                dropdownIcon={<Building2 className="h-4 w-4" aria-hidden />}
                labels={{
                  title: 'Resumo por fornecedor',
                  rowLabelHeader: 'Fornecedor',
                  entityPlural: 'fornecedores',
                  addDropdownLabel: 'Gerenciar fornecedores exibidos',
                  addPlaceholder: 'Selecione fornecedores para exibir...',
                  addSearchPlaceholder: 'Pesquisar fornecedor...',
                  emptyOptionsMessage: 'Nenhum fornecedor disponível para adicionar.',
                  emptySearchMessage: 'Nenhum fornecedor encontrado.',
                  allVisibleMessage:
                    `As ${EXTRATO_RESUMO_TOP_SAIDA} maiores saídas estão exibidas. Nenhum adicional selecionado.`,
                  clearAddedLabel: 'Limpar adicionados'
                }}
              />
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
            <ExtratoItemsList
              items={filteredItems}
              emptyMessage={
                hasListRefinement
                  ? 'Nenhuma movimentação encontrada com os filtros ou termo de busca aplicados.'
                  : 'Nenhuma movimentação encontrada no extrato.'
              }
            />
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

        <ExtratoExportPdfModal
          isOpen={exportPdfModalOpen}
          onClose={() => setExportPdfModalOpen(false)}
          onConfirm={handleExportPdf}
          exporting={exportingPdf}
          natureCount={extratoResumoNatureza.length}
          topLimit={EXTRATO_RESUMO_TOP_SAIDA}
        />

        <Modal
          isOpen={isFiltersModalOpen}
          onClose={closeFiltersModal}
          title="Filtros"
          size="lg"
        >
          <div className="space-y-4">
            <ExtratoFiltrosSalvosPanel
              filterDraft={filterDraft}
              onLoadDraft={setFilterDraft}
              allValues={filtroAllValues}
              disabled={isLoading}
            />

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
                label="Polo"
                options={poloFilterOptions}
                selected={filterDraft.poloFilterIds}
                onChange={(ids) => setFilterDraft((d) => ({ ...d, poloFilterIds: ids }))}
                disabled={isLoading}
                placeholder="Todos os polos"
                searchPlaceholder="Pesquisar polo..."
                emptyOptionsMessage="Nenhum polo no extrato carregado."
                emptySearchMessage="Nenhum polo encontrado."
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

'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CalendarDays, ChevronDown, ChevronUp, Filter, Loader2, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import { useCostCenters } from '@/hooks/useCostCenters';
import api from '@/lib/api';

type ExtratoCaixaItem = {
  codColigada: number | null;
  codCxa: string;
  codCCusto: string;
  valor: number;
  codFilial: number | null;
  data: string | null;
};

type ExtratoCaixaApiResponse = {
  success: boolean;
  message?: string;
  data: {
    configured: boolean;
    items: ExtratoCaixaItem[];
    total: number;
    message?: string | null;
  };
};

type MonthGroupData = {
  year: number;
  month: number;
  items: ExtratoCaixaItem[];
};

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR');
}

function normalizeMatchText(value: string): string {
  return value.trim().toLowerCase();
}

function matchesCostCenterFilter(
  item: ExtratoCaixaItem,
  selected: string,
  costCenters: Array<{ code?: string; name?: string; label?: string }>
): boolean {
  if (!selected) return true;
  const itemCc = (item.codCCusto || '').trim();
  if (!itemCc) return false;

  const selectedNorm = normalizeMatchText(selected);
  const itemNorm = normalizeMatchText(itemCc);
  if (itemNorm === selectedNorm) return true;

  const match = costCenters.find((cc) => {
    const name = normalizeMatchText(String(cc.name || cc.label || ''));
    const code = normalizeMatchText(String(cc.code || ''));
    return name === selectedNorm || code === selectedNorm;
  });

  if (match) {
    const name = normalizeMatchText(String(match.name || match.label || ''));
    const code = normalizeMatchText(String(match.code || ''));
    return itemNorm === name || itemNorm === code;
  }

  return false;
}

function getItemMonthYear(data: string | null): { year: number; month: number } | null {
  if (!data) return null;
  const d = new Date(data);
  if (isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function groupItemsByMonth(items: ExtratoCaixaItem[]): MonthGroupData[] {
  const groups = new Map<string, MonthGroupData>();

  for (const item of items) {
    const period = getItemMonthYear(item.data);
    const year = period?.year ?? 0;
    const month = period?.month ?? 0;
    const key = `${year}-${String(month).padStart(2, '0')}`;

    if (!groups.has(key)) {
      groups.set(key, { year, month, items: [] });
    }
    groups.get(key)!.items.push(item);
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.items.sort((a: ExtratoCaixaItem, b: ExtratoCaixaItem) => {
      const ta = a.data ? new Date(a.data).getTime() : Number.NEGATIVE_INFINITY;
      const tb = b.data ? new Date(b.data).getTime() : Number.NEGATIVE_INFINITY;
      const aTime = Number.isFinite(ta) ? ta : Number.NEGATIVE_INFINITY;
      const bTime = Number.isFinite(tb) ? tb : Number.NEGATIVE_INFINITY;
      return bTime - aTime;
    });
  }

  return result.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

interface ExtratoMonthGroupProps {
  year: number;
  month: number;
  items: ExtratoCaixaItem[];
}

function ExtratoMonthGroup({ year, month, items }: ExtratoMonthGroupProps) {
  const [listExpanded, setListExpanded] = useState(false);

  const totalEntrada = items.reduce((sum, it) => (it.valor > 0 ? sum + it.valor : sum), 0);
  const totalSaida = items.reduce(
    (sum, it) => (it.valor < 0 ? sum + Math.abs(it.valor) : sum),
    0
  );

  const titleMonth =
    year === 0 || month === 0
      ? 'Sem data'
      : (() => {
          const label = MONTHS_PT[month - 1] || '';
          return label.charAt(0) + label.slice(1).toLowerCase();
        })();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b-0 !pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center space-x-3">
            <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
              <CalendarDays className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {year === 0 || month === 0
                  ? titleMonth
                  : `Movimentações de ${titleMonth} de ${year}`}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {items.length} {items.length === 1 ? 'movimentação' : 'movimentações'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 pt-3 sm:justify-end sm:gap-4 sm:border-t-0 sm:pt-0 dark:border-gray-700/80">
            <dl className="flex items-baseline gap-4 text-sm sm:gap-5">
              <div>
                <dt className="text-xs font-medium text-green-600/90 dark:text-green-400">
                  Entrada
                </dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-green-700 dark:text-green-300">
                  {formatCurrency(totalEntrada)}
                </dd>
              </div>
              <div
                className="hidden h-9 w-px self-center bg-gray-200 sm:block dark:bg-gray-600"
                aria-hidden
              />
              <div>
                <dt className="text-xs font-medium text-red-600/90 dark:text-red-400">Saída</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-red-700 dark:text-red-300">
                  {formatCurrency(totalSaida)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setListExpanded((v) => !v)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/80 dark:hover:text-gray-100"
              aria-expanded={listExpanded}
              aria-controls={`extrato-list-${year}-${month}`}
              title={listExpanded ? 'Recolher lista' : 'Expandir lista'}
            >
              {listExpanded ? (
                <ChevronUp className="h-5 w-5" aria-hidden />
              ) : (
                <ChevronDown className="h-5 w-5" aria-hidden />
              )}
              <span className="sr-only">{listExpanded ? 'Recolher lista' : 'Expandir lista'}</span>
            </button>
          </div>
        </div>
      </CardHeader>
      <div id={`extrato-list-${year}-${month}`} className={listExpanded ? '' : 'hidden'}>
        <CardContent className="!pt-0 px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                    Data
                  </th>
                  <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                    Coligada
                  </th>
                  <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                    Caixa
                  </th>
                  <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                    Centro de Custo
                  </th>
                  <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                    Filial
                  </th>
                  <th className="px-3 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {items.map((item, index) => (
                  <tr
                    key={`${item.data}-${item.codCxa}-${item.codCCusto}-${item.valor}-${index}`}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-gray-900 dark:text-gray-100 sm:px-6">
                      {formatDate(item.data)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-700 dark:text-gray-300 sm:px-6">
                      {item.codColigada ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-gray-900 dark:text-gray-100 sm:px-6">
                      {item.codCxa || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-gray-900 dark:text-gray-100 sm:px-6">
                      {item.codCCusto || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-center text-gray-700 dark:text-gray-300 sm:px-6">
                      {item.codFilial ?? '—'}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-3 text-right font-medium sm:px-6 ${
                        item.valor > 0
                          ? 'text-green-600 dark:text-green-400'
                          : item.valor < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {formatCurrency(item.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export default function AnaliseExtratoPage() {
  const pageTitle = 'Extrato de Caixa';
  const pageSubtitle = 'Movimentações do extrato de caixa integradas ao TOTVS RM';

  const { isDepartmentFinanceiro, userPosition } = usePermissions();
  const isAdministrator = userPosition === 'Administrador';
  const canAccess = isAdministrator || isDepartmentFinanceiro;

  const { costCentersList, costCenters, isLoading: isLoadingCostCenters } = useCostCenters();
  const [costCenterFilter, setCostCenterFilter] = useState('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['extrato-caixa'],
    queryFn: async () => {
      const res = await api.get<ExtratoCaixaApiResponse>('/extrato-caixa', { timeout: 180000 });
      return res.data;
    },
    enabled: canAccess,
  });

  const items = data?.data?.items ?? [];
  const configured = data?.data?.configured ?? false;
  const apiMessage = data?.message || data?.data?.message || null;
  const loadFailed = data?.success === false;

  const filteredItems = useMemo(
    () => items.filter((item) => matchesCostCenterFilter(item, costCenterFilter, costCenters)),
    [items, costCenterFilter, costCenters]
  );

  const groupedByMonth = useMemo(() => groupItemsByMonth(filteredItems), [filteredItems]);

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
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={() => {}}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
              {pageTitle}
            </h1>
            <p className="mt-2 text-sm text-gray-600 sm:text-base dark:text-gray-400">
              {pageSubtitle}
            </p>
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setIsFiltersModalOpen(true)}
              className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                costCenterFilter
                  ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
              aria-label="Abrir filtro"
              title={costCenterFilter ? 'Filtro (centro de custo ativo)' : 'Filtro'}
            >
              <Filter className="h-4 w-4" />
              {costCenterFilter && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
              )}
            </button>
          </div>

          {isLoading || isFetching ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando extrato de caixa...
              </CardContent>
            </Card>
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
          ) : groupedByMonth.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Wallet className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                <p className="text-gray-600 dark:text-gray-400">
                  {costCenterFilter
                    ? 'Nenhuma movimentação encontrada para o centro de custo selecionado.'
                    : 'Nenhuma movimentação encontrada no extrato.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4 sm:gap-6">
              {groupedByMonth.map((group) => (
                <ExtratoMonthGroup
                  key={`${group.year}-${group.month}`}
                  year={group.year}
                  month={group.month}
                  items={group.items}
                />
              ))}
            </div>
          )}
        </div>

        <Modal
          isOpen={isFiltersModalOpen}
          onClose={() => setIsFiltersModalOpen(false)}
          title="Filtros"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Centro de Custo
              </label>
              <select
                value={costCenterFilter}
                onChange={(e) => setCostCenterFilter(e.target.value)}
                disabled={isLoadingCostCenters}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="">Todos os centros de custo</option>
                {costCentersList.map((costCenter) => (
                  <option key={costCenter} value={costCenter}>
                    {costCenter}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setCostCenterFilter('')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

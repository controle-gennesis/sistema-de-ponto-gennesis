'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  ChevronRight,
  Layers,
  Package,
  Search,
  SlidersHorizontal,
  Table2,
  X,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { ListPagination } from '@/components/ui/ListPagination';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
} from '@/components/ui/CadastroListSummary';
import {
  cadastroListClasses,
  getListTableRowClassName,
  ListRowNavigableLabel,
} from '@/components/ui/RowActionMenu';
import api from '@/lib/api';

const ROUTE = '/ponto/tabela-sinapi';
const PAGE_SIZE = 50;

/** O catálogo não muda dentro de um mês de referência — cache longo no cliente. */
const CATALOG_STALE_TIME = 30 * 60 * 1000;

type TabKey = 'compositions' | 'items';

type ListMeta = {
  total: number | null;
  page: number;
  limit: number;
  totalPages: number | null;
  hasNextPage: boolean;
};

type SinapiComposition = {
  id: number;
  code: number;
  description: string;
  unit: string;
  stateCode: string | null;
  referenceMonth: string | null;
  baseUnitCost: number | null;
  sourceUpdatedAt?: string | null;
  previousCode?: number | null;
  items?: SinapiCompositionItem[];
};

type SinapiCompositionItem = {
  itemType: 'INPUT' | 'SUB_COMPOSITION';
  code: number;
  description: string;
  unit: string;
  resourceType: string | null;
  coefficient: string;
  unitPrice: number | null;
  totalPrice: number | null;
};

type SinapiItem = {
  id: number;
  code: number;
  description: string;
  unit: string;
  stateCode: string | null;
  referenceMonth: string | null;
  unitPrice: number | null;
  technicalStandards?: string | null;
  generalInfo?: string | null;
  imageUrl?: string | null;
  sourceUpdatedAt?: string | null;
  previousCode?: number | null;
};

type SinapiTreeNode = {
  code: string;
  description: string;
  unit: string;
  depth: number;
  coefficient: string | null;
  item_type: 'COMPOSITION' | 'SUB_COMPOSITION' | 'INPUT';
  unit_price: number | null;
  items: SinapiTreeNode[];
  truncated?: boolean;
};

/** Preços da API vêm em centavos (INTEGER). */
function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

function formatCoefficient(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
}

function formatMonthLabel(month: string): string {
  const [year, monthPart] = month.split('-');
  const index = Number(monthPart) - 1;
  const names = [
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
  return names[index] ? `${names[index]}/${year}` : month;
}

const REGIME_OPTIONS = ['Não desonerado', 'Desonerado'] as const;

export default function TabelaSinapiPage() {
  const [tab, setTab] = useState<TabKey>('compositions');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('SP');
  const [month, setMonth] = useState('');
  const [unit, setUnit] = useState('');
  const [regime, setRegime] = useState<string>(REGIME_OPTIONS[0]);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedComposition, setSelectedComposition] = useState<SinapiComposition | null>(null);
  const [selectedItem, setSelectedItem] = useState<SinapiItem | null>(null);

  const isDesonerated = regime === 'Desonerado';

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [tab, search, state, month, unit, regime]);

  const { data: metadata, isLoading: loadingMetadata } = useQuery({
    queryKey: ['sinapi-metadata'],
    queryFn: async () => {
      const res = await api.get('/sinapi/metadata');
      return (res.data?.data ?? { states: [], months: [], units: [] }) as {
        states: string[];
        months: string[];
        units: string[];
      };
    },
    staleTime: 6 * 60 * 60 * 1000,
  });

  const availableMonths = metadata?.months ?? [];

  useEffect(() => {
    if (!month && availableMonths.length > 0) {
      setMonth(availableMonths[0]);
    }
  }, [month, availableMonths]);

  const filterParams = useMemo(
    () => ({
      search: search || undefined,
      unit: unit || undefined,
      state,
      month: month || undefined,
      isDesonerated: String(isDesonerated),
    }),
    [search, unit, state, month, isDesonerated],
  );

  const queryParams = useMemo(
    () => ({ ...filterParams, page: String(page), limit: String(PAGE_SIZE) }),
    [filterParams, page],
  );

  const compositionsQuery = useQuery({
    queryKey: ['sinapi-compositions', queryParams],
    queryFn: async () => {
      const res = await api.get('/sinapi/compositions', { params: queryParams });
      return {
        rows: (res.data?.data ?? []) as SinapiComposition[],
        meta: (res.data?.meta ?? null) as ListMeta | null,
      };
    },
    enabled: tab === 'compositions' && Boolean(month),
    staleTime: CATALOG_STALE_TIME,
  });

  const itemsQuery = useQuery({
    queryKey: ['sinapi-items', queryParams],
    queryFn: async () => {
      const res = await api.get('/sinapi/items', { params: queryParams });
      return {
        rows: (res.data?.data ?? []) as SinapiItem[],
        meta: (res.data?.meta ?? null) as ListMeta | null,
      };
    },
    enabled: tab === 'items' && Boolean(month),
    staleTime: CATALOG_STALE_TIME,
  });

  /**
   * Totais dos dois catálogos para os cartões do topo. Ficam fora da paginação
   * (limit=1) para não refazer a consulta a cada troca de página.
   */
  const countParams = useMemo(
    () => ({ ...filterParams, page: '1', limit: '1' }),
    [filterParams],
  );

  const compositionsCountQuery = useQuery({
    queryKey: ['sinapi-compositions-count', countParams],
    queryFn: async () => {
      const res = await api.get('/sinapi/compositions', { params: countParams });
      return (res.data?.meta?.total ?? null) as number | null;
    },
    enabled: Boolean(month),
    staleTime: CATALOG_STALE_TIME,
  });

  const itemsCountQuery = useQuery({
    queryKey: ['sinapi-items-count', countParams],
    queryFn: async () => {
      const res = await api.get('/sinapi/items', { params: countParams });
      return (res.data?.meta?.total ?? null) as number | null;
    },
    enabled: Boolean(month),
    staleTime: CATALOG_STALE_TIME,
  });

  const activeQuery = tab === 'compositions' ? compositionsQuery : itemsQuery;
  const meta = activeQuery.data?.meta ?? null;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  const hasActiveFilters = Boolean(unit) || isDesonerated;

  if (loadingMetadata) {
    return (
      <ProtectedRoute route={ROUTE}>
        <Loading message="Carregando base SINAPI..." fullScreen size="lg" />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route={ROUTE}>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
            Tabela SINAPI
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            Composições, insumos e analítico oficial da Caixa/IBGE por UF e mês de referência
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard
            icon={Layers}
            label="Composições"
            value={
              compositionsCountQuery.data != null
                ? compositionsCountQuery.data.toLocaleString('pt-BR')
                : '—'
            }
            hint="Serviços com analítico de insumos"
            iconBg="bg-red-100 dark:bg-red-900/30"
            iconColor="text-red-600 dark:text-red-400"
          />
          <SummaryCard
            icon={Package}
            label="Insumos"
            value={
              itemsCountQuery.data != null ? itemsCountQuery.data.toLocaleString('pt-BR') : '—'
            }
            hint="Materiais, mão de obra e equipamentos"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconColor="text-blue-600 dark:text-blue-400"
          />
          <SummaryCard
            icon={Table2}
            label="Referência"
            value={month ? `${state} · ${formatMonthLabel(month)}` : '—'}
            hint={isDesonerated ? 'Regime desonerado' : 'Regime não desonerado'}
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconColor="text-emerald-600 dark:text-emerald-400"
          />
        </div>

        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className="flex min-w-0 items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700/50">
                <TabButton
                  active={tab === 'compositions'}
                  onClick={() => setTab('compositions')}
                  icon={Layers}
                  label="Composições"
                />
                <TabButton
                  active={tab === 'items'}
                  onClick={() => setTab('items')}
                  icon={Package}
                  label="Insumos"
                />
              </div>

              <div className={cadastroListClasses.cardToolbar}>
                <div className={cadastroListClasses.searchFilterGroup}>
                  <div className={cadastroListClasses.searchFieldInGroup}>
                    <Input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder={
                        tab === 'compositions'
                          ? 'Buscar composição (ex.: alvenaria)'
                          : 'Buscar insumo (ex.: cimento)'
                      }
                      leftIcon={<Search className="h-4 w-4" />}
                      fullWidth
                    />
                  </div>
                  <div className={cadastroListClasses.filterIconButtonWrap}>
                    <Button
                      variant={showFilters || hasActiveFilters ? 'primary' : 'outline'}
                      className={cadastroListClasses.filterIconButton}
                      onClick={() => setShowFilters((prev) => !prev)}
                      aria-label="Filtros"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="w-full sm:w-[7rem]">
                  <StringSingleSelectDropdown
                    value={state}
                    onChange={setState}
                    options={metadata?.states ?? []}
                    placeholder="UF"
                    searchPlaceholder="Buscar UF..."
                    allowEmpty={false}
                  />
                </div>
                <div className="w-full sm:w-[11rem]">
                  <StringSingleSelectDropdown
                    value={month}
                    onChange={setMonth}
                    options={availableMonths.map((value) => ({
                      value,
                      label: formatMonthLabel(value),
                    }))}
                    placeholder="Mês"
                    disableSearch
                    allowEmpty={false}
                  />
                </div>
              </div>
            </div>

            {showFilters ? (
              <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-700/30">
                <div className="w-full sm:w-[12rem]">
                  <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                    Unidade
                  </p>
                  <StringSingleSelectDropdown
                    value={unit}
                    onChange={setUnit}
                    options={metadata?.units ?? []}
                    placeholder="Todas"
                    searchPlaceholder="Buscar unidade..."
                    allowEmpty
                    emptyOptionLabel="Todas"
                  />
                </div>
                <div className="w-full sm:w-[14rem]">
                  <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                    Regime tributário
                  </p>
                  <StringSingleSelectDropdown
                    value={regime}
                    onChange={setRegime}
                    options={[...REGIME_OPTIONS]}
                    disableSearch
                    allowEmpty={false}
                  />
                </div>
                {hasActiveFilters ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<X className="h-4 w-4" />}
                    onClick={() => {
                      setUnit('');
                      setRegime(REGIME_OPTIONS[0]);
                    }}
                  >
                    Limpar filtros
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardHeader>

          <CardContent className={cadastroListClasses.cardContent}>
            {activeQuery.isLoading ? (
              <CadastroListLoading message="Consultando base SINAPI..." />
            ) : activeQuery.isError ? (
              <CadastroListEmpty
                icon={Boxes}
                title="Não foi possível consultar a base SINAPI"
                hint="A API pública pode estar indisponível ou com limite de consultas atingido. Tente novamente em alguns instantes."
              />
            ) : total === 0 ? (
              <CadastroListEmpty
                icon={Boxes}
                title={
                  tab === 'compositions' ? 'Nenhuma composição encontrada' : 'Nenhum insumo encontrado'
                }
                hint="Ajuste a busca, a UF ou o mês de referência."
              />
            ) : (
              <>
                <CadastroListSummary
                  startItem={startItem}
                  endItem={endItem}
                  total={total}
                  itemLabel={tab === 'compositions' ? 'composição' : 'insumo'}
                  itemLabelPlural={tab === 'compositions' ? 'composições' : 'insumos'}
                  currentPage={page}
                  totalPages={totalPages}
                />

                <div className={cadastroListClasses.tableScroll}>
                  <table className={cadastroListClasses.table}>
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th scope="col" className={cadastroListClasses.thCenter}>
                          Código
                        </th>
                        <th scope="col" className={`${cadastroListClasses.th} min-w-[22rem]`}>
                          Descrição
                        </th>
                        <th scope="col" className={cadastroListClasses.thCenter}>
                          Unidade
                        </th>
                        <th scope="col" className={cadastroListClasses.thNumeric}>
                          {tab === 'compositions' ? 'Custo unitário' : 'Preço unitário'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {tab === 'compositions'
                        ? (compositionsQuery.data?.rows ?? []).map((row) => (
                            <tr
                              key={row.id}
                              className={getListTableRowClassName(true)}
                              onClick={() => setSelectedComposition(row)}
                            >
                              <td className={`${cadastroListClasses.tdCenter} font-mono tabular-nums`}>
                                <ListRowNavigableLabel className="font-mono tabular-nums">
                                  {row.code}
                                </ListRowNavigableLabel>
                              </td>
                              <td className={cadastroListClasses.td}>{row.description}</td>
                              <td className={cadastroListClasses.tdCenter}>{row.unit}</td>
                              <td
                                className={`${cadastroListClasses.tdNumeric} font-medium text-gray-900 dark:text-gray-100`}
                              >
                                {formatMoney(row.baseUnitCost)}
                              </td>
                            </tr>
                          ))
                        : (itemsQuery.data?.rows ?? []).map((row) => (
                            <tr
                              key={row.id}
                              className={getListTableRowClassName(true)}
                              onClick={() => setSelectedItem(row)}
                            >
                              <td className={`${cadastroListClasses.tdCenter} font-mono tabular-nums`}>
                                <ListRowNavigableLabel className="font-mono tabular-nums">
                                  {row.code}
                                </ListRowNavigableLabel>
                              </td>
                              <td className={cadastroListClasses.td}>{row.description}</td>
                              <td className={cadastroListClasses.tdCenter}>{row.unit}</td>
                              <td
                                className={`${cadastroListClasses.tdNumeric} font-medium text-gray-900 dark:text-gray-100`}
                              >
                                {formatMoney(row.unitPrice)}
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>

                <ListPagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </>
            )}

            <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-700/70 dark:text-gray-400">
              Dados do SINAPI (Caixa Econômica Federal / IBGE), consultados pela API pública SINPRES.
              Sem vínculo oficial com a Caixa.
            </p>
          </CardContent>
        </Card>
      </div>

      <CompositionDetailModal
        composition={selectedComposition}
        state={state}
        month={month}
        isDesonerated={isDesonerated}
        onClose={() => setSelectedComposition(null)}
      />

      <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </ProtectedRoute>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  iconBg,
  iconColor,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  hint: string;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className={`rounded-lg p-2.5 ${iconBg}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <p className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Layers;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-white text-red-600 shadow-sm dark:bg-gray-800 dark:text-red-400'
          : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

const RESOURCE_GROUP_LABEL: Record<'INPUT' | 'SUB_COMPOSITION', string> = {
  INPUT: 'Insumos',
  SUB_COMPOSITION: 'Subcomposições',
};

function CompositionDetailModal({
  composition,
  state,
  month,
  isDesonerated,
  onClose,
}: {
  composition: SinapiComposition | null;
  state: string;
  month: string;
  isDesonerated: boolean;
  onClose: () => void;
}) {
  const [showTree, setShowTree] = useState(false);

  useEffect(() => {
    setShowTree(false);
  }, [composition?.code]);

  const priceParams = useMemo(
    () => ({ state, month: month || undefined, isDesonerated: String(isDesonerated) }),
    [state, month, isDesonerated],
  );

  const detailQuery = useQuery({
    queryKey: ['sinapi-composition', composition?.code, priceParams],
    queryFn: async () => {
      const res = await api.get(`/sinapi/compositions/${composition?.code}`, {
        params: priceParams,
      });
      return (res.data?.data ?? null) as SinapiComposition | null;
    },
    enabled: Boolean(composition?.code),
    staleTime: CATALOG_STALE_TIME,
  });

  const treeQuery = useQuery({
    queryKey: ['sinapi-composition-tree', composition?.code, priceParams],
    queryFn: async () => {
      const res = await api.get(`/sinapi/compositions/${composition?.code}/tree`, {
        params: { ...priceParams, maxDepth: '5' },
      });
      return (res.data?.data ?? null) as SinapiTreeNode | null;
    },
    enabled: Boolean(composition?.code) && showTree,
    staleTime: CATALOG_STALE_TIME,
  });

  const detail = detailQuery.data ?? composition;
  const items = detail?.items ?? [];

  const groups = useMemo(() => {
    const byType = new Map<'INPUT' | 'SUB_COMPOSITION', SinapiCompositionItem[]>();
    for (const item of items) {
      const list = byType.get(item.itemType) ?? [];
      list.push(item);
      byType.set(item.itemType, list);
    }
    return (['INPUT', 'SUB_COMPOSITION'] as const)
      .filter((type) => (byType.get(type)?.length ?? 0) > 0)
      .map((type) => {
        const rows = byType.get(type) ?? [];
        return {
          type,
          rows,
          subtotal: rows.reduce((sum, row) => sum + (row.totalPrice ?? 0), 0),
        };
      });
  }, [items]);

  const computedTotal = groups.reduce((sum, group) => sum + group.subtotal, 0);

  return (
    <Modal
      isOpen={Boolean(composition)}
      onClose={onClose}
      size="5xl"
      title={
        composition ? (
          <div className="min-w-0">
            <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
              Composição {composition.code} · {composition.unit}
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
              {composition.description}
            </p>
          </div>
        ) : null
      }
    >
      {!composition ? null : detailQuery.isLoading ? (
        <Loading message="Carregando analítico..." size="md" />
      ) : detailQuery.isError ? (
        <CadastroListEmpty
          icon={Boxes}
          title="Não foi possível carregar o analítico"
          hint="Tente novamente em alguns instantes."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Custo unitário" value={formatMoney(detail?.baseUnitCost)} highlight />
            <MiniStat label="Unidade" value={detail?.unit ?? '—'} />
            <MiniStat
              label="Referência"
              value={`${state} · ${month ? formatMonthLabel(month) : '—'}`}
            />
            <MiniStat label="Itens no analítico" value={String(items.length)} />
          </div>

          {items.length === 0 ? (
            <CadastroListEmpty
              icon={Boxes}
              title="Esta composição não possui analítico na base"
              hint="Alguns códigos de composição não têm itens publicados pela Caixa."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="table-scroll">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/40">
                    <tr>
                      <th className={cadastroListClasses.thCenter}>Código</th>
                      <th className={`${cadastroListClasses.th} min-w-[20rem]`}>Descrição</th>
                      <th className={cadastroListClasses.thCenter}>Un.</th>
                      <th className={cadastroListClasses.thNumeric}>Coeficiente</th>
                      <th className={cadastroListClasses.thNumeric}>Preço unit.</th>
                      <th className={cadastroListClasses.thNumeric}>Total</th>
                    </tr>
                  </thead>
                  {groups.map((group) => (
                    <tbody
                      key={group.type}
                      className="divide-y divide-gray-200 border-t border-gray-200 dark:divide-gray-700 dark:border-gray-700"
                    >
                      <tr className="bg-gray-50/70 dark:bg-gray-700/30">
                        <td
                          colSpan={5}
                          className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 sm:px-6 dark:text-gray-300"
                        >
                          {RESOURCE_GROUP_LABEL[group.type]} ({group.rows.length})
                        </td>
                        <td className="px-2 py-2 text-right text-xs font-semibold tabular-nums text-gray-700 sm:px-6 dark:text-gray-200">
                          {formatMoney(group.subtotal)}
                        </td>
                      </tr>
                      {group.rows.map((row) => (
                        <tr key={`${group.type}-${row.code}`}>
                          <td className={`${cadastroListClasses.tdCenter} font-mono`}>{row.code}</td>
                          <td className={cadastroListClasses.tdMuted}>{row.description}</td>
                          <td className={cadastroListClasses.tdCenter}>{row.unit}</td>
                          <td className={`${cadastroListClasses.tdNumeric} tabular-nums`}>
                            {formatCoefficient(row.coefficient)}
                          </td>
                          <td className={`${cadastroListClasses.tdNumeric} tabular-nums`}>
                            {formatMoney(row.unitPrice)}
                          </td>
                          <td
                            className={`${cadastroListClasses.tdNumeric} font-medium tabular-nums text-gray-900 dark:text-gray-100`}
                          >
                            {formatMoney(row.totalPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                  <tfoot className="border-t-2 border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-700/40">
                    <tr>
                      <td
                        colSpan={5}
                        className="px-2 py-3 text-right text-sm font-semibold text-gray-700 sm:px-6 dark:text-gray-200"
                      >
                        Total do analítico
                      </td>
                      <td className="px-2 py-3 text-right text-sm font-bold tabular-nums text-gray-900 sm:px-6 dark:text-gray-100">
                        {formatMoney(computedTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTree((prev) => !prev)}
              icon={
                <ChevronRight
                  className={`h-4 w-4 transition-transform ${showTree ? 'rotate-90' : ''}`}
                />
              }
            >
              {showTree ? 'Ocultar árvore completa' : 'Abrir árvore completa (subcomposições)'}
            </Button>

            {showTree ? (
              <div className="mt-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                {treeQuery.isLoading ? (
                  <Loading message="Expandindo subcomposições..." size="sm" />
                ) : treeQuery.isError || !treeQuery.data ? (
                  <p className="py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                    Não foi possível expandir esta composição.
                  </p>
                ) : (
                  <TreeNode node={treeQuery.data} />
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}

function TreeNode({ node }: { node: SinapiTreeNode }) {
  const isInput = node.item_type === 'INPUT';

  return (
    <div style={{ marginLeft: node.depth === 0 ? 0 : 16 }}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-l border-gray-200 py-1 pl-3 dark:border-gray-700">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            isInput
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          }`}
        >
          {isInput ? 'Insumo' : 'Composição'}
        </span>
        <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
          {node.code}
        </span>
        <span className="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-200">
          {node.description}
        </span>
        {node.coefficient ? (
          <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
            × {formatCoefficient(node.coefficient)} {node.unit}
          </span>
        ) : null}
        <span className="shrink-0 text-xs font-medium tabular-nums text-gray-700 dark:text-gray-300">
          {formatMoney(node.unit_price)}
        </span>
        {node.truncated ? (
          <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
            (truncado)
          </span>
        ) : null}
      </div>
      {node.items?.map((child) => (
        <TreeNode key={`${child.code}-${child.depth}-${child.coefficient ?? ''}`} node={child} />
      ))}
    </div>
  );
}

function ItemDetailModal({ item, onClose }: { item: SinapiItem | null; onClose: () => void }) {
  return (
    <Modal
      isOpen={Boolean(item)}
      onClose={onClose}
      size="2xl"
      title={
        item ? (
          <div className="min-w-0">
            <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
              Insumo {item.code} · {item.unit}
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
              {item.description}
            </p>
          </div>
        ) : null
      }
    >
      {!item ? null : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat label="Preço unitário" value={formatMoney(item.unitPrice)} highlight />
            <MiniStat
              label="Referência"
              value={`${item.stateCode ?? '—'} · ${
                item.referenceMonth ? formatMonthLabel(item.referenceMonth) : '—'
              }`}
            />
            <MiniStat label="Ficha atualizada em" value={item.sourceUpdatedAt || '—'} />
          </div>

          {item.imageUrl ? (
            <div className="flex justify-center rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-700/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.description}
                className="max-h-56 rounded-lg object-contain"
              />
            </div>
          ) : null}

          {item.technicalStandards ? (
            <DetailBlock label="Normas técnicas" value={item.technicalStandards} />
          ) : null}

          {item.generalInfo ? (
            <DetailBlock label="Informações gerais" value={item.generalInfo} />
          ) : null}

          {item.previousCode ? (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              Este código substitui o código anterior {item.previousCode} na base SINAPI.
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function MiniStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-sm font-semibold ${
          highlight
            ? 'text-red-600 dark:text-red-400'
            : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{value}</p>
    </div>
  );
}

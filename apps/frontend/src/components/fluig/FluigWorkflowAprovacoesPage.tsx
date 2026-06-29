'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Minus,
  Search,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListEmpty, CadastroListSummary } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
} from '@/components/ui/listTableUi';
import api from '@/lib/api';
import { formatFluigCellValue } from '@/lib/fluigCellValue';
import {
  countWorkflowSummary,
  extractPersonFromCellValue,
  FLUIG_WORKFLOW_APPROVAL_DATASET_G3,
  FLUIG_WORKFLOW_APPROVAL_DATASET_G5,
  getWorkflowSectorsForDataset,
  parseWorkflowApprovalRows,
  resolvePendingWithDisplay,
  SECTOR_TABLE_HEADERS,
  type ParsedWorkflowRow,
  type WorkflowStepStatus,
} from '@/lib/fluigWorkflowApproval';
import { ListPagination } from '@/components/ui/ListPagination';

const ITEMS_PER_PAGE = 25;

const ID_COL_TH =
  'w-[1%] whitespace-nowrap py-4 pl-3 pr-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:pl-6';
const ID_COL_TD =
  'w-[1%] whitespace-nowrap py-4 pl-3 pr-4 text-left align-middle text-sm text-gray-900 dark:text-gray-100 sm:pl-6';
const ID_COL_HEADER_INNER = 'inline-block min-w-[4.75rem] text-center';
const ID_COL_CELL_INNER = 'inline-block min-w-[4.75rem]';

const DATASETS = [
  { id: FLUIG_WORKFLOW_APPROVAL_DATASET_G3, label: 'G3' },
  { id: FLUIG_WORKFLOW_APPROVAL_DATASET_G5, label: 'G5' },
] as const;

type CardFilter = 'all' | 'approved' | 'compras' | 'tecnico' | 'diretoria' | 'other';

const FILTER_CARDS: {
  filter: CardFilter;
  label: string;
  countKey: keyof ReturnType<typeof countWorkflowSummary>;
  Icon: typeof FileText;
  iconBg: string;
  iconColor: string;
}[] = [
  {
    filter: 'all',
    label: 'Total',
    countKey: 'total',
    Icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    filter: 'approved',
    label: 'Aprovadas',
    countKey: 'fullyApproved',
    Icon: CheckCircle2,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  {
    filter: 'compras',
    label: 'Pend. Compras',
    countKey: 'pendingCompras',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    filter: 'tecnico',
    label: 'Pend. Gestor',
    countKey: 'pendingTecnico',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    filter: 'diretoria',
    label: 'Pend. Diretoria',
    countKey: 'pendingDiretoria',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
];

const WORKFLOW_CARD_LIST_CONFIG: Record<
  CardFilter,
  {
    title: string;
    Icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  all: {
    title: 'Todas as solicitações',
    Icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  approved: {
    title: 'Solicitações aprovadas',
    Icon: CheckCircle2,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  compras: {
    title: 'Pendências em Compras',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  tecnico: {
    title: 'Pendências em Gestor',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  diretoria: {
    title: 'Pendências em Diretoria',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  other: {
    title: 'Outras pendências',
    Icon: HelpCircle,
    iconBg: 'bg-slate-100 dark:bg-slate-800',
    iconColor: 'text-slate-600 dark:text-slate-400',
  },
};

function stepStatusBadgeClass(status: WorkflowStepStatus): string {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'rejected':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'waiting':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500';
  }
}

function pendingWithBadgeClass(statusClassName: string): string {
  if (/green/.test(statusClassName)) {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (/amber/.test(statusClassName)) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  }
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function stepStatusBadge(status: WorkflowStepStatus) {
  switch (status) {
    case 'approved':
      return {
        Icon: CheckCircle2,
        className: 'text-green-600 dark:text-green-400',
        label: 'Aprovado',
      };
    case 'pending':
      return {
        Icon: Clock,
        className: 'text-amber-600 dark:text-amber-400',
        label: 'Pendente',
      };
    case 'rejected':
      return {
        Icon: XCircle,
        className: 'text-red-600 dark:text-red-400',
        label: 'Rejeitado',
      };
    case 'waiting':
      return {
        Icon: Minus,
        className: 'text-gray-400 dark:text-gray-500',
        label: 'Aguardando',
      };
    default:
      return {
        Icon: HelpCircle,
        className: 'text-gray-400 dark:text-gray-500',
        label: '—',
      };
  }
}

function extractPersonName(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/\(([^)]+)\)/);
  if (match?.[1]?.trim()) return match[1].trim();
  return trimmed;
}

function StatusPersonCell({
  status,
  person,
  statusClassName = 'text-gray-700 dark:text-gray-300',
  asBadge = false,
}: {
  status: string;
  person?: string | null;
  statusClassName?: string;
  asBadge?: boolean;
}) {
  return (
    <div className="flex flex-col items-center space-y-1 text-center">
      {asBadge ? (
        <span
          className={`inline-flex max-w-full whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${pendingWithBadgeClass(statusClassName)}`}
        >
          {status}
        </span>
      ) : (
        <span
          className={`inline-flex max-w-full whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClassName}`}
        >
          {status}
        </span>
      )}
      {person ? <p className="text-xs text-gray-500 dark:text-gray-400">{person}</p> : null}
    </div>
  );
}

function getStepPersonName(step: ParsedWorkflowRow['steps'][number]): string | null {
  if (step.status === 'approved') {
    return (
      extractPersonName(step.approver) ??
      extractPersonFromCellValue(step.detail) ??
      extractPersonFromCellValue(step.pendingWith)
    );
  }

  if (step.status === 'pending') {
    return extractPersonName(step.pendingWith) ?? extractPersonFromCellValue(step.detail);
  }

  if (step.status === 'rejected') {
    return extractPersonName(step.approver ?? step.pendingWith);
  }

  return null;
}

function ApprovalStepCell({ step }: { step: ParsedWorkflowRow['steps'][number] }) {
  const badge = stepStatusBadge(step.status);
  const person = getStepPersonName(step);

  return (
    <StatusPersonCell
      status={badge.label}
      person={person}
      statusClassName={stepStatusBadgeClass(step.status)}
    />
  );
}

function PendingWithCell({ row }: { row: ParsedWorkflowRow }) {
  const display = resolvePendingWithDisplay(row);
  return (
    <StatusPersonCell
      status={display.status}
      person={display.person}
      statusClassName={display.statusClassName}
      asBadge
    />
  );
}

function ApprovalStepCellDetail({ step }: { step: ParsedWorkflowRow['steps'][number] }) {
  const badge = stepStatusBadge(step.status);
  const Icon = badge.Icon;

  return (
    <div className="min-w-[140px] space-y-0.5">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${badge.className}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{badge.label}</span>
      </div>
      {step.status === 'approved' && step.approver ? (
        <p className="text-xs text-gray-700 dark:text-gray-300">
          <span className="text-gray-500 dark:text-gray-400">Por: </span>
          {step.approver}
        </p>
      ) : null}
      {step.status === 'approved' && step.approvedAt ? (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{step.approvedAt}</p>
      ) : null}
      {step.status === 'pending' && step.pendingWith ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          <span className="text-gray-500 dark:text-gray-400">Com: </span>
          {step.pendingWith}
        </p>
      ) : null}
      {step.status === 'pending' && !step.pendingWith && step.detail ? (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{step.detail}</p>
      ) : null}
    </div>
  );
}

export function FluigWorkflowAprovacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [listPage, setListPage] = useState(1);
  const [detailRow, setDetailRow] = useState<ParsedWorkflowRow | null>(null);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const user = userData?.data ?? { name: 'Usuário', role: 'EMPLOYEE' as const };

  const datasetQueries = useQueries({
    queries: DATASETS.map(({ id }) => ({
      queryKey: ['fluig-workflow-approval', id],
      queryFn: async () => {
        const res = await api.post(`/fluig/datasets/${encodeURIComponent(id)}/data`, {}, {
          timeout: 130000,
        });
        return res.data;
      },
      staleTime: 5 * 60 * 1000,
    })),
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const activeQuery = datasetQueries[activeTab];
  const datasetId = DATASETS[activeTab]?.id ?? DATASETS[0].id;
  const content = activeQuery?.data?.data?.content;
  const values = (content?.values ?? []) as Record<string, unknown>[];
  const columns = (content?.columns ?? (values[0] ? Object.keys(values[0]) : [])) as string[];

  const { rows } = useMemo(
    () => parseWorkflowApprovalRows(values, columns, datasetId),
    [values, columns, datasetId]
  );

  const summary = useMemo(() => countWorkflowSummary(rows), [rows]);

  const visibleSectors = useMemo(() => getWorkflowSectorsForDataset(datasetId), [datasetId]);

  const visibleFilterCards = useMemo(
    () =>
      FILTER_CARDS.filter((card) => {
        if (card.filter === 'other') return false;
        if (card.filter === 'compras' && !visibleSectors.includes('compras')) return false;
        return true;
      }),
    [visibleSectors]
  );

  const listHeader = WORKFLOW_CARD_LIST_CONFIG[cardFilter];
  const ListHeaderIcon = listHeader.Icon;

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (cardFilter === 'approved' && !row.fullyApproved) return false;
      if (cardFilter === 'compras' && row.currentPendingSector !== 'compras') return false;
      if (cardFilter === 'tecnico' && row.currentPendingSector !== 'tecnico') return false;
      if (cardFilter === 'diretoria' && row.currentPendingSector !== 'diretoria') return false;
      if (cardFilter === 'other' && (row.fullyApproved || row.currentPendingSector)) return false;

      if (!term) return true;
      const hay = [
        row.processId,
        row.title,
        row.filial ?? '',
        row.currentStage ?? '',
        row.currentPendingWith ?? '',
        ...row.steps.flatMap((s) => [s.approver ?? '', s.pendingWith ?? '', s.detail ?? '']),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, search, cardFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));

  const paginatedRows = useMemo(() => {
    const start = (listPage - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRows, listPage]);

  useEffect(() => {
    setListPage(1);
  }, [search, cardFilter, activeTab]);

  useEffect(() => {
    if (!visibleSectors.includes('compras') && cardFilter === 'compras') {
      setCardFilter('all');
    }
  }, [visibleSectors, cardFilter]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  const listStart =
    filteredRows.length === 0 ? 0 : (listPage - 1) * ITEMS_PER_PAGE + 1;
  const listEnd =
    filteredRows.length === 0
      ? 0
      : Math.min(listPage * ITEMS_PER_PAGE, filteredRows.length);

  const isLoading = datasetQueries.some((q) => q.isLoading);
  const isFetching = datasetQueries.some((q) => q.isFetching);
  const hasError = datasetQueries.some((q) => q.isError);
  const errorMessage =
    (datasetQueries.find((q) => q.error)?.error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message ?? 'Não foi possível carregar os dados do Fluig.';

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['fluig-workflow-approval'] });
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/fluig/aprovacoes-workflow">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/fluig/aprovacoes-workflow">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Aprovações Fluig
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Status de aprovação
            </p>
          </div>

          <div className="flex justify-center">
            <div className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              {DATASETS.map(({ id, label }, idx) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveTab(idx);
                    setCardFilter('all');
                    setListPage(1);
                  }}
                  className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
                    activeTab === idx
                      ? 'bg-white text-red-600 shadow-sm dark:bg-gray-900 dark:text-red-400'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {hasError && !isLoading ? (
            <Card className="w-full">
              <CardContent className="py-10 text-center">
                <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
                <Button type="button" className="mt-4" onClick={refetch}>
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          ) : isLoading ? (
            <Card className="w-full">
              <CardContent className="py-16">
                <Loading message="Carregando solicitações do Fluig..." size="lg" />
              </CardContent>
            </Card>
          ) : (
            <>
              <div
                className={`grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 ${
                  visibleFilterCards.length >= 5
                    ? '2xl:grid-cols-5'
                    : visibleFilterCards.length === 4
                      ? '2xl:grid-cols-4'
                      : '2xl:grid-cols-3'
                }`}
              >
                {visibleFilterCards.map((card) => (
                  <FilterStatCard
                    key={card.filter}
                    label={card.label}
                    count={summary[card.countKey]}
                    icon={card.Icon}
                    iconBg={card.iconBg}
                    iconColor={card.iconColor}
                    isActive={cardFilter === card.filter}
                    loading={isFetching}
                    onClick={() => setCardFilter(card.filter)}
                  />
                ))}
              </div>

              <Card className={cadastroListClasses.card}>
                <CardHeader className={cadastroListClasses.cardHeader}>
                  <div className={cadastroListClasses.cardHeaderRow}>
                    <div className={cadastroListClasses.cardHeaderIconRow}>
                      <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                        <ListHeaderIcon
                          className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`}
                        />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {listHeader.title}
                        </h3>
                      </div>
                    </div>
                    <div className={cadastroListClasses.cardToolbar}>
                      <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                        <input
                          type="search"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar código, aprovador..."
                          className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                        {search ? (
                          <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                            aria-label="Limpar busca"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className={cadastroListClasses.cardContent}>
                  {filteredRows.length === 0 ? (
                    <CadastroListEmpty
                      icon={ListHeaderIcon}
                      title="Nenhuma solicitação encontrada"
                      hint="Ajuste os filtros ou a busca para ver outros resultados."
                    />
                  ) : (
                    <>
                      <CadastroListSummary
                        startItem={listStart}
                        endItem={listEnd}
                        total={filteredRows.length}
                        itemLabel="solicitação"
                        itemLabelPlural="solicitações"
                        currentPage={listPage}
                        totalPages={totalPages}
                      />
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <colgroup>
                            <col className="w-[1%]" />
                          </colgroup>
                          <thead className="border-b border-gray-200 dark:border-gray-700">
                            <tr>
                              <th className={ID_COL_TH}>
                                <span className={ID_COL_HEADER_INNER}>ID</span>
                              </th>
                              {visibleSectors.map((sector) => (
                                <th key={sector} className={cadastroListClasses.thCenter}>
                                  {SECTOR_TABLE_HEADERS[sector]}
                                </th>
                              ))}
                              <th className={cadastroListClasses.thCenter}>Pendente com</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                            {paginatedRows.map((row) => (
                              <tr
                                key={row.rowKey}
                                className={getListTableRowClassName(true)}
                                onClick={() => setDetailRow(row)}
                              >
                                <td className={ID_COL_TD}>
                                  <span className={ID_COL_CELL_INNER}>
                                    <ListRowNavigableLabel className="font-mono font-medium">
                                      {row.processId}
                                    </ListRowNavigableLabel>
                                  </span>
                                </td>
                                {visibleSectors.map((sector) => {
                                  const step = row.steps.find((s) => s.sector === sector)!;
                                  return (
                                    <td key={sector} className={cadastroListClasses.tdCenter}>
                                      <ApprovalStepCell step={step} />
                                    </td>
                                  );
                                })}
                                <td className={cadastroListClasses.tdCenter}>
                                  <PendingWithCell row={row} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <ListPagination
                        currentPage={listPage}
                        totalPages={totalPages}
                        onPageChange={setListPage}
                        className={cadastroListClasses.pagination}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Modal
          isOpen={detailRow != null}
          onClose={() => setDetailRow(null)}
          title={detailRow ? `Processo ${detailRow.processId}` : 'Detalhes'}
          size="xl"
        >
          {detailRow ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{detailRow.title}</p>
                {detailRow.currentStage ? (
                  <p className="mt-1 text-xs text-gray-500">Etapa atual: {detailRow.currentStage}</p>
                ) : null}
              </div>

              <div className={`grid gap-3 ${visibleSectors.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                {detailRow.steps
                  .filter((step) => visibleSectors.includes(step.sector))
                  .map((step) => (
                  <div
                    key={step.sector}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {step.label}
                    </p>
                    <div className="mt-2">
                      <ApprovalStepCellDetail step={step} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(detailRow.raw).map(([key, val]) => (
                      <tr key={key} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="whitespace-nowrap bg-gray-50 px-3 py-2 font-medium text-gray-600 dark:bg-gray-900/50 dark:text-gray-400">
                          {key}
                        </td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                          {formatFluigCellValue(val) || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

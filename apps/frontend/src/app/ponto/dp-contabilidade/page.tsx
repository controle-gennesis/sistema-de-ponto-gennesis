'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Ban,
  Calculator,
  CheckCircle2,
  CircleDot,
  ClipboardList,
  FileText,
  Filter,
  MailPlus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { ContabilRequestDetailsView } from '@/lib/contabilRequestDetailsView';
import { FORM_FIELD_NO_FOCUS_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DpRequestMessages } from '@/components/dp/DpRequestMessages';
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { AppTabButton } from '@/components/ui/AppTabButton';
import { TabCountBadge } from '@/components/ui/TabCountBadge';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import {
  cadastroListClasses,
  RowActionMenuCell,
  RowActionMenuPortal,
} from '@/components/ui/RowActionMenu';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';

const PAGE_SIZE = 20;
const QUERY_KEY = 'dp-contabilidade';

const REQUEST_TYPES = [
  'ADMISSAO',
  'AFASTAMENTO',
  'ALTERACAO_FUNCAO',
  'ALTERACAO_SALARIAL',
  'CONVENCAO_COLETIVA',
  'FECHAMENTO_FOLHA',
  'FERIAS',
  'IMPOSTOS_ENCARGOS',
  'REALOCACAO_COLABORADOR',
  'RESCISAO',
  'RETIFICACAO_RECALCULO',
  'SOLICITACAO_GERAL',
] as const;

type RequestType = (typeof REQUEST_TYPES)[number];
type RequestStatus = 'OPEN' | 'IN_PROGRESS' | 'CONCLUDED' | 'CANCELLED';

type Comment = {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
};

type DpContabilidadeRequest = {
  id: string;
  displayNumber: number;
  createdByUserId: string;
  createdByName: string;
  createdByEmail: string;
  sector: string | null;
  requestType: RequestType;
  title: string;
  description: string;
  contractId: string | null;
  contractName: string | null;
  status: RequestStatus;
  concludedAt: string | null;
  cancelledAt: string | null;
  sourceDpRequestId?: string | null;
  /** Dados estruturados da solicitação interna criada direto para a Contabilidade. */
  source?: {
    displayNumber: number;
    requestType: string;
    details: unknown;
    company: string | null;
    polo: string | null;
    prazoInicio: string;
    prazoFim: string;
    costCenterName: string | null;
    employeeNames: Record<string, string>;
  } | null;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
};

type ListResponse = {
  success: boolean;
  data: DpContabilidadeRequest[];
  stats: {
    total: number;
    OPEN: number;
    IN_PROGRESS: number;
    CONCLUDED: number;
    CANCELLED: number;
  };
};

const TYPE_LABELS: Record<RequestType, string> = {
  ADMISSAO: 'Admissão',
  AFASTAMENTO: 'Afastamento',
  ALTERACAO_FUNCAO: 'Alteração de Função',
  ALTERACAO_SALARIAL: 'Alteração Salarial',
  CONVENCAO_COLETIVA: 'Convenção Coletiva / CCT',
  FECHAMENTO_FOLHA: 'Fechamento da Folha',
  FERIAS: 'Férias',
  IMPOSTOS_ENCARGOS: 'Impostos / Encargos da Folha',
  REALOCACAO_COLABORADOR: 'Realocação de Colaborador',
  RESCISAO: 'Rescisão',
  RETIFICACAO_RECALCULO: 'Retificação / Recálculo',
  SOLICITACAO_GERAL: 'Solicitação Geral',
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  CONCLUDED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE: Record<RequestStatus, string> = {
  OPEN: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  CONCLUDED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const STAGE_TABS: { filter: 'all' | RequestStatus; label: string }[] = [
  { filter: 'all', label: 'Todas' },
  { filter: 'OPEN', label: 'Abertas' },
  { filter: 'IN_PROGRESS', label: 'Em Andamento' },
  { filter: 'CONCLUDED', label: 'Concluídas' },
  { filter: 'CANCELLED', label: 'Canceladas' },
];

const STAGE_LIST_HEADER: Record<
  'all' | RequestStatus,
  { title: string; subtitle: string; Icon: React.ElementType; iconBg: string; iconColor: string }
> = {
  all: {
    title: 'Solicitações',
    subtitle: 'Pedidos recebidos e acompanhamento do atendimento',
    Icon: Calculator,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  OPEN: {
    title: 'Abertas',
    subtitle: 'Pedidos que ainda não foram atendidos',
    Icon: MailPlus,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  IN_PROGRESS: {
    title: 'Em Andamento',
    subtitle: 'Pedidos que a Contabilidade já começou a atender',
    Icon: CircleDot,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  CONCLUDED: {
    title: 'Concluídas',
    subtitle: 'Pedidos atendidos pela Contabilidade',
    Icon: CheckCircle2,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  CANCELLED: {
    title: 'Canceladas',
    subtitle: 'Pedidos cancelados, com o motivo no histórico',
    Icon: Ban,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

const EMPTY_STATS: ListResponse['stats'] = {
  total: 0,
  OPEN: 0,
  IN_PROGRESS: 0,
  CONCLUDED: 0,
  CANCELLED: 0,
};

function apiErrorMessage(err: unknown, fallback: string) {
  const ax = err as { response?: { data?: { error?: string; message?: string } } };
  return ax.response?.data?.error || ax.response?.data?.message || fallback;
}

export default function DpContabilidadePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | RequestType>('all');
  const [contractFilter, setContractFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [listPage, setListPage] = useState(1);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [selected, setSelected] = useState<DpContabilidadeRequest | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [confirmAction, setConfirmAction] = useState<'CONCLUDED' | 'CANCELLED' | null>(null);
  const [confirmComment, setConfirmComment] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const user = userData?.data ?? { name: 'Usuário', role: 'EMPLOYEE' as const };

  const { data: contractsData } = useQuery({
    queryKey: ['contracts-list-dp-contabilidade'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const contracts = (contractsData?.data || []) as Array<{
    id: string;
    name: string;
    number?: string;
  }>;

  const listParams = {
    q: debouncedSearch || undefined,
    type: typeFilter === 'all' ? undefined : typeFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    from: fromDate || undefined,
    to: toDate || undefined,
    contractId: contractFilter === 'all' ? undefined : contractFilter,
  };

  const { data: listData, isLoading } = useQuery({
    queryKey: [QUERY_KEY, listParams],
    queryFn: async () => {
      const res = await api.get('/dp-contabilidade', { params: listParams });
      return res.data as ListResponse;
    },
  });

  const requests = listData?.data ?? [];
  const stats = listData?.stats ?? EMPTY_STATS;
  const listHeader = STAGE_LIST_HEADER[statusFilter];
  const ListHeaderIcon = listHeader.Icon;

  const { startItem, endItem, totalPages } = getCadastroListRange(
    listPage,
    PAGE_SIZE,
    requests.length
  );
  const paginated = requests.slice((listPage - 1) * PAGE_SIZE, listPage * PAGE_SIZE);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(paginated);

  useEffect(() => {
    setListPage(1);
  }, [debouncedSearch, statusFilter, typeFilter, contractFilter, fromDate, toDate]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    contractFilter !== 'all' ||
    Boolean(fromDate) ||
    Boolean(toDate);

  const filterTypeOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: 'all', label: 'Todos' },
        ...REQUEST_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] })),
      ]),
    []
  );

  const filterStatusOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: 'all', label: 'Todos' },
        { value: 'OPEN', label: STATUS_LABELS.OPEN },
        { value: 'IN_PROGRESS', label: STATUS_LABELS.IN_PROGRESS },
        { value: 'CONCLUDED', label: STATUS_LABELS.CONCLUDED },
        { value: 'CANCELLED', label: STATUS_LABELS.CANCELLED },
      ]),
    []
  );

  const contractFilterOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: 'all', label: 'Todos' },
        ...contracts.map((c) => ({
          value: c.id,
          label: c.number ? `${c.number} — ${c.name}` : c.name,
        })),
      ]),
    [contracts]
  );

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: ['dp-contabilidade-pending-count'] });
  };

  const commentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const res = await api.post(`/dp-contabilidade/${id}/comments`, { body });
      return res.data as { data: DpContabilidadeRequest };
    },
    onSuccess: (payload) => {
      toast.success('Comentário registrado.');
      setCommentBody('');
      setSelected(payload.data);
      invalidateList();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Não foi possível enviar o comentário.')),
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      comment,
    }: {
      id: string;
      status: Exclude<RequestStatus, 'OPEN'>;
      comment?: string;
    }) => {
      const res = await api.put(`/dp-contabilidade/${id}/status`, { status, comment });
      return res.data as { data: DpContabilidadeRequest };
    },
    onSuccess: (payload, vars) => {
      const labels: Record<Exclude<RequestStatus, 'OPEN'>, string> = {
        IN_PROGRESS: 'Solicitação em andamento.',
        CONCLUDED: 'Solicitação concluída. O registro permanece no histórico.',
        CANCELLED: 'Solicitação cancelada. O registro permanece no histórico.',
      };
      toast.success(labels[vars.status]);
      setConfirmAction(null);
      setConfirmComment('');
      setCommentBody('');
      setSelected(payload.data);
      invalidateList();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Não foi possível atualizar o status.')),
  });

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setContractFilter('all');
    setFromDate('');
    setToDate('');
  };

  const canActOnSelected =
    selected?.status === 'OPEN' || selected?.status === 'IN_PROGRESS';

  // Concluir e cancelar pedem confirmação; o texto já digitado na caixa de mensagem segue junto.
  const openConfirm = (action: 'CONCLUDED' | 'CANCELLED') => {
    setConfirmComment(commentBody);
    setConfirmAction(action);
  };

  const closeConfirm = () => {
    if (statusMutation.isPending) return;
    setConfirmAction(null);
    setConfirmComment('');
  };

  const submitConfirm = () => {
    if (!selected || !confirmAction) return;
    const comment = confirmComment.trim();
    if (confirmAction === 'CANCELLED' && comment.length < 3) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }
    statusMutation.mutate({
      id: selected.id,
      status: confirmAction,
      comment: comment || undefined,
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  return (
    <ProtectedRoute route="/ponto/dp-contabilidade">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Atendimento Contábil"
            description="Registre pedidos à Contabilidade e acompanhe o andamento de cada um."
          />

          <div id="secao-etapas-contabil" className="scroll-mt-4 bg-transparent px-2">
            <nav
              aria-label="Etapas do atendimento"
              className="flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-visible py-3 sm:gap-x-2"
            >
              {STAGE_TABS.map((tab) => {
                const active = statusFilter === tab.filter;
                const count = tab.filter === 'all' ? stats.total : stats[tab.filter];
                return (
                  <React.Fragment key={tab.filter}>
                    <AppTabButton
                      active={active}
                      onClick={() => setStatusFilter(tab.filter)}
                      className="flex items-center gap-2 whitespace-nowrap px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm"
                    >
                      {tab.label}
                      <span className="app-tab__badge">
                        <TabCountBadge count={count ?? 0} active={active} tone="red" />
                      </span>
                    </AppTabButton>
                    {tab.filter === 'all' ? (
                      <span
                        aria-hidden
                        className="mx-0.5 inline-flex select-none items-center self-center text-sm font-light text-gray-300 dark:text-gray-600 sm:mx-1"
                      >
                        |
                      </span>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                    <ListHeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {listHeader.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{listHeader.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:w-[280px] sm:flex-none sm:basis-auto sm:min-w-[240px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por nº, título, solicitante..."
                      className={`h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-10 text-sm font-medium text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${FORM_FIELD_NO_FOCUS_CLS}`}
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        aria-label="Limpar busca"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(true)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Abrir filtro"
                    title="Filtro"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isLoading ? (
                  <CadastroListLoading message="Carregando solicitações..." />
                ) : requests.length === 0 ? (
                  hasActiveFilters ? (
                    <CadastroListEmpty
                      icon={ClipboardList}
                      title="Nenhuma solicitação encontrada"
                      hint="Ajuste a busca ou os filtros para ver outros resultados."
                    />
                  ) : (
                    <CadastroListEmpty
                      icon={ClipboardList}
                      title="Nenhuma solicitação ainda."
                      hint="Os pedidos chegam automaticamente quando o Departamento Pessoal finaliza uma solicitação. Tudo fica registrado para consulta."
                    />
                  )
                ) : (
                  <>
                    <CadastroListSummary
                      startItem={startItem}
                      endItem={endItem}
                      total={requests.length}
                      itemLabel="solicitação"
                      itemLabelPlural="solicitações"
                      currentPage={listPage}
                      totalPages={totalPages}
                    />
                    {hasActiveFilters ? (
                      <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">Filtro ativo</p>
                    ) : null}
                    <div className="table-scroll">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className={cadastroListClasses.th}>ID</th>
                            <th className={cadastroListClasses.th}>Título</th>
                            <th className={cadastroListClasses.thCenter}>Tipo</th>
                            <th className={cadastroListClasses.thCenter}>Unidade</th>
                            <th className={cadastroListClasses.thCenter}>Solicitante</th>
                            <th className={cadastroListClasses.thCenter}>Aberta em</th>
                            <th className={cadastroListClasses.thCenter}>Status</th>
                            <th className={cadastroListClasses.thRight}>Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                          {paginated.map((row) => (
                            <tr
                              key={row.id}
                              onClick={() => {
                                setCommentBody('');
                                setSelected(row);
                              }}
                              className={getListTableRowClassName(true)}
                            >
                              <td className="px-3 py-3 align-middle text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 sm:px-6">
                                <ListRowNavigableLabel className="font-medium tabular-nums">
                                  {row.displayNumber}
                                </ListRowNavigableLabel>
                              </td>
                              <td className="max-w-[280px] px-3 py-3 align-middle text-left text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                {row.title}
                              </td>
                              <td className="px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                {TYPE_LABELS[row.requestType]}
                              </td>
                              <td className="max-w-[240px] px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                {row.source?.costCenterName || row.contractName || '—'}
                              </td>
                              <td className="px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                <div className="flex flex-col items-center gap-0.5">
                                  <span>{row.createdByName || '—'}</span>
                                  {row.sector?.trim() ? (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {row.sector}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                {formatDateTimeBr(row.createdAt, '—')}
                              </td>
                              <td className="px-3 py-3 align-middle text-center sm:px-6">
                                <span
                                  className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[row.status]}`}
                                >
                                  {STATUS_LABELS[row.status]}
                                </span>
                              </td>
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(row.id)}
                                onToggle={(e) =>
                                  toggleRowActionMenu(row.id, e.currentTarget as HTMLButtonElement)
                                }
                              />
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ListPagination
                      currentPage={listPage}
                      totalPages={totalPages}
                      onPageChange={setListPage}
                    />
                    {rowActionMenu && rowForActionMenu ? (
                      <RowActionMenuPortal
                        menu={rowActionMenu}
                        onClose={closeRowActionMenu}
                        hideDefaultActions
                        extraItems={[
                          {
                            label: 'Ver detalhes',
                            onClick: () => {
                              setCommentBody('');
                              setSelected(rowForActionMenu);
                            },
                            icon: (
                              <FileText className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                            ),
                          },
                        ]}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </PageStack>

        <Modal
          isOpen={!!selected}
          onClose={() => {
            setSelected(null);
            setCommentBody('');
            setConfirmAction(null);
            setConfirmComment('');
          }}
          title={
            selected
              ? `Solicitação nº ${selected.displayNumber}`
              : 'Solicitação'
          }
          size="lg"
        >
          {selected ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-900/40 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Tipo
                  </p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {TYPE_LABELS[selected.requestType]}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Status
                  </p>
                  <p className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[selected.status]}`}
                    >
                      {STATUS_LABELS[selected.status]}
                    </span>
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Título
                  </p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">{selected.title}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Solicitante
                  </p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">{selected.createdByName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selected.createdByEmail}
                    {selected.sector ? ` · ${selected.sector}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Unidade
                  </p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {selected.source?.costCenterName || selected.contractName || '—'}
                  </p>
                </div>
                {selected.sourceDpRequestId ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Origem
                    </p>
                    <p className="mt-1 text-gray-900 dark:text-gray-100">
                      Enviada automaticamente ao finalizar a solicitação interna no DP.
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Aberta em
                  </p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {formatDateTimeBr(selected.createdAt, '—')}
                  </p>
                </div>
                {selected.concludedAt ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Concluída em
                    </p>
                    <p className="mt-1 text-gray-900 dark:text-gray-100">
                      {formatDateTimeBr(selected.concludedAt, '—')}
                    </p>
                  </div>
                ) : null}
                {selected.cancelledAt ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Cancelada em
                    </p>
                    <p className="mt-1 text-gray-900 dark:text-gray-100">
                      {formatDateTimeBr(selected.cancelledAt, '—')}
                    </p>
                  </div>
                ) : null}
              </div>

              {selected.source?.details ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Dados da solicitação nº {selected.source.displayNumber}
                  </p>
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-900/40 sm:grid-cols-2">
                    {[
                      { label: 'Unidade', value: selected.source.costCenterName },
                      { label: 'Empresa', value: selected.source.company },
                      { label: 'Polo', value: selected.source.polo },
                    ].map((item) => (
                      <div key={item.label}>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {item.label}
                        </p>
                        <p className="mt-1 text-gray-900 dark:text-gray-100">{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                  <ContabilRequestDetailsView
                    requestType={selected.source.requestType}
                    details={selected.source.details}
                    employeeNameById={new Map(Object.entries(selected.source.employeeNames ?? {}))}
                  />
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Descrição
                  </p>
                  <p className="whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                    {selected.description}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Histórico de mensagens
                </p>
                {selected.comments.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhuma mensagem registrada ainda.
                  </p>
                ) : (
                  <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
                    {selected.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {comment.userName}
                          </span>
                          <span>{formatDateTimeBr(comment.createdAt, '—')}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">
                          {comment.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selected.sourceDpRequestId ? (
                <DpRequestMessages
                  requestId={selected.sourceDpRequestId}
                  title={`Conversa com o DP${selected.source?.displayNumber ? ` (solicitação nº ${selected.source.displayNumber})` : ''}`}
                />
              ) : null}

              {canActOnSelected ? (
                <div className="space-y-3">
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    maxLength={4000}
                    placeholder="Escreva uma mensagem para a contabilidade ou para o DP..."
                    className={FORM_FIELD_TEXTAREA_CLS}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!commentBody.trim() || commentMutation.isPending}
                      onClick={() =>
                        commentMutation.mutate({ id: selected.id, body: commentBody.trim() })
                      }
                    >
                      {commentMutation.isPending ? 'Enviando...' : 'Enviar mensagem'}
                    </Button>
                    {selected.status === 'OPEN' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({ id: selected.id, status: 'IN_PROGRESS' })
                        }
                      >
                        Marcar em andamento
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="success"
                      disabled={statusMutation.isPending}
                      onClick={() => openConfirm('CONCLUDED')}
                    >
                      Concluir
                    </Button>
                    <Button
                      type="button"
                      variant="error"
                      disabled={statusMutation.isPending}
                      onClick={() => openConfirm('CANCELLED')}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Esta solicitação está encerrada e permanece disponível apenas para consulta.
                </p>
              )}
            </div>
          ) : null}
        </Modal>

        <Modal
          isOpen={!!selected && !!confirmAction}
          onClose={closeConfirm}
          title={confirmAction === 'CANCELLED' ? 'Cancelar solicitação' : 'Concluir solicitação'}
          size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {confirmAction === 'CANCELLED'
                ? 'Ao cancelar, a solicitação é encerrada e não poderá ser reaberta. Ela permanece no histórico.'
                : 'Ao concluir, a solicitação é encerrada e não poderá ser reaberta. Ela permanece no histórico.'}
            </p>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {confirmAction === 'CANCELLED' ? 'Motivo do cancelamento' : 'Mensagem (opcional)'}
              </label>
              <textarea
                value={confirmComment}
                onChange={(e) => setConfirmComment(e.target.value)}
                maxLength={4000}
                placeholder={
                  confirmAction === 'CANCELLED'
                    ? 'Explique por que está cancelando...'
                    : 'Registre uma observação final, se quiser...'
                }
                className={FORM_FIELD_TEXTAREA_CLS}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={statusMutation.isPending}
                onClick={closeConfirm}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant={confirmAction === 'CANCELLED' ? 'error' : 'success'}
                disabled={statusMutation.isPending}
                onClick={submitConfirm}
              >
                {statusMutation.isPending
                  ? 'Salvando...'
                  : confirmAction === 'CANCELLED'
                    ? 'Cancelar solicitação'
                    : 'Concluir solicitação'}
              </Button>
            </div>
          </div>
        </Modal>

        {isFiltersModalOpen && (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
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
              <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Status
                    </label>
                    <SingleSelectSearchDropdown
                      value={statusFilter}
                      onChange={(value) => setStatusFilter(value as 'all' | RequestStatus)}
                      options={filterStatusOptions}
                      allowEmpty={false}
                      placeholder="Todos"
                      searchPlaceholder="Pesquisar..."
                      noFocusRing
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Tipo
                    </label>
                    <SingleSelectSearchDropdown
                      value={typeFilter}
                      onChange={(value) => setTypeFilter(value as 'all' | RequestType)}
                      options={filterTypeOptions}
                      allowEmpty={false}
                      placeholder="Todos"
                      searchPlaceholder="Pesquisar..."
                      noFocusRing
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Contrato
                    </label>
                    <SingleSelectSearchDropdown
                      value={contractFilter}
                      onChange={setContractFilter}
                      options={contractFilterOptions}
                      allowEmpty={false}
                      placeholder="Todos"
                      searchPlaceholder="Pesquisar..."
                      noFocusRing
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      De
                    </label>
                    <DatePickerField
                      value={fromDate}
                      onChange={setFromDate}
                      placeholder="Data inicial"
                      noFocusRing
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Até
                    </label>
                    <DatePickerField
                      value={toDate}
                      onChange={setToDate}
                      placeholder="Data final"
                      noFocusRing
                    />
                  </div>
                </div>
              </div>
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
          </AppModalOverlay>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

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
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_NO_FOCUS_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
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

const EMPTY_STATS: ListResponse['stats'] = {
  total: 0,
  OPEN: 0,
  IN_PROGRESS: 0,
  CONCLUDED: 0,
  CANCELLED: 0,
};

const emptyCreateForm = {
  requestType: '' as RequestType | '',
  title: '',
  description: '',
  contractId: '',
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selected, setSelected] = useState<DpContabilidadeRequest | null>(null);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [commentBody, setCommentBody] = useState('');

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

  const typeOptions = useMemo(
    () =>
      labeledToSelectOptions(
        REQUEST_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }))
      ),
    []
  );

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

  const createContractOptions = useMemo(
    () =>
      labeledToSelectOptions(
        contracts.map((c) => ({
          value: c.id,
          label: c.number ? `${c.number} — ${c.name}` : c.name,
        }))
      ),
    [contracts]
  );

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/dp-contabilidade', {
        requestType: createForm.requestType,
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        contractId: createForm.contractId || null,
      });
      return res.data as { data: DpContabilidadeRequest };
    },
    onSuccess: () => {
      toast.success('Solicitação registrada.');
      setIsCreateModalOpen(false);
      setCreateForm(emptyCreateForm);
      invalidateList();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Não foi possível abrir a solicitação.')),
  });

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
    mutationFn: async ({ id, status }: { id: string; status: Exclude<RequestStatus, 'OPEN'> }) => {
      const res = await api.put(`/dp-contabilidade/${id}/status`, { status });
      return res.data as { data: DpContabilidadeRequest };
    },
    onSuccess: (payload, vars) => {
      const labels: Record<Exclude<RequestStatus, 'OPEN'>, string> = {
        IN_PROGRESS: 'Solicitação em andamento.',
        CONCLUDED: 'Solicitação concluída. O registro permanece no histórico.',
        CANCELLED: 'Solicitação cancelada. O registro permanece no histórico.',
      };
      toast.success(labels[vars.status]);
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

  const openCreate = () => {
    setCreateForm(emptyCreateForm);
    setIsCreateModalOpen(true);
  };

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.requestType) {
      toast.error('Selecione o tipo da solicitação.');
      return;
    }
    if (createForm.title.trim().length < 3) {
      toast.error('Informe um título com pelo menos 3 caracteres.');
      return;
    }
    if (createForm.description.trim().length < 8) {
      toast.error('Descreva a solicitação com pelo menos 8 caracteres.');
      return;
    }
    createMutation.mutate();
  };

  const canActOnSelected =
    selected?.status === 'OPEN' || selected?.status === 'IN_PROGRESS';

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  return (
    <ProtectedRoute route="/ponto/dp-contabilidade">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              DP/Contabilidade
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Comunicação do Departamento Pessoal com a Contabilidade. As solicitações ficam
              registradas para consulta e não passam por aprovação.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FilterStatCard
              label="Abertas"
              count={stats.OPEN}
              icon={MailPlus}
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
              isActive={statusFilter === 'OPEN'}
              loading={isLoading}
              onClick={() => setStatusFilter((prev) => (prev === 'OPEN' ? 'all' : 'OPEN'))}
            />
            <FilterStatCard
              label="Em andamento"
              count={stats.IN_PROGRESS}
              icon={CircleDot}
              iconBg="bg-yellow-100 dark:bg-yellow-900/30"
              iconColor="text-yellow-600 dark:text-yellow-400"
              isActive={statusFilter === 'IN_PROGRESS'}
              loading={isLoading}
              onClick={() =>
                setStatusFilter((prev) => (prev === 'IN_PROGRESS' ? 'all' : 'IN_PROGRESS'))
              }
            />
            <FilterStatCard
              label="Concluídas"
              count={stats.CONCLUDED}
              icon={CheckCircle2}
              iconBg="bg-green-100 dark:bg-green-900/30"
              iconColor="text-green-600 dark:text-green-400"
              isActive={statusFilter === 'CONCLUDED'}
              loading={isLoading}
              onClick={() =>
                setStatusFilter((prev) => (prev === 'CONCLUDED' ? 'all' : 'CONCLUDED'))
              }
            />
            <FilterStatCard
              label="Canceladas"
              count={stats.CANCELLED}
              icon={Ban}
              iconBg="bg-red-100 dark:bg-red-900/30"
              iconColor="text-red-600 dark:text-red-400"
              isActive={statusFilter === 'CANCELLED'}
              loading={isLoading}
              onClick={() =>
                setStatusFilter((prev) => (prev === 'CANCELLED' ? 'all' : 'CANCELLED'))
              }
            />
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-blue-100 p-2 sm:p-3 dark:bg-blue-900/30">
                    <Calculator className="h-5 w-5 text-blue-600 sm:h-6 sm:w-6 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Solicitações
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Histórico permanente de comunicação com a contabilidade
                    </p>
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
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova solicitação</span>
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
                    <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center dark:border-gray-600">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Nenhuma solicitação encontrada para os filtros aplicados.
                      </p>
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="mt-2 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  ) : (
                    <CadastroListEmpty
                      icon={ClipboardList}
                      title="Nenhuma solicitação ainda."
                      hint="Use Nova solicitação para enviar um pedido à contabilidade. Tudo fica registrado para consulta futura."
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
                            <th className={cadastroListClasses.thCenter}>Tipo</th>
                            <th className={cadastroListClasses.thCenter}>Título</th>
                            <th className={cadastroListClasses.thCenter}>Contrato</th>
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
                              <td className="px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                {TYPE_LABELS[row.requestType]}
                              </td>
                              <td className="max-w-[280px] px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                {row.title}
                              </td>
                              <td className="max-w-[240px] px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                {row.contractName || '—'}
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
        </div>

        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Nova solicitação"
          size="lg"
          contentOverflowVisible
          elevated
        >
          <form onSubmit={submitCreate} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Tipo de solicitação
              </label>
              <SingleSelectSearchDropdown
                value={createForm.requestType}
                onChange={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    requestType: value as RequestType,
                    title:
                      !prev.title.trim() ||
                      (prev.requestType && prev.title === TYPE_LABELS[prev.requestType])
                        ? TYPE_LABELS[value as RequestType]
                        : prev.title,
                  }))
                }
                options={typeOptions}
                allowEmpty={false}
                placeholder="Selecione o tipo"
                searchPlaceholder="Pesquisar tipo..."
                noFocusRing
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Título
              </label>
              <input
                value={createForm.title}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                maxLength={180}
                placeholder="Resumo da solicitação"
                className={FORM_FIELD_INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Descrição
              </label>
              <textarea
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                }
                maxLength={8000}
                placeholder="Detalhe o que a contabilidade precisa tratar."
                className={`${FORM_FIELD_TEXTAREA_CLS} min-h-[140px]`}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Contrato (opcional)
              </label>
              <SingleSelectSearchDropdown
                value={createForm.contractId}
                onChange={(value) => setCreateForm((prev) => ({ ...prev, contractId: value }))}
                options={createContractOptions}
                allowEmpty
                emptyOptionLabel="Nenhum"
                placeholder="Vincular a um contrato"
                searchPlaceholder="Pesquisar contrato..."
                noFocusRing
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Enviando...' : 'Enviar solicitação'}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={!!selected}
          onClose={() => {
            setSelected(null);
            setCommentBody('');
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
                    Contrato
                  </p>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {selected.contractName || '—'}
                  </p>
                </div>
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

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Descrição
                </p>
                <p className="whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {selected.description}
                </p>
              </div>

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
                      onClick={() =>
                        statusMutation.mutate({ id: selected.id, status: 'CONCLUDED' })
                      }
                    >
                      Concluir
                    </Button>
                    <Button
                      type="button"
                      variant="error"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({ id: selected.id, status: 'CANCELLED' })
                      }
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

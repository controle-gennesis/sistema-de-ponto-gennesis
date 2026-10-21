'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Edit,
  Eye,
  FileCheck2,
  Filter,
  Hourglass,
  MoreVertical,
  Plus,
  Search,
  Timer,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { FichaDemandaApprovalFormModal } from '@/components/engenharia/FichaDemandaApprovalFormModal';
import { FichaDemandaDetailModal } from '@/components/engenharia/FichaDemandaDetailModal';
import { FichaDemandaImportModal } from '@/components/engenharia/FichaDemandaImportModal';
import { FdStatusBadges } from '@/components/engenharia/FdStatusBadges';
import api from '@/lib/api';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  listTableRowClasses,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import {
  formatCurrencyDisplay,
  formToApiPayload,
  type FichaDemandaApprovalFormState,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { ListPagination } from '@/components/ui/ListPagination';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { FilterStatCard } from '@/components/ui/FilterStatCard';

const ROW_ACTION_MENU_WIDTH_PX = 224;

type CardFilter = 'ALL' | 'IN_APPROVAL' | 'PENDING' | 'QUOTATION' | 'FINISHED' | 'CANCELLED';

/** Aguardando Aprovação = aguardando o gestor. Fila/Cotação/Finalizadas = status de compras da ficha já aprovada. */
function matchesCard(r: FichaDemandaApprovalRecord, card: CardFilter): boolean {
  switch (card) {
    case 'ALL':
      return true;
    case 'IN_APPROVAL':
      return r.status === 'WAITING_MANAGER';
    case 'PENDING':
      return r.status === 'APPROVED' && !r.purchaseStatus;
    case 'QUOTATION':
      return (
        r.status === 'APPROVED' &&
        (r.purchaseStatus === 'QUOTATION' ||
          r.purchaseStatus === 'PURCHASE_REQUEST' ||
          r.purchaseStatus === 'SUPPLIES')
      );
    case 'FINISHED':
      return r.purchaseStatus === 'FINISHED';
    case 'CANCELLED':
      return r.status === 'CANCELLED' || r.purchaseStatus === 'CANCELLED';
  }
}

const CARD_STYLE: Record<
  CardFilter,
  { label: string; subtitle: string; Icon: LucideIcon; iconBg: string; iconColor: string }
> = {
  ALL: {
    label: 'Todas',
    subtitle: 'Todas as fichas de demanda cadastradas',
    Icon: ClipboardList,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  IN_APPROVAL: {
    label: 'Aprovação',
    subtitle: 'Fichas aguardando a aprovação do gestor',
    Icon: FileCheck2,
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  PENDING: {
    label: 'Fila',
    subtitle: 'Fichas aprovadas aguardando a criação da solicitação de compra',
    Icon: Hourglass,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  QUOTATION: {
    label: 'Cotação',
    subtitle: 'Fichas em cotação, com uma ou mais ordens de compra',
    Icon: Timer,
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
  },
  FINISHED: {
    label: 'Finalizadas',
    subtitle: 'Fichas com a compra finalizada',
    Icon: CheckCircle2,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  CANCELLED: {
    label: 'Canceladas',
    subtitle: 'Fichas canceladas',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

const CARD_ORDER: CardFilter[] = [
  'ALL',
  'IN_APPROVAL',
  'PENDING',
  'QUOTATION',
  'FINISHED',
  'CANCELLED',
];
const ITEMS_PER_PAGE = 20;

export default function AprovacaoFdsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contratoFiltro = (searchParams?.get('contrato') || '').trim();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CardFilter>('ALL');
  const [contratoFilter, setContratoFilter] = useState(contratoFiltro || 'ALL');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FichaDemandaApprovalRecord | null>(null);
  const [detailRecord, setDetailRecord] = useState<FichaDemandaApprovalRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rowActionMenu, setRowActionMenu] = useState<{
    rowId: string;
    top: number;
    left: number;
  } | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['demand-sheet-approvals', searchTerm, contratoFilter],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals', {
        params: {
          search: searchTerm || undefined,
          contratoId: contratoFilter !== 'ALL' ? contratoFilter : undefined,
        },
      });
      return (res.data?.data || []) as FichaDemandaApprovalRecord[];
    },
    enabled: !loadingUser,
  });

  const { data: contratosData } = useQuery({
    queryKey: ['fd-approval-contrato-options'],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals/options/contratos');
      return (res.data?.data ?? []) as Array<{ id: string; name: string; number?: string }>;
    },
    enabled: !loadingUser,
  });
  const contratoOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: 'ALL', label: 'Todos' },
        ...(contratosData ?? []).map((c) => ({ value: c.id, label: c.name })),
      ]),
    [contratosData]
  );
  const hasActiveFilter = contratoFilter !== 'ALL';

  const allRecords = useMemo(() => listData || [], [listData]);
  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        CARD_ORDER.map((card) => [card, allRecords.filter((r) => matchesCard(r, card)).length])
      ) as Record<CardFilter, number>,
    [allRecords]
  );
  const records = useMemo(
    () => allRecords.filter((r) => matchesCard(r, statusFilter)),
    [allRecords, statusFilter]
  );
  const listHeader = CARD_STYLE[statusFilter];
  const ListHeaderIcon = listHeader.Icon;
  const totalFiltered = records.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = records.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(startIndex + ITEMS_PER_PAGE, totalFiltered);
  const isListEmpty = !loadingList && totalFiltered === 0;

  const rowForActionMenu = rowActionMenu
    ? records.find((r) => r.id === rowActionMenu.rowId) ?? null
    : null;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, contratoFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!rowActionMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRowActionMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rowActionMenu]);

  useEffect(() => {
    if (rowActionMenu && !records.some((r) => r.id === rowActionMenu.rowId)) {
      setRowActionMenu(null);
    }
  }, [rowActionMenu, records]);

  const modalOpen = showForm || deleteId != null || detailRecord != null;

  useEffect(() => {
    if (!modalOpen) return;
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [modalOpen]);

  const createMutation = useMutation({
    mutationFn: async (form: FichaDemandaApprovalFormState) => {
      const res = await api.post('/demand-sheet-approvals', formToApiPayload(form));
      return res.data;
    },
    onSuccess: () => {
      toast.success('Ficha registrada. Aguardando aprovação.');
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      setShowForm(false);
      setEditingRecord(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao salvar ficha');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      form,
    }: {
      id: string;
      form: FichaDemandaApprovalFormState;
    }) => {
      const res = await api.patch(`/demand-sheet-approvals/${id}`, formToApiPayload(form));
      return res.data;
    },
    onSuccess: () => {
      toast.success('Ficha atualizada.');
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      setShowForm(false);
      setEditingRecord(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao atualizar ficha');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/demand-sheet-approvals/${id}`);
    },
    onSuccess: () => {
      toast.success('Registro excluído.');
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      setDeleteId(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    },
  });

  const handleSave = (form: FichaDemandaApprovalFormState) => {
    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setEditingRecord(null);
    setShowForm(true);
  };

  const openDetail = (row: FichaDemandaApprovalRecord) => {
    setDetailRecord(row);
  };

  const openEdit = (row: FichaDemandaApprovalRecord) => {
    if (row.status !== 'WAITING_MANAGER') {
      toast.error('Somente fichas aguardando aprovação podem ser editadas.');
      return;
    }
    setEditingRecord(row);
    setShowForm(true);
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/aprovacao-fds">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/aprovacao-fds">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Fichas de Demanda"
            description="Cadastre e acompanhe as fichas de demanda."
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-6">
            {CARD_ORDER.map((card) => {
              const style = CARD_STYLE[card];
              return (
                <FilterStatCard
                  key={card}
                  label={style.label}
                  count={statusCounts[card]}
                  icon={style.Icon}
                  iconBg={style.iconBg}
                  iconColor={style.iconColor}
                  loading={loadingList}
                  isActive={statusFilter === card}
                  onClick={() => setStatusFilter((prev) => (prev === card ? 'ALL' : card))}
                />
              );
            })}
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
                      {statusFilter === 'ALL' ? 'Fichas de Demanda' : listHeader.label}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {statusFilter === 'ALL'
                        ? 'Gerencie as fichas de demanda cadastradas'
                        : listHeader.subtitle}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por código FD, pedido, contrato..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveFilter
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveFilter ? 'Filtro (contrato ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilter ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImport(true)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Importar"
                    title="Importar"
                  >
                    <Upload className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova Ficha de Demanda</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <CadastroListLoading message="Carregando fichas..." />
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <ClipboardCheck className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma ficha de demanda encontrada</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                    {searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre uma nova ficha para começar'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                      {totalFiltered === 1 ? 'ficha' : 'fichas'}
                    </span>
                    <span>
                      Página {currentPage} de {totalPages}
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Código da FD
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            ID / Nº Mov.
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Pedido
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Contrato
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Solicitante
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Polo
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Status
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Faturamento
                          </th>
                          <th className={`${listTableRowClasses.actionTh} text-center`}>
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => openDetail(row)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openDetail(row);
                              }
                            }}
                            tabIndex={0}
                            role="button"
                            className={getListTableRowClassName(true, listTableRowClasses.tr)}
                          >
                            <td className="px-3 py-4 text-left sm:px-6">
                              <ListRowNavigableLabel className="text-sm font-medium">
                                {row.codFichaDemanda}
                              </ListRowNavigableLabel>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-center tabular-nums sm:px-6">
                              <p className="text-gray-900 dark:text-gray-100">
                                {row.idMovRm?.trim() || '—'}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {row.numMovRm?.trim() || '—'}
                              </p>
                            </td>
                            <td className="px-3 py-4 text-center text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.codigoPedido}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-center uppercase text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.contratoNome}
                            </td>
                            <td className="px-3 py-4 text-center text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.solicitanteNome}
                            </td>
                            <td className="px-3 py-4 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.polo}
                            </td>
                            <td className="px-3 py-4 text-center sm:px-6">
                              <FdStatusBadges record={row} />
                            </td>
                            <td className="px-3 py-4 text-center tabular-nums text-gray-900 dark:text-gray-100 sm:px-6">
                              {formatCurrencyDisplay(row.faturamentoEstimado)}
                            </td>
                            <td
                              className={`${listTableRowClasses.actionTd} text-center`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setRowActionMenu((prev) => {
                                      if (prev?.rowId === row.id) return null;
                                      let left = rect.right - ROW_ACTION_MENU_WIDTH_PX;
                                      left = Math.max(
                                        8,
                                        Math.min(left, window.innerWidth - ROW_ACTION_MENU_WIDTH_PX - 8)
                                      );
                                      return { rowId: row.id, top: rect.bottom + 4, left };
                                    });
                                  }}
                                  className={rowActionMenuButtonClass(rowActionMenu?.rowId === row.id)}
                                  aria-label="Menu de ações"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ListPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />

                  {rowActionMenu && rowForActionMenu && (
                    <ActionMenuOverlay
                      open
                      onClose={() => setRowActionMenu(null)}
                      top={rowActionMenu.top}
                      left={rowActionMenu.left}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowActionMenu(null);
                          openDetail(rowForActionMenu);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Eye className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-300" />
                        <span>Ver detalhes</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowActionMenu(null);
                          openEdit(rowForActionMenu);
                        }}
                        disabled={rowForActionMenu.status !== 'WAITING_MANAGER'}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Edit className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowActionMenu(null);
                          if (rowForActionMenu.status !== 'WAITING_MANAGER') {
                            toast.error('Somente fichas aguardando aprovação podem ser excluídas.');
                            return;
                          }
                          setDeleteId(rowForActionMenu.id);
                        }}
                        disabled={rowForActionMenu.status !== 'WAITING_MANAGER'}
                        className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        <span>Excluir</span>
                      </button>
                    </ActionMenuOverlay>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </PageStack>

        <FichaDemandaDetailModal
          isOpen={detailRecord != null}
          record={detailRecord}
          onClose={() => setDetailRecord(null)}
          onRecordUpdated={(updated) => setDetailRecord(updated)}
        />

        <FichaDemandaApprovalFormModal
          isOpen={showForm}
          onClose={() => {
            if (!isSaving) {
              setShowForm(false);
              setEditingRecord(null);
            }
          }}
          editingRecord={editingRecord}
          onSave={handleSave}
          isSaving={isSaving}
        />

        <FichaDemandaImportModal
          isOpen={showImport}
          onClose={() => setShowImport(false)}
          onImported={() => {
            queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
          }}
        />

        {deleteId ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" aria-hidden onClick={() => setDeleteId(null)} />
            <div className="relative z-[1101] w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <p className="mb-1 text-gray-900 dark:text-gray-100">Excluir ficha de demanda?</p>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteId(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}
        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — Fichas de Demanda"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Contrato
              </label>
              <StringSingleSelectDropdown
                value={contratoFilter}
                onChange={setContratoFilter}
                options={contratoOptions}
                allowEmpty={false}
                searchPlaceholder="Pesquisar contrato..."
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setContratoFilter('ALL')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
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

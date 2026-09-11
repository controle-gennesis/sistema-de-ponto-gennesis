'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Eye, Filter, MoreVertical, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { FichaDemandaPurchaseStatusModal } from '@/components/suprimentos/FichaDemandaPurchaseStatusModal';
import { FichaDemandaDetailModal } from '@/components/engenharia/FichaDemandaDetailModal';
import api from '@/lib/api';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  listTableRowClasses,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import {
  fdPurchaseStatusBadgeClass,
  formatCurrencyDisplay,
  purchaseStatusLabel,
  type DemandSheetPurchaseStatus,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const ITEMS_PER_PAGE = 20;
const ROW_ACTION_MENU_WIDTH_PX = 224;

type PurchaseStatusFilter = 'ALL' | 'NONE' | DemandSheetPurchaseStatus;

const PURCHASE_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'ALL', label: 'Todos' },
  { value: 'NONE', label: 'Sem status' },
  { value: 'WAREHOUSE_DF', label: 'Almoxarifado DF' },
  { value: 'WAREHOUSE_GO', label: 'Almoxarifado GO' },
  { value: 'FULLY_FULFILLED_BY_STOCK', label: 'Atendida totalmente pelo estoque' },
  { value: 'PARTIALLY_FULFILLED_BY_STOCK', label: 'Atendida parcialmente pelo estoque' },
  { value: 'PURCHASE_REQUEST', label: 'Solicitação de compra' },
  { value: 'SUPPLIES', label: 'Suprimentos' },
  { value: 'FINISHED', label: 'Finalizado' },
]);

export default function FdsAprovadasPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<PurchaseStatusFilter>('ALL');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<FichaDemandaApprovalRecord | null>(null);
  const [detailRecord, setDetailRecord] = useState<FichaDemandaApprovalRecord | null>(null);
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
    queryKey: ['demand-sheet-approvals', 'aprovadas-compras', searchTerm, purchaseStatusFilter],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals/aprovadas-compras', {
        params: {
          search: searchTerm || undefined,
          purchaseStatus: purchaseStatusFilter !== 'ALL' ? purchaseStatusFilter : undefined,
        },
      });
      return (res.data?.data || []) as FichaDemandaApprovalRecord[];
    },
    enabled: !loadingUser,
  });

  const records = listData || [];
  const totalFiltered = records.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = records.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(startIndex + ITEMS_PER_PAGE, totalFiltered);
  const isListEmpty = !loadingList && totalFiltered === 0;
  const hasActiveFilter = purchaseStatusFilter !== 'ALL';
  const rowForActionMenu = rowActionMenu
    ? records.find((r) => r.id === rowActionMenu.rowId) ?? null
    : null;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, purchaseStatusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!rowActionMenu) return;
    const onScroll = () => setRowActionMenu(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [rowActionMenu]);

  useEffect(() => {
    if (rowActionMenu && !records.some((r) => r.id === rowActionMenu.rowId)) {
      setRowActionMenu(null);
    }
  }, [rowActionMenu, records]);

  const openDetail = (row: FichaDemandaApprovalRecord) => {
    setRowActionMenu(null);
    setDetailRecord(row);
  };

  const openPurchaseStatus = (row: FichaDemandaApprovalRecord) => {
    setRowActionMenu(null);
    setSelectedRecord(row);
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      purchaseStatus,
    }: {
      id: string;
      purchaseStatus: DemandSheetPurchaseStatus;
    }) => {
      const res = await api.patch(`/demand-sheet-approvals/${id}/purchase-status`, {
        purchaseStatus,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Status de compras atualizado.');
      setSelectedRecord(null);
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao atualizar status');
    },
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/fds-aprovadas">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/fds-aprovadas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Fichas de Demanda
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Consulte e acompanhe as fichas de demanda aprovadas.
            </p>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <ClipboardCheck className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Fichas de Demanda
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Lista de fichas aprovadas
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
                    title={hasActiveFilter ? 'Filtro (status ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilter ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
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
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma ficha aprovada encontrada</p>
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
                            Contrato
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Obra
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Solicitante
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Faturamento
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Status compras
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
                            <td className="whitespace-nowrap px-3 py-4 text-center uppercase text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.contratoNome}
                            </td>
                            <td className="px-3 py-4 text-center uppercase text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.obra}
                            </td>
                            <td className="px-3 py-4 text-center text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.solicitanteNome}
                            </td>
                            <td className="px-3 py-4 text-center tabular-nums text-gray-900 dark:text-gray-100 sm:px-6">
                              {formatCurrencyDisplay(row.faturamentoEstimado)}
                            </td>
                            <td className="px-3 py-4 text-center sm:px-6">
                              <span
                                className={`inline-flex max-w-[220px] rounded-full px-2.5 py-0.5 text-xs font-semibold ${fdPurchaseStatusBadgeClass(row.purchaseStatus)}`}
                                title={purchaseStatusLabel(row.purchaseStatus)}
                              >
                                {purchaseStatusLabel(row.purchaseStatus)}
                              </span>
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
                                    const rect = (
                                      e.currentTarget as HTMLButtonElement
                                    ).getBoundingClientRect();
                                    setRowActionMenu((prev) => {
                                      if (prev?.rowId === row.id) return null;
                                      let left = rect.right - ROW_ACTION_MENU_WIDTH_PX;
                                      left = Math.max(
                                        8,
                                        Math.min(
                                          left,
                                          window.innerWidth - ROW_ACTION_MENU_WIDTH_PX - 8,
                                        ),
                                      );
                                      return {
                                        rowId: row.id,
                                        top: rect.bottom + 4,
                                        left,
                                      };
                                    });
                                  }}
                                  className={rowActionMenuButtonClass(
                                    rowActionMenu?.rowId === row.id,
                                  )}
                                  aria-label="Abrir menu de ações"
                                  title="Ações"
                                >
                                  <MoreVertical className="h-4 w-4" strokeWidth={2} />
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
                          openPurchaseStatus(rowForActionMenu);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <ClipboardCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span>Atualizar status</span>
                      </button>
                    </ActionMenuOverlay>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <FichaDemandaDetailModal
          isOpen={detailRecord != null}
          record={detailRecord}
          onClose={() => setDetailRecord(null)}
          onRecordUpdated={(updated) => setDetailRecord(updated)}
        />

        <FichaDemandaPurchaseStatusModal
          record={selectedRecord}
          isOpen={!!selectedRecord}
          isSaving={updateStatusMutation.isPending}
          onClose={() => setSelectedRecord(null)}
          onSave={(purchaseStatus) => {
            if (!selectedRecord) return;
            updateStatusMutation.mutate({ id: selectedRecord.id, purchaseStatus });
          }}
        />

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — Fichas de Demanda"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Status de compras
              </label>
              <StringSingleSelectDropdown
                value={purchaseStatusFilter}
                onChange={(value) => setPurchaseStatusFilter(value as PurchaseStatusFilter)}
                options={PURCHASE_STATUS_FILTER_OPTIONS}
                allowEmpty={false}
                className="w-full"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setPurchaseStatusFilter('ALL')}
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

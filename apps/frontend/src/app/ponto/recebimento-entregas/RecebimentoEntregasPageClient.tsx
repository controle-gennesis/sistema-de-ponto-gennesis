'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Filter, PackageCheck, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import api from '@/lib/api';
import { listTableRowClasses } from '@/components/ui/listTableUi';
import toast from 'react-hot-toast';
import {
  CURRENT_STATUS_OPTIONS,
  DELIVERY_TYPE_OPTIONS,
  FINAL_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  POLO_OPTIONS,
  STOCK_SHORTFALL_TYPE_OPTIONS,
  formatCurrency,
  formatDate,
  normalizeDeliveryType,
  statusBadge,
  type CurrentStatusValue,
  type FinalStatusValue,
  type PaymentStatusValue,
  type PoloValue,
  type StockShortfallTypeValue,
} from '@/components/suprimentos/materialDeliveryLabels';

type MaterialDeliveryRow = {
  id: string;
  deliveryNumber: string;
  polo: PoloValue;
  movementId: string | null;
  movementNumber: string | null;
  currentStatus: CurrentStatusValue;
  paymentStatus: PaymentStatusValue;
  supplierName: string | null;
  purchaseOrderId: string | null;
  orderValue: string | number | null;
  expectedDelivery: string | null;
  totalPaid: string | number | null;
  stockShortfallType: StockShortfallTypeValue | null;
  rmNumber: string | null;
  deliveryType: string | null;
  observations: string | null;
  finalStatus: FinalStatusValue;
  receivedByEngineering: boolean;
  receivedAt: string | null;
  supplier: { id: string; code: string; name: string } | null;
  purchaseOrder: { id: string; orderNumber: string; status: string } | null;
  receivedByUser: { id: string; name: string } | null;
  contractRecord: { id: string; name: string; number: string } | null;
};

type ViewTab = 'pending' | 'received';

const ITEMS_PER_PAGE = 12;

const NO_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

const searchInputClassName = `h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${NO_FOCUS}`;

const thBase =
  'px-3 sm:px-6 py-3 align-middle text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap';
const thLeftClass = `${thBase} text-left`;
const thCenterClass = `${thBase} text-center`;
const tdBase = 'px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300';
const tdLeftClass = `${tdBase} text-left`;
const tdCenterClass = `${tdBase} text-center`;
const tdTruncateCenterClass = `${tdCenterClass} truncate`;
const tdPillClass = `${tdCenterClass}`;

function supplierLabel(row: MaterialDeliveryRow): string {
  return row.supplier?.name ?? row.supplierName ?? '—';
}

function contractLabel(row: MaterialDeliveryRow): string {
  return row.contractRecord?.name ?? '—';
}

function deliveryTypeLabel(value: string | null | undefined): string {
  const normalized = normalizeDeliveryType(value);
  if (!normalized) return '—';
  return DELIVERY_TYPE_OPTIONS.find((o) => o.value === normalized)?.label ?? '—';
}

function StatusPill({
  value,
  options,
}: {
  value: string;
  options: readonly { value: string; label: string; className: string }[];
}) {
  const badge = statusBadge(value, options);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

export default function RecebimentoEntregasPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [poloFilter, setPoloFilter] = useState('');
  const [viewTab, setViewTab] = useState<ViewTab>('pending');
  const [listCurrentPage, setListCurrentPage] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [confirmRow, setConfirmRow] = useState<MaterialDeliveryRow | null>(null);

  const poloSelectOptions = useMemo(
    () => POLO_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: summaryRes } = useQuery({
    queryKey: ['material-deliveries-summary-recebimento'],
    queryFn: async () => {
      const res = await api.get('/material-deliveries/summary', {
        params: { forRecebimento: 'true' },
      });
      return res.data;
    },
  });

  const { data: listRes, isLoading: loadingList } = useQuery({
    queryKey: ['material-deliveries-recebimento', search, poloFilter, viewTab],
    queryFn: async () => {
      const res = await api.get('/material-deliveries', {
        params: {
          search: search.trim() || undefined,
          polo: poloFilter || undefined,
          awaitingEngineering: viewTab === 'pending' ? 'true' : undefined,
          receivedByEngineering: viewTab === 'received' ? 'true' : undefined,
          forRecebimento: 'true',
          limit: 300,
        },
      });
      return res.data;
    },
  });

  const items: MaterialDeliveryRow[] = listRes?.data ?? [];
  const summary = summaryRes?.data ?? { awaitingEngineering: 0, delivered: 0 };

  const totalRows = items.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / ITEMS_PER_PAGE));
  const startIndex = (listCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );
  const startItem = totalRows === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, totalRows);

  useEffect(() => {
    setListCurrentPage(1);
  }, [search, poloFilter, viewTab]);

  useEffect(() => {
    if (listCurrentPage > totalPages) {
      setListCurrentPage(totalPages);
    }
  }, [listCurrentPage, totalPages]);

  const receiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-deliveries/${id}/receive`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      toast.success('Recebimento confirmado');
      setConfirmRow(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao confirmar recebimento');
    },
  });

  const clearFilters = () => {
    setPoloFilter('');
    setSearch('');
    setViewTab('pending');
    setListCurrentPage(1);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/recebimento-entregas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-8">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Recebimento de Entregas
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Confirme o recebimento de material na obra. Esta tela é exclusiva para a engenharia.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent
                className="p-4 sm:p-6"
                role="button"
                tabIndex={0}
                onClick={() => setViewTab('pending')}
                onKeyDown={(e) => e.key === 'Enter' && setViewTab('pending')}
              >
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex-shrink-0">
                    <PackageCheck className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                      Aguardando confirmação
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {summary.awaitingEngineering}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent
                className="p-4 sm:p-6"
                role="button"
                tabIndex={0}
                onClick={() => setViewTab('received')}
                onKeyDown={(e) => e.key === 'Enter' && setViewTab('received')}
              >
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                      Já recebidas
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {summary.delivered}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <PackageCheck className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Entregas para recebimento
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {viewTab === 'pending'
                        ? 'Exibindo entregas aguardando confirmação da engenharia'
                        : 'Exibindo entregas já confirmadas pela engenharia'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar ID, contrato, fornecedor, OC..."
                      className={searchInputClassName}
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(true)}
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
              {loadingList ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-400">Carregando entregas...</p>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {viewTab === 'pending'
                      ? 'Nenhuma entrega aguardando confirmação'
                      : 'Nenhuma entrega recebida encontrada'}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                    {viewTab === 'pending'
                      ? 'Quando o material chegar na obra, confirme o recebimento aqui'
                      : 'Ajuste os filtros para ver outras entregas'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalRows} entrega
                      {totalRows !== 1 ? 's' : ''}
                    </span>
                    <span>
                      Página {listCurrentPage} de {totalPages}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={thLeftClass}>ID</th>
                          <th className={thCenterClass}>Ordem de compra</th>
                          <th className={thCenterClass}>N° RM</th>
                          <th className={thCenterClass}>ID Mov</th>
                          <th className={thCenterClass}>Nº Mov</th>
                          <th className={thCenterClass}>Contrato</th>
                          <th className={thCenterClass}>Fornecedor</th>
                          <th className={thCenterClass}>Valor OC</th>
                          <th className={thCenterClass}>Status atual</th>
                          <th className={thCenterClass}>Pagamento</th>
                          <th className={thCenterClass}>Status final</th>
                          <th className={thCenterClass}>Previsão entrega</th>
                          <th className={thCenterClass}>Tipo entrega</th>
                          <th className={thCenterClass}>Valor total pago</th>
                          <th className={thCenterClass}>Furo estoque</th>
                          <th className={thCenterClass}>Recebido eng.</th>
                          <th className={thCenterClass}>Observações</th>
                          {viewTab === 'pending' ? <th className={thCenterClass}>Ação</th> : null}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedItems.map((row) => {
                          const isOverdue =
                            !row.receivedByEngineering &&
                            row.expectedDelivery &&
                            new Date(row.expectedDelivery) < new Date() &&
                            row.currentStatus !== 'ENTREGUE' &&
                            row.currentStatus !== 'CANCELADO';

                          return (
                          <tr
                            key={row.id}
                            className={`${listTableRowClasses.tr} ${
                              isOverdue ? 'bg-red-50/60 dark:bg-red-950/20' : ''
                            }`}
                          >
                            <td className={`${tdLeftClass} whitespace-nowrap`}>
                              <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">{row.deliveryNumber}</span>
                            </td>
                            <td className={`${tdCenterClass} whitespace-nowrap`}>
                              {row.purchaseOrder?.orderNumber ?? '—'}
                            </td>
                            <td className={`${tdCenterClass} whitespace-nowrap`}>{row.rmNumber ?? '—'}</td>
                            <td className={`${tdCenterClass} whitespace-nowrap`}>{row.movementId ?? '—'}</td>
                            <td className={`${tdCenterClass} whitespace-nowrap`}>{row.movementNumber ?? '—'}</td>
                            <td className={tdCenterClass} title={`${contractLabel(row)} · ${row.polo}`}>
                              <span className="inline-flex flex-col items-center gap-0.5">
                                <span className="max-w-[140px] truncate">{contractLabel(row)}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{row.polo}</span>
                              </span>
                            </td>
                            <td className={tdTruncateCenterClass} title={supplierLabel(row)}>
                              {supplierLabel(row)}
                            </td>
                            <td className={`${tdCenterClass} whitespace-nowrap tabular-nums`}>
                              {formatCurrency(row.orderValue)}
                            </td>
                            <td className={tdPillClass}>
                              <div className="flex justify-center">
                                <StatusPill value={row.currentStatus} options={CURRENT_STATUS_OPTIONS} />
                              </div>
                            </td>
                            <td className={tdPillClass}>
                              <div className="flex justify-center">
                                <StatusPill value={row.paymentStatus} options={PAYMENT_STATUS_OPTIONS} />
                              </div>
                            </td>
                            <td className={tdPillClass}>
                              <div className="flex justify-center">
                                <StatusPill value={row.finalStatus} options={FINAL_STATUS_OPTIONS} />
                              </div>
                            </td>
                            <td className={`${tdCenterClass} whitespace-nowrap`}>
                              {formatDate(row.expectedDelivery)}
                              {isOverdue ? (
                                <span className="ml-1 text-xs font-medium text-red-600 dark:text-red-400">
                                  atrasada
                                </span>
                              ) : null}
                            </td>
                            <td className={tdTruncateCenterClass} title={deliveryTypeLabel(row.deliveryType)}>
                              {deliveryTypeLabel(row.deliveryType)}
                            </td>
                            <td className={`${tdCenterClass} whitespace-nowrap tabular-nums`}>
                              {formatCurrency(row.totalPaid)}
                            </td>
                            <td className={tdPillClass}>
                              {row.stockShortfallType ? (
                                <div className="flex justify-center">
                                  <StatusPill
                                    value={row.stockShortfallType}
                                    options={STOCK_SHORTFALL_TYPE_OPTIONS}
                                  />
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500">—</span>
                              )}
                            </td>
                            <td className={tdCenterClass}>
                              {row.receivedByEngineering ? (
                                <span className="inline-flex flex-col items-center gap-0.5">
                                  <span>{row.receivedByUser?.name ?? '—'}</span>
                                  {row.receivedAt ? (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {formatDate(row.receivedAt)}
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                  Pendente
                                </span>
                              )}
                            </td>
                            <td className={tdTruncateCenterClass} title={row.observations ?? ''}>
                              {row.observations || '—'}
                            </td>
                            {viewTab === 'pending' ? (
                              <td className={tdCenterClass}>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRow(row)}
                                  disabled={receiveMutation.isPending}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50 dark:border-green-800/60 dark:bg-green-950/30 dark:text-green-300 dark:hover:bg-green-900/40 whitespace-nowrap"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Confirmar recebimento
                                </button>
                              </td>
                            ) : null}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setListCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={listCurrentPage === 1}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setListCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={listCurrentPage === totalPages}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Próxima
                      </button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} title="Filtros">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Situação</label>
              <div className="flex gap-2">
                <ButtonSeg
                  active={viewTab === 'pending'}
                  onClick={() => setViewTab('pending')}
                  label="Aguardando confirmação"
                />
                <ButtonSeg
                  active={viewTab === 'received'}
                  onClick={() => setViewTab('received')}
                  label="Já recebidas"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Polo</label>
              <SingleSelectSearchDropdown
                value={poloFilter}
                onChange={setPoloFilter}
                options={poloSelectOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                noFocusRing
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  clearFilters();
                  setIsFiltersOpen(false);
                }}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={Boolean(confirmRow)}
          onClose={() => setConfirmRow(null)}
          title="Confirmar recebimento"
        >
          {confirmRow ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Confirma que o material da entrega <strong>#{confirmRow.deliveryNumber}</strong>{' '}
                foi recebido na obra?
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Ordem de compra</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {confirmRow.purchaseOrder?.orderNumber ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Contrato</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {contractLabel(confirmRow)} ({confirmRow.polo})
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Fornecedor</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {supplierLabel(confirmRow)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">N° RM</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {confirmRow.rmNumber ?? '—'}
                  </dd>
                </div>
              </dl>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmRow(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => receiveMutation.mutate(confirmRow.id)}
                  disabled={receiveMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {receiveMutation.isPending ? 'Confirmando...' : 'Confirmar recebimento'}
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

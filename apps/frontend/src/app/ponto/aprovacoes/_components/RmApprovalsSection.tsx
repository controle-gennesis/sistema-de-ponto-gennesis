'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle,
  ClipboardList,
  Eye,
  Filter,
  MoreVertical,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { usePermissions } from '@/hooks/usePermissions';
import type { MaterialRequest } from '@/app/ponto/gerenciar-materiais/_lib/types';
import {
  getPriorityInfo,
  materialItemLabel,
  rmSolicitante,
  rmTitulo,
} from '@/app/ponto/gerenciar-materiais/_lib/display';
import { formatRmListDisplayId } from '@/app/ponto/gerenciar-materiais/_lib/rmListDisplay';
import { matchesMaterialRequestSearch, normalizeFluxSearch } from '@/app/ponto/gerenciar-materiais/_lib/search';

type RmPhaseFilter = 'PENDING' | 'IN_REVIEW' | 'ALL';

const RM_PHASE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'IN_REVIEW', label: 'Em correção' },
  { value: 'ALL', label: 'Todas em análise' },
]);

const cellPad = 'px-2 sm:px-3 py-3';
const cellPadTh = 'px-2 sm:px-3 py-4';
const rmColCls = 'w-[4%] min-w-[3rem] max-w-[4.5rem]';
const actionColCls = 'w-[4%] min-w-[3rem] max-w-[4.5rem]';
const thTextCls = `${cellPadTh} text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`;
const thCenterCls = `${cellPadTh} text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap`;
const rmThCls = `${thCenterCls} ${rmColCls} !pl-2 sm:!pl-3 !pr-1`;
const rmTdCls = `${cadastroListClasses.tdMono} ${rmColCls} text-center !pl-2 sm:!pl-3 !pr-1`;
const tdTextCls = `${cellPad} text-center text-sm text-gray-700 dark:text-gray-300 min-w-0`;
const tdMutedCls = `${cellPad} text-center text-sm text-gray-600 dark:text-gray-400 min-w-0`;
const tdCenterCls = `${cellPad} text-center text-sm min-w-0`;
const actionThCls = `${cadastroListClasses.thRight} ${actionColCls} !pl-1 !pr-2 sm:!pr-3`;
const actionTdCls = `${actionColCls} !pl-1 !pr-2 sm:!pr-3 py-3 align-middle`;
const RM_ACTION_MENU_WIDTH_PX = 224;
const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const MENU_ITEM_BORDER_CLASS = `${MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;

export function RmApprovalsSection() {
  const queryClient = useQueryClient();
  const { canApproveMaterialRequests, gestorScopedCostCenterIds } = usePermissions();

  const [searchTerm, setSearchTerm] = useState('');
  const [rmPhase, setRmPhase] = useState<RmPhaseFilter>('PENDING');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<MaterialRequest | null>(null);
  const [approveTarget, setApproveTarget] = useState<MaterialRequest | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<MaterialRequest | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MaterialRequest | null>(null);
  const [actionMenu, setActionMenu] = useState<{
    requestId: string;
    top: number;
    left: number;
  } | null>(null);

  const { data: requestsData, isLoading } = useQuery({
    queryKey: ['approvals', 'material-requests', rmPhase],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '500' };
      if (rmPhase !== 'ALL') params.status = rmPhase;
      const res = await api.get('/material-requests', { params });
      return (res.data?.data ?? []) as MaterialRequest[];
    },
    enabled: canApproveMaterialRequests,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const requests = requestsData ?? [];

  const filteredRequests = useMemo(() => {
    const normalized = normalizeFluxSearch(searchTerm);
    let list = requests;
    if (rmPhase === 'ALL') {
      list = requests.filter((r) => r.status === 'PENDING' || r.status === 'IN_REVIEW');
    }
    if (gestorScopedCostCenterIds !== undefined) {
      const allowed = new Set(gestorScopedCostCenterIds);
      list = list.filter((r) => {
        const ccId = r.costCenter?.id;
        return ccId ? allowed.has(ccId) : false;
      });
    }
    if (!normalized) return list;
    return list.filter((r) => matchesMaterialRequestSearch(r, normalized));
  }, [requests, searchTerm, rmPhase, gestorScopedCostCenterIds]);

  const requestForMenu = useMemo(() => {
    if (!actionMenu) return null;
    return filteredRequests.find((r) => r.id === actionMenu.requestId) ?? null;
  }, [actionMenu, filteredRequests]);

  useEffect(() => {
    if (actionMenu && !requestForMenu) {
      setActionMenu(null);
    }
  }, [actionMenu, requestForMenu]);

  const invalidateRmQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['approvals', 'material-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'], refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: ['material-requests'], refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] }),
    ]);
  };

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'APPROVED' });
      return res.data;
    },
    onSuccess: async () => {
      toast.success('Requisição aprovada.');
      setApproveTarget(null);
      setDetailRequest(null);
      await invalidateRmQueries();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Erro ao aprovar requisição');
    },
  });

  const correctionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'IN_REVIEW' });
      return res.data;
    },
    onSuccess: async () => {
      toast.success('Requisição enviada para correção.');
      setCorrectionTarget(null);
      setDetailRequest(null);
      await invalidateRmQueries();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Erro ao enviar para correção');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'CANCELLED' });
      return res.data;
    },
    onSuccess: async () => {
      toast.success('Requisição cancelada.');
      setCancelTarget(null);
      setDetailRequest(null);
      await invalidateRmQueries();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Erro ao cancelar requisição');
    },
  });

  if (!canApproveMaterialRequests) {
    return null;
  }

  return (
    <>
      <Card className="w-full scroll-mt-4" id="secao-rm-aprovacoes">
        <CardHeader className="border-b-0 pb-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3">
              <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                <ClipboardList className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Requisições de Materiais
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Aprove, envie para correção ou cancele solicitações pendentes
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por RM, solicitante, material..."
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(true)}
                className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <Filter className="h-4 w-4 shrink-0" />
                <span>Filtros</span>
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loading message="Carregando requisições..." />
          ) : filteredRequests.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardList className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
              <p className="text-gray-500 dark:text-gray-400">
                {searchTerm.trim()
                  ? 'Nenhuma requisição corresponde à busca'
                  : 'Nenhuma requisição pendente de aprovação'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={`${cadastroListClasses.table} text-sm`}>
                <colgroup>
                  <col className="w-[4%]" />
                  <col className="w-[17%]" />
                  <col className="w-[19%]" />
                  <col className="w-[42%]" />
                  <col className="w-[14%]" />
                  <col className="w-[4%]" />
                </colgroup>
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th scope="col" className={rmThCls}>
                      RM
                    </th>
                    <th className={thTextCls}>Solicitante</th>
                    <th className={thTextCls}>Centro de Custo</th>
                    <th className={thTextCls}>Descrição</th>
                    <th className={thCenterCls}>Prioridade</th>
                    <th scope="col" className={actionThCls}>
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {filteredRequests.map((request) => {
                    const priorityInfo = getPriorityInfo(request.priority);

                    return (
                      <tr key={request.id} className={getListTableRowClassName(false)}>
                        <td
                          className={rmTdCls}
                          title={request.requestNumber || undefined}
                        >
                          <ListRowNavigableLabel className="font-medium">
                            {formatRmListDisplayId(request.requestNumber)}
                          </ListRowNavigableLabel>
                        </td>
                        <td className={tdTextCls}>
                          <span className="block truncate">
                            {rmSolicitante(request)?.name || '—'}
                          </span>
                        </td>
                        <td className={tdTextCls} title={request.costCenter?.name}>
                          <span className="line-clamp-2">{request.costCenter?.name || '—'}</span>
                        </td>
                        <td className={tdMutedCls}>
                          <span className="line-clamp-2" title={request.description || ''}>
                            {request.description || '—'}
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-500">
                            {rmTitulo(request)}
                          </span>
                        </td>
                        <td className={tdCenterCls}>
                          <span className={`text-xs font-medium whitespace-nowrap ${priorityInfo.color}`}>
                            {priorityInfo.label}
                          </span>
                        </td>
                        <td className={actionTdCls}>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActionMenu((prev) => {
                                  if (prev?.requestId === request.id) return null;
                                  let left = rect.right - RM_ACTION_MENU_WIDTH_PX;
                                  left = Math.max(
                                    8,
                                    Math.min(left, window.innerWidth - RM_ACTION_MENU_WIDTH_PX - 8)
                                  );
                                  return { requestId: request.id, top: rect.bottom + 4, left };
                                });
                              }}
                              className={rowActionMenuButtonClass(actionMenu?.requestId === request.id)}
                              aria-label="Menu de ações"
                              aria-expanded={actionMenu?.requestId === request.id}
                              aria-haspopup="menu"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {detailRequest && (
        <Modal isOpen onClose={() => setDetailRequest(null)} title="Detalhes da Requisição" size="lg">
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Número</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {formatRmListDisplayId(detailRequest.requestNumber) ||
                  `#${detailRequest.id.slice(0, 8)}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Solicitante</p>
              <p className="text-gray-900 dark:text-gray-100">
                {rmSolicitante(detailRequest)?.name || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Centro de Custo</p>
              <p className="text-gray-900 dark:text-gray-100">{detailRequest.costCenter?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Descrição</p>
              <p className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                {detailRequest.description || '—'}
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Itens</p>
              <ul className="space-y-1 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                {detailRequest.items.map((item) => (
                  <li key={item.id} className="text-gray-800 dark:text-gray-200">
                    {materialItemLabel(item)} — {item.quantity} {item.unit}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Modal>
      )}

      {approveTarget && (
        <Modal isOpen onClose={() => setApproveTarget(null)} title="Aprovar Requisição" size="md">
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            Confirmar aprovação da requisição{' '}
            <strong>{formatRmListDisplayId(approveTarget.requestNumber)}</strong>?
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setApproveTarget(null)}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => approveMutation.mutate(approveTarget.id)}
              disabled={approveMutation.isPending}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
            </button>
          </div>
        </Modal>
      )}

      {correctionTarget && (
        <Modal
          isOpen
          onClose={() => setCorrectionTarget(null)}
          title="Enviar para Correção RM"
          size="md"
        >
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            O solicitante poderá ajustar a requisição e reenviá-la para análise.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCorrectionTarget(null)}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => correctionMutation.mutate(correctionTarget.id)}
              disabled={correctionMutation.isPending}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {correctionMutation.isPending ? 'Enviando...' : 'Enviar para correção'}
            </button>
          </div>
        </Modal>
      )}

      {cancelTarget && (
        <Modal isOpen onClose={() => setCancelTarget(null)} title="Cancelar Requisição" size="md">
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            A RM ficará como <strong>Cancelada</strong> e sairá do fluxo de análise. Confirma?
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => cancelMutation.mutate(cancelTarget.id)}
              disabled={cancelMutation.isPending}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </div>
        </Modal>
      )}

      <Modal isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} title="Filtros" size="md">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Status
            </label>
            <StringSingleSelectDropdown
              value={rmPhase}
              onChange={(v) => setRmPhase(v as RmPhaseFilter)}
              options={RM_PHASE_FILTER_OPTIONS}
              allowEmpty={false}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setRmPhase('PENDING')}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Limpar filtros
            </button>
            <button
              type="button"
              onClick={() => setIsFiltersOpen(false)}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300"
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      {actionMenu &&
        requestForMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[2000]" aria-hidden onClick={() => setActionMenu(null)} />
            <div
              role="menu"
              className="fixed z-[2001] w-56 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
              style={{ top: actionMenu.top, left: actionMenu.left }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setActionMenu(null);
                  setDetailRequest(requestForMenu);
                }}
                className={MENU_ITEM_CLASS}
              >
                <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>Ver detalhes</span>
              </button>
              {requestForMenu.status === 'PENDING' && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionMenu(null);
                      setApproveTarget(requestForMenu);
                    }}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <CheckCircle className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>Aprovar requisição</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionMenu(null);
                      setCorrectionTarget(requestForMenu);
                    }}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <Wrench className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                    <span>Enviar para correção RM</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionMenu(null);
                      setCancelTarget(requestForMenu);
                    }}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <Ban className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Cancelar requisição</span>
                  </button>
                </>
              )}
              {requestForMenu.status === 'IN_REVIEW' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActionMenu(null);
                    setCancelTarget(requestForMenu);
                  }}
                  className={MENU_ITEM_BORDER_CLASS}
                >
                  <Ban className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>Cancelar requisição</span>
                </button>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

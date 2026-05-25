'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Ban,
  CheckCircle,
  ClipboardList,
  Eye,
  FileText,
  Pencil,
  Search,
  Wrench,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import type { PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import type { FluxTab, MaterialRequest } from '../_lib/types';
import {
  formatDate,
  getPriorityInfo,
  joinOrderNumbersPt,
  rmSolicitante,
  rmTitulo
} from '../_lib/display';

const LIST_ITEMS_PER_PAGE = 12;

const FLUX_TAB_META: Partial<
  Record<FluxTab, { title: string; subtitle: string }>
> = {
  rm_PENDING: {
    title: 'Requisições pendentes',
    subtitle: 'Aprove, envie para correção ou cancele a solicitação'
  },
  rm_IN_REVIEW: {
    title: 'Correção RM',
    subtitle: 'Solicitações devolvidas ao solicitante para ajuste'
  },
  rm_APPROVED: {
    title: 'RMs Aprovadas',
    subtitle: 'SC aprovadas sem OC — crie a ordem de compra quando necessário'
  },
  rm_CANCELLED: {
    title: 'Solicitações canceladas',
    subtitle: 'Histórico de requisições canceladas'
  }
};

export function MaterialRequestsRmList({
  fluxTab,
  searchTerm,
  onSearchChange,
  loadingRequests,
  filteredRequests,
  ordersByMaterialRequestId,
  currentUserId,
  onCreateOc,
  onApprove,
  onCorrection,
  onCancel,
  onDetails,
  flushInCard = false
}: {
  fluxTab: FluxTab;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  flushInCard?: boolean;
  loadingRequests: boolean;
  filteredRequests: MaterialRequest[];
  ordersByMaterialRequestId: Map<string, PurchaseOrder[]>;
  currentUserId?: string;
  onCreateOc: (r: MaterialRequest) => void;
  onApprove: (r: MaterialRequest) => void;
  onCorrection: (r: MaterialRequest) => void;
  onCancel: (r: MaterialRequest) => void;
  onDetails: (r: MaterialRequest) => void;
}) {
  const [listCurrentPage, setListCurrentPage] = useState(1);

  const meta = FLUX_TAB_META[fluxTab] ?? {
    title: 'Requisições de materiais',
    subtitle: 'Gerencie solicitações do fluxo SC / RM'
  };

  const listTotal = filteredRequests.length;
  const listTotalPages = Math.max(1, Math.ceil(listTotal / LIST_ITEMS_PER_PAGE));
  const listStartIndex = (listCurrentPage - 1) * LIST_ITEMS_PER_PAGE;
  const paginatedRequests = filteredRequests.slice(
    listStartIndex,
    listStartIndex + LIST_ITEMS_PER_PAGE
  );
  const listStartItem = listTotal === 0 ? 0 : listStartIndex + 1;
  const listEndItem = Math.min(listStartIndex + LIST_ITEMS_PER_PAGE, listTotal);

  useEffect(() => {
    setListCurrentPage(1);
  }, [fluxTab, searchTerm, listTotal]);

  useEffect(() => {
    if (listCurrentPage > listTotalPages) {
      setListCurrentPage(listTotalPages);
    }
  }, [listCurrentPage, listTotalPages]);

  return (
    <Card
      className={`w-full ${flushInCard ? 'rounded-none border-0 border-t-0 shadow-none' : ''}`}
    >
      <CardHeader className={`border-b-0 pb-1 ${flushInCard ? 'pt-4' : ''}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
              <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{meta.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{meta.subtitle}</p>
            </div>
          </div>
          <div className="relative min-w-[240px] flex-1 sm:w-[300px] sm:flex-none sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por nome, descrição ou centro de custo..."
              className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loadingRequests ? (
          <div className="text-center py-8">
            <Loading message="Carregando requisições..." />
          </div>
        ) : listTotal === 0 ? (
          <div className="text-center py-8">
            <ClipboardList className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm.trim()
                ? 'Nenhuma requisição corresponde à busca nesta fase'
                : 'Nenhuma requisição encontrada'}
            </p>
            {searchTerm.trim() ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Limpar busca
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span>
                Mostrando {listStartItem} a {listEndItem} de {listTotal} requisição(ões)
              </span>
              <span>
                Página {listCurrentPage} de {listTotalPages}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Nº SC
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Solicitante
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Centro de Custo
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Prioridade
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      OC gerada
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Criado em
                    </th>
                    <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedRequests.map((request) => {
                    const priorityInfo = getPriorityInfo(request.priority);
                    const ocs = ordersByMaterialRequestId.get(request.id) ?? [];
                    const ocNums = ocs.map((o) => o.orderNumber).filter((n): n is string => Boolean(n));

                    return (
                      <tr
                        key={request.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-3 sm:px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {request.requestNumber || `#${request.id.slice(0, 8)}`}
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[140px] truncate">
                          {rmSolicitante(request)?.name || '—'}
                        </td>
                        <td
                          className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[160px]"
                          title={request.costCenter?.name}
                        >
                          <span className="line-clamp-2">{request.costCenter?.name || '—'}</span>
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[200px]">
                          <span className="line-clamp-2" title={request.description || ''}>
                            {request.description || '—'}
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-500">
                            {rmTitulo(request)}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${priorityInfo.color}`}
                          >
                            {priorityInfo.label}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[120px]">
                          {ocNums.length > 0 ? (
                            <span className="line-clamp-2" title={joinOrderNumbersPt(ocNums)}>
                              {joinOrderNumbersPt(ocNums)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(request.createdAt)}
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-0.5">
                            {request.status === 'APPROVED' && (
                              <button
                                type="button"
                                onClick={() => onCreateOc(request)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                                title="Criar Ordem de Compra"
                              >
                                <FileText className="h-4 w-4" />
                              </button>
                            )}
                            {request.status === 'PENDING' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onApprove(request)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40"
                                  title="Aprovar"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onCorrection(request)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                  title="Enviar para Correção RM"
                                >
                                  <Wrench className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onCancel(request)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                  title="Cancelar requisição"
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            {request.status === 'IN_REVIEW' &&
                              currentUserId === rmSolicitante(request)?.id && (
                                <Link
                                  href={`/ponto/solicitar-materiais?editRm=${request.id}`}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                  title="Editar RM"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Link>
                              )}
                            {request.status === 'IN_REVIEW' && (
                              <button
                                type="button"
                                onClick={() => onCancel(request)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                title="Cancelar requisição"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDetails(request)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                              title="Ver detalhes"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {listTotalPages > 1 && (
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
                  onClick={() => setListCurrentPage((prev) => Math.min(prev + 1, listTotalPages))}
                  disabled={listCurrentPage === listTotalPages}
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
  );
}

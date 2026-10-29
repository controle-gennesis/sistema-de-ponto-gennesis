'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, CheckCircle, XCircle, AlertCircle, Eye, FileText, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';

interface PointCorrectionRequest {
  id: string;
  title: string;
  description: string;
  justification: string;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  originalDate: string;
  originalTime: string;
  originalType: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT';
  correctedDate: string;
  correctedTime: string;
  correctedType: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT';
  createdAt: string;
  approvedAt?: string;
  rejectionReason?: string;
  approvedBy?: {
    id: string;
    name: string;
    email: string;
  };
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'PENDING':
      return { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle };
    case 'IN_REVIEW':
      return { label: 'Em Análise', color: 'bg-blue-100 text-blue-800', icon: Eye };
    case 'APPROVED':
      return { label: 'Aprovada', color: 'bg-green-100 text-green-800', icon: CheckCircle };
    case 'REJECTED':
      return { label: 'Rejeitada', color: 'bg-red-100 text-red-800', icon: XCircle };
    case 'CANCELLED':
      return { label: 'Cancelada', color: 'bg-gray-100 text-gray-800', icon: XCircle };
    default:
      return { label: 'Desconhecido', color: 'bg-gray-100 text-gray-800', icon: AlertCircle };
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'ENTRY': return 'Entrada';
    case 'LUNCH_START': return 'Início Almoço';
    case 'LUNCH_END': return 'Fim Almoço';
    case 'EXIT': return 'Saída';
    default: return type;
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('pt-BR');
};

const formatTime = (timeString: string) => {
  return timeString.substring(0, 5); // HH:MM
};

const STATUS_LIST_HEADER: Record<
  'all' | 'PENDING' | 'APPROVED' | 'REJECTED',
  { title: string; subtitle: string; Icon: React.ElementType; iconBg: string; iconColor: string }
> = {
  all: {
    title: 'Todas as solicitações',
    subtitle: 'Todas as alterações de ponto registradas',
    Icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  PENDING: {
    title: 'Solicitações pendentes',
    subtitle: 'Alterações de ponto aguardando análise',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  APPROVED: {
    title: 'Solicitações aprovadas',
    subtitle: 'Alterações de ponto já aprovadas',
    Icon: CheckCircle,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  REJECTED: {
    title: 'Solicitações rejeitadas',
    subtitle: 'Alterações de ponto que foram rejeitadas',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

function listHeaderFor(tab: string) {
  return STATUS_LIST_HEADER[tab as keyof typeof STATUS_LIST_HEADER] ?? STATUS_LIST_HEADER.all;
}

const PAGE_SIZE = 10;

type StatusTab = 'all' | 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

interface PointCorrectionListProps {
  onNew?: () => void;
}

export const PointCorrectionList: React.FC<PointCorrectionListProps> = ({ onNew }) => {
  const [selectedRequest, setSelectedRequest] = useState<PointCorrectionRequest | null>(null);
  const [activeStatusTab, setActiveStatusTab] = useState<StatusTab>('all');
  const [page, setPage] = useState(1);

  const { data: requestsData, isLoading, error } = useQuery({
    queryKey: ['point-corrections'],
    queryFn: async () => {
      const response = await api.get('/solicitacoes/minhas-solicitacoes');
      return response.data;
    }
  });

  const allRequests: PointCorrectionRequest[] = requestsData || [];

  const stats = {
    total: allRequests.length,
    pending: allRequests.filter((r) => r.status === 'PENDING').length,
    approved: allRequests.filter((r) => r.status === 'APPROVED').length,
    rejected: allRequests.filter((r) => r.status === 'REJECTED').length,
  };

  const filteredRequests = allRequests.filter(
    (request) => activeStatusTab === 'all' || request.status === activeStatusTab
  );

  const listRange = getCadastroListRange(page, PAGE_SIZE, filteredRequests.length);
  const currentPage = Math.min(page, listRange.totalPages);
  const pagedRequests = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selectTab = (tab: StatusTab) => {
    setActiveStatusTab(tab);
    setPage(1);
  };

  const listHeader = listHeaderFor(activeStatusTab);
  const ListHeaderIcon = listHeader.Icon;

  const emptyHint =
    allRequests.length === 0
      ? 'Crie sua primeira solicitação de correção'
      : activeStatusTab !== 'all'
        ? `Não há solicitações ${getStatusInfo(activeStatusTab).label.toLowerCase()} no momento.`
        : 'Nenhuma solicitação encontrada.';

  return (
    <>
      <div className={pageStatCardsGridClass}>
        <FilterStatCard
          label="Todas"
          count={stats.total}
          icon={FileText}
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconColor="text-blue-600 dark:text-blue-400"
          isActive={activeStatusTab === 'all'}
          onClick={() => selectTab('all')}
        />
        <FilterStatCard
          label="Pendentes"
          count={stats.pending}
          icon={Clock}
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
          isActive={activeStatusTab === 'PENDING'}
          onClick={() => selectTab('PENDING')}
        />
        <FilterStatCard
          label="Aprovadas"
          count={stats.approved}
          icon={CheckCircle}
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          iconColor="text-emerald-600 dark:text-emerald-400"
          isActive={activeStatusTab === 'APPROVED'}
          onClick={() => selectTab('APPROVED')}
        />
        <FilterStatCard
          label="Rejeitadas"
          count={stats.rejected}
          icon={XCircle}
          iconBg="bg-red-100 dark:bg-red-900/30"
          iconColor="text-red-600 dark:text-red-400"
          isActive={activeStatusTab === 'REJECTED'}
          onClick={() => selectTab('REJECTED')}
        />
      </div>

      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                <ListHeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{listHeader.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{listHeader.subtitle}</p>
              </div>
            </div>
            {onNew ? (
              <div className={cadastroListClasses.cardToolbar}>
                <button
                  type="button"
                  onClick={onNew}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Nova Alteração</span>
                </button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className={cadastroListClasses.cardContent}>
          {isLoading ? (
            <CadastroListLoading message="Carregando solicitações..." />
          ) : error ? (
            <div className="py-8 text-center">
              <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500 dark:text-red-400" />
              <p className="text-red-600 dark:text-red-400">Erro ao carregar solicitações</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <CadastroListEmpty icon={FileText} title="Nenhuma solicitação encontrada" hint={emptyHint} />
          ) : (
            <>
              <CadastroListSummary
                startItem={listRange.startItem}
                endItem={listRange.endItem}
                total={filteredRequests.length}
                itemLabel="solicitação"
                itemLabelPlural="solicitações"
                currentPage={currentPage}
                totalPages={listRange.totalPages}
              />
              <div className="table-scroll">
                <table className={cadastroListClasses.table}>
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className={cadastroListClasses.th}>Solicitação</th>
                      <th className={cadastroListClasses.thCenter}>Original</th>
                      <th className={cadastroListClasses.thCenter}>Corrigido</th>
                      <th className={cadastroListClasses.thCenter}>Registrada em</th>
                      <th className={cadastroListClasses.thCenter}>Status</th>
                      <th className={cadastroListClasses.thCenter}>Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                    {pagedRequests.map((request) => {
                      const statusInfo = getStatusInfo(request.status);
                      const StatusIcon = statusInfo.icon;
                      return (
                        <tr
                          key={request.id}
                          className={getListTableRowClassName(true)}
                          onClick={() => setSelectedRequest(request)}
                        >
                          <td className={cadastroListClasses.tdTruncate}>
                            <ListRowNavigableLabel className="font-medium">{request.title}</ListRowNavigableLabel>
                            {request.justification ? (
                              <p className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                                {request.justification}
                              </p>
                            ) : null}
                            {request.rejectionReason && request.status === 'REJECTED' ? (
                              <p className="text-xs text-red-600 dark:text-red-400">
                                Rejeição: {request.rejectionReason}
                              </p>
                            ) : null}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <p>
                              {formatDate(request.originalDate)} {formatTime(request.originalTime)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {getTypeLabel(request.originalType)}
                            </p>
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <p>
                              {formatDate(request.correctedDate)} {formatTime(request.correctedTime)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {getTypeLabel(request.correctedType)}
                            </p>
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            {formatDate(request.createdAt)}
                            {request.approvedBy ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400">{request.approvedBy.name}</p>
                            ) : null}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusInfo.color}`}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className={cadastroListClasses.tdCenter} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setSelectedRequest(request)}
                              title="Ver detalhes"
                              aria-label="Ver detalhes"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ListPagination currentPage={currentPage} totalPages={listRange.totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title="Detalhes da Solicitação"
        size="lg"
      >
        {selectedRequest ? (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900 dark:text-gray-100">{selectedRequest.title}</h4>

            <div>
              <h5 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Justificativa:</h5>
              <p className="rounded bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                {selectedRequest.justification}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded bg-red-50 p-3 dark:bg-red-900/30">
                <h6 className="mb-2 font-medium text-red-800 dark:text-red-300">Dados Originais</h6>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {formatDate(selectedRequest.originalDate)} às {formatTime(selectedRequest.originalTime)}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">{getTypeLabel(selectedRequest.originalType)}</p>
              </div>

              <div className="rounded bg-green-50 p-3 dark:bg-green-900/30">
                <h6 className="mb-2 font-medium text-green-800 dark:text-green-300">Dados Corrigidos</h6>
                <p className="text-sm text-green-700 dark:text-green-300">
                  {formatDate(selectedRequest.correctedDate)} às {formatTime(selectedRequest.correctedTime)}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {getTypeLabel(selectedRequest.correctedType)}
                </p>
              </div>
            </div>

            {selectedRequest.rejectionReason ? (
              <div className="rounded border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/30">
                <h6 className="mb-2 font-medium text-red-800 dark:text-red-300">Motivo da Rejeição:</h6>
                <p className="text-sm text-red-700 dark:text-red-300">{selectedRequest.rejectionReason}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
};

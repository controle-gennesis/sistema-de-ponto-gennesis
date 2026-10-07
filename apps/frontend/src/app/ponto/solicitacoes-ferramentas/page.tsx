'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle,
  Clock,
  Eye,
  Paperclip,
  Search,
  Users,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { FilePreviewCard } from '@/components/ui/FilePreviewCard';
import {
  cadastroListClasses,
  getListTableRowClassName,
  RowActionMenuCell,
  RowActionMenuPortal,
  type RowActionMenuExtraItem,
} from '@/components/ui/RowActionMenu';
import { ListRowNavigableLabel } from '@/components/ui/listTableUi';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { ListPageHeader, PageStack, pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useLogout } from '@/hooks/useLogout';
import { authService } from '@/lib/auth';
import api from '@/lib/api';
import {
  formatToolRentalDemand,
  formatToolRentalLogistics,
  formatToolRentalPriority,
  formatToolRentalStatus,
  resolveToolRentalDisplayStatus,
  toolRentalStatusBadgeClass,
  type ToolRentalDemandType,
  type ToolRentalLogisticsMode,
  type ToolRentalPriority,
  type ToolRentalRequestStatus,
} from '@/lib/toolRentalLabels';
import { buildToolRentalTimeline, type ToolRentalTimelineEvent } from '@/lib/toolRentalTimeline';
import {
  DpRequestHistoryTimeline,
  type DpRequestHistoryModalTab,
} from '@/lib/dpRequestHistoryModal';
import { DetailInfoTabs, type DetailInfoTabItem } from '@/components/ui/DetailInfoLayout';

type ToolRentalRequest = {
  id: string;
  code: string;
  polo: string;
  contrato: string;
  obra: string;
  titulo: string;
  equipamento: string;
  equipamentos?: Array<{ nome: string; quantidade: number; linkSugestao?: string | null }> | null;
  renewedFrom?: { id: string; code: string } | null;
  demandType: ToolRentalDemandType;
  logisticsMode?: ToolRentalLogisticsMode;
  priority: ToolRentalPriority;
  status: ToolRentalRequestStatus;
  periodoInicio: string;
  periodoFim: string;
  linkSugestao?: string | null;
  supplierName?: string | null;
  scNumber?: string | null;
  ocMirrorUrl?: string | null;
  ocMirrorName?: string | null;
  paymentProofUrl?: string | null;
  paymentProofName?: string | null;
  attachments?: Array<{ id: string; name: string; url: string; kind?: string }> | null;
  suppliesApprovalComment?: string | null;
  suppliesRejectionReason?: string | null;
  receivedAt?: string | null;
  receivedBy?: { id: string; name: string } | null;
  receiptObservation?: string | null;
  receiptAttachments?: Array<{ id: string; name: string; url: string }> | null;
  createdAt?: string;
  updatedAt?: string;
  suppliesApprovedAt?: string | null;
  assignedUser?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  suppliesApprovedBy?: { id: string; name: string } | null;
  events?: ToolRentalTimelineEvent[];
};

type StatusFilter = 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED';

const PENDING_STATUSES = 'OPEN,SUPPLIER_RELATION,QUOTATION,AWAITING_PAYMENT' as const;

const LIST_HEADER_BY_FILTER: Record<
  StatusFilter,
  {
    title: string;
    subtitle: string;
    Icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  ALL: {
    title: 'Todas as solicitações',
    subtitle: 'Todas as solicitações de ferramentas.',
    Icon: Users,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  PENDING: {
    title: 'Pendentes',
    subtitle: 'Em andamento no Suprimentos.',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  COMPLETED: {
    title: 'Finalizadas',
    subtitle: 'Solicitações concluídas.',
    Icon: CheckCircle,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  CANCELLED: {
    title: 'Canceladas',
    subtitle: 'Solicitações canceladas.',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

type ToolRentalAnexo = { id: string; name: string; url: string; kind?: string };

function anexosByKind(list: ToolRentalAnexo[] | null | undefined, kind: string): ToolRentalAnexo[] {
  return (list || []).filter((a) => (a.kind || 'outro') === kind && a.url);
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-gray-100 py-2.5 last:border-0 sm:grid-cols-[10rem_1fr] sm:gap-4 dark:border-gray-700/80">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}

function SolicitacoesFerramentasPage() {
  const queryClient = useQueryClient();
  const handleLogout = useLogout();
  const user = authService.getUser();

  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selected, setSelected] = useState<ToolRentalRequest | null>(null);
  const [detailTab, setDetailTab] = useState<DpRequestHistoryModalTab>('detalhes');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [scNumberDraft, setScNumberDraft] = useState('');
  const [uploadingKind, setUploadingKind] = useState<'oc' | null>(null);
  const [removingAnexoId, setRemovingAnexoId] = useState<string | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['tool-rental-requests-supplies'] });
    queryClient.invalidateQueries({ queryKey: ['tool-rental-supplies-summary'] });
    queryClient.invalidateQueries({ queryKey: ['tool-rental-supplies-pending-count'] });
  };

  const closeDetail = () => {
    setSelected(null);
    setDetailTab('detalhes');
    setShowReject(false);
    setRejectReason('');
    setScNumberDraft('');
    setUploadingKind(null);
    setRemovingAnexoId(null);
  };

  const { data: listData, isLoading } = useQuery({
    queryKey: ['tool-rental-requests-supplies', searchTerm, page, statusFilter],
    queryFn: async () => {
      const res = await api.get('/tool-rental-requests', {
        params: {
          search: searchTerm || undefined,
          page,
          limit: 20,
          scope: 'all',
          status:
            statusFilter === 'ALL'
              ? undefined
              : statusFilter === 'PENDING'
                ? PENDING_STATUSES
                : statusFilter,
        },
      });
      return res.data;
    },
  });

  const { data: summaryData } = useQuery({
    queryKey: ['tool-rental-supplies-summary'],
    queryFn: async () => {
      const res = await api.get('/tool-rental-requests/supplies-summary');
      return (
        res.data?.data ?? {
          pending: 0,
          completed: 0,
          cancelled: 0,
          total: 0,
        }
      );
    },
  });

  const saveScNumberMutation = useMutation({
    mutationFn: async ({ id, scNumber }: { id: string; scNumber: string }) => {
      const res = await api.put(`/tool-rental-requests/${id}/sc-number`, { scNumber });
      return res.data?.data as ToolRentalRequest;
    },
    onSuccess: (row) => {
      toast.success('Número da SC salvo');
      if (row) {
        setSelected(row);
        setScNumberDraft(row.scNumber || '');
      }
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao salvar número da SC');
    },
  });

  const toSupplierMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/tool-rental-requests/${id}/to-supplier-relation`, {});
    },
    onSuccess: () => {
      toast.success('Encaminhada para Em análise');
      closeDetail();
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao encaminhar');
    },
  });

  const toQuotationMutation = useMutation({
    mutationFn: async ({ id, scNumber }: { id: string; scNumber: string }) => {
      await api.put(`/tool-rental-requests/${id}/to-quotation`, { scNumber });
    },
    onSuccess: () => {
      toast.success('Encaminhada para Cotação');
      closeDetail();
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao avançar etapa');
    },
  });

  const toPaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/tool-rental-requests/${id}/to-awaiting-payment`, {});
    },
    onSuccess: () => {
      toast.success('Encaminhada para Aguardando Pagamento');
      closeDetail();
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao avançar etapa');
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/tool-rental-requests/${id}/complete`, {});
    },
    onSuccess: () => {
      toast.success('Solicitação finalizada — aguardando confirmação de recebimento');
      closeDetail();
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao finalizar');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await api.put(`/tool-rental-requests/${id}/supplies-reject`, { reason });
    },
    onSuccess: () => {
      toast.success('Solicitação rejeitada');
      closeDetail();
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao rejeitar');
    },
  });

  const uploadAnexoMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', 'oc');
      const res = await api.post(`/tool-rental-requests/${id}/anexos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.data as ToolRentalRequest;
    },
    onSuccess: (row) => {
      toast.success('Ordem de compra anexada');
      setSelected(row);
      setUploadingKind(null);
      invalidateAll();
    },
    onError: (err: any) => {
      setUploadingKind(null);
      toast.error(
        err?.response?.data?.error || err?.response?.data?.message || 'Falha ao enviar anexo',
      );
    },
  });

  const deleteAnexoMutation = useMutation({
    mutationFn: async ({ id, anexoId }: { id: string; anexoId: string }) => {
      const res = await api.delete(`/tool-rental-requests/${id}/anexos/${anexoId}`);
      return res.data?.data as ToolRentalRequest;
    },
    onSuccess: (row) => {
      toast.success('Anexo removido');
      setSelected(row);
      setRemovingAnexoId(null);
      invalidateAll();
    },
    onError: (err: any) => {
      setRemovingAnexoId(null);
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Falha ao remover');
    },
  });

  const busy =
    saveScNumberMutation.isPending ||
    toSupplierMutation.isPending ||
    toQuotationMutation.isPending ||
    toPaymentMutation.isPending ||
    completeMutation.isPending ||
    rejectMutation.isPending ||
    uploadAnexoMutation.isPending ||
    deleteAnexoMutation.isPending;

  const rows: ToolRentalRequest[] = listData?.data ?? [];
  const total = listData?.pagination?.total ?? 0;
  const listRange = getCadastroListRange(page, 20, total);

  const {
    rowActionMenu,
    rowForActionMenu,
    isRowMenuOpen,
    toggleRowActionMenu,
    closeRowActionMenu,
  } = useRowActionMenu(rows);

  const openDetail = (row: ToolRentalRequest) => {
    setDetailTab('detalhes');
    setSelected(row);
    setScNumberDraft(row.scNumber || '');
    setShowReject(false);
  };

  const persistScNumber = () => {
    if (!selected) return;
    const next = scNumberDraft.trim();
    if (!next) return toast.error('Informe o número da SC');
    if (next === (selected.scNumber || '').trim()) return;
    saveScNumberMutation.mutate({ id: selected.id, scNumber: next });
  };

  const forwardToAnalysis = () => {
    if (!selected) return;
    toSupplierMutation.mutate(selected.id);
  };

  const forwardToQuotation = () => {
    if (!selected) return;
    const scNumber = scNumberDraft.trim() || selected.scNumber?.trim() || '';
    if (!scNumber) return toast.error('Informe o número da SC antes de encaminhar');
    toQuotationMutation.mutate({ id: selected.id, scNumber });
  };

  const buildRowMenuItems = (row: ToolRentalRequest): RowActionMenuExtraItem[] => [
    {
      label:
        row.status === 'OPEN' ||
        row.status === 'SUPPLIER_RELATION' ||
        row.status === 'QUOTATION' ||
        row.status === 'AWAITING_PAYMENT'
          ? 'Atender'
          : 'Ver detalhes',
      icon: <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />,
      onClick: () => openDetail(row),
    },
  ];

  const listHeader = LIST_HEADER_BY_FILTER[statusFilter];
  const ListHeaderIcon = listHeader.Icon;

  const stats = useMemo(
    () => [
      {
        filter: 'ALL' as StatusFilter,
        label: 'Todas',
        value: summaryData?.total ?? 0,
        Icon: LIST_HEADER_BY_FILTER.ALL.Icon,
        iconBg: LIST_HEADER_BY_FILTER.ALL.iconBg,
        iconColor: LIST_HEADER_BY_FILTER.ALL.iconColor,
      },
      {
        filter: 'PENDING' as StatusFilter,
        label: 'Pendentes',
        value: summaryData?.pending ?? 0,
        Icon: LIST_HEADER_BY_FILTER.PENDING.Icon,
        iconBg: LIST_HEADER_BY_FILTER.PENDING.iconBg,
        iconColor: LIST_HEADER_BY_FILTER.PENDING.iconColor,
      },
      {
        filter: 'COMPLETED' as StatusFilter,
        label: 'Finalizadas',
        value: summaryData?.completed ?? 0,
        Icon: LIST_HEADER_BY_FILTER.COMPLETED.Icon,
        iconBg: LIST_HEADER_BY_FILTER.COMPLETED.iconBg,
        iconColor: LIST_HEADER_BY_FILTER.COMPLETED.iconColor,
      },
      {
        filter: 'CANCELLED' as StatusFilter,
        label: 'Canceladas',
        value: summaryData?.cancelled ?? 0,
        Icon: LIST_HEADER_BY_FILTER.CANCELLED.Icon,
        iconBg: LIST_HEADER_BY_FILTER.CANCELLED.iconBg,
        iconColor: LIST_HEADER_BY_FILTER.CANCELLED.iconColor,
      },
    ],
    [summaryData]
  );

  if (!user) {
    return (
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
        <Loading message="Carregando..." fullScreen size="lg" />
      </MainLayout>
    );
  }

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <PageStack>
          <ListPageHeader
            title="Pedidos de Ferramentas"
            description="Gerencie as solicitações de ferramentas"
          />

        <div className={pageStatCardsGridClass}>
          {stats.map((stat) => (
            <FilterStatCard
              key={stat.filter}
              label={stat.label}
              count={stat.value}
              icon={stat.Icon}
              iconBg={stat.iconBg}
              iconColor={stat.iconColor}
              isActive={statusFilter === stat.filter}
              onClick={() => {
                setStatusFilter(stat.filter);
                setPage(1);
              }}
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
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                    {listHeader.title}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {listHeader.subtitle}
                  </p>
                </div>
              </div>
              <div className={cadastroListClasses.cardToolbar}>
                <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Buscar título, obra, equipamento…"
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            <CadastroListSummary
              startItem={listRange.startItem}
              endItem={listRange.endItem}
              total={total}
              itemLabel="solicitação"
              itemLabelPlural="solicitações"
              currentPage={page}
              totalPages={listRange.totalPages}
            />
            {isLoading ? (
              <CadastroListLoading message="Carregando solicitações..." />
            ) : rows.length === 0 ? (
              <CadastroListEmpty
                icon={Wrench}
                title="Nenhuma solicitação neste filtro"
                hint="Ajuste o filtro ou aguarde novas solicitações da Engenharia."
              />
            ) : (
              <div className="table-scroll">
                <table className={cadastroListClasses.table}>
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className={cadastroListClasses.th}>ID</th>
                      <th className={cadastroListClasses.th}>Solicitação</th>
                      <th className={cadastroListClasses.thCenter}>Tipo</th>
                      <th className={cadastroListClasses.thCenter}>Polo</th>
                      <th className={cadastroListClasses.thCenter}>Prioridade</th>
                      <th className={cadastroListClasses.thCenter}>Período</th>
                      <th className={cadastroListClasses.thCenter}>Status</th>
                      <th className={cadastroListClasses.thRight}>Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                    {rows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={getListTableRowClassName(true)}
                        onClick={() => openDetail(row)}
                      >
                        <td className={cadastroListClasses.tdMono}>
                          <ListRowNavigableLabel className="font-mono font-medium">
                            {formatCadastroListId(row.code, listRange.startItem + index)}
                          </ListRowNavigableLabel>
                        </td>
                        <td className={cadastroListClasses.tdTruncate}>
                          <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                            {row.titulo}
                          </p>
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatToolRentalDemand(row.demandType)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>{row.polo}</td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatToolRentalPriority(row.priority)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {formatDateOnly(row.periodoInicio)} – {formatDateOnly(row.periodoFim)}
                        </td>
                        <td className={cadastroListClasses.tdCenter}>
                          {(() => {
                            const displayStatus = resolveToolRentalDisplayStatus(
                              row.status,
                              row.receivedAt,
                            );
                            return (
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${toolRentalStatusBadgeClass(displayStatus)}`}
                              >
                                {formatToolRentalStatus(displayStatus)}
                              </span>
                            );
                          })()}
                        </td>
                        <RowActionMenuCell
                          isOpen={isRowMenuOpen(row.id)}
                          onToggle={(e) => toggleRowActionMenu(row.id, e.currentTarget)}
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {rowActionMenu && rowForActionMenu ? (
              <RowActionMenuPortal
                menu={rowActionMenu}
                onClose={closeRowActionMenu}
                onEdit={() => {}}
                hideDefaultActions
                extraItems={buildRowMenuItems(rowForActionMenu)}
              />
            ) : null}
            <ListPagination
              currentPage={page}
              totalPages={listRange.totalPages}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>

        <Modal
          isOpen={!!selected}
          onClose={() => {
            if (busy) return;
            closeDetail();
          }}
          title={selected ? `Solicitação #${selected.code}` : 'Solicitação'}
          size="lg"
          headerClassName="!border-b-0 !pb-2"
          contentClassName="!pt-0"
        >
          {selected ? (
            <div className="space-y-5">
              <div className="-mx-6">
                <DetailInfoTabs
                  tabs={
                    [
                      { id: 'detalhes', label: 'Detalhes' },
                      { id: 'timeline', label: 'Timeline' },
                    ] satisfies DetailInfoTabItem<DpRequestHistoryModalTab>[]
                  }
                  active={detailTab}
                  onChange={setDetailTab}
                  ariaLabel="Seções da solicitação"
                  className="px-6"
                />
              </div>

              {detailTab === 'timeline' ? (
                <DpRequestHistoryTimeline
                  steps={buildToolRentalTimeline(selected)}
                  formatDateTime={formatDateTime}
                />
              ) : (
                <>
                  <dl>
                    <DetailRow label="Título" value={selected.titulo} />
                    <DetailRow label="Tipo" value={formatToolRentalDemand(selected.demandType)} />
                    {selected.renewedFrom ? (
                      <DetailRow
                        label={selected.demandType === 'DEVOLUCAO' ? 'Devolução' : 'Renovação'}
                        value={
                          selected.demandType === 'DEVOLUCAO'
                            ? `Devolução da solicitação #${selected.renewedFrom.code}`
                            : `Renovação da solicitação #${selected.renewedFrom.code}`
                        }
                      />
                    ) : null}
                    <DetailRow
                      label="Modalidade"
                      value={
                        selected.logisticsMode
                          ? formatToolRentalLogistics(selected.logisticsMode)
                          : '—'
                      }
                    />
                    <DetailRow label="Prioridade" value={formatToolRentalPriority(selected.priority)} />
                    <DetailRow label="Polo" value={selected.polo} />
                    <DetailRow label="Contrato" value={selected.contrato} />
                    <DetailRow label="Obra" value={selected.obra} />
                    <DetailRow
                      label="Equipamentos"
                      value={
                        Array.isArray(selected.equipamentos) && selected.equipamentos.length > 0 ? (
                          <ul className="space-y-1.5">
                            {selected.equipamentos.map((item, index) => (
                              <li key={`${item.nome}-${index}`}>
                                <div>
                                  {item.nome}{' '}
                                  <span className="font-normal text-gray-500 dark:text-gray-400">
                                    — qtd. {item.quantidade}
                                  </span>
                                </div>
                                {item.linkSugestao ? (
                                  <a
                                    href={item.linkSugestao}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-0.5 block truncate text-xs font-normal text-blue-600 hover:underline dark:text-blue-400"
                                  >
                                    {item.linkSugestao}
                                  </a>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          selected.equipamento || '—'
                        )
                      }
                    />
                    <DetailRow
                      label="Período"
                      value={`${formatDateOnly(selected.periodoInicio)} – ${formatDateOnly(selected.periodoFim)}`}
                    />
                    <DetailRow
                      label="Solicitante"
                      value={selected.createdBy?.name || selected.assignedUser?.name || '—'}
                    />
                    <DetailRow label="Fornecedor" value={selected.supplierName || '—'} />
                    <DetailRow
                      label="Status"
                      value={(() => {
                        const displayStatus = resolveToolRentalDisplayStatus(
                          selected.status,
                          selected.receivedAt,
                        );
                        return (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${toolRentalStatusBadgeClass(displayStatus)}`}
                          >
                            {formatToolRentalStatus(displayStatus)}
                          </span>
                        );
                      })()}
                    />
                    {selected.status === 'OPEN' ||
                    selected.status === 'SUPPLIER_RELATION' ||
                    selected.status === 'QUOTATION' ? (
                      <div className="grid gap-1 border-b border-gray-100 py-2.5 last:border-0 sm:grid-cols-[10rem_1fr] sm:gap-4 dark:border-gray-700/80">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Nº da SC <span className="text-red-600">*</span>
                        </dt>
                        <dd className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            value={scNumberDraft}
                            onChange={(e) => setScNumberDraft(e.target.value)}
                            onBlur={persistScNumber}
                            disabled={busy}
                            placeholder="Ex.: SC-12345"
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                          />
                          <button
                            type="button"
                            disabled={busy || !scNumberDraft.trim()}
                            onClick={persistScNumber}
                            className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            {saveScNumberMutation.isPending ? 'Salvando…' : 'Salvar SC'}
                          </button>
                        </dd>
                      </div>
                    ) : (
                      <DetailRow label="Nº da SC" value={selected.scNumber || '—'} />
                    )}
                    {selected.suppliesRejectionReason ? (
                      <DetailRow label="Rejeição" value={selected.suppliesRejectionReason} />
                    ) : null}
                    {selected.receivedAt ? (
                      <>
                        <DetailRow
                          label="Quem recebeu"
                          value={selected.receivedBy?.name || '—'}
                        />
                        <DetailRow
                          label="Data e hora do recebimento"
                          value={formatDateTime(selected.receivedAt)}
                        />
                        {selected.receiptObservation ? (
                          <DetailRow label="Observação do recebimento" value={selected.receiptObservation} />
                        ) : null}
                      </>
                    ) : null}
                  </dl>

                  {selected.receivedAt &&
                  Array.isArray(selected.receiptAttachments) &&
                  selected.receiptAttachments.length > 0 ? (
                    <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Anexos do recebimento
                      </p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {selected.receiptAttachments.map((anexo) => (
                          <FilePreviewCard
                            key={anexo.id}
                            file={{
                              originalName: anexo.name || 'Arquivo',
                              fileUrl: anexo.url,
                            }}
                            extra="Recebimento"
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(() => {
                    const anexos = selected.attachments || [];
                    const ordensCompra = anexosByKind(anexos, 'oc');
                    const canEditAnexos = !showReject && selected.status === 'QUOTATION';
                    const showOcSection =
                      canEditAnexos ||
                      ordensCompra.length > 0 ||
                      selected.status === 'QUOTATION' ||
                      selected.status === 'AWAITING_PAYMENT' ||
                      selected.status === 'COMPLETED' ||
                      selected.status === 'AWAITING_RECEIPT';

                    if (!showOcSection) return null;

                    return (
                      <div className="rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                            <Paperclip className="h-4 w-4 text-gray-500" />
                            Ordem de compra
                          </div>
                        </div>
                        <div className="space-y-3 p-4">
                          {ordensCompra.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Nenhuma ordem de compra anexada.
                            </p>
                          ) : (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                              {ordensCompra.map((anexo) => (
                                <FilePreviewCard
                                  key={anexo.id}
                                  file={{
                                    originalName: anexo.name || 'Arquivo',
                                    fileUrl: anexo.url,
                                  }}
                                  extra="OC"
                                  removing={removingAnexoId === anexo.id}
                                  onRemove={
                                    canEditAnexos
                                      ? () => {
                                          setRemovingAnexoId(anexo.id);
                                          deleteAnexoMutation.mutate({
                                            id: selected.id,
                                            anexoId: anexo.id,
                                          });
                                        }
                                      : undefined
                                  }
                                />
                              ))}
                            </div>
                          )}
                          {canEditAnexos ? (
                            <FileDropZone
                              label="Adicionar ordem de compra"
                              hint="Clique ou arraste imagem/PDF"
                              uploading={uploadingKind === 'oc'}
                              disabled={busy && uploadingKind !== 'oc'}
                              onFiles={(files) => {
                                const file = files[0];
                                if (!file) return;
                                setUploadingKind('oc');
                                uploadAnexoMutation.mutate({
                                  id: selected.id,
                                  file,
                                });
                              }}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}

                  {showReject ? (
                    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                      <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                        Motivo da rejeição
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        placeholder="Descreva o motivo…"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowReject(false);
                            setRejectReason('');
                          }}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium dark:border-gray-600"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          disabled={busy || !rejectReason.trim()}
                          onClick={() =>
                            rejectMutation.mutate({ id: selected.id, reason: rejectReason.trim() })
                          }
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Confirmar rejeição
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!showReject && selected.status === 'OPEN' ? (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => setShowReject(true)}
                        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={forwardToAnalysis}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Encaminhar p/ Em análise
                      </button>
                    </div>
                  ) : null}

                  {!showReject && selected.status === 'SUPPLIER_RELATION' ? (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => setShowReject(true)}
                        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={forwardToQuotation}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Encaminhar p/ Cotação
                      </button>
                    </div>
                  ) : null}

                  {!showReject && selected.status === 'QUOTATION' ? (
                    <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => setShowReject(true)}
                        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toPaymentMutation.mutate(selected.id)}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Encaminhar p/ Aguardando Pagamento
                      </button>
                    </div>
                  ) : null}

                  {!showReject && selected.status === 'AWAITING_PAYMENT' ? (
                    <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => completeMutation.mutate(selected.id)}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Encaminhar p/ Recebimento
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </Modal>
      </PageStack>
    </MainLayout>
  );
}

export default function Page() {
  return (
    <ProtectedRoute route="/ponto/solicitacoes-ferramentas">
      <SolicitacoesFerramentasPage />
    </ProtectedRoute>
  );
}

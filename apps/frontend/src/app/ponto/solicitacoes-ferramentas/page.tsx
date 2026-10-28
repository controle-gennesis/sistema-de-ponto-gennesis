'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle,
  CreditCard,
  FileSearch,
  Inbox,
  Eye,
  Paperclip,
  Pencil,
  Plus,
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
import { Bloco } from '@/components/ferramentas/Bloco';
import { NovaSolicitacaoFerramentaModal } from '@/components/ferramentas/NovaSolicitacaoFerramentaModal';
import { detectOcIdFromFile } from '@/lib/extractOcId';
import { DatePickerField } from '@/components/ui/DatePickerField';
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
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useLogout } from '@/hooks/useLogout';
import { authService } from '@/lib/auth';
import api from '@/lib/api';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
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
  scId?: string | null;
  ocId?: string | null;
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

type StatusFilter = 'ALL' | 'OPEN' | 'QUOTATION' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'CANCELLED';

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
  OPEN: {
    title: 'Abertas',
    subtitle: 'Aguardando o Suprimentos iniciar a cotação.',
    Icon: Inbox,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  QUOTATION: {
    title: 'Cotação',
    subtitle: 'Cotação e ordem de compra em andamento.',
    Icon: FileSearch,
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
  },
  AWAITING_PAYMENT: {
    title: 'Pagamento',
    subtitle: 'Ordem de compra emitida, pagamento pendente.',
    Icon: CreditCard,
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconColor: 'text-violet-600 dark:text-violet-400',
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

const pageStatCardsGrid6Class =
  'grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-4 sm:gap-6';

const labelCls = 'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400';
const fieldCls = FORM_FIELD_INPUT_CLS;

/** Botão quadrado vermelho do cabeçalho dos blocos (mesmo da Ficha de Demanda). */
function BlocoActionButton({
  label,
  onClick,
  disabled,
  icon = 'plus',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: 'plus' | 'edit';
}) {
  const Icon = icon === 'edit' ? Pencil : Plus;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
    >
      <Icon className="h-4 w-4 shrink-0" />
    </button>
  );
}

/** Botão "+" que abre direto o seletor de arquivo. */
function BlocoPickFileButton({
  label,
  onFile,
  disabled,
}: {
  label: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <BlocoActionButton label={label} disabled={disabled} onClick={() => inputRef.current?.click()} />
    </>
  );
}

function SolicitacoesFerramentasPage() {
  const queryClient = useQueryClient();
  const handleLogout = useLogout();
  const user = authService.getUser();

  const [searchTerm, setSearchTerm] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selected, setSelected] = useState<ToolRentalRequest | null>(null);
  const [detailTab, setDetailTab] = useState<DpRequestHistoryModalTab>('detalhes');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [scNumberDraft, setScNumberDraft] = useState('');
  const [scIdDraft, setScIdDraft] = useState('');
  const [ocIdDraft, setOcIdDraft] = useState('');
  const [scModalOpen, setScModalOpen] = useState(false);
  const [ocModalOpen, setOcModalOpen] = useState(false);
  const [ocFile, setOcFile] = useState<File | null>(null);
  // Leitura do ID no arquivo da OC: o campo só aparece se não der para ler.
  const [ocIdStatus, setOcIdStatus] = useState<'none' | 'found' | 'missing'>('none');
  const [uploadingKind, setUploadingKind] = useState<'oc' | 'nf' | 'boleto' | 'payment' | null>(null);
  const [removingAnexoId, setRemovingAnexoId] = useState<string | null>(null);
  const [renewTarget, setRenewTarget] = useState<ToolRentalRequest | null>(null);
  const [renewForm, setRenewForm] = useState({ periodoInicio: '', periodoFim: '', observacao: '' });

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
    setScIdDraft('');
    setOcIdDraft('');
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
          status: statusFilter === 'ALL' ? undefined : statusFilter,
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
          open: 0,
          quotation: 0,
          awaitingPayment: 0,
          completed: 0,
          cancelled: 0,
          total: 0,
        }
      );
    },
  });

  const saveScNumberMutation = useMutation({
    mutationFn: async ({ id, scNumber, scId }: { id: string; scNumber: string; scId: string }) => {
      const res = await api.put(`/tool-rental-requests/${id}/sc-number`, { scNumber, scId });
      return res.data?.data as ToolRentalRequest;
    },
    onSuccess: (row) => {
      toast.success('Solicitação de compra salva');
      if (row) {
        setSelected(row);
        setScNumberDraft(row.scNumber || '');
        setScIdDraft(row.scId || '');
      }
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Falha ao salvar número da SC');
    },
  });

  const toQuotationMutation = useMutation({
    mutationFn: async ({ id, scNumber, scId }: { id: string; scNumber: string; scId: string }) => {
      await api.put(`/tool-rental-requests/${id}/to-quotation`, { scNumber, scId });
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
    mutationFn: async ({ id, ocId }: { id: string; ocId: string }) => {
      await api.put(`/tool-rental-requests/${id}/to-awaiting-payment`, { ocId });
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
    mutationFn: async ({
      id,
      file,
      kind,
      ocId,
    }: {
      id: string;
      file: File;
      kind: 'oc' | 'nf' | 'boleto' | 'payment';
      ocId?: string;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);
      if (ocId) formData.append('ocId', ocId);
      const res = await api.post(`/tool-rental-requests/${id}/anexos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.data as ToolRentalRequest;
    },
    onSuccess: (row) => {
      toast.success('Arquivo anexado');
      setSelected(row);
      setOcIdDraft(row?.ocId || '');
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

  const renewMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      periodoInicio: string;
      periodoFim: string;
      observacao: string;
    }) => {
      await api.post(`/tool-rental-requests/${payload.id}/renew`, {
        periodoInicio: payload.periodoInicio,
        periodoFim: payload.periodoFim,
        observacao: payload.observacao.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success('Renovação aberta — a solicitação atual foi finalizada');
      setRenewTarget(null);
      closeDetail();
      invalidateAll();
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Não foi possível solicitar a renovação',
      );
    },
  });

  const busy =
    renewMutation.isPending ||
    saveScNumberMutation.isPending ||
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
    setScIdDraft(row.scId || '');
    setOcIdDraft(row.ocId || '');
    setShowReject(false);
  };

  const openScModal = () => {
    if (!selected) return;
    setScNumberDraft(selected.scNumber || '');
    setScIdDraft(selected.scId || '');
    setScModalOpen(true);
  };

  const submitScModal = () => {
    if (!selected) return;
    const scNumber = scNumberDraft.trim();
    const scId = scIdDraft.trim();
    if (!scNumber) return toast.error('Informe o número da SC');
    if (!scId) return toast.error('Informe o ID da SC');
    saveScNumberMutation.mutate(
      { id: selected.id, scNumber, scId },
      { onSuccess: () => setScModalOpen(false) },
    );
  };

  const openOcModal = () => {
    setOcIdDraft('');
    setOcFile(null);
    setOcIdStatus('none');
    setOcModalOpen(true);
  };

  const submitOcModal = () => {
    if (!selected) return;
    const ocId = ocIdDraft.trim();
    if (!ocId) return toast.error('Informe o ID da OC');
    if (!ocFile) return toast.error('Anexe a ordem de compra');
    setUploadingKind('oc');
    uploadAnexoMutation.mutate(
      { id: selected.id, file: ocFile, kind: 'oc', ocId },
      {
        onSuccess: () => {
          setOcModalOpen(false);
          setOcFile(null);
        },
      },
    );
  };

  const canRenew = (row: ToolRentalRequest) =>
    (row.status === 'IN_USE' || (row.status === 'COMPLETED' && Boolean(row.receivedAt))) &&
    (row.demandType === 'NOVA_LOCACAO' || row.demandType === 'RENOVACAO');

  const openRenew = (row: ToolRentalRequest) => {
    setRenewForm({ periodoInicio: row.periodoFim?.slice(0, 10) || '', periodoFim: '', observacao: '' });
    setRenewTarget(row);
  };

  const submitRenew = () => {
    if (!renewTarget) return;
    if (!renewForm.periodoInicio) return toast.error('Informe a data de início');
    if (!renewForm.periodoFim) return toast.error('Informe a data de fim');
    renewMutation.mutate({ id: renewTarget.id, ...renewForm });
  };

  const forwardToQuotation = () => {
    if (!selected) return;
    const scNumber = (selected.scNumber || '').trim();
    const scId = (selected.scId || '').trim();
    if (!scNumber || !scId) return toast.error('Adicione a solicitação de compra (Nº e ID da SC)');
    toQuotationMutation.mutate({ id: selected.id, scNumber, scId });
  };

  const forwardToPayment = () => {
    if (!selected) return;
    const ocId = (selected.ocId || '').trim();
    if (!ocId || anexosByKind(selected.attachments, 'oc').length === 0) {
      return toast.error('Adicione a ordem de compra (ID e anexo)');
    }
    toPaymentMutation.mutate({ id: selected.id, ocId });
  };

  const buildRowMenuItems = (row: ToolRentalRequest): RowActionMenuExtraItem[] => [
    {
      label:
        row.status === 'OPEN' ||
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

  const stats = useMemo(() => {
    const defs: Array<{ filter: StatusFilter; label: string; value: number }> = [
      { filter: 'ALL', label: 'Todas', value: summaryData?.total ?? 0 },
      { filter: 'OPEN', label: 'Abertas', value: summaryData?.open ?? 0 },
      { filter: 'QUOTATION', label: 'Cotação', value: summaryData?.quotation ?? 0 },
      {
        filter: 'AWAITING_PAYMENT',
        label: 'Pagamento',
        value: summaryData?.awaitingPayment ?? 0,
      },
      { filter: 'COMPLETED', label: 'Finalizadas', value: summaryData?.completed ?? 0 },
      { filter: 'CANCELLED', label: 'Canceladas', value: summaryData?.cancelled ?? 0 },
    ];
    return defs.map((d) => ({
      ...d,
      Icon: LIST_HEADER_BY_FILTER[d.filter].Icon,
      iconBg: LIST_HEADER_BY_FILTER[d.filter].iconBg,
      iconColor: LIST_HEADER_BY_FILTER[d.filter].iconColor,
    }));
  }, [summaryData]);

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

        <div className={pageStatCardsGrid6Class}>
          {stats.map((stat) => (
            <FilterStatCard
              size="sm"
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
                <button
                  type="button"
                  onClick={() => setShowNewForm(true)}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Nova Solicitação</span>
                </button>
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
          size="xl"
          headerClassName="!border-b-0 !pb-2"
          contentClassName="!pt-0"
          footer={
            selected && detailTab === 'detalhes' ? (
              showReject ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReject(false);
                      setRejectReason('');
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    disabled={busy || !rejectReason.trim()}
                    onClick={() =>
                      rejectMutation.mutate({ id: selected.id, reason: rejectReason.trim() })
                    }
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Confirmar rejeição
                  </button>
                </>
              ) : selected.status === 'OPEN' || selected.status === 'QUOTATION' ? (
                <>
                  {selected.status === 'OPEN' ? (
                    <button type="button" onClick={() => setShowReject(true)} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30">
                    Rejeitar
                  </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={selected.status === 'OPEN' ? forwardToQuotation : forwardToPayment}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {selected.status === 'OPEN'
                      ? 'Avançar para Cotação'
                      : 'Avançar para Pagamento'}
                  </button>
                </>
              ) : canRenew(selected) ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openRenew(selected)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  Solicitar renovação
                </button>
              ) : selected.status === 'AWAITING_PAYMENT' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (anexosByKind(selected.attachments, 'payment').length === 0) {
                      return toast.error('Anexe o comprovante de pagamento');
                    }
                    completeMutation.mutate(selected.id);
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  Avançar para Recebimento
                </button>
              ) : null
            ) : null
          }
        >
          {selected ? (
            <div className="space-y-4 text-sm">
              <div className="sticky top-0 z-10 -mx-6 bg-white dark:bg-gray-800">
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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold uppercase text-gray-500">Status</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {(() => {
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
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">Tipo</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{formatToolRentalDemand(selected.demandType)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">Prioridade</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{formatToolRentalPriority(selected.priority)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">Modalidade</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.logisticsMode ? formatToolRentalLogistics(selected.logisticsMode) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">Polo</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.polo}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold uppercase text-gray-500">Título</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.titulo}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold uppercase text-gray-500">Equipamentos</p>
                      <ul className="mt-1 space-y-1.5 font-medium text-gray-900 dark:text-gray-100">
                        {Array.isArray(selected.equipamentos) && selected.equipamentos.length > 0 ? (
                          selected.equipamentos.map((item, index) => (
                            <li key={`${item.nome}-${index}`}>
                              <div>
                                {item.nome}{' '}
                                <span className="text-gray-500 dark:text-gray-400">
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
                          ))
                        ) : (
                          <li>{selected.equipamento || '—'}</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">Período</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{formatDateOnly(selected.periodoInicio)} – {formatDateOnly(selected.periodoFim)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">Solicitante</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.createdBy?.name || selected.assignedUser?.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">Contrato</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.contrato}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">Obra</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.obra}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold uppercase text-gray-500">Fornecedor</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.supplierName || '—'}</p>
                    </div>
                    {selected.renewedFrom ? (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold uppercase text-gray-500">
                          {selected.demandType === 'DEVOLUCAO' ? 'Devolução' : 'Renovação'}
                        </p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                          {selected.demandType === 'DEVOLUCAO'
                            ? `Devolução da solicitação #${selected.renewedFrom.code}`
                            : `Renovação da solicitação #${selected.renewedFrom.code}`}
                        </p>
                      </div>
                    ) : null}
                    {selected.suppliesRejectionReason ? (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold uppercase text-gray-500">Rejeição</p>
                        <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                          {selected.suppliesRejectionReason}
                        </p>
                      </div>
                    ) : null}
                    {selected.receivedAt ? (
                      <>
                        <div>
                          <p className="text-xs font-semibold uppercase text-gray-500">Quem recebeu</p>
                          <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                            {selected.receivedBy?.name || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase text-gray-500">
                            Data e hora do recebimento
                          </p>
                          <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                            {formatDateTime(selected.receivedAt)}
                          </p>
                        </div>
                        {selected.receiptObservation ? (
                          <div className="sm:col-span-2">
                            <p className="text-xs font-semibold uppercase text-gray-500">Observação</p>
                            <p className="mt-1 whitespace-pre-wrap font-medium text-gray-900 dark:text-gray-100">
                              {selected.receiptObservation}
                            </p>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {anexosByKind(selected.attachments, 'fd').length > 0 ? (
                      <div className="sm:col-span-2">
                        <p className="mb-2 text-xs font-semibold uppercase text-gray-500">FD - anexo</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {anexosByKind(selected.attachments, 'fd').map((anexo) => (
                            <FilePreviewCard
                              key={anexo.id}
                              file={{
                                originalName: anexo.name || 'Arquivo',
                                fileUrl: anexo.url,
                              }}
                              displayName="FD"
                              extra={anexo.name || 'Arquivo'}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {selected.receivedAt &&
                    Array.isArray(selected.receiptAttachments) &&
                    selected.receiptAttachments.length > 0 ? (
                      <div className="sm:col-span-2">
                        <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                          Anexos do recebimento
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {selected.receiptAttachments.map((anexo) => (
                            <FilePreviewCard
                              key={anexo.id}
                              file={{
                                originalName: anexo.name || 'Arquivo',
                                fileUrl: anexo.url,
                              }}
                              displayName="Recebimento"
                              extra={anexo.name || 'Arquivo'}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {selected.status === 'OPEN' || selected.scNumber || selected.scId ? (
                    <Bloco
                      title="Solicitação de compra"
                      action={
                        selected.status === 'OPEN' ? (
                          <BlocoActionButton
                            label={selected.scNumber ? 'Editar solicitação de compra' : 'Adicionar solicitação de compra'}
                            icon={selected.scNumber ? 'edit' : 'plus'}
                            disabled={busy}
                            onClick={openScModal}
                          />
                        ) : null
                      }
                    >
                      {selected.scNumber || selected.scId ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase text-gray-500">Nº da SC</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                              {selected.scNumber || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-gray-500">ID da SC</p>
                            <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                              {selected.scId || '—'}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Nenhuma solicitação de compra informada.
                        </p>
                      )}
                    </Bloco>
                  ) : null}

                  {(
                    [
                      { kind: 'nf', title: 'Nota fiscal', extra: 'NF', add: 'Adicionar nota fiscal', editIn: ['OPEN'] },
                      { kind: 'boleto', title: 'Boleto', extra: 'Boleto', add: 'Adicionar boleto', editIn: ['OPEN'] },
                      { kind: 'oc', title: 'Ordem de compra', extra: 'OC', add: 'Adicionar ordem de compra', editIn: ['QUOTATION'] },
                      { kind: 'payment', title: 'Comprovante de pagamento', extra: 'Comprovante', add: 'Adicionar comprovante', editIn: ['AWAITING_PAYMENT'] },
                    ] as const
                  ).map((section) => {
                    const lista = anexosByKind(selected.attachments, section.kind);
                    const canEditAnexos =
                      !showReject && (section.editIn as readonly string[]).includes(selected.status);
                    const isOc = section.kind === 'oc';
                    const visivel =
                      canEditAnexos ||
                      lista.length > 0 ||
                      (isOc && Boolean(selected.ocId)) ||
                      (section.kind === 'payment' &&
                        (selected.status === 'COMPLETED' || selected.status === 'AWAITING_RECEIPT'));
                    if (!visivel) return null;

                    // Um arquivo por bloco: com ele anexado, o botão "+" some (remover traz de volta).
                    const podeAdicionar = canEditAnexos && lista.length === 0;
                    const action = !podeAdicionar ? null : isOc ? (
                      <BlocoActionButton label={section.add} disabled={busy} onClick={openOcModal} />
                    ) : (
                      <BlocoPickFileButton
                        label={section.add}
                        disabled={busy}
                        onFile={(file) => {
                          setUploadingKind(section.kind);
                          uploadAnexoMutation.mutate({ id: selected.id, file, kind: section.kind });
                        }}
                      />
                    );

                    return (
                      <Bloco key={section.kind} title={section.title} action={action}>
                        <div className="space-y-3">
                          {lista.length > 0 ? (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {lista.map((anexo) => (
                                <FilePreviewCard
                                  key={anexo.id}
                                  file={{
                                    originalName: anexo.name || 'Arquivo',
                                    fileUrl: anexo.url,
                                  }}
                                  displayName={section.kind === 'oc' && selected.ocId ? `ID ${selected.ocId}` : section.extra}
                                  extra={anexo.name || 'Arquivo'}
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
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Nenhum arquivo anexado.
                            </p>
                          )}
                        </div>
                      </Bloco>
                    );
                  })}

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
                    </div>
                  ) : null}

                </>
              )}
            </div>
          ) : null}
        </Modal>

        <Modal
          isOpen={!!renewTarget}
          onClose={() => !renewMutation.isPending && setRenewTarget(null)}
          title={renewTarget ? `Renovar solicitação #${renewTarget.code}` : 'Renovar solicitação'}
          size="md"
          footer={
            <>
              <button
                type="button"
                disabled={renewMutation.isPending}
                onClick={() => setRenewTarget(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={renewMutation.isPending}
                onClick={submitRenew}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {renewMutation.isPending ? 'Enviando…' : 'Solicitar renovação'}
              </button>
            </>
          }
        >
          {renewTarget ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                A solicitação atual será <strong>finalizada</strong> e uma nova renovação será aberta
                com os mesmos equipamentos, contrato, obra e fornecedor. Informe o novo período.
              </p>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800/60">
                <p className="font-medium text-gray-900 dark:text-gray-100">{renewTarget.titulo}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Período atual: {formatDateOnly(renewTarget.periodoInicio)} –{' '}
                  {formatDateOnly(renewTarget.periodoFim)}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>
                    Novo início <span className="text-red-600">*</span>
                  </label>
                  <DatePickerField
                    value={renewForm.periodoInicio}
                    onChange={(periodoInicio) => setRenewForm((f) => ({ ...f, periodoInicio }))}
                    placeholder="dd/mm/aaaa"
                    noFocusRing
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    Novo fim <span className="text-red-600">*</span>
                  </label>
                  <DatePickerField
                    value={renewForm.periodoFim}
                    onChange={(periodoFim) => setRenewForm((f) => ({ ...f, periodoFim }))}
                    placeholder="dd/mm/aaaa"
                    noFocusRing
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Observação</label>
                <textarea
                  className={fieldCls}
                  rows={3}
                  value={renewForm.observacao}
                  onChange={(e) => setRenewForm((f) => ({ ...f, observacao: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal
          isOpen={scModalOpen}
          onClose={() => !saveScNumberMutation.isPending && setScModalOpen(false)}
          title={selected?.scNumber ? 'Editar solicitação de compra' : 'Adicionar solicitação de compra'}
          size="md"
          footer={
            <>
              <button
                type="button"
                disabled={saveScNumberMutation.isPending}
                onClick={() => setScModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saveScNumberMutation.isPending || !scNumberDraft.trim() || !scIdDraft.trim()}
                onClick={submitScModal}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saveScNumberMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className={labelCls}>
                Nº da SC <span className="text-red-600">*</span>
              </label>
              <input
                className={fieldCls}
                value={scNumberDraft}
                onChange={(e) => setScNumberDraft(e.target.value)}
                placeholder="Digite o número da solicitação"
              />
            </div>
            <div>
              <label className={labelCls}>
                ID da SC <span className="text-red-600">*</span>
              </label>
              <input
                className={fieldCls}
                value={scIdDraft}
                onChange={(e) => setScIdDraft(e.target.value)}
                placeholder="Digite o ID da solicitação"
              />
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={ocModalOpen}
          onClose={() => !uploadAnexoMutation.isPending && setOcModalOpen(false)}
          title="Adicionar ordem de compra"
          size="md"
          footer={
            <>
              <button
                type="button"
                disabled={uploadAnexoMutation.isPending}
                onClick={() => setOcModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={uploadAnexoMutation.isPending || !ocIdDraft.trim() || !ocFile}
                onClick={submitOcModal}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {uploadAnexoMutation.isPending ? 'Adicionando...' : 'Adicionar'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {ocIdStatus === 'missing' ? (
              <div>
                <label className={labelCls}>
                  ID da OC <span className="text-red-600">*</span>
                </label>
                <input
                  className={fieldCls}
                  value={ocIdDraft}
                  onChange={(e) => setOcIdDraft(e.target.value)}
                  placeholder="Digite o ID da ordem de compra"
                />
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  Não foi possível ler o ID no arquivo. Informe manualmente.
                </span>
              </div>
            ) : null}
            <div>
              <label className={labelCls}>
                Anexo da OC <span className="text-red-600">*</span>
              </label>
              <FileDropZone
                label={ocFile ? ocFile.name : 'Anexar ordem de compra'}
                hint={ocFile ? 'Clique ou arraste para trocar o arquivo' : 'Clique ou arraste imagem/PDF'}
                onFiles={(files) => {
                  const file = files[0];
                  if (!file) return;
                  setOcFile(file);
                  setOcIdStatus('none');
                  void detectOcIdFromFile(file).then((id) => {
                    if (id) setOcIdDraft(id);
                    setOcIdStatus(id ? 'found' : 'missing');
                  });
                }}
              />
              {ocIdStatus === 'found' ? (
                <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  ID da OC identificado no arquivo: {ocIdDraft}
                </p>
              ) : null}
            </div>
          </div>
        </Modal>

        <NovaSolicitacaoFerramentaModal isOpen={showNewForm} onClose={() => setShowNewForm(false)} />
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

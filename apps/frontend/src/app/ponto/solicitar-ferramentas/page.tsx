'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Search, Wrench, X, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { DateTimePickerField } from '@/components/ui/DateTimePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { AsyncSearchSelectDropdown } from '@/components/ui/AsyncSearchSelectDropdown';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { FilePreviewCard } from '@/components/ui/FilePreviewCard';
import { getOcSupplierLabel } from '@/components/oc/OcPurchaseOrderFormFields';
import { searchOcSuppliers } from '@/components/oc/searchOcSuppliers';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  cadastroListClasses,
  getListTableRowClassName,
  RowActionMenuCell,
  RowActionMenuPortal,
} from '@/components/ui/RowActionMenu';
import { ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { useLogout } from '@/hooks/useLogout';
import { usePermissions } from '@/hooks/usePermissions';
import { authService } from '@/lib/auth';
import api from '@/lib/api';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import {
  formatToolRentalDemand,
  formatToolRentalInUsePeriodHint,
  formatToolRentalLogistics,
  formatToolRentalPriority,
  formatToolRentalStatus,
  resolveToolRentalDisplayStatus,
  TOOL_RENTAL_DEMAND_OPTIONS,
  TOOL_RENTAL_PRIORITY_OPTIONS,
  toolRentalStatusBadgeClass,
  type ToolRentalDemandType,
  type ToolRentalLogisticsMode,
  type ToolRentalPriority,
  type ToolRentalRequestStatus,
} from '@/lib/toolRentalLabels';
import { buildToolRentalTimeline, type ToolRentalTimelineEvent } from '@/lib/toolRentalTimeline';
import { DetailInfoTabs, type DetailInfoTabItem } from '@/components/ui/DetailInfoLayout';
import {
  DpRequestHistoryTimeline,
  type DpRequestHistoryModalTab,
} from '@/lib/dpRequestHistoryModal';

type EquipamentoItem = { nome: string; quantidade: number; linkSugestao?: string | null };

type ToolRentalRequest = {
  id: string;
  code: string;
  polo: string;
  contrato: string;
  obra: string;
  titulo: string;
  equipamento: string;
  equipamentos?: EquipamentoItem[] | null;
  demandType: ToolRentalDemandType;
  priority: ToolRentalPriority;
  logisticsMode?: ToolRentalLogisticsMode;
  status: ToolRentalRequestStatus;
  periodoInicio: string;
  periodoFim: string;
  linkSugestao?: string | null;
  supplierName?: string | null;
  scNumber?: string | null;
  createdAt?: string;
  updatedAt?: string;
  suppliesApprovedAt?: string | null;
  suppliesApprovalComment?: string | null;
  suppliesRejectionReason?: string | null;
  receivedAt?: string | null;
  receivedBy?: { id: string; name: string } | null;
  receiptObservation?: string | null;
  receiptAttachments?: Array<{ id: string; name: string; url: string }> | null;
  attachments?: Array<{ id: string; name: string; url: string; kind?: string }> | null;
  renewedFromId?: string | null;
  renewedFrom?: { id: string; code: string } | null;
  assignedUser?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  suppliesApprovedBy?: { id: string; name: string } | null;
  events?: ToolRentalTimelineEvent[];
};

type ContractOption = { id: string; name: string; number?: string };
type ObraOption = { id: string; name: string };

type FormEquipamentoRow = { nome: string; quantidade: string; linkSugestao: string };

type FormState = {
  contractId: string;
  obraId: string;
  titulo: string;
  supplierId: string;
  priority: ToolRentalPriority;
  demandType: ToolRentalDemandType;
  equipamentos: FormEquipamentoRow[];
  periodoInicio: string;
  periodoFim: string;
  fdAttachments: ReceiptAnexo[];
};

const EMPTY_EQUIPAMENTO_ROW = (): FormEquipamentoRow => ({
  nome: '',
  quantidade: '1',
  linkSugestao: '',
});

const EMPTY_FORM = (): FormState => ({
  contractId: '',
  obraId: '',
  titulo: '',
  supplierId: '',
  priority: 'NORMAL',
  demandType: 'NOVA_LOCACAO',
  equipamentos: [EMPTY_EQUIPAMENTO_ROW()],
  periodoInicio: '',
  periodoFim: '',
  fdAttachments: [],
});

function resolveEquipamentos(row: ToolRentalRequest): EquipamentoItem[] {
  if (Array.isArray(row.equipamentos) && row.equipamentos.length > 0) {
    return row.equipamentos
      .map((item) => ({
        nome: String(item.nome || '').trim(),
        quantidade: Number(item.quantidade) || 0,
        linkSugestao: String(item.linkSugestao || '').trim() || null,
      }))
      .filter((item) => item.nome && item.quantidade > 0);
  }
  const nome = String(row.equipamento || '').trim();
  const legacyLink = String(row.linkSugestao || '').trim() || null;
  return nome ? [{ nome, quantidade: 1, linkSugestao: legacyLink }] : [];
}

function formatEquipamentosLabel(items: EquipamentoItem[]): string {
  if (items.length === 0) return '—';
  return items.map((item) => `${item.nome} (${item.quantidade})`).join(', ');
}

const labelCls =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300';
const requiredMark = <span className="text-red-600"> *</span>;
const fieldCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500';

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

function toLocalDateTimeInput(value?: Date): string {
  const d = value || new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type ReceiptAnexo = { id: string; name: string; url: string };

function fdAnexosOf(row: ToolRentalRequest): ReceiptAnexo[] {
  return (row.attachments || []).filter((anexo) => anexo.kind === 'fd' && anexo.url);
}

function SolicitarLocacoesFerramentasPage() {
  const queryClient = useQueryClient();
  const handleLogout = useLogout();
  const user = authService.getUser();
  const { allowedContractIds, isAdministrator } = usePermissions();
  const allowedContractIdSet = useMemo(() => new Set(allowedContractIds), [allowedContractIds]);

  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selected, setSelected] = useState<ToolRentalRequest | null>(null);
  const [detailTab, setDetailTab] = useState<DpRequestHistoryModalTab>('detalhes');
  const [renewTarget, setRenewTarget] = useState<ToolRentalRequest | null>(null);
  const [renewForm, setRenewForm] = useState<{
    periodoInicio: string;
    periodoFim: string;
    observacao: string;
  }>({ periodoInicio: '', periodoFim: '', observacao: '' });
  const [devolutionTarget, setDevolutionTarget] = useState<ToolRentalRequest | null>(null);
  const [devolutionForm, setDevolutionForm] = useState<{
    periodoInicio: string;
    periodoFim: string;
    observacao: string;
  }>({ periodoInicio: '', periodoFim: '', observacao: '' });
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'receipt'; id: string }
    | { kind: 'cancel'; id: string; closeDetail?: boolean }
    | null
  >(null);
  const [receiptForm, setReceiptForm] = useState({
    receivedById: '',
    receivedAt: '',
    observation: '',
    attachments: [] as ReceiptAnexo[],
  });
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [uploadingFd, setUploadingFd] = useState(false);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['tool-rental-requests', searchTerm, page],
    queryFn: async () => {
      const res = await api.get('/tool-rental-requests', {
        params: { search: searchTerm || undefined, page, limit: 20 },
      });
      return res.data;
    },
  });

  const [supplierLabel, setSupplierLabel] = useState('');

  const { data: contractsRes, isLoading: loadingContracts } = useQuery({
    queryKey: ['contracts-for-tool-rental', allowedContractIds.join(',')],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
    enabled: showForm,
  });

  const contracts = useMemo(() => {
    const rows = (contractsRes?.data ?? []) as ContractOption[];
    if (isAdministrator) return rows;
    // Só contratos liberados para a pessoa
    return rows.filter((c) => allowedContractIdSet.has(c.id));
  }, [contractsRes?.data, isAdministrator, allowedContractIdSet]);

  const { data: obras = [], isLoading: loadingObras } = useQuery({
    queryKey: ['tool-rental-obras', form.contractId],
    enabled: showForm && Boolean(form.contractId),
    queryFn: async () => {
      const res = await api.get('/obras', {
        params: { isActive: 'true', contratoId: form.contractId, limit: 500, page: 1 },
      });
      return ((res.data?.data || []) as ObraOption[]).filter((o) => o.id && o.name?.trim());
    },
  });

  const contractOptions = useMemo(
    () =>
      labeledToSelectOptions(
        contracts.map((c) => ({
          value: c.id,
          label: c.name,
          searchText: [c.name, c.number].filter(Boolean).join(' '),
        })),
      ),
    [contracts],
  );

  const obraOptions = useMemo(
    () => labeledToSelectOptions(obras.map((o) => ({ value: o.id, label: o.name }))),
    [obras],
  );

  const createMutation = useMutation({
    mutationFn: async (payload: FormState) => {
      const contract = contracts.find((c) => c.id === payload.contractId);
      const obra = obras.find((o) => o.id === payload.obraId);
      if (!contract) throw new Error('Contrato inválido');
      if (!obra) throw new Error('Obra inválida');
      const equipamentos = payload.equipamentos
        .map((row) => ({
          nome: row.nome.trim(),
          quantidade: Number(String(row.quantidade).replace(',', '.')),
          linkSugestao: row.linkSugestao.trim() || null,
        }))
        .filter((row) => row.nome && Number.isFinite(row.quantidade) && row.quantidade > 0)
        .map((row) => ({
          nome: row.nome,
          quantidade: Math.floor(row.quantidade),
          ...(row.linkSugestao ? { linkSugestao: row.linkSugestao } : {}),
        }));
      if (equipamentos.length === 0) throw new Error('Informe ao menos um equipamento');
      await api.post('/tool-rental-requests', {
        contractId: contract.id,
        contrato: contract.name,
        obra: obra.name,
        titulo: payload.titulo,
        supplierId: payload.supplierId || null,
        priority: payload.priority,
        demandType: payload.demandType,
        equipamentos,
        periodoInicio: payload.periodoInicio,
        periodoFim: payload.periodoFim,
        ...(payload.demandType === 'NOVA_LOCACAO'
          ? {
              fdAttachments: payload.fdAttachments.map((anexo) => ({
                id: anexo.id,
                name: anexo.name,
                url: anexo.url,
              })),
            }
          : {}),
      });
    },
    onSuccess: () => {
      toast.success('Solicitação aberta — após a SC, o Suprimentos dá continuidade');
      setShowForm(false);
      setForm(EMPTY_FORM());
      queryClient.invalidateQueries({ queryKey: ['tool-rental-requests'] });
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Não foi possível criar a solicitação',
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/tool-rental-requests/${id}/cancel`);
    },
    onSuccess: (_data, id) => {
      toast.success('Solicitação cancelada');
      if (confirmAction?.kind === 'cancel' && confirmAction.closeDetail) {
        setSelected(null);
        setDetailTab('detalhes');
      }
      if (confirmAction?.kind === 'cancel' && confirmAction.id === id) {
        setConfirmAction(null);
      }
      queryClient.invalidateQueries({ queryKey: ['tool-rental-requests'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Não foi possível cancelar');
    },
  });

  const { data: receiptUsers = [] } = useQuery({
    queryKey: ['tool-rental-receipt-users', 'with-photo-cpf'],
    enabled: confirmAction?.kind === 'receipt',
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get('/tool-rental-requests/receipt-users');
      const users = (res.data?.data || []) as Array<{
        id: string;
        name: string;
        cpf?: string | null;
        profilePhotoUrl?: string | null;
      }>;
      return users.filter((u) => {
        const name = u.name?.trim() || '';
        if (!u.id || !name) return false;
        if (name.localeCompare('Administrador', 'pt-BR', { sensitivity: 'accent' }) === 0) {
          return false;
        }
        return true;
      });
    },
  });

  const receiptUserOptions = useMemo(
    () =>
      toPersonSelectOptions(
        receiptUsers.map((u) => ({
          value: u.id,
          name: u.name.trim(),
          cpf: u.cpf,
          profilePhotoUrl: u.profilePhotoUrl,
        })),
      ),
    [receiptUsers],
  );

  const openReceiptForm = (id: string) => {
    const isAdminName =
      !!user?.name?.trim() &&
      user.name.trim().localeCompare('Administrador', 'pt-BR', { sensitivity: 'accent' }) === 0;
    setReceiptForm({
      receivedById: user?.id && !isAdminName ? user.id : '',
      receivedAt: toLocalDateTimeInput(),
      observation: '',
      attachments: [],
    });
    setConfirmAction({ kind: 'receipt', id });
  };

  const confirmReceiptMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      receivedById: string;
      receivedAt: string;
      observation: string;
      attachments: ReceiptAnexo[];
    }) => {
      const res = await api.put(`/tool-rental-requests/${payload.id}/confirm-receipt`, {
        receivedById: payload.receivedById,
        receivedAt: new Date(payload.receivedAt).toISOString(),
        receiptObservation: payload.observation.trim() || null,
        receiptAttachments: payload.attachments,
      });
      return res.data?.data as ToolRentalRequest | undefined;
    },
    onSuccess: (updated) => {
      toast.success('Recebimento confirmado — equipamento em uso');
      if (updated) setSelected(updated);
      setConfirmAction(null);
      queryClient.invalidateQueries({ queryKey: ['tool-rental-requests'] });
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Não foi possível confirmar o recebimento',
      );
    },
  });

  const uploadReceiptFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadingReceipt(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/tool-rental-requests/upload-receipt-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data?.data;
      if (!data?.url) throw new Error('Falha no upload');
      setReceiptForm((f) => ({
        ...f,
        attachments: [
          ...f.attachments,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: data.originalName || file.name,
            url: data.url,
          },
        ],
      }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Falha ao anexar arquivo');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const uploadFdFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadingFd(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/tool-rental-requests/upload-fd-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data?.data;
      if (!data?.url) throw new Error('Falha no upload');
      setForm((f) => ({
        ...f,
        fdAttachments: [
          ...f.fdAttachments,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: data.originalName || file.name,
            url: data.url,
          },
        ],
      }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Falha ao anexar a FD');
    } finally {
      setUploadingFd(false);
    }
  };

  const submitReceipt = () => {
    if (!confirmAction || confirmAction.kind !== 'receipt') return;
    if (!receiptForm.receivedById) return toast.error('Informe quem recebeu');
    if (!receiptForm.receivedAt) return toast.error('Informe a data e hora do recebimento');
    confirmReceiptMutation.mutate({
      id: confirmAction.id,
      receivedById: receiptForm.receivedById,
      receivedAt: receiptForm.receivedAt,
      observation: receiptForm.observation,
      attachments: receiptForm.attachments,
    });
  };

  const renewMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      periodoInicio: string;
      periodoFim: string;
      observacao: string;
    }) => {
      const res = await api.post(`/tool-rental-requests/${payload.id}/renew`, {
        periodoInicio: payload.periodoInicio,
        periodoFim: payload.periodoFim,
        observacao: payload.observacao.trim() || null,
      });
      return res.data?.data as ToolRentalRequest | undefined;
    },
    onSuccess: () => {
      toast.success('Renovação aberta — a solicitação atual foi finalizada');
      setRenewTarget(null);
      setSelected(null);
      setDetailTab('detalhes');
      queryClient.invalidateQueries({ queryKey: ['tool-rental-requests'] });
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Não foi possível solicitar a renovação',
      );
    },
  });

  const devolutionMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      periodoInicio: string;
      periodoFim: string;
      observacao: string;
    }) => {
      const res = await api.post(`/tool-rental-requests/${payload.id}/request-devolution`, {
        periodoInicio: payload.periodoInicio,
        periodoFim: payload.periodoFim,
        observacao: payload.observacao.trim() || null,
      });
      return res.data?.data as ToolRentalRequest | undefined;
    },
    onSuccess: () => {
      toast.success('Devolução aberta — a solicitação atual foi finalizada');
      setDevolutionTarget(null);
      setSelected(null);
      setDetailTab('detalhes');
      queryClient.invalidateQueries({ queryKey: ['tool-rental-requests'] });
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Não foi possível solicitar a devolução',
      );
    },
  });

  const openRenew = (row: ToolRentalRequest) => {
    setRenewForm({
      periodoInicio: row.periodoFim || '',
      periodoFim: '',
      observacao: '',
    });
    setRenewTarget(row);
  };

  const openDevolution = (row: ToolRentalRequest) => {
    const today = toLocalDateTimeInput().slice(0, 10);
    setDevolutionForm({
      periodoInicio: row.periodoInicio?.slice(0, 10) || today,
      periodoFim: today,
      observacao: '',
    });
    setDevolutionTarget(row);
  };

  const submitRenew = () => {
    if (!renewTarget) return;
    if (!renewForm.periodoInicio) return toast.error('Informe a data de início');
    if (!renewForm.periodoFim) return toast.error('Informe a data de fim');
    renewMutation.mutate({
      id: renewTarget.id,
      periodoInicio: renewForm.periodoInicio,
      periodoFim: renewForm.periodoFim,
      observacao: renewForm.observacao,
    });
  };

  const submitDevolution = () => {
    if (!devolutionTarget) return;
    if (!devolutionForm.periodoInicio) return toast.error('Informe a data de início');
    if (!devolutionForm.periodoFim) return toast.error('Informe a data de fim');
    devolutionMutation.mutate({
      id: devolutionTarget.id,
      periodoInicio: devolutionForm.periodoInicio,
      periodoFim: devolutionForm.periodoFim,
      observacao: devolutionForm.observacao,
    });
  };

  const canConfirmReceipt = (row: ToolRentalRequest) =>
    (row.status === 'COMPLETED' || row.status === 'AWAITING_RECEIPT') && !row.receivedAt;

  const canRenewOrDevolve = (row: ToolRentalRequest) =>
    (row.status === 'IN_USE' ||
      (row.status === 'COMPLETED' && Boolean(row.receivedAt))) &&
    (row.demandType === 'NOVA_LOCACAO' || row.demandType === 'RENOVACAO');

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

  const openForm = () => {
    setForm(EMPTY_FORM());
    setSupplierLabel('');
    setShowForm(true);
  };

  const submitForm = () => {
    if (!form.contractId) return toast.error('Informe o contrato');
    if (!form.obraId) return toast.error('Informe a obra');
    if (!form.titulo.trim()) return toast.error('Informe o título');
    if (!form.priority) return toast.error('Informe a prioridade');
    if (!form.demandType) return toast.error('Informe o tipo de demanda');
    const hasValidEquipamento = form.equipamentos.some((row) => {
      const qtd = Number(String(row.quantidade).replace(',', '.'));
      return row.nome.trim() && Number.isFinite(qtd) && qtd > 0;
    });
    if (!hasValidEquipamento) {
      return toast.error('Informe ao menos um equipamento com quantidade');
    }
    if (!form.periodoInicio) return toast.error('Informe a data de início');
    if (!form.periodoFim) return toast.error('Informe a data de fim');
    if (form.demandType === 'NOVA_LOCACAO' && form.fdAttachments.length === 0) {
      return toast.error('Anexe a FD na primeira locação');
    }
    createMutation.mutate(form);
  };

  if (!user) {
    return <Loading />;
  }

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <PageStack>
          <ListPageHeader title="Solicitação de Ferramentas" />

        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                  <Wrench className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                    Minhas Solicitações
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Suas solicitações e as dos contratos liberados
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
                    placeholder="Buscar..."
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={openForm}
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
              title="Nenhuma solicitação encontrada"
              hint="Clique em Nova Solicitação para começar."
            />
          ) : (
            <div className="table-scroll">
              <table className={cadastroListClasses.table}>
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className={cadastroListClasses.th}>ID</th>
                    <th className={cadastroListClasses.th}>Título</th>
                    <th className={cadastroListClasses.thCenter}>Tipo</th>
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
                      onClick={() => {
                        setDetailTab('detalhes');
                        setSelected(row);
                      }}
                    >
                      <td className={cadastroListClasses.tdMono}>
                        <ListRowNavigableLabel className="font-mono font-medium">
                          {formatCadastroListId(row.code, listRange.startItem + index)}
                        </ListRowNavigableLabel>
                      </td>
                      <td className={cadastroListClasses.tdTruncate}>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                            {row.titulo}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {formatEquipamentosLabel(resolveEquipamentos(row))}
                          </p>
                        </div>
                      </td>
                      <td className={cadastroListClasses.tdCenter}>
                        {formatToolRentalDemand(row.demandType)}
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
                          const periodHint =
                            displayStatus === 'IN_USE'
                              ? formatToolRentalInUsePeriodHint(row.periodoFim)
                              : null;
                          return (
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${toolRentalStatusBadgeClass(displayStatus)}`}
                              >
                                {formatToolRentalStatus(displayStatus)}
                              </span>
                              {periodHint ? (
                                <span
                                  className={`text-[10px] font-medium leading-tight ${
                                    periodHint.tone === 'overdue'
                                      ? 'text-red-600 dark:text-red-400'
                                      : periodHint.tone === 'today'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-sky-700 dark:text-sky-300'
                                  }`}
                                >
                                  {periodHint.text}
                                </span>
                              ) : null}
                            </div>
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
              extraItems={[
                {
                  label: 'Cancelar',
                  tone: 'danger',
                  disabled: rowForActionMenu.status !== 'OPEN',
                  disabledTitle: 'Somente solicitações abertas podem ser canceladas',
                  icon: <XCircle className="h-4 w-4 shrink-0" />,
                  onClick: () => {
                    setConfirmAction({ kind: 'cancel', id: rowForActionMenu.id });
                  },
                },
              ]}
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
          setSelected(null);
          setDetailTab('detalhes');
        }}
        title={selected ? `Solicitação #${selected.code}` : 'Solicitação'}
        size="lg"
        headerClassName="!border-b-0 !pb-2"
        contentClassName="!pt-0"
      >
        {selected ? (
          <div className="space-y-4 text-sm">
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

            {detailTab === 'detalhes' ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase text-gray-500">Status</p>
                    {(() => {
                      const displayStatus = resolveToolRentalDisplayStatus(
                        selected.status,
                        selected.receivedAt,
                      );
                      const periodHint =
                        displayStatus === 'IN_USE'
                          ? formatToolRentalInUsePeriodHint(selected.periodoFim)
                          : null;
                      return (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${toolRentalStatusBadgeClass(displayStatus)}`}
                          >
                            {formatToolRentalStatus(displayStatus)}
                          </span>
                          {periodHint ? (
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                periodHint.tone === 'overdue'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                                  : periodHint.tone === 'today'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                    : 'bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'
                              }`}
                            >
                              {periodHint.text}
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Tipo</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {formatToolRentalDemand(selected.demandType)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Prioridade</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {formatToolRentalPriority(selected.priority)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Modalidade</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {selected.logisticsMode
                        ? formatToolRentalLogistics(selected.logisticsMode)
                        : '—'}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase text-gray-500">Título</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.titulo}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase text-gray-500">Equipamentos</p>
                    <ul className="mt-1 space-y-1.5 font-medium text-gray-900 dark:text-gray-100">
                      {resolveEquipamentos(selected).map((item, index) => (
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
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Período</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {formatDateOnly(selected.periodoInicio)} – {formatDateOnly(selected.periodoFim)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Contrato</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.contrato}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Obra</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.obra}</p>
                  </div>
                  {selected.scNumber ? (
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">Nº da SC</p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                        {selected.scNumber}
                      </p>
                    </div>
                  ) : null}
                  {fdAnexosOf(selected).length > 0 ? (
                    <div className="sm:col-span-2">
                      <p className="mb-2 text-xs font-semibold uppercase text-gray-500">FD - anexo</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {fdAnexosOf(selected).map((anexo) => (
                          <FilePreviewCard
                            key={anexo.id}
                            file={{
                              originalName: anexo.name || 'Arquivo',
                              fileUrl: anexo.url,
                            }}
                            extra="FD"
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
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
                      {Array.isArray(selected.receiptAttachments) &&
                      selected.receiptAttachments.length > 0 ? (
                        <div className="sm:col-span-2">
                          <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                            Anexos do recebimento
                          </p>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                    </>
                  ) : null}
                </div>
                {canRenewOrDevolve(selected) ? (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => openDevolution(selected)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Solicitar devolução
                    </button>
                    <button
                      type="button"
                      onClick={() => openRenew(selected)}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      Solicitar renovação
                    </button>
                  </div>
                ) : null}
                {selected.status === 'OPEN' ? (
                  <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmAction({
                          kind: 'cancel',
                          id: selected.id,
                          closeDetail: true,
                        })
                      }
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      Cancelar solicitação
                    </button>
                  </div>
                ) : null}
                {canConfirmReceipt(selected) ? (
                  <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button
                      type="button"
                      disabled={confirmReceiptMutation.isPending}
                      onClick={() => openReceiptForm(selected.id)}
                      className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                      Confirmar recebimento
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <DpRequestHistoryTimeline
                steps={buildToolRentalTimeline(selected)}
                formatDateTime={formatDateTime}
              />
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={showForm}
        onClose={() => !createMutation.isPending && setShowForm(false)}
        title="Solicitação de Ferramentas"
        size="xl"
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Título{requiredMark}</label>
            <input
              className={fieldCls}
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder={
                form.demandType === 'COMPRA'
                  ? 'Ex.: Compra de furadeira industrial'
                  : 'Ex.: Locação de andaime tubular'
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Tipo de demanda{requiredMark}</label>
              <StringSingleSelectDropdown
                value={form.demandType}
                onChange={(demandType) =>
                  setForm((f) => ({ ...f, demandType: demandType as ToolRentalDemandType }))
                }
                options={TOOL_RENTAL_DEMAND_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                  searchText: opt.label,
                }))}
                allowEmpty={false}
              />
            </div>
            <div>
              <label className={labelCls}>Prioridade{requiredMark}</label>
              <StringSingleSelectDropdown
                value={form.priority}
                onChange={(priority) =>
                  setForm((f) => ({ ...f, priority: priority as ToolRentalPriority }))
                }
                options={TOOL_RENTAL_PRIORITY_OPTIONS}
                allowEmpty={false}
              />
            </div>
          </div>

          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
              <h4 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                Equipamentos ({form.equipamentos.length}){requiredMark}
              </h4>
            </div>
            <div className="space-y-6">
              {form.equipamentos.map((row, index) => (
                <div
                  key={`equipamento-${index}`}
                  className="rounded-xl border border-gray-200 p-3.5 dark:border-gray-700"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Equipamento {index + 1}
                    </span>
                    {form.equipamentos.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            equipamentos: f.equipamentos.filter((_, i) => i !== index),
                          }))
                        }
                        className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        aria-label={`Remover equipamento ${index + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                          Equipamento *
                        </label>
                        <input
                          className={fieldCls}
                          value={row.nome}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              equipamentos: f.equipamentos.map((item, i) =>
                                i === index ? { ...item, nome: e.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="Descreva o equipamento"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                          Qtd *
                        </label>
                        <input
                          className={`${fieldCls} [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={row.quantidade}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              equipamentos: f.equipamentos.map((item, i) =>
                                i === index ? { ...item, quantidade: e.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Link de sugestão
                      </label>
                      <input
                        className={fieldCls}
                        value={row.linkSugestao}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            equipamentos: f.equipamentos.map((item, i) =>
                              i === index ? { ...item, linkSugestao: e.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="http://"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    equipamentos: [...f.equipamentos, EMPTY_EQUIPAMENTO_ROW()],
                  }))
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-red-300 bg-red-50/50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-800 dark:border-red-800/60 dark:bg-red-950/25 dark:text-red-300 dark:hover:border-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-200"
              >
                <Plus className="h-4 w-4" />
                Adicionar equipamento
              </button>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>
                {form.demandType === 'COMPRA' ? 'Necessário a partir de' : 'Data de início'}
                {requiredMark}
              </label>
              <DatePickerField
                value={form.periodoInicio}
                onChange={(periodoInicio) => setForm((f) => ({ ...f, periodoInicio }))}
                placeholder="dd/mm/aaaa"
                noFocusRing
              />
            </div>
            <div>
              <label className={labelCls}>
                {form.demandType === 'COMPRA' ? 'Necessário até' : 'Data de fim'}
                {requiredMark}
              </label>
              <DatePickerField
                value={form.periodoFim}
                onChange={(periodoFim) => setForm((f) => ({ ...f, periodoFim }))}
                placeholder="dd/mm/aaaa"
                noFocusRing
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Contrato{requiredMark}</label>
              <SingleSelectSearchDropdown
                value={form.contractId}
                onChange={(contractId) =>
                  setForm((f) => ({ ...f, contractId, obraId: '' }))
                }
                options={contractOptions}
                disabled={loadingContracts}
                placeholder={loadingContracts ? 'Carregando…' : 'Selecionar contrato…'}
                searchPlaceholder="Pesquisar contrato…"
                emptyOptionsMessage="Nenhum contrato liberado para você."
                noFocusRing
              />
            </div>
            <div>
              <label className={labelCls}>Obra{requiredMark}</label>
              <SingleSelectSearchDropdown
                value={form.obraId}
                onChange={(obraId) => setForm((f) => ({ ...f, obraId }))}
                options={obraOptions}
                disabled={!form.contractId || loadingObras}
                placeholder={
                  !form.contractId
                    ? 'Selecione o contrato primeiro…'
                    : loadingObras
                      ? 'Carregando…'
                      : 'Selecionar obra…'
                }
                searchPlaceholder="Pesquisar obra…"
                emptyOptionsMessage="Nenhuma obra neste contrato."
                noFocusRing
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Fornecedor</label>
            <AsyncSearchSelectDropdown
              value={form.supplierId}
              selectedLabel={supplierLabel || undefined}
              onChange={(supplier) => {
                setForm((f) => ({ ...f, supplierId: supplier.id }));
                setSupplierLabel(
                  supplier.tradeName?.trim() || supplier.name?.trim() || getOcSupplierLabel(supplier),
                );
              }}
              searchFn={searchOcSuppliers}
              getOptionId={(supplier) => supplier.id}
              getOptionLabel={(supplier) =>
                supplier.tradeName?.trim() || supplier.name?.trim() || getOcSupplierLabel(supplier)
              }
              queryKeyPrefix="tool-rental-supplier"
              placeholder="Digite para buscar fornecedor…"
              searchPlaceholder="Nome, fantasia ou CNPJ…"
              noFocusRing
            />
          </div>

          {form.demandType === 'NOVA_LOCACAO' ? (
            <div>
              <label className={labelCls}>FD - anexo{requiredMark}</label>
              {form.fdAttachments.length > 0 ? (
                <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {form.fdAttachments.map((anexo) => (
                    <FilePreviewCard
                      key={anexo.id}
                      file={{
                        originalName: anexo.name || 'Arquivo',
                        fileUrl: anexo.url,
                      }}
                      extra="FD"
                      onRemove={() =>
                        setForm((f) => ({
                          ...f,
                          fdAttachments: f.fdAttachments.filter((item) => item.id !== anexo.id),
                        }))
                      }
                    />
                  ))}
                </div>
              ) : null}
              <FileDropZone
                label="Adicionar FD"
                hint="Obrigatório na primeira locação. Clique ou arraste imagem/PDF"
                uploading={uploadingFd}
                disabled={createMutation.isPending}
                onFiles={(files) => {
                  void uploadFdFile(files);
                }}
              />
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={submitForm}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!renewTarget}
        onClose={() => !renewMutation.isPending && setRenewTarget(null)}
        title={renewTarget ? `Renovar solicitação #${renewTarget.code}` : 'Renovar solicitação'}
        size="md"
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
                <label className={labelCls}>Novo início{requiredMark}</label>
                <DatePickerField
                  value={renewForm.periodoInicio}
                  onChange={(periodoInicio) =>
                    setRenewForm((f) => ({ ...f, periodoInicio }))
                  }
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                />
              </div>
              <div>
                <label className={labelCls}>Novo fim{requiredMark}</label>
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
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
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
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={!!devolutionTarget}
        onClose={() => !devolutionMutation.isPending && setDevolutionTarget(null)}
        title={
          devolutionTarget
            ? `Devolver solicitação #${devolutionTarget.code}`
            : 'Solicitar devolução'
        }
        size="md"
      >
        {devolutionTarget ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              A solicitação atual será <strong>finalizada</strong> e uma nova solicitação de{' '}
              <strong>devolução</strong> será aberta para o Suprimentos tratar a retirada.
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800/60">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {devolutionTarget.titulo}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Período em uso: {formatDateOnly(devolutionTarget.periodoInicio)} –{' '}
                {formatDateOnly(devolutionTarget.periodoFim)}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Início da devolução{requiredMark}</label>
                <DatePickerField
                  value={devolutionForm.periodoInicio}
                  onChange={(periodoInicio) =>
                    setDevolutionForm((f) => ({ ...f, periodoInicio }))
                  }
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                />
              </div>
              <div>
                <label className={labelCls}>Fim / previsão{requiredMark}</label>
                <DatePickerField
                  value={devolutionForm.periodoFim}
                  onChange={(periodoFim) =>
                    setDevolutionForm((f) => ({ ...f, periodoFim }))
                  }
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
                value={devolutionForm.observacao}
                onChange={(e) =>
                  setDevolutionForm((f) => ({ ...f, observacao: e.target.value }))
                }
                placeholder="Ex.: equipamento pronto para retirada na obra"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                disabled={devolutionMutation.isPending}
                onClick={() => setDevolutionTarget(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={devolutionMutation.isPending}
                onClick={submitDevolution}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {devolutionMutation.isPending ? 'Enviando…' : 'Solicitar devolução'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={confirmAction?.kind === 'receipt'}
        onClose={() => {
          if (confirmReceiptMutation.isPending || uploadingReceipt) return;
          setConfirmAction(null);
        }}
        title="Confirmar recebimento"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Quem recebeu{requiredMark}</label>
            <SingleSelectSearchDropdown
              value={receiptForm.receivedById}
              onChange={(receivedById) => setReceiptForm((f) => ({ ...f, receivedById }))}
              options={receiptUserOptions}
              allowEmpty={false}
              placeholder="Selecionar funcionário…"
              searchPlaceholder="Pesquisar por nome ou CPF…"
              emptyOptionsMessage="Nenhum funcionário encontrado."
              noFocusRing
            />
          </div>
          <div>
            <label className={labelCls}>Data e hora do recebimento{requiredMark}</label>
            <DateTimePickerField
              value={receiptForm.receivedAt}
              onChange={(receivedAt) => setReceiptForm((f) => ({ ...f, receivedAt }))}
              placeholder="dd/mm/aaaa hh:mm"
              noFocusRing
              aria-label="Data e hora do recebimento"
            />
          </div>
          <div>
            <label className={labelCls}>Anexos</label>
            {receiptForm.attachments.length > 0 ? (
              <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {receiptForm.attachments.map((anexo) => (
                  <FilePreviewCard
                    key={anexo.id}
                    file={{
                      originalName: anexo.name || 'Arquivo',
                      fileUrl: anexo.url,
                    }}
                    extra="Recebimento"
                    onRemove={() =>
                      setReceiptForm((f) => ({
                        ...f,
                        attachments: f.attachments.filter((a) => a.id !== anexo.id),
                      }))
                    }
                  />
                ))}
              </div>
            ) : null}
            <FileDropZone
              label="Adicionar anexo"
              hint="Clique ou arraste imagem/PDF"
              uploading={uploadingReceipt}
              disabled={confirmReceiptMutation.isPending}
              onFiles={(files) => {
                void uploadReceiptFile(files);
              }}
            />
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <textarea
              className={fieldCls}
              rows={3}
              value={receiptForm.observation}
              onChange={(e) =>
                setReceiptForm((f) => ({ ...f, observation: e.target.value }))
              }
              placeholder="Ex.: equipamento conferido e em bom estado"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              disabled={confirmReceiptMutation.isPending || uploadingReceipt}
              onClick={() => setConfirmAction(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={confirmReceiptMutation.isPending || uploadingReceipt}
              onClick={submitReceipt}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {confirmReceiptMutation.isPending ? 'Confirmando…' : 'Confirmar recebimento'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={confirmAction?.kind === 'cancel'}
        onClose={() => {
          if (cancelMutation.isPending) return;
          setConfirmAction(null);
        }}
        title="Cancelar solicitação"
        size="md"
      >
        {confirmAction?.kind === 'cancel' ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Tem certeza que deseja cancelar esta solicitação? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(confirmAction.id)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelMutation.isPending ? 'Cancelando…' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
      </PageStack>
    </MainLayout>
  );
}

export default function Page() {
  return (
    <ProtectedRoute route="/ponto/solicitar-ferramentas">
      <SolicitarLocacoesFerramentasPage />
    </ProtectedRoute>
  );
}

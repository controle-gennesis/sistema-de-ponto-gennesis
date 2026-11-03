'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Calculator,
  CheckCircle,
  ClipboardList,
  FileText,
  Plus,
  Search,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  listTableRowClasses,
} from '@/components/ui/listTableUi';
import { RowActionMenuCell, RowActionMenuPortal } from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { buildDpRequestTimeline } from '@/lib/dpRequestTimeline';
import { DP_SOLICITACOES_NO_FOCUS_CLS, formatIsoDateRangeToBr } from '@/lib/dpSolicitacoesUi';
import { ContabilRequestDetailsView, isContabilDirectRequestType } from '@/lib/contabilRequestDetailsView';
import { DpRequestDetailsPreview } from '@/lib/dpRequestDetailsPreview';
import { DP_SENT_TO_ACCOUNTING_LABEL, dpRequestIsSentToAccounting } from '@/lib/dpRequestDpUi';
import {
  DpRequestHistoryMetaCard,
  DpRequestHistoryModalFooter,
  DpRequestHistoryModalTabs,
  DpRequestHistorySectionCard,
  DpRequestHistoryTimeline,
  type DpRequestHistoryMetaField,
} from '@/lib/dpRequestHistoryModal';
import { COMPANIES_LIST } from '@/constants/payrollFilters';
import {
  ContabilSolicitacaoTypeFields,
  CONTABIL_TYPE_LABELS,
  type ContabilAnexoDraft,
  type ContabilFormRequestType,
} from '../solicitacoes-dp/ContabilSolicitacaoTypeFields';

const ROUTE = '/ponto/solicitacoes-contabilidade';

type RequestStatus = 'IN_ACCOUNTING' | 'CONCLUDED' | 'CANCELLED' | string;

type ContabilRequest = {
  id: string;
  displayNumber?: number;
  title: string;
  status: RequestStatus;
  requestType: string;
  prazoInicio: string;
  prazoFim: string;
  sectorSolicitante: string;
  solicitanteNome: string;
  contract?: { id: string; number: string; name: string } | null;
  costCenter?: { id: string; name: string; code?: string | null } | null;
  company?: string | null;
  polo?: string | null;
  createdAt: string;
  dpFeedback?: string | null;
  dpConclusionComment?: string | null;
  dpCancellationReason?: string | null;
  dpConcludedAt?: string | null;
  details?: Record<string, unknown> | null;
  statusHistory?: unknown;
  contabilidadePendente?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  IN_ACCOUNTING: 'Na Contabilidade',
  CONCLUDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE: Record<string, string> = {
  IN_ACCOUNTING: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  CONCLUDED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

/** Tipos de Solicitações Internas que seguem para a Contabilidade quando o DP finaliza. */
const SENT_TYPE_LABELS: Record<string, string> = {
  ADMISSAO: 'Admissão',
  FERIAS: 'Férias',
  RESCISAO: 'Rescisão',
  ALTERACAO_FUNCAO_SALARIO: 'Alteração de função/salário',
  RETIFICACAO_ALOCACAO: 'Retificação de alocação',
};

/** Pedido criado nesta página (direto) ou solicitação interna finalizada e enviada pelo DP. */
function isInScope(r: { requestType: string; status: string }): boolean {
  return (
    isContabilDirectRequestType(r.requestType) ||
    (r.status === 'CONCLUDED' && dpRequestIsSentToAccounting(r.requestType))
  );
}

/** Etapa para os cards: o que veio de Solicitações Internas já está com a Contabilidade. */
function stageOf(r: { requestType: string; status: string }): Exclude<StageFilter, 'all'> {
  if (!isContabilDirectRequestType(r.requestType)) return 'IN_ACCOUNTING';
  if (r.status === 'CONCLUDED') return 'CONCLUDED';
  if (r.status === 'CANCELLED') return 'CANCELLED';
  return 'IN_ACCOUNTING';
}

function typeLabel(requestType: string): string {
  return (
    CONTABIL_TYPE_LABELS[requestType as ContabilFormRequestType] ??
    SENT_TYPE_LABELS[requestType] ??
    requestType
  );
}

function statusLabel(r: { requestType: string; status: string }): string {
  if (!isContabilDirectRequestType(r.requestType) && r.status === 'CONCLUDED') {
    return DP_SENT_TO_ACCOUNTING_LABEL;
  }
  return STATUS_LABELS[r.status] ?? r.status;
}

type StageFilter = 'all' | 'IN_ACCOUNTING' | 'CONCLUDED' | 'CANCELLED';

const STAGE_CARDS: {
  filter: StageFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
}[] = [
  {
    filter: 'all',
    label: 'Todos',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: ClipboardList,
  },
  {
    filter: 'IN_ACCOUNTING',
    label: 'Na Contabilidade',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    Icon: Calculator,
  },
  {
    filter: 'CONCLUDED',
    label: 'Finalizadas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
  },
  {
    filter: 'CANCELLED',
    label: 'Canceladas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
  },
];

/** Título, subtítulo, ícone e cores da lista conforme o card selecionado. */
const STAGE_LIST_CONFIG: Record<
  StageFilter,
  { title: string; subtitle: string; Icon: LucideIcon; iconBg: string; iconColor: string }
> = {
  all: {
    title: 'Todas as Solicitações',
    subtitle: 'Criadas aqui ou enviadas à Contabilidade a partir de Solicitações Internas.',
    Icon: ClipboardList,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  IN_ACCOUNTING: {
    title: 'Solicitações na Contabilidade',
    subtitle: 'Pedidos em atendimento pela Contabilidade.',
    Icon: Calculator,
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
  },
  CONCLUDED: {
    title: 'Solicitações Finalizadas',
    subtitle: 'Pedidos já concluídos pela Contabilidade.',
    Icon: CheckCircle,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  CANCELLED: {
    title: 'Solicitações Canceladas',
    subtitle: 'Pedidos cancelados, com o motivo no detalhe.',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

// ── Polo (mesmas regras de Solicitações Internas) ───────────────────────────
const DP_POLO_OPTIONS = ['DF', 'GO'] as const;

function normalizeUpper(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function mapPoloToRegion(raw: string | null | undefined): 'DF' | 'GO' | '' {
  const u = normalizeUpper(raw);
  if (!u) return '';
  if (u === 'DF' || u.includes('BRASILIA')) return 'DF';
  if (u === 'GO' || u.includes('GOIAS')) return 'GO';
  return '';
}

function resolveCostCenterPoloRegion(costCenter?: {
  polo?: string | null;
  name?: string | null;
  code?: string | null;
}): 'DF' | 'GO' | null {
  const fromPolo = mapPoloToRegion(costCenter?.polo);
  if (fromPolo) return fromPolo;
  const combined = [costCenter?.name, costCenter?.code].map(normalizeUpper).filter(Boolean).join(' ');
  if (!combined) return null;
  if (/\bDF\b/.test(combined) || combined.includes('BRASILIA') || combined.includes('DISTRITO FEDERAL')) return 'DF';
  if (/\bGO\b/.test(combined) || combined.includes('GOIAS')) return 'GO';
  return null;
}

function isFormPolo(v: string): v is (typeof DP_POLO_OPTIONS)[number] {
  return (DP_POLO_OPTIONS as readonly string[]).includes(v);
}

async function fileToAttachment(file: File) {
  const max = 15 * 1024 * 1024;
  if (file.size > max) throw new Error('Arquivo deve ter no máximo 15 MB');
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = fr.result as string;
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    fr.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    fr.readAsDataURL(file);
  });
  return { fileName: file.name, mimeType: file.type || 'application/octet-stream', dataBase64 };
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`);
  return parts.join(' ');
}

function formatDateTime(iso?: string | null) {
  return formatDateTimeBr(iso, '—');
}

function unitLabel(r: ContabilRequest): string {
  return r.costCenter?.name?.trim() || r.costCenter?.code?.trim() || r.contract?.name?.trim() || '—';
}

const emptyForm = {
  costCenterId: '',
  company: '',
  polo: '',
  requestType: '' as ContabilFormRequestType | '',
};

export function SolicitacoesContabilidadePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdministrator, isDepartmentPessoal } = usePermissions();

  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [anexos, setAnexos] = useState<ContabilAnexoDraft[]>([]);
  const [historyRequest, setHistoryRequest] = useState<ContabilRequest | null>(null);
  const [historyTab, setHistoryTab] = useState<'detalhes' | 'timeline'>('detalhes');

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });
  const user = userData?.data;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const canCreate = !!(isAdministrator || isDepartmentPessoal);

  const { data: myResp, isLoading: loadingList } = useQuery({
    queryKey: ['dp-my-requests', 'contabilidade'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/minhas', { params: { status: 'all' } });
      return (res.data?.data ?? []) as ContabilRequest[];
    },
    enabled: !loadingUser,
  });

  const requests = React.useMemo(
    () => (myResp ?? []).filter(isInScope),
    [myResp]
  );

  const counts = React.useMemo(() => {
    const c: Record<StageFilter, number> = {
      all: requests.length,
      IN_ACCOUNTING: 0,
      CONCLUDED: 0,
      CANCELLED: 0,
    };
    for (const r of requests) c[stageOf(r)] += 1;
    return c;
  }, [requests]);

  const filtered = requests.filter((r) => {
    if (stageFilter !== 'all' && stageOf(r) !== stageFilter) return false;
    const q = search.trim();
    if (!q) return true;
    if (r.displayNumber != null && String(r.displayNumber) === q) return true;
    return r.id.toLowerCase() === q.toLowerCase();
  });

  const { rowActionMenu, rowForActionMenu, toggleRowActionMenu, closeRowActionMenu, isRowMenuOpen } =
    useRowActionMenu(filtered);

  // ── dados do formulário ─────────────────────────────────────────────────
  const { data: costCentersResp } = useQuery({
    queryKey: ['solicitacoes-dp-centros-custo'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/centros-custo-elegiveis');
      return (res.data?.data ?? []) as Array<{
        id: string;
        name: string;
        code?: string;
        company?: string | null;
        polo?: string | null;
      }>;
    },
    enabled: isCreateOpen,
  });
  const costCenters = costCentersResp ?? [];

  const payrollMonthYear = React.useMemo(() => {
    const n = new Date();
    return { month: n.getMonth() + 1, year: n.getFullYear() };
  }, []);

  const { data: payrollEmpResp } = useQuery({
    queryKey: ['payroll-employees-dp', payrollMonthYear.month, payrollMonthYear.year],
    queryFn: async () => {
      const params = new URLSearchParams({
        month: String(payrollMonthYear.month),
        year: String(payrollMonthYear.year),
        limit: '500',
        page: '1',
      });
      const res = await api.get(`/payroll/employees?${params.toString()}`);
      return (res.data?.data?.employees ?? []) as Array<{
        id: string;
        name: string;
        cpf?: string;
        profilePhotoUrl?: string | null;
        department?: string;
        position?: string;
        company?: string | null;
        polo?: string | null;
        costCenter?: string | null;
      }>;
    },
    enabled: !loadingUser,
  });
  const payrollEmployees = payrollEmpResp ?? [];
  const employeeNameById = React.useMemo(
    () => new Map(payrollEmployees.map((e) => [e.id, e.name])),
    [payrollEmployees]
  );

  const costCenterOptions = React.useMemo<MultiSelectSearchOption[]>(
    () =>
      costCenters.map((c) => ({
        value: c.id,
        label: c.name,
        searchText: [c.name, c.code].filter(Boolean).join(' '),
      })),
    [costCenters]
  );

  const companyOptions = React.useMemo<MultiSelectSearchOption[]>(() => {
    const items = COMPANIES_LIST.map((c) => ({ value: c, label: c, searchText: c }));
    if (form.company && !COMPANIES_LIST.includes(form.company)) {
      return [{ value: form.company, label: form.company, searchText: form.company }, ...items];
    }
    return items;
  }, [form.company]);

  const selectedCostCenter = costCenters.find((c) => c.id === form.costCenterId);
  const costCenterPolo = React.useMemo(
    () =>
      resolveCostCenterPoloRegion({
        polo: selectedCostCenter?.polo,
        name: selectedCostCenter?.name,
        code: selectedCostCenter?.code,
      }),
    [selectedCostCenter]
  );
  const poloOptions = React.useMemo<MultiSelectSearchOption[]>(
    () => (costCenterPolo ? [{ value: costCenterPolo, label: costCenterPolo, searchText: costCenterPolo }] : []),
    [costCenterPolo]
  );

  const handleCostCenterChange = (id: string) => {
    if (!id) {
      setForm((p) => ({ ...p, costCenterId: '', company: '', polo: '' }));
      return;
    }
    const center = costCenters.find((c) => c.id === id);
    const region = resolveCostCenterPoloRegion({ polo: center?.polo, name: center?.name, code: center?.code });
    setForm((p) => ({
      ...p,
      costCenterId: id,
      company: center?.company?.trim() ?? '',
      polo: region ?? '',
    }));
  };

  const typeOptions = React.useMemo<MultiSelectSearchOption[]>(
    () =>
      (Object.entries(CONTABIL_TYPE_LABELS) as [ContabilFormRequestType, string][]).map(([value, label]) => ({
        value,
        label,
        searchText: label,
      })),
    []
  );

  const resetCreate = () => {
    setForm(emptyForm);
    setDetails({});
    setAnexos([]);
  };

  const closeCreate = () => {
    resetCreate();
    setIsCreateOpen(false);
  };

  const patchDetails = (p: Record<string, unknown>) => setDetails((d) => ({ ...d, ...p }));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.requestType) throw new Error('Selecione o tipo de solicitação');
      if (!form.costCenterId) throw new Error('Selecione a unidade');

      const anexosPayload: Record<string, unknown>[] = [];
      for (let i = 0; i < anexos.length; i++) {
        const anexo = anexos[i];
        if (!anexo.file) throw new Error(`Selecione o arquivo do anexo ${i + 1}`);
        if (!anexo.tipoArquivo) throw new Error(`Informe o tipo do arquivo do anexo ${i + 1}`);
        anexosPayload.push({
          ...(await fileToAttachment(anexo.file)),
          tipoArquivo: anexo.tipoArquivo,
          ...(anexo.dataValidade ? { dataValidade: anexo.dataValidade } : {}),
        });
      }

      const res = await api.post('/solicitacoes-dp', {
        requestType: form.requestType,
        costCenterId: form.costCenterId,
        company: form.company || undefined,
        polo: form.polo || undefined,
        details: { ...details, anexos: anexosPayload },
      });
      return { contabilidadeError: !!res.data?.contabilidadeError };
    },
    onSuccess: async (result) => {
      if (result.contabilidadeError) {
        toast.error(
          'Solicitação criada, mas não foi possível enviar à Contabilidade. Abra a solicitação e use "Reenviar à Contabilidade".',
          { duration: 8000 }
        );
      } else {
        toast.success('Solicitação enviada à Contabilidade.');
      }
      closeCreate();
      await queryClient.invalidateQueries({ queryKey: ['dp-my-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['dp-contabilidade-pending-count'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Erro ao criar solicitação');
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/solicitacoes-dp/${id}/reenviar-contabilidade`);
      return res.data as { contabilidadeCreated?: boolean };
    },
    onSuccess: async (payload) => {
      toast.success(
        payload?.contabilidadeCreated
          ? 'Enviada ao Atendimento Contábil.'
          : 'Esta solicitação já foi enviada à Contabilidade.'
      );
      setHistoryRequest(null);
      await queryClient.invalidateQueries({ queryKey: ['dp-my-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['dp-contabilidade-pending-count'] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || err?.message || 'Não foi possível reenviar.'),
  });

  const openHistory = (r: ContabilRequest) => {
    setHistoryTab('detalhes');
    setHistoryRequest(r);
  };

  const statusBadge = (r: ContabilRequest) => (
    <span
      className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${
        isContabilDirectRequestType(r.requestType)
          ? (STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300')
          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'
      }`}
    >
      {statusLabel(r)}
    </span>
  );

  const metaFields = (r: ContabilRequest): DpRequestHistoryMetaField[] => [
    { label: 'Nº da solicitação', value: r.displayNumber != null ? String(r.displayNumber) : '—' },
    { label: 'Tipo', value: typeLabel(r.requestType) },
    { label: 'Status', value: statusBadge(r) },
    { label: 'Solicitante', value: r.solicitanteNome || '—' },
    { label: 'Setor', value: r.sectorSolicitante || '—' },
    { label: 'Unidade', value: unitLabel(r) },
    ...(r.contract
      ? [{ label: 'Contrato', value: `${r.contract.number} - ${r.contract.name}` }]
      : []),
    { label: 'Empresa', value: r.company || '—' },
    { label: 'Polo', value: r.polo || '—' },
    ...(isContabilDirectRequestType(r.requestType)
      ? []
      : [{ label: 'Período', value: formatIsoDateRangeToBr(r.prazoInicio, r.prazoFim) }]),
    { label: 'Criada em', value: formatDateTime(r.createdAt) },
    { label: 'Finalizada em', value: formatDateTime(r.dpConcludedAt) },
  ];

  if (loadingUser) {
    return (
      <ProtectedRoute route={ROUTE}>
        <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  const listHeader = STAGE_LIST_CONFIG[stageFilter];
  const ListHeaderIcon = listHeader.Icon;

  const feedbackText =
    historyRequest &&
    ((historyRequest.dpFeedback ?? '').trim() ||
      (historyRequest.dpConclusionComment ?? '').trim() ||
      (historyRequest.dpCancellationReason ?? '').trim());

  return (
    <ProtectedRoute route={ROUTE}>
      <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Solicitações à Contabilidade"
            description="Crie pedidos diretos à Contabilidade e acompanhe o andamento de cada um"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 2xl:grid-cols-4">
            {STAGE_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={counts[card.filter]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={stageFilter === card.filter}
                loading={loadingList}
                onClick={() => setStageFilter(card.filter)}
              />
            ))}
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
                      {listHeader.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{listHeader.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:w-[280px] sm:min-w-[240px] sm:flex-none sm:basis-auto">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por ID..."
                      className={`h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-10 text-sm font-medium text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${DP_SOLICITACOES_NO_FOCUS_CLS}`}
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
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={() => {
                        resetCreate();
                        setIsCreateOpen(true);
                      }}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>Nova Solicitação</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loadingList ? (
                  <CadastroListLoading message="Carregando solicitações…" />
                ) : filtered.length === 0 ? (
                  <CadastroListEmpty
                    icon={ClipboardList}
                    title={requests.length === 0 ? 'Nenhuma solicitação ainda.' : 'Nenhuma solicitação encontrada'}
                    hint={
                      requests.length === 0
                        ? canCreate
                          ? 'Use Nova solicitação para enviar um pedido à Contabilidade.'
                          : 'Os pedidos enviados à Contabilidade aparecem aqui.'
                        : 'Ajuste a busca ou o filtro de etapa.'
                    }
                  />
                ) : (
                  <>
                    <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                      Mostrando 1 a {filtered.length} de {requests.length} solicitações
                    </div>
                    <div className="table-scroll">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            {['ID', 'Solicitante', 'Unidade', 'Tipo', 'Status', 'Criado em'].map(
                              (h, i) => (
                                <th
                                  key={h}
                                  className={`px-3 py-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 ${
                                    h === 'Solicitante' ? 'text-left' : 'text-center'
                                  }`}
                                  data-col={i}
                                >
                                  {h}
                                </th>
                              )
                            )}
                            <th className={listTableRowClasses.actionTh}>Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                          {filtered.map((r) => (
                            <tr
                              key={r.id}
                              onClick={() => openHistory(r)}
                              className={getListTableRowClassName(true)}
                            >
                              <td className="px-3 py-3 text-center align-middle text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                                <ListRowNavigableLabel className="font-medium tabular-nums">
                                  {r.displayNumber ?? '—'}
                                </ListRowNavigableLabel>
                              </td>
                              <td className="max-w-[180px] truncate px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                                {r.solicitanteNome || '—'}
                              </td>
                              <td className="max-w-[200px] px-3 py-3 text-center align-middle text-sm text-gray-700 dark:text-gray-300">
                                {unitLabel(r)}
                              </td>
                              <td className="px-3 py-3 text-center align-middle text-sm font-medium text-gray-900 dark:text-gray-100">
                                {typeLabel(r.requestType)}
                              </td>
                              <td className="px-3 py-3 text-center align-middle">{statusBadge(r)}</td>
                              <td className="whitespace-nowrap px-3 py-3 text-center align-middle text-sm text-gray-700 dark:text-gray-300">
                                {formatDateTime(r.createdAt)}
                              </td>
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(r.id)}
                                onToggle={(e) => toggleRowActionMenu(r.id, e.currentTarget as HTMLButtonElement)}
                              />
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {rowActionMenu && rowForActionMenu ? (
                      <RowActionMenuPortal
                        menu={rowActionMenu}
                        onClose={closeRowActionMenu}
                        onEdit={() => {}}
                        onDelete={() => {}}
                        hideDefaultActions
                        extraItems={[
                          {
                            label: 'Ver detalhes',
                            onClick: () => openHistory(rowForActionMenu),
                            icon: <FileText className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />,
                          },
                        ]}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </PageStack>

        {/* Nova solicitação */}
        <Modal
          isOpen={isCreateOpen}
          onClose={closeCreate}
          title="Nova solicitação à Contabilidade"
          size="xl"
          scrollContent
          contentOverflowVisible
          elevated
        >
          <form
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Tipo de solicitação *</label>
              <SingleSelectSearchDropdown
                value={form.requestType}
                onChange={(rt) => {
                  setForm((p) => ({ ...p, requestType: rt as ContabilFormRequestType | '' }));
                  setDetails({});
                  setAnexos([]);
                }}
                options={typeOptions}
                allowEmpty
                placeholder="Selecione o tipo..."
                searchPlaceholder="Pesquisar..."
                noFocusRing
              />
            </div>


            {form.requestType ? (
              <>
            <div
              className={`grid grid-cols-1 gap-4 md:col-span-2 ${
                costCenterPolo ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
              }`}
            >
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium">Unidade *</label>
                <SingleSelectSearchDropdown
                  value={form.costCenterId}
                  onChange={handleCostCenterChange}
                  options={costCenterOptions}
                  allowEmpty
                  placeholder="Selecionar unidade..."
                  searchPlaceholder="Pesquisar..."
                  noFocusRing
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium">Empresa</label>
                <SingleSelectSearchDropdown
                  value={form.company}
                  onChange={(company) => setForm((p) => ({ ...p, company }))}
                  options={companyOptions}
                  allowEmpty
                  placeholder="Selecione a empresa..."
                  searchPlaceholder="Pesquisar..."
                  noFocusRing
                />
              </div>
              {costCenterPolo ? (
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium">Polo</label>
                  <SingleSelectSearchDropdown
                    value={isFormPolo(form.polo) ? form.polo : costCenterPolo}
                    onChange={(polo) => setForm((p) => ({ ...p, polo }))}
                    options={poloOptions}
                    allowEmpty={false}
                    placeholder="Selecione o polo..."
                    searchPlaceholder="Pesquisar..."
                    noFocusRing
                  />
                </div>
              ) : null}
            </div>

            <ContabilSolicitacaoTypeFields
              requestType={form.requestType}
              details={details}
              patchDetails={patchDetails}
              employees={payrollEmployees}
              anexos={anexos}
              onAnexosChange={setAnexos}
            />

              </>
            ) : null}

            <div className="flex justify-end gap-3 md:col-span-2">
              <Button type="button" variant="outline" onClick={closeCreate}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Enviando...' : 'Enviar solicitação'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Detalhes */}
        <Modal
          isOpen={!!historyRequest}
          onClose={() => setHistoryRequest(null)}
          title="Histórico da solicitação"
          size="lg"
        >
          {historyRequest && (
            <div className="space-y-5">
              <DpRequestHistoryModalTabs activeTab={historyTab} onTabChange={setHistoryTab} />

              {historyTab === 'detalhes' ? (
                <div className="space-y-4">
                  <DpRequestHistoryMetaCard fields={metaFields(historyRequest)} />

                  {isContabilDirectRequestType(historyRequest.requestType) ? (
                    <ContabilRequestDetailsView
                      requestType={historyRequest.requestType}
                      details={historyRequest.details}
                      employeeNameById={employeeNameById}
                    />
                  ) : (
                    <DpRequestDetailsPreview
                      requestType={historyRequest.requestType}
                      details={historyRequest.details}
                      employeeNameById={employeeNameById}
                    />
                  )}

                  {feedbackText ? (
                    <DpRequestHistorySectionCard title="Retorno da Contabilidade">
                      <p className="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">
                        {feedbackText}
                      </p>
                    </DpRequestHistorySectionCard>
                  ) : null}

                  {historyRequest.contabilidadePendente ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                      <p>Esta solicitação ainda não chegou à Contabilidade.</p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={resendMutation.isPending}
                        onClick={() => resendMutation.mutate(historyRequest.id)}
                      >
                        {resendMutation.isPending ? 'Enviando...' : 'Reenviar à Contabilidade'}
                      </Button>
                    </div>
                  ) : null}

                  <DpRequestHistoryModalFooter>
                    <Button type="button" variant="outline" onClick={() => setHistoryRequest(null)}>
                      Fechar
                    </Button>
                  </DpRequestHistoryModalFooter>
                </div>
              ) : (
                <div className="space-y-4">
                  <DpRequestHistoryTimeline
                    steps={buildDpRequestTimeline(
                      historyRequest,
                      isContabilDirectRequestType(historyRequest.requestType)
                        ? STATUS_LABELS
                        : { ...STATUS_LABELS, CONCLUDED: DP_SENT_TO_ACCOUNTING_LABEL },
                      formatDuration
                    )}
                    formatDateTime={formatDateTime}
                  />
                  <DpRequestHistoryModalFooter>
                    <Button type="button" variant="outline" onClick={() => setHistoryRequest(null)}>
                      Fechar
                    </Button>
                  </DpRequestHistoryModalFooter>
                </div>
              )}
            </div>
          )}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

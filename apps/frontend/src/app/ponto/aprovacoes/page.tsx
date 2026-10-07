'use client';

import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { getListTableRowClassName, listTableRowClasses, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { formatIsoDateRangeToBr } from '@/lib/dpSolicitacoesUi';
import { DpRequestDetailsPreview } from '@/lib/dpRequestDetailsPreview';
import {
  DpRequestHistoryMetaCard,
  type DpRequestHistoryMetaField,
} from '@/lib/dpRequestHistoryModal';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { Check, Download, Eye, FileText, Filter, MoreVertical, Wrench, Search, X, CheckCircle, Clock, LayoutList, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import {
  exportEspelhoNfPdf,
  fmtEspelhoBrl,
  parseEspelhoBrCurrencyToNumber,
  type EspelhoFederalRates
} from '@/lib/exportEspelhoNfLayout';
import {
  type EspelhoApprovalStatus,
  resolveEspelhoApprovalStatus,
  updateEspelhoApprovalStatus
} from '@/lib/espelhoNfApproval';
import { OcApprovalsSection } from './_components/OcApprovalsSection';
import { FdApprovalsSection } from './_components/FdApprovalsSection';
import { FuelApprovalsSection } from './_components/FuelApprovalsSection';
import { RmApprovalsSection } from './_components/RmApprovalsSection';
import { MedicaoApprovalsSection } from './_components/MedicaoApprovalsSection';
import {
  AprovacoesTabsNav,
  type AprovacaoTabId,
} from './_components/AprovacoesTabsNav';
import {
  ApprovalPhaseStatCards,
  DEFAULT_APPROVAL_PHASE_CARDS,
  fetchApprovalPhaseCounts,
  type ApprovalPhaseStatCard,
} from './_components/ApprovalPhaseStatCards';
import {
  APPROVAL_STATUS_COLUMN_TITLE,
  ApprovalStatusBadge,
  dpToApprovalStatus,
  espelhoToApprovalStatus,
} from './_components/ApprovalStatusBadge';
import { useApprovalNotificationCounts } from '@/hooks/useApprovalNotificationCounts';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
const DP_PHASES = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const;
type DpPhaseFilter = (typeof DP_PHASES)[number];

const DP_PHASE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovadas' },
  { value: 'REJECTED', label: 'Canceladas' },
  { value: 'ALL', label: 'Todos' },
]);

const DP_PHASE_SUBTITLE: Record<DpPhaseFilter, string> = {
  PENDING: 'Pendentes de aprovação',
  APPROVED: 'Já aprovadas pelo gestor',
  REJECTED: 'Canceladas pelo gestor',
  ALL: 'Todas as solicitações da sua área',
};

const ESPELHO_PHASE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'ALL', label: 'Todos os status' },
  { value: 'PENDING_APPROVAL', label: 'Pendentes' },
  { value: 'SENT_FOR_CORRECTION', label: 'Correção' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'CANCELLED', label: 'Cancelados' },
]);

type EspelhoPhaseFilter =
  | 'ALL'
  | 'PENDING_APPROVAL'
  | 'SENT_FOR_CORRECTION'
  | 'APPROVED'
  | 'CANCELLED';

const ESPELHO_STAT_CARDS: ApprovalPhaseStatCard<EspelhoPhaseFilter>[] = [
  {
    filter: 'PENDING_APPROVAL',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
  },
  {
    filter: 'APPROVED',
    label: 'Aprovados',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
  },
  {
    filter: 'CANCELLED',
    label: 'Cancelados',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
  },
  {
    filter: 'ALL',
    label: 'Todos',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: LayoutList,
  },
];

const ESPELHO_PHASE_SUBTITLE: Record<EspelhoPhaseFilter, string> = {
  PENDING_APPROVAL: 'Pendentes de aprovação',
  SENT_FOR_CORRECTION: 'Enviados para correção',
  APPROVED: 'Espelhos aprovados',
  CANCELLED: 'Espelhos cancelados',
  ALL: 'Todos os espelhos',
};

type DpUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type DpRequestStatus =
  | 'WAITING_MANAGER'
  | 'IN_REVIEW_DP'
  | 'IN_FINANCEIRO'
  | 'WAITING_RETURN'
  | 'WAITING_RETURN_ACCOUNTING'
  | 'WAITING_RETURN_ADM_TST'
  | 'WAITING_RETURN_ENGINEERING'
  | 'CONCLUDED'
  | 'CANCELLED';
type DpRequestType =
  | 'ADMISSAO'
  | 'ADVERTENCIA_SUSPENSAO'
  | 'ALTERACAO_FUNCAO_SALARIO'
  | 'ATESTADO_MEDICO'
  | 'BENEFICIOS_VIAGEM'
  | 'FERIAS'
  | 'HORA_EXTRA'
  | 'OUTRAS_SOLICITACOES'
  | 'RESCISAO'
  | 'RETIFICACAO_ALOCACAO'
  | 'ADM_VIAGENS'
  | 'ADM_EPI_FARDAMENTO'
  | 'ADM_MANUTENCAO_ESCRITORIO'
  | 'ADM_MATERIAL_ESCRITORIO'
  | 'ADM_INFORMATICA'
  | 'ADM_TREINAMENTOS_NR'
  | 'ADM_ASOS';

type DpContractSummary = { id: string; number: string; name: string };
type EspelhoApprovalItem = {
  id: string;
  takerName: string;
  measurementRef: string;
  measurementAmount: string;
  dueDate: string;
  status: EspelhoApprovalStatus;
  mirror: any;
};
type EspelhoApprovalsData = {
  items: EspelhoApprovalItem[];
  providers: any[];
  takers: any[];
  bankAccounts: any[];
  taxCodes: any[];
};

type DpRequest = {
  id: string;
  displayNumber?: number;
  title: string;
  status: DpRequestStatus;
  urgency: DpUrgency;
  requestType: DpRequestType;
  prazoInicio: string;
  prazoFim: string;
  sectorSolicitante: string;
  solicitanteNome: string;
  solicitanteEmail: string;
  contractId?: string | null;
  contract?: DpContractSummary | null;
  costCenterId?: string | null;
  costCenter?: { id: string; name?: string | null; code?: string | null } | null;
  company?: string | null;
  polo?: string | null;
  managerApprovedBy?: string | null;
  managerApprovedByName?: string | null;
  managerApprovedAt?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  createdAt?: string;
  details?: Record<string, unknown> | null;
  employee?: { costCenter?: string | null } | null;
};

function formatDateTime(iso?: string | null) {
  return formatDateTimeBr(iso, '—');
}

function formatYmd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

const URGENCY_LABELS: Record<DpUrgency, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

const URGENCY_ROW_BADGE: Record<DpUrgency, string> = {
  LOW: 'text-yellow-800 dark:text-yellow-300',
  MEDIUM: 'text-yellow-800 dark:text-yellow-300',
  HIGH: 'text-red-700 dark:text-red-300',
  URGENT: 'text-red-700 dark:text-red-300',
};

const TYPE_LABELS: Record<DpRequestType, string> = {
  ADMISSAO: 'Admissão',
  ADVERTENCIA_SUSPENSAO: 'Medida disciplinar',
  ALTERACAO_FUNCAO_SALARIO: 'Alteração de função/salário',
  ATESTADO_MEDICO: 'Atestado médico',
  BENEFICIOS_VIAGEM: 'Benefícios de viagem',
  FERIAS: 'Férias',
  HORA_EXTRA: 'Hora extra',
  OUTRAS_SOLICITACOES: 'Outras solicitações',
  RESCISAO: 'Rescisão',
  RETIFICACAO_ALOCACAO: 'Retificação de alocação',
  ADM_VIAGENS: 'Viagens',
  ADM_EPI_FARDAMENTO: "EPI's e fardamento",
  ADM_MANUTENCAO_ESCRITORIO: 'Manutenção do escritório',
  ADM_MATERIAL_ESCRITORIO: 'Material de escritório',
  ADM_INFORMATICA: 'Informática',
  ADM_TREINAMENTOS_NR: "Treinamentos e NR's",
  ADM_ASOS: "ASO's",
};
const ESPELHO_ACTION_MENU_WIDTH_PX = 224;
const ESPELHO_MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const ESPELHO_MENU_ITEM_BORDER_CLASS = `${ESPELHO_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;
const DP_ACTION_MENU_WIDTH_PX = 224;
const DP_MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const DP_MENU_ITEM_BORDER_CLASS = `${DP_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;
const espelhoCellPad = 'px-2 sm:px-3 py-3';
const espelhoCellPadTh = 'px-2 sm:px-3 py-4';
const espelhoActionColCls = 'w-[4%] min-w-[3rem] max-w-[4.5rem]';
const espelhoThTextCls = `${espelhoCellPadTh} text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400`;
const espelhoThLeftCls = `${espelhoCellPadTh} text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 !pl-2 sm:!pl-3`;
const espelhoThCenterCls = `${espelhoThTextCls} whitespace-nowrap`;
const espelhoTdTextCls = `${espelhoCellPad} text-center text-sm text-gray-700 dark:text-gray-300 min-w-0`;
const espelhoTdRefCls = `${espelhoCellPad} text-left text-sm text-gray-600 dark:text-gray-400 min-w-0 !pl-2 sm:!pl-3`;
const espelhoTdCenterCls = `${espelhoCellPad} text-center text-sm min-w-0`;
const espelhoActionThCls = `${cadastroListClasses.thRight} ${espelhoActionColCls} !pl-1 !pr-2 sm:!pr-3`;
const espelhoActionTdCls = `${espelhoActionColCls} !pl-1 !pr-2 sm:!pr-3 py-3 align-middle`;

function AprovacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  /** Fase do bloco «Solicitações»: pendentes (padrão), aprovadas, canceladas ou todas. */
  const [searchDp, setSearchDp] = useState('');
  const [dpPhase, setDpPhase] = useState<DpPhaseFilter>('PENDING');
  const [isDpFiltersOpen, setIsDpFiltersOpen] = useState(false);
  /** Busca + filtro de status do bloco «Espelhos da Nota Fiscal». */
  const [searchEspelho, setSearchEspelho] = useState('');
  const [isEspelhoFiltersOpen, setIsEspelhoFiltersOpen] = useState(false);
  const [managerComment, setManagerComment] = useState<Record<string, string>>({});
  const [managerCancellationReason, setManagerCancellationReason] = useState<Record<string, string>>({});
  const [managerRejectingId, setManagerRejectingId] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<DpRequest | null>(null);
  const [espelhoPhase, setEspelhoPhase] = useState<EspelhoPhaseFilter>('PENDING_APPROVAL');
  const [espelhoActionMenu, setEspelhoActionMenu] = useState<{
    mirrorId: string;
    top: number;
    left: number;
  } | null>(null);
  const [dpActionMenu, setDpActionMenu] = useState<{
    requestId: string;
    top: number;
    left: number;
  } | null>(null);
  const {
    canAccessDpApproverPages,
    canApproveFd,
    canApproveEspelhoNf,
    espelhoNfApprovalCostCenterIds,
    espelhoNfApprovalSeesAll,
    canApproveOc,
    canApproveFuel,
    canApproveMaterialRequests,
    canApproveEmpreiteiroDaily,
    isLinkedEmpreiteiro,
    isAdministrator,
    isElevatedUser,
  } = usePermissions();
  const canApproveDp = canAccessDpApproverPages;
  const isAdminUser = isAdministrator || isElevatedUser;
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams?.get('tab') ?? null;
  const initialTab: AprovacaoTabId =
    tabFromUrl === 'dp' ||
    tabFromUrl === 'espelho' ||
    tabFromUrl === 'fd' ||
    tabFromUrl === 'fuel' ||
    tabFromUrl === 'rm' ||
    tabFromUrl === 'oc' ||
    tabFromUrl === 'medicao'
      ? tabFromUrl
      : 'dp';
  const [activeTab, setActiveTab] = useState<AprovacaoTabId>(initialTab);
  const { counts: approvalCounts } = useApprovalNotificationCounts();

  useEffect(() => {
    if (
      tabFromUrl === 'dp' ||
      tabFromUrl === 'espelho' ||
      tabFromUrl === 'fd' ||
      tabFromUrl === 'fuel' ||
      tabFromUrl === 'rm' ||
      tabFromUrl === 'oc' ||
      tabFromUrl === 'medicao'
    ) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

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

  const { data: dpResp, isLoading: loadingDp } = useQuery({
    queryKey: ['approvals', 'dp', dpPhase],
    queryFn: async () => {
      const res = await api.get(`/solicitacoes-dp/aprovacoes?phase=${dpPhase}`);
      return (res.data?.data ?? []) as DpRequest[];
    },
    enabled: !loadingUser && canApproveDp && activeTab === 'dp',
  });

  const { data: dpPhaseCounts, isLoading: loadingDpCounts } = useQuery({
    queryKey: ['approvals', 'dp', 'phase-counts'],
    queryFn: () => fetchApprovalPhaseCounts('/solicitacoes-dp/aprovacoes', DP_PHASES),
    enabled: !loadingUser && canApproveDp && activeTab === 'dp',
    staleTime: 30_000,
  });
  const { data: espelhoResp, isLoading: loadingEspelhoApprovals } = useQuery({
    queryKey: [
      'approvals',
      'espelho-nf',
      espelhoNfApprovalSeesAll,
      espelhoNfApprovalCostCenterIds,
    ],
    enabled: !loadingUser && canApproveEspelhoNf && activeTab === 'espelho',
    queryFn: async () => {
      const res = await api.get('/espelho-nf/bootstrap');
      const data = res.data?.data || {};
      const mirrors = Array.isArray(data.mirrors) ? data.mirrors : [];
      const allowedCostCenters = new Set(espelhoNfApprovalCostCenterIds);
      const visibleMirrors = mirrors.filter((m: { costCenterId?: string | null }) => {
        if (espelhoNfApprovalSeesAll) return true;
        return allowedCostCenters.has(String(m.costCenterId ?? ''));
      });
      const providers = Array.isArray(data.providers) ? data.providers : [];
      const takers = Array.isArray(data.takers) ? data.takers : [];
      const bankAccounts = Array.isArray(data.bankAccounts) ? data.bankAccounts : [];
      const taxCodes = Array.isArray(data.taxCodes) ? data.taxCodes : [];
      const takerById = new Map(
        takers.map((t: any) => [
          String(t.id ?? ''),
          String(t.corporateName || t.name || '').trim()
        ])
      );
      const parsed: EspelhoApprovalItem[] = visibleMirrors.map((m: any) => ({
        id: String(m.id ?? ''),
        takerName: String(m.takerName || takerById.get(String(m.takerId ?? '')) || '').trim(),
        measurementRef: String(m.measurementRef ?? ''),
        measurementAmount: String(m.measurementAmount ?? ''),
        dueDate: String(m.dueDate ?? ''),
        status: resolveEspelhoApprovalStatus(String(m.id ?? ''), String(m.approvalStatus ?? '')),
        mirror: m
      }));
      return {
        items: parsed,
        providers,
        takers,
        bankAccounts,
        taxCodes
      } as EspelhoApprovalsData;
    },
  });

  const dpRequests = (dpResp as DpRequest[]) || [];
  const espelhoData = (espelhoResp as EspelhoApprovalsData | undefined) ?? {
    items: [],
    providers: [],
    takers: [],
    bankAccounts: [],
    taxCodes: []
  };
  const espelhoApprovals = espelhoData.items;

  const detailPayrollMonthYear = React.useMemo(() => {
    const src = detailRequest?.createdAt;
    if (!src) {
      const n = new Date();
      return { month: n.getMonth() + 1, year: n.getFullYear() };
    }
    const d = new Date(src);
    if (Number.isNaN(d.getTime())) {
      const n = new Date();
      return { month: n.getMonth() + 1, year: n.getFullYear() };
    }
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }, [detailRequest?.createdAt]);

  const { data: payrollEmpForDetail } = useQuery({
    queryKey: [
      'payroll-employees-aprovacoes-detalhe',
      detailPayrollMonthYear.month,
      detailPayrollMonthYear.year,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        month: String(detailPayrollMonthYear.month),
        year: String(detailPayrollMonthYear.year),
        limit: '500',
        page: '1',
      });
      const res = await api.get(`/payroll/employees?${params.toString()}`);
      return (res.data?.data?.employees ?? []) as { id: string; name: string }[];
    },
    enabled: !loadingUser && canApproveDp && !!detailRequest,
  });

  const employeeNameByIdForDetail = React.useMemo(() => {
    const list = payrollEmpForDetail ?? [];
    return new Map(list.map((e) => [e.id, e.name]));
  }, [payrollEmpForDetail]);

  const getCostCenterLabel = (r: DpRequest): string | null => {
    const fromLinked = r.costCenter?.name?.trim() || r.costCenter?.code?.trim() || '';
    if (fromLinked) return fromLinked;
    const fromDetails =
      typeof r.details?.costCenter === 'string' ? r.details.costCenter.trim() : '';
    if (fromDetails) return fromDetails;
    const fromEmployee = typeof r.employee?.costCenter === 'string' ? r.employee.costCenter.trim() : '';
    return fromEmployee || null;
  };

  const getContratoColunaLabel = (r: DpRequest): string => {
    return getCostCenterLabel(r) || r.contract?.name || '—';
  };

  const detailMetaFields = React.useMemo((): DpRequestHistoryMetaField[] => {
    if (!detailRequest) return [];
    const centroCusto = getCostCenterLabel(detailRequest);
    const contrato = `${detailRequest.contract?.name ?? ''}${
      detailRequest.contract?.number ? ` (${detailRequest.contract.number})` : ''
    }`.trim();
    const fields: DpRequestHistoryMetaField[] = [
      {
        label: 'Nº da solicitação',
        value: detailRequest.displayNumber != null ? String(detailRequest.displayNumber) : '—',
      },
      {
        label: APPROVAL_STATUS_COLUMN_TITLE,
        value: <ApprovalStatusBadge kind={dpToApprovalStatus(detailRequest.status)} />,
      },
      {
        label: 'Urgência',
        value: (
          <span className={`text-sm font-medium ${URGENCY_ROW_BADGE[detailRequest.urgency]}`}>
            {URGENCY_LABELS[detailRequest.urgency]}
          </span>
        ),
      },
      {
        label: 'Tipo',
        value: TYPE_LABELS[detailRequest.requestType] ?? detailRequest.requestType,
      },
      {
        label: 'Período de atendimento',
        value: formatIsoDateRangeToBr(detailRequest.prazoInicio, detailRequest.prazoFim),
      },
      { label: 'Criada em', value: formatDateTime(detailRequest.createdAt) },
      { label: 'Centro de custo', value: centroCusto || '—' },
      { label: 'Contrato', value: contrato || '—' },
      { label: 'Empresa', value: detailRequest.company?.trim() || '—' },
      { label: 'Polo', value: detailRequest.polo?.trim() || '—' },
      { label: 'Solicitante', value: detailRequest.solicitanteNome || '—' },
      { label: 'Setor', value: detailRequest.sectorSolicitante || '—' },
      { label: 'Login', value: detailRequest.solicitanteEmail || '—' },
    ];
    if (detailRequest.managerApprovedByName?.trim()) {
      fields.push({ label: 'Aprovado por', value: detailRequest.managerApprovedByName });
    }
    if (detailRequest.managerApprovedAt) {
      fields.push({
        label: 'Aprovado em',
        value: formatDateTime(detailRequest.managerApprovedAt),
      });
    }
    if (detailRequest.managerApprovalComment?.trim()) {
      fields.push({
        label: 'Comentário da aprovação',
        value: detailRequest.managerApprovalComment,
      });
    }
    if (detailRequest.managerRejectionReason?.trim()) {
      fields.push({
        label: 'Motivo do cancelamento',
        value: detailRequest.managerRejectionReason,
      });
    }
    return fields;
  }, [detailRequest]);

  const dpFiltered = useMemo(() => {
    const q = searchDp.trim();
    if (!q) return dpRequests;
    return dpRequests.filter((r) => {
      if (r.displayNumber != null && String(r.displayNumber).includes(q)) return true;
      return textMatchesSearch(r.id, q);
    });
  }, [dpRequests, searchDp]);

  const espelhoFiltered = useMemo(() => {
    const q = searchEspelho.trim().toLowerCase();
    const byPhase =
      espelhoPhase === 'ALL'
        ? espelhoApprovals
        : espelhoApprovals.filter((m) => m.status === espelhoPhase);
    if (!q) return byPhase;
    return byPhase.filter((m) => {
      const title = `${m.takerName} ${m.measurementRef} ${m.measurementAmount} ${m.id}`.toLowerCase();
      return title.includes(q);
    });
  }, [espelhoApprovals, espelhoPhase, searchEspelho]);

  const espelhoPhaseCounts = useMemo(() => {
    const counts: Record<EspelhoPhaseFilter, number> = {
      ALL: espelhoApprovals.length,
      PENDING_APPROVAL: 0,
      SENT_FOR_CORRECTION: 0,
      APPROVED: 0,
      CANCELLED: 0,
    };
    for (const item of espelhoApprovals) {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
    return counts;
  }, [espelhoApprovals]);

  const espelhoForActionMenu = useMemo(
    () => espelhoFiltered.find((m) => m.id === espelhoActionMenu?.mirrorId) ?? null,
    [espelhoFiltered, espelhoActionMenu?.mirrorId]
  );

  const dpForActionMenu = useMemo(
    () => dpFiltered.find((r) => r.id === dpActionMenu?.requestId) ?? null,
    [dpFiltered, dpActionMenu?.requestId]
  );

  useEffect(() => {
    setEspelhoActionMenu(null);
  }, [activeTab, espelhoPhase, searchEspelho]);

  useEffect(() => {
    setDpActionMenu(null);
  }, [activeTab, dpPhase, searchDp]);

  const approvalTabs = useMemo(() => {
    const tabs: { id: AprovacaoTabId; label: string; count: number }[] = [];
    if (canApproveDp) {
      tabs.push({
        id: 'dp',
        label: 'Solicitações Internas',
        count: approvalCounts.dp,
      });
    }
    if (canApproveEspelhoNf) {
      tabs.push({
        id: 'espelho',
        label: 'Espelhos da NF',
        count: approvalCounts.espelho,
      });
    }
    if (canApproveFd) {
      tabs.push({
        id: 'fd',
        label: 'Fichas de Demanda',
        count: approvalCounts.fd,
      });
    }
    if (canApproveFuel) {
      tabs.push({
        id: 'fuel',
        label: 'Abastecimento',
        count: approvalCounts.fuel,
      });
    }
    if (canApproveMaterialRequests) {
      tabs.push({
        id: 'rm',
        label: 'Requisições de Materiais',
        count: approvalCounts.rm,
      });
    }
    if (canApproveOc) {
      tabs.push({
        id: 'oc',
        label: 'Ordens de Compra',
        count: approvalCounts.oc,
      });
    }
    if (canApproveEmpreiteiroDaily && !isLinkedEmpreiteiro) {
      tabs.push({
        id: 'medicao',
        label: 'Medições de Entrega',
        count: approvalCounts.medicao,
      });
    }
    return tabs;
  }, [canApproveDp, canApproveFd, canApproveEspelhoNf, canApproveFuel, canApproveMaterialRequests, canApproveOc, canApproveEmpreiteiroDaily, isLinkedEmpreiteiro, approvalCounts]);

  useEffect(() => {
    if (approvalTabs.length === 0) return;
    if (!approvalTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(approvalTabs[0].id);
    }
  }, [approvalTabs, activeTab]);

  const approveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/solicitacoes-dp/${id}/manager-approve`, { comment });
      return res.data?.data as DpRequest;
    },
    onSuccess: async (_, variables) => {
      toast.success('Solicitação aprovada');
      setDetailRequest((cur) => (cur?.id === variables.id ? null : cur));
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'dp'] });
      await queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Erro'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({
      id,
      cancellationReason,
      asAdmin,
    }: {
      id: string;
      cancellationReason: string;
      asAdmin?: boolean;
    }) => {
      const path = asAdmin
        ? `/solicitacoes-dp/${id}/admin-cancel`
        : `/solicitacoes-dp/${id}/manager-reject`;
      const res = await api.put(path, { cancellationReason });
      return res.data?.data as DpRequest;
    },
    onSuccess: async (_, variables) => {
      toast.success('Solicitação cancelada');
      setManagerRejectingId(null);
      setManagerCancellationReason((p) => {
        const n = { ...p };
        delete n[variables.id];
        return n;
      });
      setDetailRequest((cur) => (cur?.id === variables.id ? null : cur));
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'dp'] });
      await queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Erro'),
  });

  const closeDetailModal = () => {
    setDetailRequest(null);
    setManagerRejectingId(null);
  };

  const canCancelDetailRequest = (req: DpRequest | null | undefined) => {
    if (!req || req.status === 'CANCELLED') return false;
    if (req.status === 'WAITING_MANAGER') return true;
    return isAdminUser;
  };

  const handleManagerRejectClick = (id: string, status: string) => {
    if (managerRejectingId !== id) {
      setManagerRejectingId(id);
      return;
    }
    const reason = (managerCancellationReason[id] || '').trim();
    if (!reason) {
      toast.error('Informe o motivo do cancelamento');
      return;
    }
    const asAdmin = status !== 'WAITING_MANAGER';
    if (asAdmin && !isAdminUser) {
      toast.error('Apenas administrador pode cancelar após aprovação');
      return;
    }
    rejectMutation.mutate({ id, cancellationReason: reason, asAdmin });
  };
  const applyEspelhoDecision = async (
    mirrorId: string,
    status: EspelhoApprovalStatus,
    successMessage: string
  ) => {
    const target = espelhoApprovals.find((item) => item.id === mirrorId);
    const targetCostCenterId = String(target?.mirror?.costCenterId ?? '');
    if (
      target &&
      !espelhoNfApprovalSeesAll &&
      !espelhoNfApprovalCostCenterIds.includes(targetCostCenterId)
    ) {
      toast.error('Você não tem permissão para decidir espelhos deste centro de custo.');
      return;
    }
    updateEspelhoApprovalStatus(mirrorId, status);
    toast.success(successMessage);
    await queryClient.invalidateQueries({ queryKey: ['approvals', 'espelho-nf'] });
    await queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
  };
  const handleDownloadEspelhoPdf = (item: EspelhoApprovalItem) => {
    const fallbackFederal: EspelhoFederalRates = {
      cofins: '0',
      csll: '0',
      inss: '0',
      irpj: '0',
      pis: '0'
    };
    let federal = fallbackFederal;
    try {
      const raw = localStorage.getItem('espelho-nf-federal-tax-rates');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EspelhoFederalRates>;
        federal = {
          cofins: String(parsed?.cofins ?? '0'),
          csll: String(parsed?.csll ?? '0'),
          inss: String(parsed?.inss ?? '0'),
          irpj: String(parsed?.irpj ?? '0'),
          pis: String(parsed?.pis ?? '0')
        };
      }
    } catch {
      federal = fallbackFederal;
    }
    exportEspelhoNfPdf(
      item.mirror,
      espelhoData.providers,
      espelhoData.takers,
      espelhoData.bankAccounts,
      espelhoData.taxCodes,
      federal
    );
    toast.success('PDF do espelho gerado.');
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/aprovacoes">
        <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/aprovacoes">
      <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Aprovações"
            description="Analise e decida sobre as solicitações pendentes da sua área"
          />

          {approvalTabs.length > 0 ? (
            <AprovacoesTabsNav
              tabs={approvalTabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Você não tem permissão para aprovar itens nesta tela.
            </div>
          )}

          {canApproveDp && activeTab === 'dp' && (
          <PageStack>
            <ApprovalPhaseStatCards
              cards={DEFAULT_APPROVAL_PHASE_CARDS}
              activeFilter={dpPhase}
              counts={dpPhaseCounts ?? {}}
              loading={loadingDpCounts}
              onSelect={setDpPhase}
            />
          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  {(() => {
                    const activeCard =
                      DEFAULT_APPROVAL_PHASE_CARDS.find((c) => c.filter === dpPhase) ??
                      DEFAULT_APPROVAL_PHASE_CARDS[0];
                    const PhaseIcon = activeCard.Icon;
                    return (
                      <>
                        <div className={`rounded-lg p-2 sm:p-3 ${activeCard.iconBg}`}>
                          <PhaseIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${activeCard.iconColor}`} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {activeCard.label}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {DP_PHASE_SUBTITLE[dpPhase]}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={searchDp}
                      onChange={(e) => setSearchDp(e.target.value)}
                      placeholder="Buscar por ID..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchDp && (
                      <button
                        type="button"
                        onClick={() => setSearchDp('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDpFiltersOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      dpPhase !== 'PENDING'
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={dpPhase !== 'PENDING' ? 'Filtro (status ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {dpPhase !== 'PENDING' && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    )}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!canApproveDp ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Você não tem permissão para aprovar solicitações do Departamento Pessoal.
                </div>
              ) : loadingDp ? (
                <CadastroListLoading message="Carregando aprovações..." />
              ) : dpFiltered.length === 0 ? (
                <div className="py-8 text-center">
                  <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden />
                  <p className="text-gray-500 dark:text-gray-400">Nenhuma aprovação pendente.</p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando 1 a {dpFiltered.length} de {dpFiltered.length} solicitações
                    </span>
                    <span>Página 1 de 1</span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            ID
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Solicitante
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Contrato
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Urgência
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Tipo
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Período de atendimento
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            {APPROVAL_STATUS_COLUMN_TITLE}
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Criado em
                          </th>
                          <th className={listTableRowClasses.actionTh}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {dpFiltered.map((r) => (
                          <tr
                            key={r.id}
                            onClick={() => setDetailRequest(r)}
                            className={getListTableRowClassName(true)}
                          >
                            <td className="px-3 py-3 align-middle text-sm tabular-nums text-gray-900 dark:text-gray-100">
                              <ListRowNavigableLabel className="font-medium tabular-nums">
                                {r.displayNumber ?? '—'}
                              </ListRowNavigableLabel>
                            </td>
                            <td className="px-3 py-3 align-middle text-left text-sm text-gray-700 dark:text-gray-300">
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {r.solicitanteNome || '—'}
                              </div>
                              {r.sectorSolicitante?.trim() ? (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {r.sectorSolicitante}
                                </div>
                              ) : null}
                            </td>
                            <td className="max-w-[200px] px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300">
                              {getContratoColunaLabel(r)}
                            </td>
                            <td className="px-3 py-3 align-middle text-center">
                              <span
                                className={`inline-flex items-center justify-center text-xs font-medium ${URGENCY_ROW_BADGE[r.urgency]}`}
                              >
                                {URGENCY_LABELS[r.urgency]}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-middle text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                              {TYPE_LABELS[r.requestType] ?? r.requestType}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300">
                              {formatIsoDateRangeToBr(r.prazoInicio, r.prazoFim)}
                            </td>
                            <td className="px-3 py-3 align-middle text-center">
                              <ApprovalStatusBadge kind={dpToApprovalStatus(r.status)} />
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300">
                              {formatDateTime(r.createdAt)}
                            </td>
                            <td
                              className="px-3 py-3 align-middle text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setDpActionMenu((prev) => {
                                      if (prev?.requestId === r.id) return null;
                                      let left = rect.right - DP_ACTION_MENU_WIDTH_PX;
                                      left = Math.max(
                                        8,
                                        Math.min(left, window.innerWidth - DP_ACTION_MENU_WIDTH_PX - 8)
                                      );
                                      return { requestId: r.id, top: rect.bottom + 4, left };
                                    });
                                  }}
                                  className={rowActionMenuButtonClass(dpActionMenu?.requestId === r.id)}
                                  aria-label="Menu de ações"
                                  aria-expanded={dpActionMenu?.requestId === r.id}
                                  aria-haspopup="menu"
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
                </>
              )}
            </CardContent>
          </Card>
          </PageStack>
          )}

          {dpActionMenu &&
            dpForActionMenu &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                className="fixed inset-0"
                style={{ zIndex: 2101 }}
                onClick={() => setDpActionMenu(null)}
              >
                <div
                  role="menu"
                  className="absolute w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                  style={{ top: dpActionMenu.top, left: dpActionMenu.left }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDpActionMenu(null);
                      setDetailRequest(dpForActionMenu);
                    }}
                    className={DP_MENU_ITEM_CLASS}
                  >
                    <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>Ver detalhes</span>
                  </button>
                  {dpForActionMenu.status === 'WAITING_MANAGER' && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDpActionMenu(null);
                        approveMutation.mutate({ id: dpForActionMenu.id });
                      }}
                      className={DP_MENU_ITEM_BORDER_CLASS}
                    >
                      <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>Aprovar solicitação</span>
                    </button>
                  )}
                  {canCancelDetailRequest(dpForActionMenu) && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDpActionMenu(null);
                        setDetailRequest(dpForActionMenu);
                        setManagerRejectingId(dpForActionMenu.id);
                      }}
                      className={DP_MENU_ITEM_BORDER_CLASS}
                    >
                      <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                      <span>
                        {dpForActionMenu.status === 'WAITING_MANAGER'
                          ? 'Cancelar solicitação'
                          : 'Cancelar (admin)'}
                      </span>
                    </button>
                  )}
                </div>
              </div>,
              document.body
            )}

          {canApproveEspelhoNf && activeTab === 'espelho' && (
          <PageStack>
            <ApprovalPhaseStatCards
              cards={ESPELHO_STAT_CARDS}
              activeFilter={espelhoPhase}
              counts={espelhoPhaseCounts}
              loading={loadingEspelhoApprovals}
              onSelect={setEspelhoPhase}
            />
          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  {(() => {
                    const activeCard =
                      ESPELHO_STAT_CARDS.find((c) => c.filter === espelhoPhase) ??
                      ESPELHO_STAT_CARDS[0];
                    const PhaseIcon = activeCard.Icon;
                    return (
                      <>
                        <div className={`rounded-lg p-2 sm:p-3 ${activeCard.iconBg}`}>
                          <PhaseIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${activeCard.iconColor}`} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {activeCard.label}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {ESPELHO_PHASE_SUBTITLE[espelhoPhase]}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={searchEspelho}
                      onChange={(e) => setSearchEspelho(e.target.value)}
                      placeholder="Buscar por tomador, medição ou ID..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchEspelho && (
                      <button
                        type="button"
                        onClick={() => setSearchEspelho('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEspelhoFiltersOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      espelhoPhase !== 'PENDING_APPROVAL'
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={espelhoPhase !== 'PENDING_APPROVAL' ? 'Filtro (status ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {espelhoPhase !== 'PENDING_APPROVAL' && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    )}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingEspelhoApprovals ? (
                <CadastroListLoading message="Carregando espelhos..." />
              ) : espelhoFiltered.length === 0 ? (
                <div className="py-8 text-center">
                  <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden />
                  <p className="text-gray-500 dark:text-gray-400">
                    {!espelhoNfApprovalSeesAll && espelhoNfApprovalCostCenterIds.length === 0
                      ? 'Nenhum centro de custo liberado para aprovar espelhos da nota fiscal.'
                      : 'Nenhum espelho neste filtro.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando 1 a {espelhoFiltered.length} de {espelhoFiltered.length} espelhos
                    </span>
                    <span>Página 1 de 1</span>
                  </div>
                  <div className="table-scroll">
                    <table className={`${cadastroListClasses.table} text-sm`}>
                      <colgroup>
                        <col className="w-[34%]" />
                        <col className="w-[22%]" />
                        <col className="w-[14%]" />
                        <col className="w-[14%]" />
                        <col className="w-[12%]" />
                        <col className="w-[4%]" />
                      </colgroup>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={espelhoThLeftCls}>Referência</th>
                          <th className={espelhoThTextCls}>Tomador</th>
                          <th className={espelhoThCenterCls}>Medição</th>
                          <th className={espelhoThCenterCls}>Vencimento</th>
                          <th className={espelhoThCenterCls}>{APPROVAL_STATUS_COLUMN_TITLE}</th>
                          <th scope="col" className={espelhoActionThCls}>
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {espelhoFiltered.map((m) => {
                          const med = parseEspelhoBrCurrencyToNumber(m.measurementAmount);
                          const medTxt = med !== null ? fmtEspelhoBrl(med) : '—';
                          const takerName = m.takerName || 'Tomador não informado';
                          const measurementRef = m.measurementRef?.trim() || '—';
                          return (
                            <tr key={m.id} className={listTableRowClasses.tr} title={m.id}>
                              <td className={espelhoTdRefCls}>
                                <span className="line-clamp-2" title={measurementRef}>
                                  {measurementRef}
                                </span>
                              </td>
                              <td className={espelhoTdTextCls} title={takerName}>
                                <span className="line-clamp-2 font-medium text-gray-900 dark:text-gray-100">
                                  {takerName}
                                </span>
                              </td>
                              <td className={espelhoTdCenterCls}>
                                <span className="font-medium tabular-nums text-gray-800 dark:text-gray-200 whitespace-nowrap">
                                  {medTxt}
                                </span>
                              </td>
                              <td className={`${espelhoTdCenterCls} tabular-nums text-gray-700 dark:text-gray-300`}>
                                {m.dueDate ? formatYmd(m.dueDate) : '—'}
                              </td>
                              <td className={espelhoTdCenterCls}>
                                <ApprovalStatusBadge kind={espelhoToApprovalStatus(m.status)} />
                              </td>
                              <td className={espelhoActionTdCls}>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setEspelhoActionMenu((prev) => {
                                        if (prev?.mirrorId === m.id) return null;
                                        let left = rect.right - ESPELHO_ACTION_MENU_WIDTH_PX;
                                        left = Math.max(
                                          8,
                                          Math.min(left, window.innerWidth - ESPELHO_ACTION_MENU_WIDTH_PX - 8)
                                        );
                                        return { mirrorId: m.id, top: rect.bottom + 4, left };
                                      });
                                    }}
                                    className={rowActionMenuButtonClass(espelhoActionMenu?.mirrorId === m.id)}
                                    aria-label="Menu de ações do espelho"
                                    aria-expanded={espelhoActionMenu?.mirrorId === m.id}
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
                </>
              )}
            </CardContent>
          </Card>
          </PageStack>
          )}

          {espelhoActionMenu &&
            espelhoForActionMenu &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                className="fixed inset-0"
                style={{ zIndex: 2101 }}
                onClick={() => setEspelhoActionMenu(null)}
              >
                <div
                  role="menu"
                  className="absolute w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                  style={{ top: espelhoActionMenu.top, left: espelhoActionMenu.left }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEspelhoActionMenu(null);
                      void applyEspelhoDecision(
                        espelhoForActionMenu.id,
                        'APPROVED',
                        'Espelho aprovado.'
                      );
                    }}
                    className={ESPELHO_MENU_ITEM_CLASS}
                  >
                    <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Aprovar espelho</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEspelhoActionMenu(null);
                      void applyEspelhoDecision(
                        espelhoForActionMenu.id,
                        'SENT_FOR_CORRECTION',
                        'Espelho enviado para correção.'
                      );
                    }}
                    className={ESPELHO_MENU_ITEM_BORDER_CLASS}
                  >
                    <Wrench className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                    <span>Enviar para correção</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEspelhoActionMenu(null);
                      void applyEspelhoDecision(
                        espelhoForActionMenu.id,
                        'CANCELLED',
                        'Espelho cancelado.'
                      );
                    }}
                    className={ESPELHO_MENU_ITEM_BORDER_CLASS}
                  >
                    <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Cancelar espelho</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEspelhoActionMenu(null);
                      handleDownloadEspelhoPdf(espelhoForActionMenu);
                    }}
                    className={ESPELHO_MENU_ITEM_BORDER_CLASS}
                  >
                    <Download className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-300" />
                    <span>Baixar PDF</span>
                  </button>
                </div>
              </div>,
              document.body
            )}

          {canApproveFd && activeTab === 'fd' && <FdApprovalsSection />}

          {canApproveFuel && activeTab === 'fuel' && <FuelApprovalsSection />}

          {canApproveMaterialRequests && activeTab === 'rm' && <RmApprovalsSection />}

          {canApproveOc && activeTab === 'oc' && <OcApprovalsSection />}

          {canApproveEmpreiteiroDaily && !isLinkedEmpreiteiro && activeTab === 'medicao' && (
            <MedicaoApprovalsSection />
          )}

          <Modal
            isOpen={!!detailRequest}
            onClose={closeDetailModal}
            title={
              detailRequest
                ? `Solicitação`
                : 'Detalhes'
            }
            size="lg"
          >
            {detailRequest && (
              <div className="space-y-6">
                <DpRequestHistoryMetaCard title="Informações" fields={detailMetaFields} />

                <DpRequestDetailsPreview
                  requestType={detailRequest.requestType}
                  details={detailRequest.details}
                  employeeNameById={employeeNameByIdForDetail}
                />

                <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {detailRequest.status === 'WAITING_MANAGER'
                      ? 'Decisão'
                      : canCancelDetailRequest(detailRequest)
                        ? 'Cancelamento administrativo'
                        : 'Ações'}
                  </h3>
                  <div className="space-y-3">
                    {detailRequest.status === 'WAITING_MANAGER' ? (
                      <Input
                        value={managerComment[detailRequest.id] || ''}
                        onChange={(e) =>
                          setManagerComment((p) => ({ ...p, [detailRequest.id]: e.target.value }))
                        }
                        placeholder="Comentário (opcional)"
                      />
                    ) : null}
                    {managerRejectingId === detailRequest.id && canCancelDetailRequest(detailRequest) ? (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Motivo do cancelamento *
                        </label>
                        <textarea
                          value={managerCancellationReason[detailRequest.id] || ''}
                          onChange={(e) =>
                            setManagerCancellationReason((p) => ({
                              ...p,
                              [detailRequest.id]: e.target.value,
                            }))
                          }
                          placeholder="Informe o motivo do cancelamento..."
                          className="w-full min-h-[88px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </div>
                    ) : null}
                    {detailRequest.status !== 'WAITING_MANAGER' &&
                    canCancelDetailRequest(detailRequest) &&
                    managerRejectingId !== detailRequest.id ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Como administrador, você pode cancelar esta solicitação mesmo após a aprovação.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button type="button" variant="outline" onClick={closeDetailModal}>
                        Fechar
                      </Button>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {canCancelDetailRequest(detailRequest) ? (
                          <Button
                            type="button"
                            variant="error"
                            onClick={() =>
                              handleManagerRejectClick(detailRequest.id, detailRequest.status)
                            }
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                          >
                            {rejectMutation.isPending
                              ? 'Cancelando…'
                              : managerRejectingId === detailRequest.id
                                ? 'Confirmar cancelamento'
                                : 'Cancelar'}
                          </Button>
                        ) : null}
                        {detailRequest.status === 'WAITING_MANAGER' ? (
                          <Button
                            type="button"
                            onClick={() => approveMutation.mutate({ id: detailRequest.id })}
                            disabled={approveMutation.isPending || rejectMutation.isPending}
                          >
                            {approveMutation.isPending ? 'Aprovando…' : 'Aprovar'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Modal>

          {/* Modal de Filtros — bloco «Solicitações» */}
          <Modal
            isOpen={isDpFiltersOpen}
            onClose={() => setIsDpFiltersOpen(false)}
            title="Filtros"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <StringSingleSelectDropdown
                  value={dpPhase}
                  onChange={(v) => setDpPhase(v as DpPhaseFilter)}
                  options={DP_PHASE_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setDpPhase('PENDING')}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setIsDpFiltersOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Modal>

          {/* Modal de Filtros — bloco «Espelhos da Nota Fiscal» */}
          <Modal
            isOpen={isEspelhoFiltersOpen}
            onClose={() => setIsEspelhoFiltersOpen(false)}
            title="Filtros"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <StringSingleSelectDropdown
                  value={espelhoPhase}
                  onChange={(v) => setEspelhoPhase(v as EspelhoPhaseFilter)}
                  options={ESPELHO_PHASE_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setEspelhoPhase('PENDING_APPROVAL')}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setIsEspelhoFiltersOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Modal>
        </PageStack>
      </MainLayout>
    </ProtectedRoute>
  );
}

/** Next.js exige Suspense em volta de `useSearchParams` na geração estática. */
export default function AprovacoesPageWithSuspense() {
  return (
    <Suspense fallback={<Loading />}>
      <AprovacoesPage />
    </Suspense>
  );
}

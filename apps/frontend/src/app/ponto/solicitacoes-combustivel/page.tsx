'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart3,
  Check,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  Filter,
  Fuel,
  MoreVertical,
  Pencil,
  Search,
  Settings,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  DetailInfoActions,
  DetailInfoNote,
  DetailInfoRows,
  DetailInfoTabs,
  type DetailInfoField,
  type DetailInfoTabItem,
} from '@/components/ui/DetailInfoLayout';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import api from '@/lib/api';
import { hasFuelStoredPhoto, resolveFuelPhotoSrc } from '@/lib/resolveMediaUrl';
import {
  FUEL_LITERS_MAX,
  parseFlexibleDecimal,
} from '@/lib/parseFlexibleDecimal';
import { FuelRequestPhoto } from '@/components/fuel/FuelRequestPhoto';
import { FuelQuotaConfigModal } from './FuelQuotaConfigModal';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  listTableRowClasses,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { DatePickerField } from '@/components/ui/DatePickerField';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { usePermissions } from '@/hooks/usePermissions';
import {
  VehicleReturnPhotoField,
  isBlankVehiclePhoto,
} from '@/components/ui/VehicleReturnPhotoField';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import {
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';

type FuelVehicleType = 'PRIVATE' | 'COMPANY';
type FuelTankLevelAfter = 'RESERVE' | 'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'FULL';

type FuelRefuelStatus =
  | 'PENDING_MANAGER'
  | 'PENDING_SUPPLIES'
  | 'AWAITING_REFUEL'
  | 'COMPLETED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type SuppliesCardFilter = 'all' | 'analysis' | 'awaiting_refuel' | 'CONCLUDED' | 'CANCELLED';

type DetailStatusFilter = 'ALL' | 'SUPPLIES_QUEUE' | FuelRefuelStatus;

const DETAIL_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'ALL', label: 'Todos do card selecionado' },
  { value: 'SUPPLIES_QUEUE', label: 'Pendentes e Liberado' },
  { value: 'PENDING_SUPPLIES', label: 'Pendente' },
  { value: 'AWAITING_REFUEL', label: 'Liberado' },
  { value: 'PENDING_MANAGER', label: 'Aguardando aprovação' },
  { value: 'COMPLETED', label: 'Concluídas' },
  { value: 'REJECTED', label: 'Rejeitadas' },
  { value: 'CANCELLED', label: 'Canceladas' },
]);

const DEFAULT_CARD_FILTER: SuppliesCardFilter = 'all';

const FUEL_SUPPLIES_ACTION_MENU_WIDTH_PX = 224;
const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const MENU_ITEM_BORDER_CLASS = `${MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;

const SUPPLIES_CARD_LIST_CONFIG: Record<
  SuppliesCardFilter,
  {
    title: string;
    subtitle: string;
    Icon: LucideIcon;
    iconBg: string;
    iconColor: string;
  }
> = {
  all: {
    title: 'Todas as solicitações',
    subtitle: 'Todas as solicitações de abastecimento.',
    Icon: Users,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  analysis: {
    title: 'Pendentes',
    subtitle: 'Aguardando liberação do posto.',
    Icon: Clock,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  awaiting_refuel: {
    title: 'Liberado',
    subtitle: 'Posto definido — colaborador pode abastecer.',
    Icon: Fuel,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  CONCLUDED: {
    title: 'Concluídas',
    subtitle: 'Solicitações finalizadas.',
    Icon: CheckCircle,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  CANCELLED: {
    title: 'Canceladas',
    subtitle: 'Solicitações canceladas ou rejeitadas.',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

const SUPPLIES_STAT_CARDS: {
  filter: SuppliesCardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: keyof {
    total: number;
    analysis: number;
    awaitingRefuel: number;
    concluded: number;
    cancelled: number;
  };
}[] = [
  {
    filter: 'all',
    label: 'Todas',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: Users,
    countKey: 'total',
  },
  {
    filter: 'analysis',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
    countKey: 'analysis',
  },
  {
    filter: 'awaiting_refuel',
    label: 'Liberado',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    Icon: Fuel,
    countKey: 'awaitingRefuel',
  },
  {
    filter: 'CONCLUDED',
    label: 'Concluídas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
    countKey: 'concluded',
  },
  {
    filter: 'CANCELLED',
    label: 'Canceladas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
    countKey: 'cancelled',
  },
];

function cardFilterToApiParam(filter: SuppliesCardFilter): string | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'analysis') return 'PENDING_MANAGER,PENDING_SUPPLIES,APPROVED';
  if (filter === 'awaiting_refuel') return 'AWAITING_REFUEL';
  if (filter === 'CONCLUDED') return 'COMPLETED';
  return 'CANCELLED,REJECTED';
}

function isFuelAnalysisStatus(status: FuelRefuelStatus): boolean {
  return (
    status === 'PENDING_MANAGER' ||
    status === 'PENDING_SUPPLIES' ||
    status === 'APPROVED'
  );
}

function isFuelAwaitingRefuelStatus(status: FuelRefuelStatus): boolean {
  return status === 'AWAITING_REFUEL';
}

function isFuelSuppliesQueueStatus(status: FuelRefuelStatus): boolean {
  return isFuelAnalysisStatus(status) || isFuelAwaitingRefuelStatus(status);
}

function matchesDetailStatusFilter(status: FuelRefuelStatus, filter: DetailStatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'SUPPLIES_QUEUE') return isFuelSuppliesQueueStatus(status);
  return status === filter;
}

function fuelAbastecimentoDateKey(row: { refuelDate?: string | null; requestedAt?: string | null }): string {
  const raw = row.refuelDate || row.requestedAt;
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'yyyy-MM-dd');
}

function matchesRefuelDateFilter(
  row: { refuelDate?: string | null; requestedAt?: string | null },
  dateFrom: string,
  dateTo: string
): boolean {
  if (!dateFrom && !dateTo) return true;
  const key = fuelAbastecimentoDateKey(row);
  if (!key) return false;
  const start = dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom;
  const end = dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo;
  if (start && key < start) return false;
  if (end && key > end) return false;
  return true;
}

type FuelRefuelDeadlineUnit = 'HOURS' | 'DAYS';

type FuelAdministrativeRegion = {
  id: string;
  code: string;
  name: string;
  stateCode?: string;
};

type FuelGasStation = {
  id: string;
  displayNumber: number;
  cityCode: string;
  name: string;
  address?: string | null;
};

type FuelRefuelRequest = {
  id: string;
  displayNumber: number;
  requestedAt: string;
  refuelDate: string;
  route: string;
  satelliteCityCode?: string | null;
  administrativeRegion?: FuelAdministrativeRegion | null;
  gasStation?: FuelGasStation | null;
  refuelDeadlineAt?: string | null;
  refuelDeadlineAmount?: number | null;
  refuelDeadlineUnit?: FuelRefuelDeadlineUnit | null;
  driverName: string;
  vehiclePlate: string;
  vehicleDescription?: string | null;
  vehicleType?: FuelVehicleType | null;
  observations?: string | null;
  status: FuelRefuelStatus;
  dashboardPhotoUrl?: string | null;
  dashboardPhotoKey?: string | null;
  dashboardPhotoViewUrl?: string | null;
  dashboardPhotoName?: string | null;
  managerApprovedAt?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  suppliesApprovedAt?: string | null;
  suppliesApprovalComment?: string | null;
  releasedAmountReais?: number | null;
  suppliesRejectionReason?: string | null;
  odometerKm?: number | null;
  tankLevelAfter?: FuelTankLevelAfter | null;
  litersRefueled?: string | number | null;
  pricePerLiter?: string | number | null;
  refuelReportObservations?: string | null;
  receiptPhotoUrl?: string | null;
  receiptPhotoKey?: string | null;
  receiptPhotoViewUrl?: string | null;
  receiptPhotoName?: string | null;
  refuelReportedAt?: string | null;
  costCenter?: string | null;
  requester: { id: string; name: string; email: string };
  contract?: {
    id: string;
    name: string;
    number: string;
    costCenter?: { code?: string | null; name?: string | null } | null;
  } | null;
  managerApprover?: { id: string; name: string } | null;
  suppliesApprover?: { id: string; name: string } | null;
};

type FuelQuotaBalance = {
  ownerName: string;
  weeklyTankQuota: number | null;
  tankPriceReais: number;
  weeklyBudgetReais: number | null;
  usedReais: number;
  remainingReais: number | null;
  unlimited: boolean;
};

function formatReais(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const TANK_LEVEL_OPTIONS: Array<{ value: FuelTankLevelAfter; label: string }> = [
  { value: 'RESERVE', label: 'Reserva' },
  { value: 'QUARTER', label: '1/4 do tanque' },
  { value: 'HALF', label: '1/2 do tanque' },
  { value: 'THREE_QUARTERS', label: '3/4 do tanque' },
  { value: 'FULL', label: 'Tanque cheio' },
];

const TANK_LEVEL_LABELS: Record<FuelTankLevelAfter, string> = Object.fromEntries(
  TANK_LEVEL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<FuelTankLevelAfter, string>;

type ReportFormState = {
  odometerKm: string;
  tankLevelAfter: FuelTankLevelAfter | '';
  litersRefueled: string;
  pricePerLiter: string;
  receiptPhoto: string;
  observations: string;
};

function EMPTY_REPORT_FORM(): ReportFormState {
  return {
    odometerKm: '',
    tankLevelAfter: '',
    litersRefueled: '',
    pricePerLiter: '',
    receiptPhoto: '',
    observations: '',
  };
}

const VEHICLE_TYPE_LABELS: Record<FuelVehicleType, string> = {
  PRIVATE: 'Particular',
  COMPANY: 'Frota',
};

const STATUS_LABELS: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER: 'Aguardando aprovação',
  PENDING_SUPPLIES: 'Pendente',
  AWAITING_REFUEL: 'Liberado',
  COMPLETED: 'Concluída',
  APPROVED: 'Pendente',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  PENDING_SUPPLIES:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  AWAITING_REFUEL:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  COMPLETED:
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  APPROVED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

const ITEMS_PER_PAGE = 20;

type FuelDetailTab =
  | 'resumo'
  | 'operacao'
  | 'aprovacoes'
  | 'cancelamento'
  | 'anexos'
  | 'abastecimento';

function extractContractDisplayName(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return '';
  // Remove só prefixo de número/código (ex.: "01/2024 — …" ou "12345 - …"),
  // sem cortar o nome quando ele próprio tem hífen (ex.: "SENAC - DF").
  const numberPrefix = trimmed.match(/^(\d+\/\d+)\s*[—–-]\s*(.+)$/);
  if (numberPrefix?.[2]) return numberPrefix[2].trim();
  const codePrefix = trimmed.match(/^([\d.]+)\s*[—–-]\s*(.+)$/);
  if (codePrefix?.[2]) return codePrefix[2].trim();
  return trimmed;
}

function fuelContractLabel(row: {
  costCenter?: string | null;
  contract?: { number?: string; name?: string } | null;
}): string {
  const name = row.contract?.name?.trim();
  const number = row.contract?.number?.trim();
  if (name) return extractContractDisplayName(name);
  if (row.costCenter?.trim()) return extractContractDisplayName(row.costCenter.trim());
  if (number) return number;
  return '—';
}

function fuelContractShortName(row: {
  contract?: { number?: string; name?: string } | null;
}): string {
  return row.contract?.name?.trim() || row.contract?.number?.trim() || '';
}

function fuelRefuelTotalValue(
  liters: string | number | null | undefined,
  pricePerLiter: string | number | null | undefined,
): number | null {
  if (liters == null || pricePerLiter == null) return null;
  const litersNum = Number(liters);
  const priceNum = Number(pricePerLiter);
  if (!Number.isFinite(litersNum) || !Number.isFinite(priceNum)) return null;
  return litersNum * priceNum;
}

function formatRefuelDeadline(
  amount?: number | null,
  unit?: FuelRefuelDeadlineUnit | null,
  deadlineAt?: string | null,
): string {
  if (deadlineAt) {
    const when = format(new Date(deadlineAt), 'dd/MM/yyyy HH:mm', { locale: ptBR });
    return `Até 22:00 do dia (${when})`;
  }
  if (!amount || !unit) return '—';
  const unitLabel = unit === 'HOURS' ? (amount === 1 ? 'hora' : 'horas') : amount === 1 ? 'dia' : 'dias';
  return `${amount} ${unitLabel}`;
}

function parseSuppliesCardFilter(value: string | null): SuppliesCardFilter | null {
  if (
    value === 'all' ||
    value === 'analysis' ||
    value === 'awaiting_refuel' ||
    value === 'CONCLUDED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  return null;
}

function SolicitacoesCombustivelPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAdministrator } = usePermissions();
  const openFromUrlHandled = useRef<string | null>(null);
  const initialQ = searchParams?.get('q')?.trim() || '';
  const initialCard = parseSuppliesCardFilter(searchParams?.get('card') ?? null);
  const [searchTerm, setSearchTerm] = useState(initialQ);
  const [cardFilter, setCardFilter] = useState<SuppliesCardFilter>(
    initialCard ?? DEFAULT_CARD_FILTER,
  );
  const [detailStatusFilter, setDetailStatusFilter] = useState<DetailStatusFilter>('ALL');
  const [refuelDateFrom, setRefuelDateFrom] = useState('');
  const [refuelDateTo, setRefuelDateTo] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isQuotaConfigOpen, setIsQuotaConfigOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<FuelRefuelRequest | null>(null);
  const [detailTab, setDetailTab] = useState<FuelDetailTab>('resumo');
  const [suppliesComment, setSuppliesComment] = useState('');
  const [approveGasStationId, setApproveGasStationId] = useState('');
  const [releasedAmountInput, setReleasedAmountInput] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [reportTarget, setReportTarget] = useState<FuelRefuelRequest | null>(null);
  const [reportForm, setReportForm] = useState<ReportFormState>(EMPTY_REPORT_FORM);
  const [isReplacingReceipt, setIsReplacingReceipt] = useState(false);
  const [receiptReplacePhoto, setReceiptReplacePhoto] = useState('');
  const [actionMenu, setActionMenu] = useState<{
    requestId: string;
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

  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: ['fuel-refuel-requests-supplies', 'stats'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests');
      return (res.data?.data || []) as FuelRefuelRequest[];
    },
    enabled: !loadingUser,
    staleTime: 0,
  });

  const {
    data: listData,
    isLoading: loadingList,
    isError: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: ['fuel-refuel-requests-supplies', searchTerm, cardFilter],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests', {
        params: {
          search: searchTerm || undefined,
          status: cardFilterToApiParam(cardFilter),
        },
      });
      return (res.data?.data || []) as FuelRefuelRequest[];
    },
    enabled: !loadingUser,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: quotaBalance } = useQuery({
    queryKey: ['fuel-quota-balance', selected?.contract?.id],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/quota-balance', {
        params: { contractId: selected!.contract!.id },
      });
      return res.data?.data as FuelQuotaBalance;
    },
    enabled: Boolean(selected?.contract?.id),
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      id,
      gasStationId,
      releasedAmountReais,
    }: {
      id: string;
      gasStationId: string;
      releasedAmountReais: number;
    }) => {
      const res = await api.put(`/fuel-refuel-requests/${id}/supplies-approve`, {
        comment: suppliesComment.trim() || undefined,
        gasStationId,
        releasedAmountReais,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação atendida. O colaborador foi notificado no WhatsApp.');
      setSelected(null);
      setSuppliesComment('');
      setApproveGasStationId('');
      setReleasedAmountInput('');
      setShowRejectForm(false);
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-supplies'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-supplies-pending-count'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-quota-balance'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao aprovar solicitação');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.put(`/fuel-refuel-requests/${id}/supplies-reject`, {
        reason: rejectReason.trim(),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação rejeitada. O colaborador foi notificado na Gennecy.');
      setSelected(null);
      setRejectReason('');
      setShowRejectForm(false);
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-supplies'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-supplies-pending-count'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao rejeitar solicitação');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/fuel-refuel-requests/${id}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação cancelada');
      setSelected(null);
      setShowCancelConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-supplies'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-supplies-pending-count'] });
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Erro ao cancelar solicitação',
      );
    },
  });

  const reportMutation = useMutation({
    mutationFn: async (payload: { id: string; body: Record<string, unknown> }) => {
      const res = await api.post(`/fuel-refuel-requests/${payload.id}/report`, payload.body);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Abastecimento informado');
      setReportTarget(null);
      setReportForm(EMPTY_REPORT_FORM());
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-supplies'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-supplies-pending-count'] });
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Erro ao informar abastecimento',
      );
    },
  });

  const receiptPhotoMutation = useMutation({
    mutationFn: async ({
      id,
      receiptPhotoBase64,
    }: {
      id: string;
      receiptPhotoBase64: string;
    }) => {
      const res = await api.put(`/fuel-refuel-requests/${id}/receipt-photo`, {
        receiptPhotoBase64,
      });
      return res.data?.data as FuelRefuelRequest;
    },
    onSuccess: (updated) => {
      toast.success('Foto do cupom fiscal atualizada');
      setSelected(updated);
      setIsReplacingReceipt(false);
      setReceiptReplacePhoto('');
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests-supplies'] });
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          'Erro ao atualizar a foto do cupom',
      );
    },
  });

  const contractId = selected?.contract?.id;
  const costCenterLabel = selected?.costCenter || selected?.contract?.name || '';

  const { data: gasStations = [], isLoading: loadingGasStations } = useQuery({
    queryKey: ['fuel-gas-stations-by-contract', contractId, costCenterLabel],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/gas-stations', {
        params: {
          contractId: contractId || undefined,
          costCenter: costCenterLabel || undefined,
        },
      });
      return (res.data?.data || []) as FuelGasStation[];
    },
    enabled: Boolean(
      selected?.status === 'PENDING_SUPPLIES' && (contractId || costCenterLabel),
    ),
    staleTime: 5 * 60 * 1000,
  });

  const gasStationSelectOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      gasStations.map((station) => ({
        value: station.id,
        label: station.name,
        description: station.address?.trim() || undefined,
        searchText: [station.name, station.address, String(station.displayNumber)]
          .filter(Boolean)
          .join(' '),
      })),
    [gasStations],
  );

  const records = useMemo(
    () =>
      (listData || []).filter(
        (row) =>
          matchesDetailStatusFilter(row.status, detailStatusFilter) &&
          matchesRefuelDateFilter(row, refuelDateFrom, refuelDateTo)
      ),
    [listData, detailStatusFilter, refuelDateFrom, refuelDateTo],
  );

  const suppliesStats = useMemo(() => {
    const list = statsData || [];
    const analysis = list.filter((row) => isFuelAnalysisStatus(row.status)).length;
    const awaitingRefuel = list.filter((row) => isFuelAwaitingRefuelStatus(row.status)).length;
    const concluded = list.filter((row) => row.status === 'COMPLETED').length;
    const cancelled = list.filter(
      (row) => row.status === 'CANCELLED' || row.status === 'REJECTED',
    ).length;
    return { total: list.length, analysis, awaitingRefuel, concluded, cancelled };
  }, [statsData]);

  const listHeader = SUPPLIES_CARD_LIST_CONFIG[cardFilter];
  const showFuelValueColumns = cardFilter === 'CONCLUDED';
  const ListHeaderIcon = listHeader.Icon;

  const selectCardFilter = (filter: SuppliesCardFilter) => {
    setCardFilter(filter);
    setDetailStatusFilter('ALL');
  };
  const totalFiltered = records.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = records.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(startIndex + ITEMS_PER_PAGE, totalFiltered);
  const isListEmpty = !loadingList && !listError && totalFiltered === 0;
  const hasActiveFilter =
    detailStatusFilter !== 'ALL' || Boolean(refuelDateFrom) || Boolean(refuelDateTo);

  const requestForMenu = useMemo(() => {
    if (!actionMenu) return null;
    return records.find((r) => r.id === actionMenu.requestId) ?? null;
  }, [actionMenu, records]);

  const openRequestDetail = (
    row: FuelRefuelRequest,
    opts?: { reject?: boolean; cancel?: boolean; replaceReceipt?: boolean },
  ) => {
    setActionMenu(null);
    setSelected(row);
    setDetailTab(opts?.replaceReceipt ? 'anexos' : 'resumo');
    setShowRejectForm(!!opts?.reject);
    setShowCancelConfirm(!!opts?.cancel);
    if (!opts?.reject) setRejectReason('');
    setIsReplacingReceipt(!!opts?.replaceReceipt);
    setReceiptReplacePhoto('');
  };

  const openReportForm = (row: FuelRefuelRequest) => {
    setActionMenu(null);
    setSelected(null);
    setShowCancelConfirm(false);
    setReportForm(EMPTY_REPORT_FORM());
    setReportTarget(row);
  };

  const submitReportForm = () => {
    if (!reportTarget) return;
    const odometerKm = Number(reportForm.odometerKm.replace(/\D/g, ''));
    if (!Number.isFinite(odometerKm) || odometerKm <= 0) {
      toast.error('Informe o hodômetro em km');
      return;
    }
    if (!reportForm.tankLevelAfter) {
      toast.error('Selecione o nível do tanque');
      return;
    }
    const litersRefueled = parseFlexibleDecimal(reportForm.litersRefueled);
    if (litersRefueled == null || litersRefueled <= 0) {
      toast.error('Informe os litros abastecidos');
      return;
    }
    if (litersRefueled > FUEL_LITERS_MAX) {
      toast.error(`Litros inválidos (máximo ${FUEL_LITERS_MAX} L). Use ponto ou vírgula como decimal.`);
      return;
    }
    const pricePerLiter = parseFlexibleDecimal(reportForm.pricePerLiter);
    if (pricePerLiter == null || pricePerLiter <= 0) {
      toast.error('Informe o valor por litro');
      return;
    }
    if (isBlankVehiclePhoto(reportForm.receiptPhoto)) {
      toast.error('Envie a foto do cupom fiscal');
      return;
    }

    reportMutation.mutate({
      id: reportTarget.id,
      body: {
        odometerKm,
        tankLevelAfter: reportForm.tankLevelAfter,
        litersRefueled,
        pricePerLiter,
        receiptPhotoBase64: reportForm.receiptPhoto,
        observations: reportForm.observations.trim() || undefined,
      },
    });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, cardFilter, detailStatusFilter, refuelDateFrom, refuelDateTo]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (actionMenu && !requestForMenu) {
      setActionMenu(null);
    }
  }, [actionMenu, requestForMenu]);

  useEffect(() => {
    const q = searchParams?.get('q')?.trim() || '';
    const card = parseSuppliesCardFilter(searchParams?.get('card') ?? null);
    if (q && q !== searchTerm) setSearchTerm(q);
    if (card && card !== cardFilter) setCardFilter(card);
    // Só sincroniza quando a URL muda (drill-down das análises).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional: reagir a searchParams
  }, [searchParams]);

  useEffect(() => {
    const openId = searchParams?.get('open')?.trim();
    if (!openId || loadingList) return;
    if (openFromUrlHandled.current === openId) return;
    const row = records.find((r) => r.id === openId);
    if (!row) return;
    openFromUrlHandled.current = openId;
    openRequestDetail(row);
    const next = new URLSearchParams(searchParams?.toString() || '');
    next.delete('open');
    const qs = next.toString();
    router.replace(
      qs ? `/ponto/solicitacoes-combustivel?${qs}` : '/ponto/solicitacoes-combustivel',
      { scroll: false },
    );
  }, [loadingList, records, searchParams, router]);

  useEffect(() => {
    if (selected?.status === 'PENDING_SUPPLIES') {
      setApproveGasStationId('');
      setSuppliesComment('');
      setReleasedAmountInput('');
    }
  }, [selected?.id, selected?.status]);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/solicitacoes-combustivel">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/solicitacoes-combustivel">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="relative flex flex-col items-center gap-3 sm:block">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                Fila de Abastecimento
              </h1>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                Acompanhe e atenda as solicitações de combustível.
              </p>
            </div>
            <div className="flex items-center gap-1 sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2">
              {isAdministrator ? (
              <button
                type="button"
                onClick={() => setIsQuotaConfigOpen(true)}
                aria-label="Configurar cotas"
                title="Configurar cotas"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
              >
                <Settings className="h-5 w-5" />
              </button>
              ) : null}
              <button
                type="button"
                onClick={() => router.push('/ponto/solicitacoes-combustivel/analises')}
                aria-label="Análises"
                title="Análises"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
              >
                <BarChart3 className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {SUPPLIES_STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={suppliesStats[card.countKey]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={cardFilter === card.filter}
                loading={loadingStats}
                onClick={() => selectCardFilter(card.filter)}
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
                  <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      placeholder="Buscar por ID, rota, condutor, placa, contrato..."
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
                    title={hasActiveFilter ? 'Filtro ativo' : 'Filtro'}
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
                <CadastroListLoading message="Carregando solicitações..." />
              ) : listError ? (
                <div className="py-8 text-center">
                  <p className="text-gray-600 dark:text-gray-400">
                    Não foi possível carregar as solicitações.
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetchList()}
                    className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : isListEmpty ? (
                <CadastroListEmpty
                  icon={ListHeaderIcon}
                  title="Nenhuma solicitação encontrada"
                  hint={
                    cardFilter === 'all' || cardFilter === 'analysis'
                      ? 'Colaboradores podem solicitar em Abastecimento ou via Conversas → Gennecy → opção 1'
                      : undefined
                  }
                />
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                      {totalFiltered === 1 ? 'solicitação' : 'solicitações'}
                    </span>
                    <span>
                      Página {currentPage} de {totalPages}
                    </span>
                  </div>
                  <div className={cadastroListClasses.tableScroll}>
                    <table
                      className={`${cadastroListClasses.table} table-fixed${
                        showFuelValueColumns ? ' min-w-[64rem]' : ' min-w-[50rem]'
                      }`}
                    >
                      <colgroup>
                        {showFuelValueColumns ? (
                          <>
                            <col className="w-[5%]" />
                            <col className="w-[15%]" />
                            <col className="w-[9%]" />
                            <col className="w-[13%]" />
                            <col className="w-[10%]" />
                            <col className="w-[6%]" />
                            <col className="w-[7%]" />
                            <col className="w-[8%]" />
                            <col className="w-[8%]" />
                            <col className="w-[11rem]" />
                            <col className="w-14" />
                          </>
                        ) : (
                          <>
                            <col className="w-[5%]" />
                            <col className="w-[20%]" />
                            <col className="w-[11%]" />
                            <col className="w-[17%]" />
                            <col className="w-[16%]" />
                            <col className="w-[8%]" />
                            <col className="w-[11rem]" />
                            <col className="w-14" />
                          </>
                        )}
                      </colgroup>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={`${cadastroListClasses.th} whitespace-nowrap`}>ID</th>
                          <th className={cadastroListClasses.th}>Solicitante</th>
                          <th className={`${cadastroListClasses.thCenter} whitespace-nowrap`}>Data abast.</th>
                          <th className={cadastroListClasses.thCenter}>Contrato</th>
                          <th className={cadastroListClasses.thCenter}>Veículo</th>
                          <th className={`${cadastroListClasses.thCenter} whitespace-nowrap`}>Tipo</th>
                          {showFuelValueColumns ? (
                            <>
                              <th className={`${cadastroListClasses.thCenter} whitespace-nowrap`}>
                                Litros
                              </th>
                              <th className={`${cadastroListClasses.thNumeric} whitespace-nowrap`}>
                                Valor por litro
                              </th>
                              <th className={`${cadastroListClasses.thNumeric} whitespace-nowrap`}>
                                Valor total
                              </th>
                            </>
                          ) : null}
                          <th className="w-[11rem] min-w-[11rem] max-w-[11rem] px-2 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-3 sm:py-4">
                            Status
                          </th>
                          <th className={listTableRowClasses.actionTh}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginatedRows.map((row) => {
                          const totalValue = fuelRefuelTotalValue(
                            row.litersRefueled,
                            row.pricePerLiter,
                          );
                          return (
                          <tr
                            key={row.id}
                            onClick={() => openRequestDetail(row)}
                            className={getListTableRowClassName(true)}
                          >
                            <td className={cadastroListClasses.tdMono}>
                              <ListRowNavigableLabel className="font-medium">
                                {row.displayNumber}
                              </ListRowNavigableLabel>
                            </td>
                            <td className={`${cadastroListClasses.tdTruncate} overflow-hidden`}>
                              <p className="truncate" title={row.requester.name}>
                                {row.requester.name}
                              </p>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <div className="leading-snug">
                                <p>
                                  {format(new Date(row.requestedAt || row.refuelDate), 'dd/MM/yyyy', {
                                    locale: ptBR,
                                  })}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {format(new Date(row.requestedAt || row.refuelDate), 'HH:mm', {
                                    locale: ptBR,
                                  })}
                                </p>
                              </div>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {fuelContractLabel(row)}
                            </td>
                            <td className={`${cadastroListClasses.tdCenter} min-w-0`}>
                              <div className="mx-auto min-w-0 max-w-full leading-snug">
                                <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                                  {row.vehiclePlate}
                                </p>
                                {row.vehicleDescription?.trim() ? (
                                  <p
                                    className="truncate text-xs text-gray-500 dark:text-gray-400"
                                    title={row.vehicleDescription}
                                  >
                                    {row.vehicleDescription.trim()}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {row.vehicleType
                                ? VEHICLE_TYPE_LABELS[row.vehicleType]
                                : '—'}
                            </td>
                            {showFuelValueColumns ? (
                              <>
                                <td className={cadastroListClasses.tdCenter}>
                                  {row.litersRefueled != null
                                    ? Number(row.litersRefueled).toLocaleString('pt-BR', {
                                        minimumFractionDigits: 3,
                                        maximumFractionDigits: 3,
                                      })
                                    : '—'}
                                </td>
                                <td className={cadastroListClasses.tdNumeric}>
                                  {row.pricePerLiter != null
                                    ? Number(row.pricePerLiter).toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      })
                                    : '—'}
                                </td>
                                <td className={`${cadastroListClasses.tdNumeric} font-medium text-gray-900 dark:text-gray-100`}>
                                  {totalValue != null
                                    ? totalValue.toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      })
                                    : '—'}
                                </td>
                              </>
                            ) : null}
                            <td className="w-[11rem] min-w-[11rem] max-w-[11rem] whitespace-nowrap px-2 py-3 text-center text-sm sm:px-3 sm:py-4">
                              <div className="flex w-full items-center justify-center">
                                <span
                                  className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[row.status]}`}
                                >
                                  {STATUS_LABELS[row.status]}
                                </span>
                              </div>
                            </td>
                            <td
                              className={listTableRowClasses.actionTd}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setActionMenu((prev) => {
                                      if (prev?.requestId === row.id) return null;
                                      let left = rect.right - FUEL_SUPPLIES_ACTION_MENU_WIDTH_PX;
                                      left = Math.max(
                                        8,
                                        Math.min(
                                          left,
                                          window.innerWidth - FUEL_SUPPLIES_ACTION_MENU_WIDTH_PX - 8,
                                        ),
                                      );
                                      return { requestId: row.id, top: rect.bottom + 4, left };
                                    });
                                  }}
                                  className={rowActionMenuButtonClass(actionMenu?.requestId === row.id)}
                                  aria-label="Menu de ações"
                                  aria-expanded={actionMenu?.requestId === row.id}
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
                  <ListPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <ActionMenuOverlay
          open={!!actionMenu && !!requestForMenu}
          onClose={() => setActionMenu(null)}
          top={actionMenu?.top ?? 0}
          left={actionMenu?.left ?? 0}
        >
          {requestForMenu ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => openRequestDetail(requestForMenu)}
                className={MENU_ITEM_CLASS}
              >
                <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>Ver detalhes</span>
              </button>
              {requestForMenu.status === 'PENDING_SUPPLIES' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openRequestDetail(requestForMenu)}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Atender solicitação</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openRequestDetail(requestForMenu, { reject: true })}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Rejeitar</span>
                  </button>
                </>
              ) : null}
              {requestForMenu.status === 'COMPLETED' ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openRequestDetail(requestForMenu, { replaceReceipt: true })}
                  className={MENU_ITEM_BORDER_CLASS}
                >
                  <Pencil className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>Alterar foto do cupom</span>
                </button>
              ) : null}
              {requestForMenu.status === 'AWAITING_REFUEL' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openReportForm(requestForMenu)}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Informar abastecimento</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openRequestDetail(requestForMenu, { cancel: true })}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Cancelar</span>
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </ActionMenuOverlay>

        <Modal
          isOpen={!!selected}
          onClose={() => {
            setSelected(null);
            setDetailTab('resumo');
            setSuppliesComment('');
            setApproveGasStationId('');
            setReleasedAmountInput('');
            setRejectReason('');
            setShowRejectForm(false);
            setShowCancelConfirm(false);
            setIsReplacingReceipt(false);
            setReceiptReplacePhoto('');
          }}
          title={`Solicitação #${selected?.displayNumber ?? ''}`}
          size="lg"
          headerClassName="!border-b-0 !pb-2"
          contentClassName="!pt-0"
        >
          {selected && (() => {
            const hasPanelPhoto = hasFuelStoredPhoto(
              selected.dashboardPhotoUrl,
              selected.dashboardPhotoKey,
            );
            const hasReceiptPhoto = hasFuelStoredPhoto(
              selected.receiptPhotoUrl,
              selected.receiptPhotoKey,
            );
            const showAnexosTab =
              hasPanelPhoto || hasReceiptPhoto || selected.status === 'COMPLETED';
            const showAbastecimentoTab = selected.status === 'COMPLETED';
            const isCancelled =
              selected.status === 'CANCELLED' || selected.status === 'REJECTED';
            const detailTabs: DetailInfoTabItem<FuelDetailTab>[] = [
              { id: 'resumo', label: 'Resumo' },
              { id: 'operacao', label: 'Operação' },
              ...(isCancelled
                ? [{ id: 'cancelamento' as const, label: 'Cancelamento' }]
                : [{ id: 'aprovacoes' as const, label: 'Aprovações' }]),
              ...(showAbastecimentoTab
                ? [{ id: 'abastecimento' as const, label: 'Abastecimento' }]
                : []),
              ...(showAnexosTab ? [{ id: 'anexos' as const, label: 'Anexos' }] : []),
            ];
            const activeTab = detailTabs.some((t) => t.id === detailTab)
              ? detailTab
              : 'resumo';

            const resumoFields: DetailInfoField[] = [
              {
                label: 'Status',
                value: (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[selected.status]}`}
                  >
                    {STATUS_LABELS[selected.status]}
                  </span>
                ),
              },
              { label: 'Solicitante', value: selected.requester.name },
              {
                label: 'Solicitado em',
                value: format(new Date(selected.requestedAt), 'dd/MM/yyyy HH:mm', {
                  locale: ptBR,
                }),
              },
              {
                label: 'Data para abastecer',
                value: format(new Date(selected.refuelDate), 'dd/MM/yyyy', { locale: ptBR }),
              },
              { label: 'Rota', value: selected.route },
              {
                label: 'Região administrativa',
                value: selected.administrativeRegion
                  ? `${selected.administrativeRegion.name}${
                      selected.administrativeRegion.stateCode
                        ? ` (${selected.administrativeRegion.stateCode})`
                        : ''
                    }`
                  : '—',
              },
            ];
            if (selected.refuelDeadlineAt || selected.refuelDeadlineAmount) {
              resumoFields.push({
                label: 'Prazo para abastecer',
                value: formatRefuelDeadline(
                  selected.refuelDeadlineAmount,
                  selected.refuelDeadlineUnit,
                  selected.refuelDeadlineAt,
                ),
              });
            }
            if (selected.gasStation) {
              resumoFields.push({
                label: 'Posto liberado',
                value: `${selected.gasStation.name}${
                  selected.gasStation.address ? ` — ${selected.gasStation.address}` : ''
                }`,
                stacked: true,
              });
            }
            if (selected.observations?.trim()) {
              resumoFields.push({
                label: 'Observações',
                value: (
                  <span className="whitespace-pre-wrap leading-relaxed">
                    {selected.observations}
                  </span>
                ),
                stacked: true,
              });
            }

            const operacaoFields: DetailInfoField[] = [
              {
                label: 'Contrato',
                value: fuelContractLabel(selected),
              },
              { label: 'Condutor', value: selected.driverName },
              {
                label: 'Veículo',
                value: `${selected.vehiclePlate}${
                  selected.vehicleDescription ? ` — ${selected.vehicleDescription}` : ''
                }`,
              },
            ];
            if (selected.vehicleType) {
              operacaoFields.push({
                label: 'Tipo',
                value: VEHICLE_TYPE_LABELS[selected.vehicleType],
              });
            }

            const gestorQuando = selected.managerApprovedAt
              ? ` — ${format(new Date(selected.managerApprovedAt), 'dd/MM/yyyy HH:mm', {
                  locale: ptBR,
                })}`
              : '';
            const gestorNome = selected.managerApprover?.name?.trim() || '';
            const gestorAprovacaoValue =
              selected.status === 'PENDING_MANAGER'
                ? 'Aguardando aprovação'
                : selected.status === 'REJECTED' ||
                    (selected.status === 'CANCELLED' && !!selected.managerRejectionReason)
                  ? gestorNome
                    ? `Cancelada por ${gestorNome}${gestorQuando}`
                    : 'Cancelada pelo gestor'
                  : selected.status === 'CANCELLED'
                    ? '—'
                    : gestorNome
                      ? `${gestorNome}${gestorQuando}`
                      : '—';

            const liberacaoValue = selected.suppliesRejectionReason
              ? selected.suppliesApprover?.name
                ? `Cancelada por ${selected.suppliesApprover.name}${
                    selected.suppliesApprovedAt
                      ? ` — ${format(new Date(selected.suppliesApprovedAt), 'dd/MM/yyyy HH:mm', {
                          locale: ptBR,
                        })}`
                      : ''
                  }`
                : 'Cancelada pelo Suprimentos'
              : selected.suppliesApprover
                ? `${selected.suppliesApprover.name}${
                    selected.suppliesApprovedAt
                      ? ` — ${format(new Date(selected.suppliesApprovedAt), 'dd/MM/yyyy HH:mm', {
                          locale: ptBR,
                        })}`
                      : ''
                  }${
                    selected.releasedAmountReais != null
                      ? ` · ${formatReais(Number(selected.releasedAmountReais))}`
                      : ''
                  }`
                : selected.status === 'PENDING_SUPPLIES' || selected.status === 'APPROVED'
                  ? 'Aguardando liberação do Suprimentos'
                  : selected.status === 'PENDING_MANAGER'
                    ? 'Aguardando aprovação do gestor'
                    : selected.status === 'CANCELLED' || selected.status === 'REJECTED'
                      ? '—'
                      : '—';

            const aprovacaoFields: DetailInfoField[] = [
              {
                label: 'Aprovação do gestor',
                value: gestorAprovacaoValue,
              },
              {
                label: 'Liberação do posto',
                value: liberacaoValue,
              },
            ];

            const canceladoPorGestor =
              selected.status === 'REJECTED' ||
              (selected.status === 'CANCELLED' && !!selected.managerRejectionReason?.trim());
            const canceladoPorSuprimentos = !!selected.suppliesRejectionReason?.trim();
            const autoCancelMatch =
              selected.suppliesApprovalComment?.match(
                /\[Cancelamento automático\]\s*([\s\S]+)$/i,
              ) ?? null;
            const cancelamentoMotivo =
              selected.managerRejectionReason?.trim() ||
              selected.suppliesRejectionReason?.trim() ||
              autoCancelMatch?.[1]?.trim() ||
              '';
            const cancelamentoQuandoRaw = canceladoPorGestor
              ? selected.managerApprovedAt
              : canceladoPorSuprimentos
                ? selected.suppliesApprovedAt
                : null;
            const cancelamentoPor = canceladoPorGestor
              ? selected.managerApprover?.name?.trim() || 'Gestor'
              : canceladoPorSuprimentos
                ? selected.suppliesApprover?.name?.trim() || 'Suprimentos'
                : autoCancelMatch
                  ? 'Sistema'
                  : selected.status === 'CANCELLED' && selected.suppliesApprover
                    ? selected.suppliesApprover.name?.trim() || 'Suprimentos'
                    : selected.status === 'CANCELLED'
                      ? selected.requester?.name?.trim() || 'Solicitante'
                      : '—';
            const cancelamentoFields: DetailInfoField[] = [
              {
                label: 'Status',
                value: (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[selected.status]}`}
                  >
                    {STATUS_LABELS[selected.status]}
                  </span>
                ),
              },
              { label: 'Cancelado por', value: cancelamentoPor },
              {
                label: 'Data',
                value: cancelamentoQuandoRaw
                  ? format(new Date(cancelamentoQuandoRaw), 'dd/MM/yyyy HH:mm', {
                      locale: ptBR,
                    })
                  : '—',
              },
            ];
            if (cancelamentoMotivo) {
              cancelamentoFields.push({
                label: 'Motivo',
                value: (
                  <span className="whitespace-pre-wrap leading-relaxed">
                    {cancelamentoMotivo}
                  </span>
                ),
                stacked: true,
              });
            }

            const abastecimentoFields: DetailInfoField[] = [];
            if (selected.odometerKm != null) {
              abastecimentoFields.push({
                label: 'Hodômetro',
                value: `${selected.odometerKm.toLocaleString('pt-BR')} km`,
              });
            }
            if (selected.tankLevelAfter) {
              abastecimentoFields.push({
                label: 'Tanque após abastecimento',
                value: TANK_LEVEL_LABELS[selected.tankLevelAfter],
              });
            }
            if (selected.litersRefueled != null) {
              abastecimentoFields.push({
                label: 'Litros',
                value: Number(selected.litersRefueled).toLocaleString('pt-BR', {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3,
                }),
              });
            }
            if (selected.pricePerLiter != null) {
              abastecimentoFields.push({
                label: 'Valor por litro',
                value: Number(selected.pricePerLiter).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                }),
              });
            }
            const totalAbastecimento = fuelRefuelTotalValue(
              selected.litersRefueled,
              selected.pricePerLiter,
            );
            if (totalAbastecimento != null) {
              abastecimentoFields.push({
                label: 'Valor total',
                value: (
                  <span className="font-semibold">
                    {totalAbastecimento.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                ),
              });
            }
            if (selected.refuelReportObservations?.trim()) {
              abastecimentoFields.push({
                label: 'Observações do abastecimento',
                value: (
                  <span className="whitespace-pre-wrap leading-relaxed">
                    {selected.refuelReportObservations}
                  </span>
                ),
                stacked: true,
              });
            }

            const panelPhotoUrl = hasPanelPhoto
              ? resolveFuelPhotoSrc(selected.dashboardPhotoViewUrl, selected.dashboardPhotoUrl)
              : null;
            const receiptPhotoUrl = hasReceiptPhoto
              ? resolveFuelPhotoSrc(selected.receiptPhotoViewUrl, selected.receiptPhotoUrl)
              : null;

            return (
            <div className="space-y-4">
              <div className="-mx-6">
                <DetailInfoTabs
                  tabs={detailTabs}
                  active={activeTab}
                  onChange={setDetailTab}
                  ariaLabel="Seções da solicitação"
                  className="px-6"
                />
              </div>

              <div className="text-sm">
                {activeTab === 'resumo' ? <DetailInfoRows fields={resumoFields} /> : null}

                {activeTab === 'operacao' ? (
                  <DetailInfoRows fields={operacaoFields} />
                ) : null}

                {activeTab === 'aprovacoes' ? (
                  <div>
                    <DetailInfoRows fields={aprovacaoFields} />
                    {selected.managerApprovalComment ? (
                      <div className="border-t border-gray-200 dark:border-gray-700">
                        <DetailInfoNote title="Parecer do gestor">
                          {selected.managerApprovalComment}
                        </DetailInfoNote>
                      </div>
                    ) : null}
                    {selected.suppliesApprovalComment ? (
                      <div className="border-t border-gray-200 dark:border-gray-700">
                        <DetailInfoNote title="Parecer do Suprimentos">
                          {selected.suppliesApprovalComment}
                        </DetailInfoNote>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activeTab === 'cancelamento' ? (
                  <DetailInfoRows fields={cancelamentoFields} />
                ) : null}

                {activeTab === 'abastecimento' ? (
                  <DetailInfoRows fields={abastecimentoFields} />
                ) : null}

                {activeTab === 'anexos' ? (
                  <div className="py-1">
                    {isReplacingReceipt ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Cupom fiscal
                        </p>
                        <VehicleReturnPhotoField
                          value={receiptReplacePhoto}
                          onChange={setReceiptReplacePhoto}
                          emptyLabel="Clique para enviar o novo cupom fiscal"
                          photoAlt="Novo cupom fiscal"
                          disabled={receiptPhotoMutation.isPending}
                        />
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={receiptPhotoMutation.isPending}
                            onClick={() => {
                              setIsReplacingReceipt(false);
                              setReceiptReplacePhoto('');
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            loading={receiptPhotoMutation.isPending}
                            disabled={receiptPhotoMutation.isPending}
                            onClick={() => {
                              if (isBlankVehiclePhoto(receiptReplacePhoto)) {
                                toast.error('Envie a nova foto do cupom fiscal');
                                return;
                              }
                              receiptPhotoMutation.mutate({
                                id: selected.id,
                                receiptPhotoBase64: receiptReplacePhoto,
                              });
                            }}
                          >
                            Salvar foto
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                          {panelPhotoUrl ? (
                            <FuelRequestPhoto
                              src={panelPhotoUrl}
                              alt={selected.dashboardPhotoName || 'Painel'}
                              label="Foto do painel"
                              fileName={selected.dashboardPhotoName}
                            />
                          ) : null}

                          {selected.status === 'COMPLETED' || hasReceiptPhoto ? (
                            receiptPhotoUrl ? (
                              <FuelRequestPhoto
                                src={receiptPhotoUrl}
                                alt={selected.receiptPhotoName || 'Cupom fiscal'}
                                label="Cupom fiscal"
                                fileName={selected.receiptPhotoName}
                                labelAction={
                                  <button
                                    type="button"
                                    className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                    title={hasReceiptPhoto ? 'Alterar foto' : 'Adicionar foto'}
                                    aria-label={hasReceiptPhoto ? 'Alterar foto' : 'Adicionar foto'}
                                    onClick={() => {
                                      setReceiptReplacePhoto('');
                                      setIsReplacingReceipt(true);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                }
                              />
                            ) : (
                              <div>
                                <div className="mb-2 flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                    Cupom fiscal
                                  </span>
                                  <button
                                    type="button"
                                    className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                    title="Adicionar foto"
                                    aria-label="Adicionar foto"
                                    onClick={() => {
                                      setReceiptReplacePhoto('');
                                      setIsReplacingReceipt(true);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  Nenhuma foto de cupom cadastrada.
                                </p>
                              </div>
                            )
                          ) : null}
                        </div>

                        {!panelPhotoUrl &&
                        !(selected.status === 'COMPLETED' || hasReceiptPhoto) ? (
                          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            Nenhum anexo disponível.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              {selected.status === 'AWAITING_REFUEL' ? (
                !showCancelConfirm ? (
                  <DetailInfoActions>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={cancelMutation.isPending || reportMutation.isPending}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      onClick={() => openReportForm(selected)}
                      disabled={cancelMutation.isPending || reportMutation.isPending}
                    >
                      Informar abastecimento
                    </Button>
                  </DetailInfoActions>
                ) : (
                  <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Cancelar esta solicitação liberada? O colaborador não poderá mais
                      abastecer neste posto.
                    </p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCancelConfirm(false)}
                        disabled={cancelMutation.isPending}
                      >
                        Voltar
                      </Button>
                      <Button
                        type="button"
                        variant="error"
                        onClick={() => cancelMutation.mutate(selected.id)}
                        disabled={cancelMutation.isPending}
                      >
                        {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
                      </Button>
                    </div>
                  </div>
                )
              ) : null}

              {selected.status === 'PENDING_SUPPLIES' ? (
                <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  {!showRejectForm ? (
                    <>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Libere o abastecimento informando o valor, um posto do contrato da
                        solicitação e o prazo para o solicitante ir ao posto.
                      </p>
                      {quotaBalance ? (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800/60">
                          {quotaBalance.unlimited ? (
                            <p className="text-gray-700 dark:text-gray-300">
                              Cota semanal de {quotaBalance.ownerName}: sem limite configurado.
                            </p>
                          ) : (
                            <div className="space-y-1 text-gray-700 dark:text-gray-300">
                              <p>
                                Cota semanal de {quotaBalance.ownerName}:{' '}
                                <span className="font-medium">
                                  {formatReais(quotaBalance.weeklyBudgetReais)}
                                </span>
                              </p>
                              <p>Já usado nesta semana: {formatReais(quotaBalance.usedReais)}</p>
                              <p>
                                Restante:{' '}
                                <span
                                  className={
                                    (quotaBalance.remainingReais ?? 0) < 0
                                      ? 'font-medium text-red-600 dark:text-red-400'
                                      : 'font-medium'
                                  }
                                >
                                  {formatReais(quotaBalance.remainingReais)}
                                </span>
                              </p>
                              {parseCurrencyInputBr(releasedAmountInput) ? (
                                <p>
                                  Depois desta liberação:{' '}
                                  <span
                                    className={
                                      (quotaBalance.remainingReais ?? 0) -
                                        (parseCurrencyInputBr(releasedAmountInput) || 0) <
                                      0
                                        ? 'font-medium text-red-600 dark:text-red-400'
                                        : 'font-medium'
                                    }
                                  >
                                    {formatReais(
                                      (quotaBalance.remainingReais ?? 0) -
                                        (parseCurrencyInputBr(releasedAmountInput) || 0)
                                    )}
                                  </span>
                                </p>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : null}
                      <Input
                        label="Valor a liberar (R$) *"
                        inputMode="numeric"
                        value={releasedAmountInput}
                        onChange={(e) =>
                          setReleasedAmountInput(maskCurrencyInputBrOrEmpty(e.target.value))
                        }
                        placeholder="R$ 0,00"
                      />
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Posto para abastecimento *
                        </label>
                        <SingleSelectSearchDropdown
                          value={approveGasStationId}
                          onChange={setApproveGasStationId}
                          options={gasStationSelectOptions}
                          disabled={
                            loadingGasStations ||
                            approveMutation.isPending ||
                            (!contractId && !costCenterLabel)
                          }
                          allowEmpty={false}
                          placeholder={
                            !contractId && !costCenterLabel
                              ? 'Solicitação sem contrato'
                              : loadingGasStations
                                ? 'Carregando postos...'
                                : 'Selecionar posto do contrato...'
                          }
                          searchPlaceholder="Pesquisar posto..."
                          emptyOptionsMessage={
                            fuelContractShortName(selected)
                              ? `Nenhum posto vinculado ao contrato ${fuelContractShortName(selected)}. Vincule em Cadastros > Postos de Combustível.`
                              : 'Nenhum posto vinculado a este contrato.'
                          }
                          noFocusRing
                        />
                      </div>
                      <Input
                        label="Observação"
                        value={suppliesComment}
                        onChange={(e) => setSuppliesComment(e.target.value)}
                        placeholder="Mensagem enviada ao colaborador no WhatsApp"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowRejectForm(true)}
                          disabled={approveMutation.isPending}
                        >
                          Rejeitar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            const releasedAmountReais = parseCurrencyInputBr(releasedAmountInput);
                            if (!releasedAmountReais || releasedAmountReais <= 0) {
                              return toast.error('Informe o valor que será liberado');
                            }
                            if (!approveGasStationId) {
                              return toast.error('Selecione o posto para abastecimento');
                            }
                            approveMutation.mutate({
                              id: selected.id,
                              gasStationId: approveGasStationId,
                              releasedAmountReais,
                            });
                          }}
                          disabled={
                            approveMutation.isPending ||
                            !approveGasStationId ||
                            !releasedAmountInput.trim()
                          }
                        >
                          {approveMutation.isPending ? 'Atendendo...' : 'Atender solicitação'}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Input
                        label="Motivo da rejeição"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Informe o motivo"
                        required
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowRejectForm(false)}
                          disabled={rejectMutation.isPending}
                        >
                          Voltar
                        </Button>
                        <Button
                          type="button"
                          variant="error"
                          onClick={() => rejectMutation.mutate(selected.id)}
                          disabled={rejectMutation.isPending || !rejectReason.trim()}
                        >
                          {rejectMutation.isPending ? 'Rejeitando...' : 'Confirmar rejeição'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            );
          })()}
        </Modal>

        <Modal
          isOpen={Boolean(reportTarget)}
          onClose={() => {
            if (reportMutation.isPending) return;
            setReportTarget(null);
          }}
          title={
            reportTarget
              ? `Informar abastecimento — #${reportTarget.displayNumber}`
              : 'Informar abastecimento'
          }
          size="lg"
        >
          {reportTarget ? (
            <div className="space-y-5">
              <section className="space-y-2 text-sm">
                <p className="text-gray-600 dark:text-gray-400">
                  Informando em nome de{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {reportTarget.requester.name}
                  </span>
                  .
                </p>
                {reportTarget.gasStation ? (
                  <p className="text-gray-900 dark:text-gray-100">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Posto:</span>{' '}
                    {reportTarget.gasStation.name}
                    {reportTarget.gasStation.address
                      ? ` — ${reportTarget.gasStation.address}`
                      : ''}
                  </p>
                ) : null}
                {reportTarget.refuelDeadlineAt || reportTarget.refuelDeadlineAmount ? (
                  <p className="text-gray-900 dark:text-gray-100">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Prazo:</span>{' '}
                    {formatRefuelDeadline(
                      reportTarget.refuelDeadlineAmount,
                      reportTarget.refuelDeadlineUnit,
                      reportTarget.refuelDeadlineAt,
                    )}
                  </p>
                ) : null}
                <p className="text-gray-600 dark:text-gray-400">
                  {reportTarget.vehiclePlate} · {reportTarget.route}
                </p>
              </section>

              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <h4 className="mb-4 border-b border-gray-200 pb-3 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-50">
                  Dados do abastecimento
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Hodômetro (km) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={reportForm.odometerKm}
                      onChange={(e) =>
                        setReportForm((f) => ({
                          ...f,
                          odometerKm: e.target.value.replace(/\D/g, ''),
                        }))
                      }
                      className={FORM_FIELD_INPUT_CLS}
                      placeholder="Ex.: 45230"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Tanque após abastecimento *
                    </label>
                    <SingleSelectSearchDropdown
                      value={reportForm.tankLevelAfter}
                      onChange={(tankLevelAfter) =>
                        setReportForm((f) => ({
                          ...f,
                          tankLevelAfter: tankLevelAfter as FuelTankLevelAfter | '',
                        }))
                      }
                      options={TANK_LEVEL_OPTIONS.map((opt) => ({
                        value: opt.value,
                        label: opt.label,
                      }))}
                      placeholder="Selecione…"
                      allowEmpty={false}
                      disableSearch
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Litros abastecidos *
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={reportForm.litersRefueled}
                      onChange={(e) =>
                        setReportForm((f) => ({ ...f, litersRefueled: e.target.value }))
                      }
                      className={FORM_FIELD_INPUT_CLS}
                      placeholder="Ex.: 45,500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Valor por litro (R$) *
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={reportForm.pricePerLiter}
                      onChange={(e) =>
                        setReportForm((f) => ({ ...f, pricePerLiter: e.target.value }))
                      }
                      className={FORM_FIELD_INPUT_CLS}
                      placeholder="Ex.: 5,89"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <h4 className="mb-4 border-b border-gray-200 pb-3 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-50">
                  Cupom e observações
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Foto do cupom fiscal *
                    </label>
                    <VehicleReturnPhotoField
                      value={reportForm.receiptPhoto}
                      onChange={(receiptPhoto) => setReportForm((f) => ({ ...f, receiptPhoto }))}
                      emptyLabel="Clique para enviar o cupom fiscal"
                      photoAlt="Cupom fiscal"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Observações
                    </label>
                    <textarea
                      value={reportForm.observations}
                      onChange={(e) =>
                        setReportForm((f) => ({ ...f, observations: e.target.value }))
                      }
                      className={FORM_FIELD_TEXTAREA_CLS}
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button
                  type="button"
                  variant="outline"
                  disabled={reportMutation.isPending}
                  onClick={() => setReportTarget(null)}
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  disabled={reportMutation.isPending}
                  onClick={submitReportForm}
                >
                  {reportMutation.isPending ? 'Enviando…' : 'Confirmar abastecimento'}
                </Button>
              </div>
            </div>
          ) : null}
        </Modal>

        {isAdministrator ? (
        <FuelQuotaConfigModal
          isOpen={isQuotaConfigOpen}
          onClose={() => setIsQuotaConfigOpen(false)}
        />
        ) : null}

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — Fila de Abastecimento"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Status
              </label>
              <StringSingleSelectDropdown
                value={detailStatusFilter}
                onChange={(value) => setDetailStatusFilter(value as DetailStatusFilter)}
                options={DETAIL_STATUS_FILTER_OPTIONS}
                allowEmpty={false}
                className="w-full"
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Data de abastecimento
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    De
                  </label>
                  <DatePickerField
                    value={refuelDateFrom}
                    onChange={setRefuelDateFrom}
                    noFocusRing
                    aria-label="Data de abastecimento de"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Até
                  </label>
                  <DatePickerField
                    value={refuelDateTo}
                    onChange={setRefuelDateTo}
                    noFocusRing
                    aria-label="Data de abastecimento até"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              {hasActiveFilter ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDetailStatusFilter('ALL');
                    setRefuelDateFrom('');
                    setRefuelDateTo('');
                  }}
                >
                  Limpar
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setIsFiltersOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

/** Next.js exige Suspense em volta de `useSearchParams` na geração estática. */
export default function SolicitacoesCombustivelPage() {
  return (
    <Suspense fallback={<Loading message="Carregando..." fullScreen size="lg" />}>
      <SolicitacoesCombustivelPageContent />
    </Suspense>
  );
}

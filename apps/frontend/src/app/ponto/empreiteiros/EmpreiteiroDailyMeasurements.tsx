'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Camera,
  Eye,
  FileText,
  ImageIcon,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  APPROVAL_STATUS_COLUMN_TITLE,
  ApprovalStatusBadge,
  type ApprovalStatusKind,
} from '@/app/ponto/aprovacoes/_components/ApprovalStatusBadge';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { DatePickerField } from '@/components/ui/DatePickerField';
import {
  ListRowNavigableLabel,
  getListTableRowClassName,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import {
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import { TeamLivePhotoCapture, LiveGeoPhotosField, type TeamGeoPhoto } from './TeamLivePhotoCapture';

export type DailyMeasurementStatus = 'SUBMITTED' | 'APPROVED' | 'CORRECTION';

type PaymentFile = {
  url: string;
  name: string;
  key?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  capturedAt?: string;
  address?: string | null;
};

type TeamMember = {
  id?: string;
  name: string;
  role: string;
};

export type DailyMeasurementContractOption = {
  contractId: string;
  contratoNome: string;
  centroCustoNome?: string;
  isActive?: boolean;
  status?: string | null;
  plannedValue?: number | null;
  currentValue?: number | null;
  /** Soma das baixas do gestor. */
  executedAmountTotal?: number | null;
  /** Equipe cadastrada neste contrato de serviço. */
  team?: TeamMember[];
  installments?: Array<{ amount: number; status?: string | null }>;
};

function isServiceContractClosed(contract?: DailyMeasurementContractOption | null) {
  if (!contract) return false;
  const status = String(contract.status || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'CANCELLED') return true;
  return contract.isActive === false;
}

function formatMoneyCompact(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const FINANCE_STAT_TONE = {
  Contrato: {
    box: 'bg-violet-50 dark:bg-violet-950/40',
    label: 'text-violet-700 dark:text-violet-300',
    value: 'text-violet-950 dark:text-violet-50',
  },
  Executado: {
    box: 'bg-sky-50 dark:bg-sky-950/40',
    label: 'text-sky-700 dark:text-sky-300',
    value: 'text-sky-950 dark:text-sky-50',
  },
  Pago: {
    box: 'bg-emerald-50 dark:bg-emerald-950/40',
    label: 'text-emerald-700 dark:text-emerald-300',
    value: 'text-emerald-950 dark:text-emerald-50',
  },
  Saldo: {
    box: 'bg-amber-50 dark:bg-amber-950/35',
    label: 'text-amber-800 dark:text-amber-200',
    value: 'text-amber-950 dark:text-amber-50',
  },
} as const;

export function ContractFinanceStats({
  items,
}: {
  items: Array<{ label: keyof typeof FINANCE_STAT_TONE; value: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => {
        const tone = FINANCE_STAT_TONE[item.label];
        return (
          <div key={item.label} className={`rounded-xl px-3 py-2.5 ${tone.box}`}>
            <p className={`text-[11px] font-medium ${tone.label}`}>{item.label}</p>
            <p className={`mt-0.5 text-sm font-semibold tabular-nums ${tone.value}`}>{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function contractFinanceSummary(
  contract: DailyMeasurementContractOption | null,
  /** Soma ao vivo das baixas das entregas já carregadas (prioriza sobre o total do cadastro). */
  liveExecutedTotal?: number | null
) {
  if (!contract) return null;
  const contractValue =
    contract.currentValue != null && Number.isFinite(contract.currentValue)
      ? contract.currentValue
      : contract.plannedValue != null && Number.isFinite(contract.plannedValue)
        ? contract.plannedValue
        : null;
  const installments = contract.installments || [];
  let paid = 0;
  for (const row of installments) {
    const amount = Number(row.amount) || 0;
    if (String(row.status || '').toUpperCase() === 'PAID') paid += amount;
  }
  const fromContract =
    contract.executedAmountTotal != null && Number.isFinite(Number(contract.executedAmountTotal))
      ? Number(contract.executedAmountTotal)
      : 0;
  const executed =
    liveExecutedTotal != null && Number.isFinite(liveExecutedTotal)
      ? Number(liveExecutedTotal)
      : fromContract;
  const saldo =
    contractValue != null ? Number((contractValue - paid).toFixed(2)) : null;
  const executedPct =
    contractValue != null && contractValue > 0
      ? Math.min(100, Math.round((executed / contractValue) * 100))
      : null;
  return {
    contractValue,
    paid,
    saldo,
    executedPct,
  };
}

export type DailyMeasurement = {
  id: string;
  workDate: string;
  description: string;
  confirmedBy: string | null;
  quantity: number | null;
  unit: string | null;
  photos: PaymentFile[];
  teamPhoto: TeamGeoPhoto | null;
  contractId?: string | null;
  contratoNome?: string | null;
  centroCustoNome?: string | null;
  status?: DailyMeasurementStatus | string | null;
  executedAmount?: number | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  returnedBy?: string | null;
  returnedAt?: string | null;
  correctionNote?: string | null;
  workers: Array<{ id: string; teamMemberId: string | null; name: string; role: string }>;
};

function normalizeStatus(value: unknown): DailyMeasurementStatus {
  const raw = String(value || '').toUpperCase();
  if (raw === 'APPROVED' || raw === 'CORRECTION') return raw;
  return 'SUBMITTED';
}

function statusKind(status: DailyMeasurementStatus): ApprovalStatusKind {
  if (status === 'APPROVED') return 'aprovado';
  if (status === 'CORRECTION') return 'cancelado';
  return 'pendente';
}

function statusLabel(status: DailyMeasurementStatus) {
  if (status === 'APPROVED') return 'Aprovado';
  if (status === 'CORRECTION') return 'Devolvida';
  return 'Pendente';
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="font-medium text-gray-900 dark:text-gray-100">{value || '—'}</p>
    </div>
  );
}

const ACTION_MENU_WIDTH_PX = 224;
const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const MENU_ITEM_BORDER_CLASS = `${MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-900/60 dark:text-gray-100 dark:focus:border-red-500';
const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

function todayYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function formatDateBr(ymd: string) {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return ymd;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function isImageFile(file: { url: string; name?: string }) {
  const source = `${file.name || ''} ${file.url || ''}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(source) || source.includes('data:image/');
}

type FormState = {
  workDate: string;
  contractId: string;
  description: string;
  confirmedBy: string;
  workerIds: string[];
  photos: TeamGeoPhoto[];
  teamPhoto: TeamGeoPhoto | null;
};

const emptyForm = (contractId = ''): FormState => ({
  workDate: todayYmd(),
  contractId,
  description: '',
  confirmedBy: '',
  workerIds: [],
  photos: [],
  teamPhoto: null,
});

function asGeoPhotos(raw: PaymentFile[] | TeamGeoPhoto[] | undefined): TeamGeoPhoto[] {
  if (!Array.isArray(raw)) return [];
  const out: TeamGeoPhoto[] = [];
  for (const item of raw) {
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    const capturedAt = String(item.capturedAt || '');
    if (
      !item?.url ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !capturedAt ||
      Number.isNaN(new Date(capturedAt).getTime())
    ) {
      continue;
    }
    const photo: TeamGeoPhoto = {
      url: item.url,
      name: item.name || 'foto-servico.jpg',
      latitude,
      longitude,
      accuracy: item.accuracy ?? null,
      capturedAt: new Date(capturedAt).toISOString(),
      address: item.address ?? null,
    };
    if (item.key) photo.key = item.key;
    out.push(photo);
  }
  return out;
}

export function EmpreiteiroDailyMeasurements({
  empreiteiroId,
  contracts = [],
  defaultContractId = '',
  filterContractId = null,
  onClearContractFilter,
  onSelectContractFilter,
  canEdit,
  canApprove = false,
  onPreviewPhoto,
}: {
  empreiteiroId: string;
  contracts?: DailyMeasurementContractOption[];
  defaultContractId?: string;
  /** Quando definido, lista só as entregas desse contrato. */
  filterContractId?: string | null;
  onClearContractFilter?: () => void;
  onSelectContractFilter?: (contractId: string | null) => void;
  canEdit: boolean;
  /** Fiscal/interno: aprovar ou devolver a entrega. */
  canApprove?: boolean;
  onPreviewPhoto: (url?: string | null, alt?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DailyMeasurement | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultContractId));
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState('');
  const [approveId, setApproveId] = useState<string | null>(null);
  const [approveAmount, setApproveAmount] = useState('');
  /** Modal de aprovação (com baixa opcional). */
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null);
  const [pendingApproveAmount, setPendingApproveAmount] = useState('');
  const [detail, setDetail] = useState<DailyMeasurement | null>(null);
  const [actionMenu, setActionMenu] = useState<{ id: string; top: number; left: number } | null>(
    null,
  );

  const { data, isLoading, dataUpdatedAt, isSuccess } = useQuery({
    queryKey: ['empreiteiro-daily-measurements', empreiteiroId],
    queryFn: async () => {
      const res = await api.get(`/empreiteiros/${empreiteiroId}/daily-measurements`);
      return res.data?.data as DailyMeasurement[];
    },
  });

  // Após sync de parcelas no backend, atualiza Contrato/Executado/Pago/Saldo.
  useEffect(() => {
    if (!isSuccess) return;
    void queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
  }, [isSuccess, dataUpdatedAt, queryClient]);

  const allItems = data ?? [];
  const filterContract = filterContractId
    ? contracts.find((c) => c.contractId === filterContractId) || null
    : null;
  const items = useMemo(() => {
    if (!filterContractId) return allItems;
    return allItems.filter((item) => item.contractId === filterContractId);
  }, [allItems, filterContractId]);
  const formContractTeam = useMemo(() => {
    const fromForm = contracts.find((c) => c.contractId === form.contractId);
    if (fromForm) return fromForm.team || [];
    const fromFilter = filterContractId
      ? contracts.find((c) => c.contractId === filterContractId)
      : null;
    if (fromFilter) return fromFilter.team || [];
    const preferred =
      contracts.find((c) => c.contractId === defaultContractId) || contracts[0] || null;
    return preferred?.team || [];
  }, [contracts, form.contractId, filterContractId, defaultContractId]);
  const teamWithId = useMemo(
    () => formContractTeam.filter((member) => member.id),
    [formContractTeam]
  );
  const contractOptions = useMemo(() => {
    const active = contracts.filter((c) => c.isActive !== false);
    const source = active.length > 0 ? active : contracts;
    return labeledToSelectOptions(
      source.map((c) => ({
        value: c.contractId,
        label: c.centroCustoNome
          ? `${c.contratoNome} · ${c.centroCustoNome}`
          : c.contratoNome,
      }))
    );
  }, [contracts]);
  const preferredContractId =
    filterContractId ||
    defaultContractId ||
    contracts.find((c) => !isServiceContractClosed(c))?.contractId ||
    contracts.find((c) => c.isActive !== false)?.contractId ||
    contracts[0]?.contractId ||
    '';

  const preferredContract =
    contracts.find((c) => c.contractId === preferredContractId) || null;
  const filterClosed = isServiceContractClosed(filterContract);
  const canAddDay =
    canEdit &&
    !filterClosed &&
    contracts.some((c) => !isServiceContractClosed(c));

  const countByContract = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of allItems) {
      const key = item.contractId || '_none';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [allItems]);

  const contractChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: Array<{
      contractId: string | null;
      label: string;
      count: number;
    }> = [
      { contractId: null, label: 'Todos', count: allItems.length },
    ];
    for (const contract of contracts) {
      if (seen.has(contract.contractId)) continue;
      seen.add(contract.contractId);
      chips.push({
        contractId: contract.contractId,
        label: contract.contratoNome,
        count: countByContract.get(contract.contractId) || 0,
      });
    }
    for (const item of allItems) {
      const id = item.contractId || '_none';
      if (seen.has(id) || id === '_none') continue;
      seen.add(id);
      chips.push({
        contractId: item.contractId || null,
        label: item.contratoNome || 'Sem contrato',
        count: countByContract.get(id) || 0,
      });
    }
    return chips;
  }, [allItems, contracts, countByContract]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => String(b.workDate).localeCompare(String(a.workDate))),
    [items],
  );
  const menuItem = sortedItems.find((row) => row.id === actionMenu?.id) ?? null;
  const showContractColumn = !filterContractId;

  useEffect(() => {
    setDetail((current) => {
      if (!current) return current;
      return allItems.find((item) => item.id === current.id) ?? null;
    });
  }, [allItems]);

  const selectContractFilter = (contractId: string | null) => {
    if (onSelectContractFilter) {
      onSelectContractFilter(contractId);
      return;
    }
    if (contractId === null) onClearContractFilter?.();
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ['empreiteiro-daily-measurements', empreiteiroId],
    });
    void queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.teamPhoto) throw new Error('Foto da equipe é obrigatória');
      if (form.photos.length === 0) throw new Error('Inclua ao menos uma foto do serviço');
      if (!form.contractId) throw new Error('Selecione o contrato de serviço desta entrega');
      const payload = {
        workDate: form.workDate,
        empreiteiroContractId: form.contractId,
        contractId: form.contractId,
        description: form.description.trim(),
        confirmedBy: form.confirmedBy.trim() || null,
        quantity: null,
        unit: null,
        workerIds: form.workerIds,
        photos: form.photos,
        teamPhoto: form.teamPhoto,
      };
      if (editing) {
        const res = await api.patch(
          `/empreiteiros/${empreiteiroId}/daily-measurements/${editing.id}`,
          payload
        );
        return res.data;
      }
      const res = await api.post(`/empreiteiros/${empreiteiroId}/daily-measurements`, payload);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Medição salva');
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(
        error.response?.data?.message || error.message || 'Não foi possível salvar a medição'
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/empreiteiros/${empreiteiroId}/daily-measurements/${id}`);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Medição excluída');
      setDeleteId(null);
      invalidate();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível excluir');
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      id,
      executedAmount,
    }: {
      id: string;
      executedAmount?: number;
    }) => {
      const res = await api.post(
        `/empreiteiros/${empreiteiroId}/daily-measurements/${id}/approve`,
        executedAmount != null && executedAmount > 0 ? { executedAmount } : {}
      );
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Medição aprovada');
      setPendingApproveId(null);
      setPendingApproveAmount('');
      invalidate();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível aprovar');
    },
  });

  const executionMutation = useMutation({
    mutationFn: async ({ id, executedAmount }: { id: string; executedAmount: number }) => {
      const res = await api.post(
        `/empreiteiros/${empreiteiroId}/daily-measurements/${id}/execution`,
        { executedAmount }
      );
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Baixa registrada');
      setApproveId(null);
      setApproveAmount('');
      invalidate();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível registrar a baixa');
    },
  });

  const returnMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await api.post(`/empreiteiros/${empreiteiroId}/daily-measurements/${id}/return`, {
        correctionNote: note,
      });
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Medição devolvida');
      setReturnId(null);
      setReturnNote('');
      invalidate();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível devolver');
    },
  });

  const openNew = () => {
    if (!canAddDay) {
      toast.error(
        filterClosed
          ? 'Contrato de serviço concluído — não é possível adicionar novas entregas'
          : 'Não há contrato de serviço ativo para registrar nova entrega'
      );
      return;
    }
    const targetId =
      preferredContract && !isServiceContractClosed(preferredContract)
        ? preferredContract.contractId
        : contracts.find((c) => !isServiceContractClosed(c))?.contractId || '';
    if (!targetId) {
      toast.error('Não há contrato de serviço ativo para registrar nova entrega');
      return;
    }
    setEditing(null);
    setForm({
      ...emptyForm(targetId),
      workerIds: teamWithId.map((member) => member.id as string),
    });
    setFormOpen(true);
  };

  const openEdit = (item: DailyMeasurement) => {
    if (normalizeStatus(item.status) === 'APPROVED') {
      toast.error('Medição aprovada não pode ser editada');
      return;
    }
    setEditing(item);
    setForm({
      workDate: item.workDate,
      contractId: item.contractId || preferredContractId,
      description: item.description,
      confirmedBy: item.confirmedBy || '',
      workerIds: item.workers.map((worker) => worker.teamMemberId).filter((id): id is string => !!id),
      photos: asGeoPhotos(item.photos),
      teamPhoto: item.teamPhoto || null,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const openDetail = (item: DailyMeasurement) => {
    setActionMenu(null);
    setDetail(item);
  };

  const toggleWorker = (id: string) => {
    setForm((prev) => ({
      ...prev,
      workerIds: prev.workerIds.includes(id)
        ? prev.workerIds.filter((current) => current !== id)
        : [...prev.workerIds, id],
    }));
  };

  const detailStatus = detail ? normalizeStatus(detail.status) : null;
  const detailPhotos = detail
    ? [
        ...(detail.teamPhoto?.url
          ? [{ url: detail.teamPhoto.url, name: 'Foto da equipe', badge: 'Equipe' }]
          : []),
        ...detail.photos
          .filter((file) => isImageFile(file))
          .map((file) => ({
            url: file.url,
            name: file.name || 'Foto do serviço',
            badge: 'Serviço',
          })),
      ]
    : [];
  const detailDocs = (detail?.photos || []).filter((file) => file.url && !isImageFile(file));
  const detailCanEdit = Boolean(detail && canEdit && detailStatus !== 'APPROVED');
  const detailCanDelete = Boolean(detail && canEdit && (detailStatus !== 'APPROVED' || canApprove));
  const menuStatus = menuItem ? normalizeStatus(menuItem.status) : null;
  const menuCanEdit = Boolean(menuItem && canEdit && menuStatus !== 'APPROVED');
  const menuCanDelete = Boolean(menuItem && canEdit && (menuStatus !== 'APPROVED' || canApprove));

  return (
    <div className="space-y-5">
      {contractChips.length > 1 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Filtrar por contrato
          </p>
          <div className="flex flex-wrap gap-2">
            {contractChips.map((chip) => {
              const active =
                chip.contractId === null
                  ? !filterContractId
                  : filterContractId === chip.contractId;
              return (
                <button
                  key={chip.contractId ?? 'all'}
                  type="button"
                  onClick={() => selectContractFilter(chip.contractId)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'border-red-500 bg-red-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-red-300 hover:bg-red-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-red-800 dark:hover:bg-red-950/30'
                  }`}
                >
                  {chip.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {(() => {
        const financeContract =
          filterContract ||
          (contracts.length === 1 ? contracts[0] : null) ||
          (preferredContractId
            ? contracts.find((c) => c.contractId === preferredContractId) || null
            : null);
        const financeContractId = financeContract?.contractId || null;
        const liveExecutedTotal =
          isSuccess && financeContractId
            ? allItems
                .filter(
                  (item) =>
                    item.contractId === financeContractId &&
                    normalizeStatus(item.status) === 'APPROVED' &&
                    item.executedAmount != null &&
                    Number(item.executedAmount) > 0
                )
                .reduce((sum, item) => sum + Number(item.executedAmount), 0)
            : null;
        const finance = contractFinanceSummary(financeContract, liveExecutedTotal);
        if (!finance || !financeContract) return null;
        if (!filterContractId && contracts.length > 1) return null;
        return (
          <div className="space-y-2">
            <ContractFinanceStats
                items={[
                  {
                    label: 'Contrato',
                    value: formatMoneyCompact(finance.contractValue),
                  },
                  {
                    label: 'Executado',
                    value: finance.executedPct != null ? `${finance.executedPct}%` : '—',
                  },
                  {
                    label: 'Pago',
                    value: formatMoneyCompact(finance.paid),
                  },
                  {
                    label: 'Saldo',
                    value: formatMoneyCompact(finance.saldo),
                  },
                ]}
              />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Ao aprovar, informe o valor da baixa — ele vai para a próxima parcela. O comprovante
              de pagamento é o passo seguinte.
            </p>
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isLoading
              ? 'Carregando entregas…'
              : items.length === 0
                ? filterContract
                  ? 'Nenhuma entrega neste contrato'
                  : 'Nenhuma entrega registrada'
                : (() => {
                    const uniqueDays = new Set(items.map((item) => item.workDate)).size;
                    const regLabel =
                      items.length === 1
                        ? '1 entrega'
                        : `${items.length} entregas`;
                    const dayLabel =
                      uniqueDays === 1
                        ? '1 data'
                        : `${uniqueDays} datas`;
                    const scope = filterContract ? ' neste contrato' : '';
                    return uniqueDays === items.length
                      ? `${regLabel} registrada${items.length === 1 ? '' : 's'}${scope}`
                      : `${regLabel} · ${dayLabel}${scope}`;
                  })()}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-500">
            {filterClosed
              ? 'Contrato concluído — só consulta das entregas.'
              : 'Medição de cada entrega — separado das notas de pagamento.'}
          </p>
        </div>
        {canAddDay && !formOpen ? (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
          >
            <Plus className="h-4 w-4" />
            Nova entrega
          </button>
        ) : null}
      </div>

      {formOpen ? (
        <section className="overflow-hidden rounded-2xl border border-red-200/70 bg-gradient-to-b from-red-50/80 to-white shadow-sm dark:border-red-900/40 dark:from-red-950/30 dark:to-gray-900/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 px-4 py-3 dark:border-red-900/40 sm:px-5">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {editing
                  ? normalizeStatus(editing.status) === 'CORRECTION'
                    ? 'Corrigir e reenviar'
                    : 'Editar entrega'
                  : 'Nova entrega'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Foto da equipe + fotos do serviço são obrigatórias. A entrega vai para aprovação do
                fiscal.
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Fechar
            </button>
          </div>

          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Data da entrega</label>
                <DatePickerField
                  value={form.workDate}
                  onChange={(workDate) => setForm((prev) => ({ ...prev, workDate }))}
                />
              </div>
              {contractOptions.length > 0 ? (
                <div>
                  <label className={labelClass}>Contrato de serviço *</label>
                  <StringSingleSelectDropdown
                    value={form.contractId}
                    onChange={(contractId) => {
                      const nextTeam = (contracts.find((c) => c.contractId === contractId)?.team ||
                        []
                      ).filter((member) => member.id);
                      setForm((prev) => ({
                        ...prev,
                        contractId,
                        workerIds: nextTeam.map((member) => member.id as string),
                      }));
                    }}
                    options={contractOptions}
                    placeholder="Selecione o serviço"
                    emptyOptionLabel="Selecione o serviço"
                    matchTriggerWidth
                  />
                </div>
              ) : null}
              <div>
                <label className={labelClass}>O que foi entregue</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className={inputClass}
                  placeholder="Ex.: chapisco da fachada e alvenaria do 2º pavimento"
                />
              </div>
              <div>
                <label className={labelClass}>Confirmado por</label>
                <input
                  value={form.confirmedBy}
                  onChange={(e) => setForm((prev) => ({ ...prev, confirmedBy: e.target.value }))}
                  className={inputClass}
                  placeholder="Encarregado ou fiscal"
                />
              </div>
              <div>
                <label className={labelClass}>Quem trabalhou</label>
                {teamWithId.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                    Cadastre a equipe deste contrato para marcar quem trabalhou nesta entrega.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teamWithId.map((member) => {
                      const id = member.id as string;
                      const active = form.workerIds.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleWorker(id)}
                          className={`rounded-full border px-3 py-1.5 text-left text-sm transition ${
                            active
                              ? 'border-red-500 bg-red-600 text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-red-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200'
                          }`}
                        >
                          <span className="font-medium">{member.name}</span>
                          <span className={`ml-1 text-xs ${active ? 'text-red-100' : 'text-gray-400'}`}>
                            {member.role}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200/80 bg-white/70 p-3 dark:border-gray-700 dark:bg-gray-950/40">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <Camera className="h-3.5 w-3.5 text-red-600" />
                  Foto da equipe
                </div>
                <TeamLivePhotoCapture
                  value={form.teamPhoto}
                  onChange={(teamPhoto) => setForm((prev) => ({ ...prev, teamPhoto }))}
                  disabled={!canEdit}
                  onPreview={onPreviewPhoto}
                />
              </div>
              <div className="rounded-xl border border-gray-200/80 bg-white/70 p-3 dark:border-gray-700 dark:bg-gray-950/40">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <ImageIcon className="h-3.5 w-3.5 text-red-600" />
                  Fotos do serviço
                </div>
                <LiveGeoPhotosField
                  values={form.photos}
                  onChange={(photos) => setForm((prev) => ({ ...prev, photos }))}
                  disabled={!canEdit}
                  onPreview={onPreviewPhoto}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-red-100 bg-white/50 px-4 py-3 dark:border-red-900/40 dark:bg-gray-950/30 sm:px-5">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                saveMutation.isPending ||
                !form.workDate ||
                !form.contractId ||
                !form.description.trim() ||
                !form.teamPhoto ||
                form.photos.length === 0
              }
              onClick={() => saveMutation.mutate()}
              className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saveMutation.isPending
                ? 'Enviando…'
                : editing && normalizeStatus(editing.status) === 'CORRECTION'
                  ? 'Reenviar para aprovação'
                  : 'Enviar para aprovação'}
            </button>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800/60"
            />
          ))}
        </div>
      ) : items.length === 0 && !formOpen ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 px-6 py-14 text-center dark:border-gray-600">
          <div className="mb-3 rounded-2xl bg-red-50 p-3 dark:bg-red-950/40">
            <CalendarDays className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Nenhuma entrega registrada ainda
          </p>
          <p className="mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
            Registre a primeira entrega com a equipe, o serviço feito e as fotos do local.
          </p>
          {canAddDay ? (
            <button
              type="button"
              onClick={openNew}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Plus className="h-4 w-4" />
              Registrar primeira entrega
            </button>
          ) : filterClosed ? (
            <p className="mt-4 text-xs font-medium text-gray-500 dark:text-gray-400">
              Contrato concluído — novas entregas bloqueadas.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/55">
          <div className="mb-2 flex flex-col gap-1 px-3 pt-3 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-6">
            <span>
              Mostrando 1 a {sortedItems.length} de {sortedItems.length} medições
            </span>
            <span>Página 1 de 1</span>
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {[
                    'Serviço',
                    ...(showContractColumn ? ['Contrato'] : []),
                    'Data',
                    'Valor',
                    APPROVAL_STATUS_COLUMN_TITLE,
                    'Ação',
                  ].map((label) => (
                    <th
                      key={label}
                      className={`px-3 py-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 ${
                        label === APPROVAL_STATUS_COLUMN_TITLE || label === 'Ação'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {sortedItems.map((item) => {
                  const status = normalizeStatus(item.status);
                  return (
                    <tr
                      key={item.id}
                      className={getListTableRowClassName(true)}
                      onClick={() => openDetail(item)}
                    >
                      <td className="px-3 py-3 align-middle text-sm sm:px-6">
                        <ListRowNavigableLabel className="font-medium">
                          {item.description || '—'}
                        </ListRowNavigableLabel>
                      </td>
                      {showContractColumn ? (
                        <td
                          className="max-w-[200px] truncate px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6"
                          title={item.contratoNome || undefined}
                        >
                          {item.contratoNome || '—'}
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                        {formatDateBr(item.workDate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                        {formatMoneyCompact(item.executedAmount)}
                      </td>
                      <td className="px-3 py-3 text-center align-middle sm:px-6">
                        <ApprovalStatusBadge kind={statusKind(status)} label={statusLabel(status)} />
                      </td>
                      <td
                        className="px-3 py-3 text-center align-middle sm:px-6"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              const rect = event.currentTarget.getBoundingClientRect();
                              setActionMenu((prev) => {
                                if (prev?.id === item.id) return null;
                                let left = rect.right - ACTION_MENU_WIDTH_PX;
                                left = Math.max(
                                  8,
                                  Math.min(left, window.innerWidth - ACTION_MENU_WIDTH_PX - 8),
                                );
                                return { id: item.id, top: rect.bottom + 4, left };
                              });
                            }}
                            className={rowActionMenuButtonClass(actionMenu?.id === item.id)}
                            aria-label="Menu de ações"
                            aria-expanded={actionMenu?.id === item.id}
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
        </div>
      )}
      <ActionMenuOverlay
        open={!!actionMenu && !!menuItem}
        onClose={() => setActionMenu(null)}
        top={actionMenu?.top ?? 0}
        left={actionMenu?.left ?? 0}
      >
        {menuItem ? (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => openDetail(menuItem)}
              className={MENU_ITEM_CLASS}
            >
              <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>Ver detalhes</span>
            </button>
            {menuCanEdit ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenu(null);
                  setDetail(null);
                  openEdit(menuItem);
                }}
                className={MENU_ITEM_BORDER_CLASS}
              >
                <Pencil className="h-4 w-4 shrink-0" />
                <span>{menuStatus === 'CORRECTION' ? 'Corrigir e reenviar' : 'Editar'}</span>
              </button>
            ) : null}
            {menuCanDelete ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionMenu(null);
                  setDeleteId(menuItem.id);
                }}
                className={MENU_ITEM_BORDER_CLASS}
              >
                <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>Excluir</span>
              </button>
            ) : null}
          </>
        ) : null}
      </ActionMenuOverlay>

      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.description || 'Medição de entrega'}
        size="lg"
      >
        {detail && detailStatus ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailField label="Serviço" value={detail.description} />
              <DetailField label="Contrato" value={detail.contratoNome || '—'} />
              <DetailField label="Data" value={formatDateBr(detail.workDate)} />
              <DetailField label="Status" value={statusLabel(detailStatus)} />
              <DetailField label="Confirmado por" value={detail.confirmedBy || '—'} />
              <DetailField
                label="Equipe"
                value={
                  detail.workers.length
                    ? detail.workers.map((worker) => worker.name).join(', ')
                    : '—'
                }
              />
              {detail.centroCustoNome ? (
                <DetailField label="Centro de custo" value={detail.centroCustoNome} />
              ) : null}
              {detailStatus === 'APPROVED' ? (
                <DetailField
                  label="Baixa"
                  value={`${formatMoneyCompact(detail.executedAmount)}${
                    detail.approvedBy ? ` · aprovado por ${detail.approvedBy}` : ''
                  }`}
                />
              ) : null}
            </div>
            {detailStatus === 'CORRECTION' && detail.correctionNote ? (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Motivo da devolução</p>
                <p className="text-gray-900 dark:text-gray-100">{detail.correctionNote}</p>
              </div>
            ) : null}

            {detailPhotos.length > 0 ? (
              <div>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Fotos</p>
                <div className="flex flex-wrap gap-2">
                  {detailPhotos.map((photo, index) => {
                    const src = resolveApiMediaUrl(photo.url) || photo.url;
                    return (
                      <button
                        key={`${photo.url}-${index}`}
                        type="button"
                        onClick={() => onPreviewPhoto(src, photo.name)}
                        className="overflow-hidden rounded-xl border border-gray-200 text-left dark:border-gray-700"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={photo.name} className="h-28 w-28 object-cover" />
                        <span className="block px-2 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                          {photo.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {detailDocs.length > 0 ? (
              <div>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Documentos</p>
                <ul className="space-y-1">
                  {detailDocs.map((file, index) => {
                    const href = resolveApiMediaUrl(file.url) || file.url;
                    return (
                      <li key={`${file.url}-${index}`}>
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-medium text-red-700 hover:underline dark:text-red-300"
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          {file.name || 'Documento'}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Fechar
              </button>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {detailCanEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      const current = detail;
                      setDetail(null);
                      openEdit(current);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {detailStatus === 'CORRECTION' ? 'Corrigir e reenviar' : 'Editar'}
                  </button>
                ) : null}
                {detailCanDelete ? (
                  <button
                    type="button"
                    onClick={() => setDeleteId(detail.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </button>
                ) : null}
                {canApprove && detailStatus === 'APPROVED' && !(detail.executedAmount != null && detail.executedAmount > 0) ? (
                  <button
                    type="button"
                    disabled={executionMutation.isPending}
                    onClick={() => {
                      setApproveId(detail.id);
                      setApproveAmount('');
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                  >
                    Dar baixa
                  </button>
                ) : null}
                {canApprove && detailStatus === 'SUBMITTED' ? (
                  <>
                    <button
                      type="button"
                      disabled={returnMutation.isPending}
                      onClick={() => {
                        setReturnId(detail.id);
                        setReturnNote('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Devolver
                    </button>
                    <button
                      type="button"
                      disabled={approveMutation.isPending}
                      onClick={() => {
                        setPendingApproveId(detail.id);
                        setPendingApproveAmount('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Aprovar
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {deleteId ? (
        <div className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Excluir esta entrega?
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              A entrega e as fotos desse registro serão removidas.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteId)}
                className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingApproveId ? (
        <div className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Aprovar e dar baixa
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Informe o valor da baixa. Ele vai para a próxima parcela (libera e atualiza o
              valor).
            </p>
            <label className="mt-3 mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Valor executado (R$) *
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={pendingApproveAmount}
              onChange={(e) =>
                setPendingApproveAmount(maskCurrencyInputBrOrEmpty(e.target.value))
              }
              placeholder="R$ 0,00"
              className={inputClass}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingApproveId(null);
                  setPendingApproveAmount('');
                }}
                className="rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  approveMutation.isPending || !parseCurrencyInputBr(pendingApproveAmount)
                }
                onClick={() => {
                  const amount = parseCurrencyInputBr(pendingApproveAmount);
                  if (!amount || amount <= 0) {
                    toast.error('Informe o valor executado da entrega');
                    return;
                  }
                  approveMutation.mutate({
                    id: pendingApproveId,
                    executedAmount: amount,
                  });
                }}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {approveMutation.isPending ? 'Salvando…' : 'Aprovar e dar baixa'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {approveId ? (
        <div className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Baixa da entrega
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Informe o valor da baixa. Ele vai para a próxima parcela pendente (libera e
              atualiza o valor).
            </p>
            <label className="mt-3 mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Valor executado (R$) *
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={approveAmount}
              onChange={(e) => setApproveAmount(maskCurrencyInputBrOrEmpty(e.target.value))}
              placeholder="R$ 0,00"
              className={inputClass}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setApproveId(null);
                  setApproveAmount('');
                }}
                className="rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={executionMutation.isPending || !parseCurrencyInputBr(approveAmount)}
                onClick={() => {
                  const amount = parseCurrencyInputBr(approveAmount);
                  if (!amount || amount <= 0) {
                    toast.error('Informe o valor executado nesta baixa');
                    return;
                  }
                  executionMutation.mutate({ id: approveId, executedAmount: amount });
                }}
                className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {executionMutation.isPending ? 'Salvando…' : 'Confirmar baixa'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {returnId ? (
        <div className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Devolver para correção
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Explique o que falta para a empreita ajustar e reenviar.
            </p>
            <textarea
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              rows={4}
              className={`${inputClass} mt-3`}
              placeholder="Ex.: falta foto da fachada e confirmar quem trabalhou"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReturnId(null);
                  setReturnNote('');
                }}
                className="rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={returnMutation.isPending || !returnNote.trim()}
                onClick={() =>
                  returnMutation.mutate({ id: returnId, note: returnNote.trim() })
                }
                className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {returnMutation.isPending ? 'Devolvendo…' : 'Devolver'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

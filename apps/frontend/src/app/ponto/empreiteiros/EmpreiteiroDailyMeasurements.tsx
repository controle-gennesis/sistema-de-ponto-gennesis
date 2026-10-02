'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
  Camera,
  ImageIcon,
  RotateCcw,
  ShieldCheck,
  Clock3,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DatePickerField } from '@/components/ui/DatePickerField';
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

function statusMeta(status: DailyMeasurementStatus) {
  if (status === 'APPROVED') {
    return {
      label: 'Aprovado',
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
      Icon: ShieldCheck,
    };
  }
  if (status === 'CORRECTION') {
    return {
      label: 'Correção',
      className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
      Icon: AlertTriangle,
    };
  }
  return {
    label: 'Enviado',
    className: 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-300',
    Icon: Clock3,
  };
}

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

function formatWeekdayBr(ymd: string) {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
}

function isImageFile(file: { url: string; name?: string }) {
  const source = `${file.name || ''} ${file.url || ''}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(source) || source.includes('data:image/');
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
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

function PhotoThumb({
  url,
  alt,
  onClick,
  caption,
  mapHref,
  badge,
}: {
  url: string;
  alt: string;
  onClick: () => void;
  caption?: string | null;
  mapHref?: string | null;
  badge?: string | null;
}) {
  const href = resolveApiMediaUrl(url) || url;
  return (
    <div className="group relative w-[7.5rem] shrink-0 overflow-hidden rounded-xl border border-gray-200/80 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50 sm:w-36">
      <button type="button" onClick={onClick} className="relative block w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={href}
          alt={alt}
          className="aspect-[4/3] w-full object-cover transition duration-200 group-hover:scale-[1.03]"
        />
        {badge ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm backdrop-blur-sm">
            {badge}
          </span>
        ) : null}
      </button>
      {caption || mapHref ? (
        <div className="space-y-0.5 px-2 py-1.5">
          {caption ? (
            <p className="line-clamp-2 text-[10px] leading-snug text-gray-500 dark:text-gray-400">
              {caption}
            </p>
          ) : null}
          {mapHref ? (
            <a
              href={mapHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 hover:underline dark:text-red-300"
            >
              <MapPin className="h-2.5 w-2.5" />
              Mapa
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PhotoSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <Icon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
        {title}
      </div>
      <div className="-mx-0.5 flex gap-2.5 overflow-x-auto px-0.5 pb-0.5">{children}</div>
    </div>
  );
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

  const groupedItems = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        contractId: string | null;
        label: string;
        centroCustoNome?: string | null;
        items: DailyMeasurement[];
      }
    >();
    for (const item of items) {
      const key = item.contractId || '_none';
      const fromList = contracts.find((c) => c.contractId === item.contractId);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          contractId: item.contractId || null,
          label: item.contratoNome || fromList?.contratoNome || 'Sem contrato',
          centroCustoNome: item.centroCustoNome || fromList?.centroCustoNome || null,
          items: [],
        });
      }
      groups.get(key)!.items.push(item);
    }
    for (const group of groups.values()) {
      group.items.sort((a, b) => String(b.workDate).localeCompare(String(a.workDate)));
    }
    const ordered: typeof groups extends Map<string, infer V> ? V[] : never[] = [];
    for (const contract of contracts) {
      const group = groups.get(contract.contractId);
      if (group) {
        ordered.push(group);
        groups.delete(contract.contractId);
      }
    }
    for (const group of groups.values()) ordered.push(group);
    return ordered;
  }, [items, contracts]);

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

  const toggleWorker = (id: string) => {
    setForm((prev) => ({
      ...prev,
      workerIds: prev.workerIds.includes(id)
        ? prev.workerIds.filter((current) => current !== id)
        : [...prev.workerIds, id],
    }));
  };

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
        <div className="space-y-6">
          {groupedItems.map((group) => (
            <section key={group.key} className="space-y-3">
              {!filterContractId ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="inline-flex max-w-full items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="truncate">{group.label}</span>
                    </p>
                    {group.centroCustoNome ? (
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {group.centroCustoNome}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {group.items.length} entrega
                      {group.items.length === 1 ? '' : 's'}
                    </span>
                    {group.contractId && onSelectContractFilter ? (
                      <button
                        type="button"
                        onClick={() => selectContractFilter(group.contractId)}
                        className="rounded-xl bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                      >
                        Só este contrato
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4">
                {group.items.map((item) => {
                  const weekday = formatWeekdayBr(item.workDate);
                  const servicePhotos = item.photos.filter((photo) => isImageFile(photo));
                  const otherFiles = item.photos.filter((photo) => !isImageFile(photo));
                  const status = normalizeStatus(item.status);
                  const meta = statusMeta(status);
                  const StatusIcon = meta.Icon;
                  const isApproved = status === 'APPROVED';
                  const isSubmitted = status === 'SUBMITTED';
                  const canEditItem = canEdit && !isApproved;
                  const canDeleteItem = canEdit && (!isApproved || canApprove);
                  return (
                    <article
                      key={item.id}
                      className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900/55"
                    >
                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                        <div className="flex shrink-0 items-center gap-3 sm:w-28 sm:flex-col sm:items-stretch">
                          <div className="rounded-2xl bg-red-50 px-3 py-2.5 text-center dark:bg-red-950/40 sm:w-full">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700/80 dark:text-red-300/80">
                              {weekday || 'Dia'}
                            </p>
                            <p className="text-sm font-bold leading-tight text-red-800 dark:text-red-200">
                              {formatDateBr(item.workDate)}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${meta.className}`}
                          >
                            <StatusIcon className="h-3.5 w-3.5" />
                            {meta.label}
                          </span>
                        </div>

                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="text-base font-semibold leading-snug text-gray-900 dark:text-gray-50">
                                {item.description}
                              </h4>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {!filterContractId && item.contratoNome ? (
                                  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">
                                      {item.contratoNome}
                                      {item.centroCustoNome
                                        ? ` · ${item.centroCustoNome}`
                                        : ''}
                                    </span>
                                  </span>
                                ) : null}
                                {item.confirmedBy ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                    <span>
                                      <span className="font-semibold">Confirmado por:</span>{' '}
                                      {item.confirmedBy}
                                    </span>
                                  </span>
                                ) : null}
                                {item.workers.length > 0 ? (
                                  <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                    <Users className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">
                                      <span className="font-semibold">Equipe:</span>{' '}
                                      {item.workers.map((worker) => worker.name).join(', ')}
                                    </span>
                                  </span>
                                ) : null}
                                {status === 'APPROVED' &&
                                item.executedAmount != null &&
                                item.executedAmount > 0 ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                                    Baixa: {formatMoneyCompact(item.executedAmount)}
                                  </span>
                                ) : null}
                              </div>
                              {status === 'CORRECTION' && item.correctionNote ? (
                                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                                  <p className="font-semibold">Devolvido para correção</p>
                                  <p className="mt-0.5 whitespace-pre-wrap">{item.correctionNote}</p>
                                </div>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {canApprove && isSubmitted ? (
                                <div className="flex flex-wrap justify-end gap-1">
                                  <button
                                    type="button"
                                    disabled={approveMutation.isPending}
                                    onClick={() => {
                                      setPendingApproveId(item.id);
                                      setPendingApproveAmount('');
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Aprovar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={returnMutation.isPending}
                                    onClick={() => {
                                      setReturnId(item.id);
                                      setReturnNote('');
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Devolver
                                  </button>
                                </div>
                              ) : null}
                              {canApprove &&
                              status === 'APPROVED' &&
                              !(item.executedAmount != null && item.executedAmount > 0) ? (
                                <button
                                  type="button"
                                  disabled={executionMutation.isPending}
                                  onClick={() => {
                                    setApproveId(item.id);
                                    setApproveAmount('');
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Dar baixa
                                </button>
                              ) : null}
                              {canEditItem || canDeleteItem ? (
                                <div className="flex shrink-0 gap-1">
                                  {canEditItem ? (
                                    <button
                                      type="button"
                                      onClick={() => openEdit(item)}
                                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      {status === 'CORRECTION' ? 'Corrigir e reenviar' : 'Editar'}
                                    </button>
                                  ) : null}
                                  {canDeleteItem ? (
                                    <button
                                      type="button"
                                      onClick={() => setDeleteId(item.id)}
                                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                      aria-label="Excluir entrega"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {(item.teamPhoto || servicePhotos.length > 0) && (
                            <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                              {item.teamPhoto ? (
                                <PhotoSection title="Foto da equipe" icon={Users}>
                                  <PhotoThumb
                                    url={item.teamPhoto.url}
                                    alt="Foto da equipe"
                                    badge="Equipe"
                                    onClick={() =>
                                      onPreviewPhoto(item.teamPhoto?.url, 'Foto da equipe')
                                    }
                                    caption={
                                      item.teamPhoto.address ||
                                      `${item.teamPhoto.latitude.toFixed(5)}, ${item.teamPhoto.longitude.toFixed(5)}`
                                    }
                                    mapHref={mapsUrl(
                                      item.teamPhoto.latitude,
                                      item.teamPhoto.longitude
                                    )}
                                  />
                                </PhotoSection>
                              ) : null}
                              {servicePhotos.length > 0 ? (
                                <PhotoSection title="Fotos do serviço" icon={ImageIcon}>
                                  {servicePhotos.map((photo, index) => {
                                    const lat = Number(photo.latitude);
                                    const lng = Number(photo.longitude);
                                    const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);
                                    return (
                                      <PhotoThumb
                                        key={`${photo.url}-${index}`}
                                        url={photo.url}
                                        alt={photo.name || 'Foto do serviço'}
                                        badge="Serviço"
                                        onClick={() =>
                                          onPreviewPhoto(
                                            photo.url,
                                            photo.name || 'Foto do serviço'
                                          )
                                        }
                                        caption={
                                          photo.capturedAt
                                            ? new Date(String(photo.capturedAt)).toLocaleString(
                                                'pt-BR',
                                                { timeZone: 'America/Sao_Paulo' }
                                              )
                                            : photo.address || null
                                        }
                                        mapHref={hasGeo ? mapsUrl(lat, lng) : null}
                                      />
                                    );
                                  })}
                                </PhotoSection>
                              ) : null}
                            </div>
                          )}

                          {otherFiles.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {otherFiles.map((photo, index) => (
                                <a
                                  key={`${photo.url}-${index}`}
                                  href={resolveApiMediaUrl(photo.url) || photo.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-medium text-red-700 hover:underline dark:text-red-300"
                                >
                                  {photo.name || 'arquivo'}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {deleteId ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
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

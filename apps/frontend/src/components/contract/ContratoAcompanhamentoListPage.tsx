'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Trash2,
  Search,
  MoreVertical,
  Eye,
  ClipboardList,
  Settings2,
  PenLine,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { computeRowActionMenuPosition } from '@/lib/computeRowActionMenuPosition';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { ReuniaoFormModal, type ReuniaoListPatch } from '@/components/contract/ReuniaoFormModal';
import { ContratoControleGeralMensalCard } from '@/components/contract/ContratoControleGeralMensalCard';
import { ContratoReunioesLancamentosBar } from '@/components/contract/ContratoReunioesLancamentosBar';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { entryMonthLabel, formatMonthLabel, getIsoMonthKey } from '@/lib/monthPeriod';
import {
  entryWeekLabel,
  formatWeekLabel,
  fortnightOverlapsCalendarMonth,
  fortnightOverlapsCalendarYear,
  getFortnightKey,
} from '@/lib/weekPeriod';
import type { AcompanhamentoKind } from '@/lib/acompanhamentoTypes';

export type { AcompanhamentoKind };

interface ReuniaoEntry {
  id: string;
  data: string;
  responsavelPreenchimento: string;
  nome: string;
  monthKey?: string;
  weekKey?: string;
  formularioName?: string;
  formularioDescription?: string;
  createdAt: string;
  updatedAt: string;
}

interface FormularioOption {
  id: string;
  name: string;
  description?: string;
}

interface ContractConfig {
  formularioId: string;
  formularioName: string;
  updatedAt: string;
}

interface Contract {
  id: string;
  name: string;
  number: string;
  startDate?: string;
  endDate?: string;
}

interface ReuniaoActionMenuState {
  reuniaoId: string;
  top: number;
  left: number;
  maxHeight: number;
  placement: 'below' | 'above';
}

export interface ContratoAcompanhamentoListConfig {
  kind: AcompanhamentoKind;
  pageTitle: string;
  sectionTitle: string;
  sectionDescription: string;
  Icon: LucideIcon;
  periodColumnLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
  configModalTitle: string;
  configModalDescription: string;
  fillButtonLabel: string;
  fillButtonContinueLabel: string;
  currentPeriodSummaryLabel: string;
  recordsCountLabel: (count: number) => string;
  saveSuccessToast: string;
  openSuccessToast: string;
  backHref?: (contractId: string) => string;
  backLabel?: string;
  protectedRoute?: string;
}

export type ContratoAcompanhamentoTabs = {
  items: Array<{ id: string; label: string }>;
  activeId: string;
  onChange: (id: string) => void;
};

const REUNIAO_MENU_WIDTH_PX = 224;
const COMPACT_PANEL_BODY_CLASS = 'min-h-[22rem] flex-1';

const MESES_FILTRO = [
  { value: 0, label: 'Todos os meses' },
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

const MESES_FILTRO_SELECT_OPTIONS = labeledToSelectOptions(
  MESES_FILTRO.map((m) => ({ value: String(m.value), label: m.label }))
);

function yearsFromContractRange(startDate?: string, endDate?: string): number[] {
  const now = new Date().getFullYear();
  const startY = startDate ? new Date(startDate).getFullYear() : now;
  const endY = endDate ? new Date(endDate).getFullYear() : now;
  if (Number.isNaN(startY) || Number.isNaN(endY)) return [now];
  const from = Math.min(startY, endY, now);
  const to = Math.max(startY, endY, now);
  const years: number[] = [];
  for (let y = from; y <= to; y++) years.push(y);
  return years;
}

function parseMonthKeyParts(monthKey?: string): { y: number; m: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!y || m < 1 || m > 12) return null;
  return { y, m };
}

function entryMatchesPeriodFilter(
  kind: AcompanhamentoKind,
  entry: ReuniaoEntry,
  filterYear: number,
  filterMonth: number
): boolean {
  if (kind === 'mensal') {
    const parts = parseMonthKeyParts(entry.monthKey);
    if (parts) {
      if (filterYear > 0 && parts.y !== filterYear) return false;
      if (filterMonth > 0 && parts.m !== filterMonth) return false;
      return true;
    }
    const d = entry.createdAt ? new Date(entry.createdAt) : null;
    if (!d || Number.isNaN(d.getTime())) return filterYear === 0 && filterMonth === 0;
    if (filterYear > 0 && d.getFullYear() !== filterYear) return false;
    if (filterMonth > 0 && d.getMonth() + 1 !== filterMonth) return false;
    return true;
  }

  if (entry.weekKey) {
    if (filterMonth > 0) return fortnightOverlapsCalendarMonth(entry.weekKey, filterYear, filterMonth);
    if (filterYear > 0) return fortnightOverlapsCalendarYear(entry.weekKey, filterYear);
    return true;
  }

  const d = entry.createdAt ? new Date(entry.createdAt) : null;
  if (!d || Number.isNaN(d.getTime())) return filterYear === 0 && filterMonth === 0;
  if (filterYear > 0 && d.getFullYear() !== filterYear) return false;
  if (filterMonth > 0 && d.getMonth() + 1 !== filterMonth) return false;
  return true;
}

function formatDateTime(iso: string) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function entryPeriodLabel(kind: AcompanhamentoKind, entry: ReuniaoEntry) {
  return kind === 'mensal' ? entryMonthLabel(entry) : entryWeekLabel(entry);
}

function sortByPeriodDesc(kind: AcompanhamentoKind, a: ReuniaoEntry, b: ReuniaoEntry) {
  const ka = kind === 'mensal' ? a.monthKey || '' : a.weekKey || '';
  const kb = kind === 'mensal' ? b.monthKey || '' : b.weekKey || '';
  if (ka && kb && ka !== kb) return kb.localeCompare(ka);
  return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
}

function isCurrentPeriod(kind: AcompanhamentoKind, entry: ReuniaoEntry) {
  if (kind === 'mensal') return entry.monthKey === getIsoMonthKey();
  return entry.weekKey === getFortnightKey();
}

function currentPeriodLabel(kind: AcompanhamentoKind) {
  return kind === 'mensal' ? formatMonthLabel(getIsoMonthKey()) : formatWeekLabel(getFortnightKey());
}

function panelTone(kind: AcompanhamentoKind) {
  if (kind === 'mensal') {
    return {
      bar: 'from-sky-500 via-cyan-400 to-teal-400',
      iconWrap:
        'bg-sky-100 text-sky-600 ring-1 ring-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/20',
      emptyWrap:
        'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
      chip:
        'bg-sky-50 text-sky-700 ring-1 ring-sky-200/70 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-500/20',
      emptyTitle: 'Nenhum relatório registrado',
      emptyHint: 'Configure o formulário e preencha o mês atual para acompanhar o contrato.',
    };
  }
  return {
    bar: 'from-indigo-500 via-violet-500 to-fuchsia-400',
    iconWrap:
      'bg-indigo-100 text-indigo-600 ring-1 ring-indigo-200/80 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/20',
    emptyWrap:
      'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300',
    chip:
      'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/70 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-500/20',
    emptyTitle: 'Nenhuma reunião registrada',
    emptyHint: 'Configure o formulário e registre a reunião da quinzena com a equipe.',
  };
}

function ContratoAcompanhamentoPanel({
  config,
  contractId,
  compact,
  formVariant,
  consumeOpenQuery,
  filterYear,
  filterMonth,
}: {
  config: ContratoAcompanhamentoListConfig;
  contractId: string;
  compact: boolean;
  formVariant: 'modal' | 'inline';
  consumeOpenQuery: boolean;
  filterYear: number;
  filterMonth: number;
}) {
  const {
    kind,
    sectionTitle,
    sectionDescription,
    Icon,
    periodColumnLabel,
    searchPlaceholder,
    configModalTitle,
    configModalDescription,
    fillButtonLabel,
    fillButtonContinueLabel,
    currentPeriodSummaryLabel,
    recordsCountLabel,
    saveSuccessToast,
    openSuccessToast,
    backHref,
  } = config;

  const relatoriosCrud = useCadastroCrudPermissions('/ponto/metricas/relatorios-contrato');
  const fromMetricasPage = config.protectedRoute === '/ponto/metricas/relatorios-contrato';
  const canWrite = !fromMetricasPage || relatoriosCrud.canEdit || relatoriosCrud.canCreate;
  const canRemove = relatoriosCrud.canDelete;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [reuniaoActionMenu, setReuniaoActionMenu] = useState<ReuniaoActionMenuState | null>(null);
  const [modalReuniaoId, setModalReuniaoId] = useState<string | null>(null);
  const [formViewOnly, setFormViewOnly] = useState(false);
  const [listOverrides, setListOverrides] = useState<Record<string, ReuniaoListPatch>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedFormularioId, setSelectedFormularioId] = useState<string>('');

  const listQueryKey = ['reunioes', kind, contractId] as const;
  const configQueryKey = ['reunioes-config', kind, contractId] as const;
  const apiBase = `/reunioes/${contractId}/${kind}`;
  const formOpen = !!modalReuniaoId;
  const showInlineForm = formVariant === 'inline' && formOpen;
  const tone = panelTone(kind);

  const { data: reunioesData, isLoading: loadingReunioes } = useQuery({
    queryKey: listQueryKey,
    queryFn: async () => (await api.get(apiBase)).data,
    enabled: !!contractId,
  });

  const { data: configData, isLoading: loadingConfig } = useQuery({
    queryKey: configQueryKey,
    queryFn: async () => (await api.get(`${apiBase}/config`)).data,
    enabled: !!contractId,
  });

  const {
    data: formulariosData,
    isLoading: loadingFormularios,
    isFetching: fetchingFormularios,
  } = useQuery({
    queryKey: ['formularios-templates'],
    queryFn: async () => {
      const res = await api.get('/formularios');
      return (Array.isArray(res.data?.data) ? res.data.data : []) as FormularioOption[];
    },
    enabled: configModalOpen,
  });

  const formularios: FormularioOption[] = Array.isArray(formulariosData) ? formulariosData : [];
  const contractConfig = (configData?.data ?? null) as ContractConfig | null;

  useEffect(() => {
    if (!consumeOpenQuery) return;
    const openId = searchParams?.get('open');
    if (!openId) return;
    setFormViewOnly(!canWrite);
    setModalReuniaoId(openId);
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    next.delete('open');
    const qs = next.toString();
    const path = pathname || backHref?.(contractId) || `/ponto/contratos/${contractId}/reunioes`;
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }, [searchParams, contractId, router, pathname, backHref, consumeOpenQuery, canWrite]);

  useEffect(() => {
    if (!configModalOpen) return;
    if (contractConfig?.formularioId) {
      setSelectedFormularioId(contractConfig.formularioId);
      return;
    }
    if (Array.isArray(formulariosData) && formulariosData.length === 1) {
      setSelectedFormularioId(formulariosData[0]!.id);
    }
  }, [configModalOpen, contractConfig?.formularioId, formulariosData]);

  const configMutation = useMutation({
    mutationFn: async (formularioId: string) =>
      (await api.put(`${apiBase}/config`, { formularioId })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configQueryKey });
      setConfigModalOpen(false);
      toast.success(saveSuccessToast);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao salvar configuração.';
      toast.error(msg);
    },
  });

  const periodoAtualMutation = useMutation({
    mutationFn: async () => (await api.post(`${apiBase}/periodo-atual`)).data,
    onSuccess: (res) => {
      const entry = res.data as ReuniaoEntry;
      queryClient.setQueryData(listQueryKey, (old: { data?: ReuniaoEntry[] } | undefined) => {
        const list = Array.isArray(old?.data) ? old!.data : [];
        return { success: true, data: [entry, ...list.filter((r) => r.id !== entry.id)] };
      });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      setFormViewOnly(false);
      setModalReuniaoId(entry.id);
      toast.success(openSuccessToast);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao abrir o período atual.';
      if (msg.includes('Configure o formulário')) {
        toast.error(msg);
        setConfigModalOpen(true);
        return;
      }
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`${apiBase}/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listQueryKey });
      const previous = queryClient.getQueryData(listQueryKey);
      queryClient.setQueryData(listQueryKey, (old: { data?: ReuniaoEntry[] } | undefined) => {
        const list = Array.isArray(old?.data) ? old.data : [];
        return { success: true, data: list.filter((r) => r.id !== id) };
      });
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      if (modalReuniaoId === id) {
        setModalReuniaoId(null);
        setFormViewOnly(false);
      }
      return { previous };
    },
    onSuccess: (_res, id) => {
      setListOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      queryClient.setQueryData(listQueryKey, (old: { data?: ReuniaoEntry[] } | undefined) => {
        const list = Array.isArray(old?.data) ? old.data : [];
        return { ...(old ?? { success: true }), data: list.filter((r) => r.id !== id) };
      });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      toast.success('Registro excluído.');
    },
    onError: (err: unknown, id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listQueryKey, ctx.previous);
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao excluir.';
      toast.error(msg);
    },
  });

  const handleListPatch = useCallback(
    (reuniaoId: string, patch: ReuniaoListPatch) => {
      setListOverrides((prev) => ({ ...prev, [reuniaoId]: patch }));
      queryClient.setQueryData(listQueryKey, (old: { data?: ReuniaoEntry[] } | undefined) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((r) =>
            r.id === reuniaoId
              ? {
                  ...r,
                  data: patch.data,
                  responsavelPreenchimento: patch.responsavelPreenchimento,
                  nome: patch.nome,
                  updatedAt: patch.updatedAt,
                }
              : r
          ),
        };
      });
    },
    [queryClient, listQueryKey]
  );

  const closeForm = () => {
    setModalReuniaoId(null);
    setFormViewOnly(false);
  };

  const openReuniao = (id: string, mode: 'view' | 'edit' = 'view') => {
    setReuniaoActionMenu(null);
    setFormViewOnly(mode === 'view' || !canWrite);
    setModalReuniaoId(id);
  };

  const formReadOnly = !canWrite || formViewOnly;

  const reunioesRaw: ReuniaoEntry[] = (reunioesData?.data ?? [])
    .filter((r: ReuniaoEntry) => !removedIds.has(r.id))
    .map((r: ReuniaoEntry & { contrato?: string }) => ({
      ...r,
      nome: r.nome || r.contrato || '',
    }));

  const reunioes = reunioesRaw
    .map((r) => {
      const ov = listOverrides[r.id];
      return ov
        ? {
            ...r,
            data: ov.data,
            responsavelPreenchimento: ov.responsavelPreenchimento,
            nome: ov.nome,
            updatedAt: ov.updatedAt,
          }
        : r;
    })
    .sort((a, b) => sortByPeriodDesc(kind, a, b));

  const currentPeriodEntry = useMemo(
    () => reunioes.find((r) => isCurrentPeriod(kind, r)),
    [reunioes, kind]
  );

  const reunioesFiltradas = reunioes.filter((r) => {
    if (!entryMatchesPeriodFilter(kind, r, filterYear, filterMonth)) return false;
    if (!searchTerm.trim()) return true;
    return (
      textMatchesSearch(entryPeriodLabel(kind, r), searchTerm) ||
      textMatchesSearch(r.formularioName, searchTerm) ||
      textMatchesSearch(r.formularioDescription, searchTerm) ||
      textMatchesSearch(r.responsavelPreenchimento, searchTerm)
    );
  });

  const listMarkup = (
    <>
      {!loadingReunioes && reunioes.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span
            className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${tone.chip}`}
          >
            {currentPeriodSummaryLabel}: {currentPeriodLabel(kind)}
            {currentPeriodEntry ? ' · em andamento' : ' · pendente'}
          </span>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {recordsCountLabel(reunioesFiltradas.length)}
          </span>
        </div>
      )}

      {loadingReunioes ? (
        <div className="mt-2">
          <CadastroListLoading message="Carregando histórico..." />
        </div>
      ) : reunioesFiltradas.length === 0 ? (
        <div
          className={`flex flex-col items-center justify-center px-6 text-center ${
            compact ? `${COMPACT_PANEL_BODY_CLASS} py-10` : 'py-14'
          }`}
        >
          <div
            className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${tone.emptyWrap}`}
          >
            <Icon className="h-7 w-7" strokeWidth={1.6} />
          </div>
          <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">
            {reunioes.length === 0 ? tone.emptyTitle : 'Nenhum registro encontrado'}
          </p>
          <p className="mt-1.5 max-w-[18rem] text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            {reunioes.length === 0
              ? tone.emptyHint
              : searchTerm.trim()
                ? 'Tente outro termo na busca.'
                : 'Nenhum registro neste mês e ano.'}
          </p>
        </div>
      ) : (
        <div
          className={`mt-1 overflow-hidden rounded-xl border border-gray-100 dark:border-white/10 ${
            compact ? COMPACT_PANEL_BODY_CLASS : ''
          }`}
        >
          <div className="table-scroll">
            <table className={`w-full text-sm ${compact ? 'min-w-[520px]' : 'min-w-[720px]'}`}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 dark:border-white/10 dark:bg-white/5">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                    {periodColumnLabel}
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                    Responsável
                  </th>
                  {!compact ? (
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                      Atualizado em
                    </th>
                  ) : null}
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {reunioesFiltradas.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openReuniao(r.id, 'view')}
                    className={`border-b border-gray-100 last:border-0 dark:border-white/5 ${getListTableRowClassName(true)} ${
                      modalReuniaoId === r.id ? 'bg-red-50/50 dark:bg-red-950/20' : ''
                    } ${isCurrentPeriod(kind, r) ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <ListRowNavigableLabel className="truncate font-medium">
                        {entryPeriodLabel(kind, r)}
                        {isCurrentPeriod(kind, r) ? (
                          <span className="ml-2 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                            atual
                          </span>
                        ) : null}
                      </ListRowNavigableLabel>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {r.responsavelPreenchimento?.trim() || '—'}
                    </td>
                    {!compact ? (
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">
                        {formatDateTime(r.updatedAt || r.createdAt)}
                      </td>
                    ) : null}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const bounds = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setReuniaoActionMenu((prev) => {
                              if (prev?.reuniaoId === r.id) return null;
                              const coords = computeRowActionMenuPosition(
                                bounds,
                                REUNIAO_MENU_WIDTH_PX
                              );
                              return { reuniaoId: r.id, ...coords };
                            });
                          }}
                          className={rowActionMenuButtonClass(reuniaoActionMenu?.reuniaoId === r.id)}
                          aria-label="Menu de ações"
                          aria-expanded={reuniaoActionMenu?.reuniaoId === r.id}
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
        </div>
      )}
    </>
  );

  return (
    <>
      <Card
        padding={compact ? 'none' : 'md'}
        className={`relative w-full !overflow-hidden !rounded-2xl border-gray-200/80 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-gray-900/70 ${
          compact ? 'flex h-full min-h-[28rem] flex-1 flex-col' : ''
        }`}
      >
        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.bar}`} />
        <CardHeader
          className={`!border-b !border-gray-100 dark:!border-white/10 ${
            compact ? 'shrink-0 !px-5 !pb-4 !pt-6 sm:!px-6' : '!pt-2'
          }`}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.iconWrap}`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-50 sm:text-lg">
                  {sectionTitle}
                </h3>
                <p className="mt-1 text-sm leading-snug text-gray-500 dark:text-gray-400">
                  {loadingConfig
                    ? 'Carregando configuração…'
                    : contractConfig?.formularioName
                      ? `Formulário: ${contractConfig.formularioName}`
                      : sectionDescription}
                </p>
              </div>
            </div>
            <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
              {!showInlineForm && !loadingReunioes && reunioes.length > 0 && (
                <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[200px] sm:w-[240px] sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-white/80 py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-white/10 dark:bg-gray-950/40 dark:text-gray-100"
                  />
                </div>
              )}
              {canWrite ? (
              <button
                type="button"
                onClick={() => setConfigModalOpen(true)}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-gray-200 bg-white/80 px-3.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-white/10 dark:bg-gray-950/40 dark:text-gray-200 dark:hover:border-white/20 dark:hover:bg-gray-900"
              >
                <Settings2 className="h-4 w-4 shrink-0" />
                {compact ? 'Formulário' : 'Configurar formulário'}
              </button>
              ) : null}
              {canWrite || currentPeriodEntry ? (
              <button
                type="button"
                onClick={() => {
                  if (currentPeriodEntry) {
                    openReuniao(currentPeriodEntry.id, canWrite ? 'edit' : 'view');
                    return;
                  }
                  if (!canWrite) return;
                  periodoAtualMutation.mutate();
                }}
                disabled={periodoAtualMutation.isPending || loadingConfig}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm shadow-red-600/25 transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-70"
              >
                <PenLine className="h-4 w-4 shrink-0" />
                {currentPeriodEntry
                  ? canWrite
                    ? fillButtonContinueLabel
                    : 'Visualizar quinzena'
                  : fillButtonLabel}
              </button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent
          className={
            compact
              ? `app-thin-scroll flex ${COMPACT_PANEL_BODY_CLASS} flex-col overflow-y-auto !px-5 !pb-5 !pt-4 sm:!px-6 sm:!pb-6`
              : undefined
          }
        >
          {showInlineForm ? (
            <div className={COMPACT_PANEL_BODY_CLASS}>
              <ReuniaoFormModal
                isOpen={formOpen}
                onClose={closeForm}
                contractId={contractId}
                kind={kind}
                reuniaoId={modalReuniaoId}
                onListPatch={handleListPatch}
                variant="inline"
                readOnly={formReadOnly}
              />
            </div>
          ) : (
            listMarkup
          )}
        </CardContent>
      </Card>

      {reuniaoActionMenu ? (
        <ActionMenuOverlay
          key={reuniaoActionMenu.reuniaoId}
          open
          onClose={() => setReuniaoActionMenu(null)}
          top={reuniaoActionMenu.top}
          left={reuniaoActionMenu.left}
          maxHeight={reuniaoActionMenu.maxHeight}
          placement={reuniaoActionMenu.placement}
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              openReuniao(reuniaoActionMenu.reuniaoId, 'view');
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>Visualizar</span>
          </button>
          {canWrite ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                openReuniao(reuniaoActionMenu.reuniaoId, 'edit');
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <PenLine className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>Editar formulário</span>
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                const { reuniaoId } = reuniaoActionMenu;
                setReuniaoActionMenu(null);
                if (confirm('Excluir este registro? Esta ação não pode ser desfeita.')) {
                  deleteMutation.mutate(reuniaoId);
                }
              }}
              className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>Excluir</span>
            </button>
          ) : null}
        </ActionMenuOverlay>
      ) : null}

      <Modal
        isOpen={configModalOpen}
        onClose={() => {
          if (configMutation.isPending) return;
          setConfigModalOpen(false);
        }}
        title={configModalTitle}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{configModalDescription}</p>

          {loadingFormularios || fetchingFormularios ? (
            <CadastroListLoading message="Carregando formulários..." />
          ) : formularios.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-600">
              <ClipboardList className="mx-auto mb-2 h-8 w-8 text-gray-400" />
              <p className="text-sm text-gray-600 dark:text-gray-400">Nenhum formulário cadastrado.</p>
              <Link
                href="/ponto/formularios"
                className="mt-3 inline-flex text-sm font-semibold text-red-600 hover:underline"
              >
                Criar formulário
              </Link>
            </div>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {formularios.map((f) => {
                const active = selectedFormularioId === f.id;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedFormularioId(f.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                        active
                          ? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-950/40'
                          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500'
                      }`}
                    >
                      <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {f.name}
                      </span>
                      {f.description ? (
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                          {f.description}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setConfigModalOpen(false)}
              disabled={configMutation.isPending}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!selectedFormularioId || configMutation.isPending || formularios.length === 0}
              onClick={() => configMutation.mutate(selectedFormularioId)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {configMutation.isPending ? 'Salvando...' : 'Salvar formulário'}
            </button>
          </div>
        </div>
      </Modal>

      {formVariant === 'modal' ? (
        <ReuniaoFormModal
          isOpen={formOpen}
          onClose={closeForm}
          contractId={contractId}
          kind={kind}
          reuniaoId={modalReuniaoId}
          onListPatch={handleListPatch}
          readOnly={formReadOnly}
        />
      ) : null}
    </>
  );
}

export function ContratoAcompanhamentoListPage({
  config,
  tabs,
  splitWith,
  showMonthlyControleGeral = false,
}: {
  config: ContratoAcompanhamentoListConfig;
  tabs?: ContratoAcompanhamentoTabs;
  /** Quando informado, exibe este bloco ao lado de `config` (reunião + relatório). */
  splitWith?: ContratoAcompanhamentoListConfig;
  /** Cópia do Controle Geral mensal da página do contrato, acima dos painéis. */
  showMonthlyControleGeral?: boolean;
}) {
  const {
    pageTitle,
    backHref,
    backLabel = 'Voltar',
    protectedRoute = '/ponto/contratos',
  } = config;

  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawId = params?.id ?? params?.contractId;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';
  const isSplit = !!splitWith;
  const openKind: AcompanhamentoKind =
    searchParams?.get('aba') === 'relatorio-mensal' ? 'mensal' : 'semanal';
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterMonth, setFilterMonth] = useState(currentMonth);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}`)).data,
    enabled: !!contractId,
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const contract = contractData?.data as Contract | undefined;
  const availableYears = useMemo(
    () => yearsFromContractRange(contract?.startDate, contract?.endDate),
    [contract?.startDate, contract?.endDate]
  );
  const yearSelectOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '0', label: 'Todos os anos' },
        ...availableYears.map((year) => ({ value: String(year), label: String(year) })),
      ]),
    [availableYears]
  );

  if (!contractId || loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  const renderPanel = (
    panelConfig: ContratoAcompanhamentoListConfig,
    opts: { compact: boolean; formVariant: 'modal' | 'inline'; consumeOpenQuery: boolean }
  ) => (
    <ContratoAcompanhamentoPanel
      config={panelConfig}
      contractId={contractId}
      compact={opts.compact}
      formVariant={opts.formVariant}
      consumeOpenQuery={opts.consumeOpenQuery}
      filterYear={filterYear}
      filterMonth={filterMonth}
    />
  );

  return (
    <ProtectedRoute route={protectedRoute} contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div
          className={
            isSplit
              ? `flex min-h-0 flex-col gap-5 ${showMonthlyControleGeral ? '' : 'xl:h-[calc(100dvh-9.5rem)]'}`
              : 'space-y-6'
          }
        >
          <div className="relative flex min-h-[3.25rem] shrink-0 items-center justify-center py-1">
            <Link
              href={backHref?.(contractId) || `/ponto/contratos/${contractId}`}
              aria-label={backLabel}
              className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-white/70 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              {backLabel}
            </Link>
            <div className="w-full max-w-3xl px-14 text-center sm:px-20">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                {pageTitle}
              </p>
              <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 sm:text-3xl">
                {loadingContract ? 'Carregando contrato…' : contract?.name || pageTitle}
              </h1>
            </div>
          </div>

          {tabs && !isSplit ? (
            <AppUnderlineTabList aria-label="Seções de reuniões de contrato">
              {tabs.items.map((item) => (
                <AppUnderlineTabButton
                  key={item.id}
                  active={tabs.activeId === item.id}
                  onClick={() => tabs.onChange(item.id)}
                  className="px-3 py-2 text-sm"
                >
                  {item.label}
                </AppUnderlineTabButton>
              ))}
            </AppUnderlineTabList>
          ) : null}

          {showMonthlyControleGeral ? (
            <div className="flex shrink-0 flex-col gap-3">
              <ContratoReunioesLancamentosBar contractId={contractId} />
              <ContratoControleGeralMensalCard contractId={contractId} />
            </div>
          ) : null}

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <StringSingleSelectDropdown
              value={String(filterMonth)}
              onChange={(v) => setFilterMonth(Number(v))}
              options={MESES_FILTRO_SELECT_OPTIONS}
              allowEmpty={false}
              disableSearch
              menuAlign="end"
              matchTriggerWidth
              className="min-w-[9.5rem] max-w-[10.5rem]"
            />
            <StringSingleSelectDropdown
              value={String(filterYear)}
              onChange={(v) => setFilterYear(Number(v))}
              options={yearSelectOptions}
              allowEmpty={false}
              disableSearch
              menuAlign="end"
              matchTriggerWidth
              menuMinWidth={152}
              className="min-w-[5.25rem]"
            />
          </div>

          {isSplit && splitWith ? (
            <div
              className={`grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-2 xl:items-stretch ${
                showMonthlyControleGeral ? 'xl:min-h-[min(44rem,calc(100dvh-20rem))]' : ''
              }`}
            >
              <div className="flex h-full min-h-[28rem] min-w-0 flex-col">
                {renderPanel(config, {
                  compact: true,
                  formVariant: 'inline',
                  consumeOpenQuery: openKind === config.kind,
                })}
              </div>
              <div className="flex h-full min-h-[28rem] min-w-0 flex-col">
                {renderPanel(splitWith, {
                  compact: true,
                  formVariant: 'inline',
                  consumeOpenQuery: openKind === splitWith.kind,
                })}
              </div>
            </div>
          ) : (
            renderPanel(config, { compact: false, formVariant: 'modal', consumeOpenQuery: true })
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}

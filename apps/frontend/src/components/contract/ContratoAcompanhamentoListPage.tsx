'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  Trash2,
  Search,
  Eye,
  ClipboardList,
  Settings2,
  PenLine,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import { NotificationCountBadge } from '@/components/ui/NotificationCountBadge';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListEmpty, CadastroListLoading, CadastroListSummary, getCadastroListRange } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { computeRowActionMenuPosition } from '@/lib/computeRowActionMenuPosition';
import {
  cadastroListClasses,
  getListTableRowClassName,
  ListRowNavigableLabel,
  RowActionMenuCell,
} from '@/components/ui/RowActionMenu';
import { ReuniaoFormModal, type ReuniaoListPatch } from '@/components/contract/ReuniaoFormModal';
import { ContratoControleGeralMensalCard } from '@/components/contract/ContratoControleGeralMensalCard';
import { ContratoReunioesLancamentosBar } from '@/components/contract/ContratoReunioesLancamentosBar';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { entryMonthLabel, formatMonthLabel, getMensalReportMonthKey } from '@/lib/monthPeriod';
import {
  entryWeekLabel,
  formatWeekLabel,
  fortnightOverlapsCalendarMonth,
  fortnightOverlapsCalendarYear,
  getFortnightKey,
} from '@/lib/weekPeriod';
import type { AcompanhamentoKind } from '@/lib/acompanhamentoTypes';

const TOOLBAR_BTN =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

const TOOLBAR_BTN_PRIMARY =
  'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40';

const TOOLBAR_BTN_ICON =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

const TOOLBAR_BTN_PRIMARY_ICON =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40';

const SEARCH_INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

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
  submittedAt?: string;
  fillStatus?: 'nao_preenchido' | 'preenchendo' | 'preenchido';
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
  fillButtonNewLabel?: string;
  currentPeriodSummaryLabel: string;
  recordsCountLabel: (count: number) => string;
  saveSuccessToast: string;
  openSuccessToast: string;
  createSuccessToast?: string;
  backHref?: (contractId: string) => string;
  backLabel?: string;
  protectedRoute?: string;
  /** Se false, oculta configurar formulário (definido em Relatórios de Contrato). */
  allowConfigureForm?: boolean;
  /** Se false, oculta o botão + da toolbar (registro fica no menu da linha / métricas). */
  allowToolbarCreate?: boolean;
  /** Se false, oculta Editar/Excluir no menu da linha. */
  allowRowEditDelete?: boolean;
  /**
   * Quando `allowRowEditDelete` é false: se true (padrão), permite preencher/continuar;
   * se false, abre só em visualização (ex.: quinzenais no contrato).
   */
  allowFill?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
}

export type ContratoAcompanhamentoTabs = {
  items: Array<{ id: string; label: string; badgeCount?: number }>;
  activeId: string;
  onChange: (id: string) => void;
};

const FILL_STATUS_META: Record<
  NonNullable<ReuniaoEntry['fillStatus']>,
  { label: string; className: string }
> = {
  nao_preenchido: {
    label: 'Não preenchido',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  },
  preenchendo: {
    label: 'Em andamento',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  },
  preenchido: {
    label: 'Preenchido',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
};

function resolveFillStatus(entry: ReuniaoEntry): NonNullable<ReuniaoEntry['fillStatus']> {
  if (entry.fillStatus) return entry.fillStatus;
  if (entry.submittedAt) return 'preenchido';
  if (entry.updatedAt && entry.createdAt && entry.updatedAt !== entry.createdAt) {
    return 'preenchendo';
  }
  if (entry.responsavelPreenchimento?.trim()) return 'preenchendo';
  return 'nao_preenchido';
}

const REUNIAO_MENU_WIDTH_PX = 224;
const LIST_DISPLAY_LIMIT = 10;

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
  if (kind === 'mensal') return entry.monthKey === getMensalReportMonthKey();
  return entry.weekKey === getFortnightKey();
}

function panelTone(kind: AcompanhamentoKind) {
  if (kind === 'mensal') {
    return {
      iconWrap: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
      emptyTitle: 'Nenhum relatório registrado',
      emptyHint: 'Preencha o mês atual para acompanhar o contrato.',
    };
  }
  return {
    iconWrap: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    emptyTitle: 'Nenhuma reunião registrada',
    emptyHint: 'Registre a reunião da quinzena com a equipe.',
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
    fillButtonNewLabel,
    saveSuccessToast,
    openSuccessToast,
    createSuccessToast,
    backHref,
    allowConfigureForm = true,
    allowToolbarCreate = true,
    allowRowEditDelete = true,
    allowFill = true,
    emptyTitle,
    emptyHint,
  } = config;

  const relatoriosCrud = useCadastroCrudPermissions('/ponto/metricas/relatorios-contrato');
  const fromMetricasPage = config.protectedRoute === '/ponto/metricas/relatorios-contrato';
  const canWrite = !fromMetricasPage || relatoriosCrud.canEdit || relatoriosCrud.canCreate;
  const canRemove = allowRowEditDelete && relatoriosCrud.canDelete;
  const canConfigureForm = canWrite && allowConfigureForm;
  const canEditEntry = canWrite && allowRowEditDelete;
  const contractFillMode = !allowRowEditDelete && canWrite && allowFill;
  /** Métricas: editar pelo histórico; contrato mensal: preencher; contrato quinzenal: só ver. */
  const canOpenForEdit = contractFillMode || canEditEntry;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [listPage, setListPage] = useState(1);
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
  const newRecordLabel =
    fillButtonNewLabel || (kind === 'mensal' ? 'Novo relatório' : 'Nova reunião');
  const newRecordToast =
    createSuccessToast ||
    (kind === 'mensal' ? 'Novo relatório criado.' : 'Nova reunião criada.');

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
    mutationFn: async (forceNew: boolean) =>
      (await api.post(`${apiBase}/periodo-atual`, forceNew ? { forceNew: true } : {})).data,
    onSuccess: (res, forceNew) => {
      const entry = res.data as ReuniaoEntry;
      queryClient.setQueryData(listQueryKey, (old: { data?: ReuniaoEntry[] } | undefined) => {
        const list = Array.isArray(old?.data) ? old!.data : [];
        return { success: true, data: [entry, ...list.filter((r) => r.id !== entry.id)] };
      });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      setFormViewOnly(false);
      setModalReuniaoId(entry.id);
      toast.success(forceNew ? newRecordToast : openSuccessToast);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao abrir o período atual.';
      if (msg.includes('Configure o formulário')) {
        if (canConfigureForm) {
          toast.error(msg);
          setConfigModalOpen(true);
          return;
        }
        toast.error(
          'O formulário deste contrato ainda não foi definido. Configure em Relatórios de Contrato.'
        );
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

  const listRange = useMemo(
    () => getCadastroListRange(listPage, LIST_DISPLAY_LIMIT, reunioesFiltradas.length),
    [listPage, reunioesFiltradas.length],
  );

  useEffect(() => {
    setListPage(1);
  }, [searchTerm, filterYear, filterMonth, kind, contractId]);

  useEffect(() => {
    if (listPage > listRange.totalPages) {
      setListPage(listRange.totalPages);
    }
  }, [listPage, listRange.totalPages]);

  const reunioesPagina = useMemo(
    () =>
      reunioesFiltradas.slice(
        (listPage - 1) * LIST_DISPLAY_LIMIT,
        listPage * LIST_DISPLAY_LIMIT,
      ),
    [reunioesFiltradas, listPage],
  );

  const itemLabel = kind === 'mensal' ? 'mês' : 'registro';
  const itemLabelPlural = kind === 'mensal' ? 'meses' : 'registros';

  const listMarkup = (
    <>
      {loadingReunioes ? (
        <div className="mt-2">
          <CadastroListLoading message="Carregando histórico..." />
        </div>
      ) : reunioesFiltradas.length === 0 ? (
        <CadastroListEmpty
          icon={Icon}
          title={
            reunioes.length === 0
              ? emptyTitle || tone.emptyTitle
              : 'Nenhum registro encontrado'
          }
          hint={
            reunioes.length === 0
              ? emptyHint || tone.emptyHint
              : searchTerm.trim()
                ? 'Tente outro termo na busca.'
                : 'Nenhum registro neste mês e ano.'
          }
        />
      ) : (
        <>
          <CadastroListSummary
            startItem={listRange.startItem}
            endItem={listRange.endItem}
            total={reunioesFiltradas.length}
            itemLabel={itemLabel}
            itemLabelPlural={itemLabelPlural}
            currentPage={listPage}
            totalPages={listRange.totalPages}
          />
          <div className={`${cadastroListClasses.tableScroll}`}>
            <table className={cadastroListClasses.table}>
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className={cadastroListClasses.th}>{periodColumnLabel}</th>
                  {kind === 'mensal' ? (
                    <th className={cadastroListClasses.thCenter}>Status</th>
                  ) : null}
                  <th className={cadastroListClasses.thCenter}>Responsável</th>
                  {!compact ? (
                    <th className={cadastroListClasses.thCenter}>Atualizado em</th>
                  ) : null}
                  <th className={`${cadastroListClasses.thCenter} w-14`}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {reunioesPagina.map((r) => {
                  const fillStatus = resolveFillStatus(r);
                  const statusMeta = FILL_STATUS_META[fillStatus];
                  return (
                  <tr
                    key={r.id}
                    onClick={() =>
                      openReuniao(r.id, canOpenForEdit ? 'edit' : 'view')
                    }
                    className={`${getListTableRowClassName(true)} ${
                      modalReuniaoId === r.id ? 'bg-red-50/50 dark:bg-red-950/20' : ''
                    }`}
                  >
                    <td className={cadastroListClasses.td}>
                      <ListRowNavigableLabel className="truncate font-medium">
                        {entryPeriodLabel(kind, r)}
                      </ListRowNavigableLabel>
                    </td>
                    {kind === 'mensal' ? (
                      <td className={`${cadastroListClasses.td} text-center`}>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                    ) : null}
                    <td className={cadastroListClasses.tdCenter}>
                      {r.responsavelPreenchimento?.trim() || '—'}
                    </td>
                    {!compact ? (
                      <td className={cadastroListClasses.tdCenter}>
                        {formatDateTime(r.updatedAt || r.createdAt)}
                      </td>
                    ) : null}
                    <RowActionMenuCell
                      align="center"
                      isOpen={reuniaoActionMenu?.reuniaoId === r.id}
                      onToggle={(e) => {
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
                    />
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
          <ListPagination
            currentPage={listPage}
            totalPages={listRange.totalPages}
            onPageChange={setListPage}
          />
        </>
      )}
    </>
  );

  return (
    <>
      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className={`rounded-lg p-2 sm:p-3 ${tone.iconWrap}`}>
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {sectionTitle}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {sectionDescription}
                </p>
              </div>
            </div>
            <div className={cadastroListClasses.cardToolbar}>
              {!showInlineForm ? (
                <div className={cadastroListClasses.searchField}>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={searchPlaceholder}
                    className={SEARCH_INPUT_CLASS}
                  />
                </div>
              ) : null}
              {canConfigureForm ? (
                <button
                  type="button"
                  onClick={() => setConfigModalOpen(true)}
                  className={TOOLBAR_BTN_ICON}
                  title="Configurar formulário"
                  aria-label="Configurar formulário"
                >
                  <Settings2 className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                </button>
              ) : null}
              {allowToolbarCreate && (canWrite || currentPeriodEntry) ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentPeriodEntry) {
                        openReuniao(currentPeriodEntry.id, canWrite ? 'edit' : 'view');
                        return;
                      }
                      if (!canWrite) return;
                      periodoAtualMutation.mutate(false);
                    }}
                    disabled={periodoAtualMutation.isPending || loadingConfig}
                    className={TOOLBAR_BTN_PRIMARY_ICON}
                    title={
                      currentPeriodEntry
                        ? canWrite
                          ? fillButtonContinueLabel
                          : 'Visualizar quinzena'
                        : fillButtonLabel
                    }
                    aria-label={
                      currentPeriodEntry
                        ? canWrite
                          ? fillButtonContinueLabel
                          : 'Visualizar quinzena'
                        : fillButtonLabel
                    }
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                  </button>
                  {canWrite && !fromMetricasPage && (currentPeriodEntry || showInlineForm) ? (
                    <button
                      type="button"
                      onClick={() => periodoAtualMutation.mutate(true)}
                      disabled={periodoAtualMutation.isPending || loadingConfig}
                      className={TOOLBAR_BTN_ICON}
                      title={newRecordLabel}
                      aria-label={newRecordLabel}
                    >
                      <Plus className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className={cadastroListClasses.cardContent}>
          {showInlineForm ? (
            <ReuniaoFormModal
              key={modalReuniaoId}
              isOpen={formOpen}
              onClose={closeForm}
              contractId={contractId}
              kind={kind}
              reuniaoId={modalReuniaoId}
              onListPatch={handleListPatch}
              variant="inline"
              readOnly={formReadOnly}
            />
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
          {(() => {
            const menuEntry = reunioes.find((r) => r.id === reuniaoActionMenu.reuniaoId);
            const fillStatus = menuEntry ? resolveFillStatus(menuEntry) : 'nao_preenchido';
            const openMode: 'view' | 'edit' = canOpenForEdit ? 'edit' : 'view';
            const primaryLabel = contractFillMode
              ? fillStatus === 'preenchido'
                ? 'Abrir formulário'
                : fillStatus === 'preenchendo'
                  ? 'Continuar preenchimento'
                  : 'Preencher'
              : 'Visualizar';
            const PrimaryIcon = contractFillMode ? PenLine : Eye;
            const primaryIconClass = contractFillMode
              ? 'h-4 w-4 shrink-0 text-red-600 dark:text-red-400'
              : 'h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400';

            return (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    openReuniao(reuniaoActionMenu.reuniaoId, openMode);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                    contractFillMode
                      ? 'font-medium text-red-600 dark:text-red-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <PrimaryIcon className={primaryIconClass} />
                  <span>{primaryLabel}</span>
                </button>
                {canEditEntry ? (
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
              </>
            );
          })()}
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
              className={TOOLBAR_BTN}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!selectedFormularioId || configMutation.isPending || formularios.length === 0}
              onClick={() => configMutation.mutate(selectedFormularioId)}
              className={TOOLBAR_BTN_PRIMARY}
            >
              {configMutation.isPending ? 'Salvando...' : 'Salvar formulário'}
            </button>
          </div>
        </div>
      </Modal>

      {formVariant === 'modal' ? (
        <ReuniaoFormModal
          key={modalReuniaoId}
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
  const filterYear = 0;
  const filterMonth = 0;

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
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="break-words text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              {loadingContract ? 'Carregando contrato…' : contract?.name || pageTitle}
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              {pageTitle}
            </p>
          </div>

          {tabs && !isSplit ? (
            <AppUnderlineTabList aria-label="Seções de reuniões de contrato">
              {tabs.items.map((item) => (
                <AppUnderlineTabButton
                  key={item.id}
                  active={tabs.activeId === item.id}
                  onClick={() => tabs.onChange(item.id)}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm"
                >
                  {item.label}
                  {(item.badgeCount ?? 0) > 0 ? (
                    <NotificationCountBadge count={item.badgeCount!} inline />
                  ) : null}
                </AppUnderlineTabButton>
              ))}
            </AppUnderlineTabList>
          ) : null}

          {showMonthlyControleGeral ? (
            <div className="flex flex-col gap-3">
              <ContratoReunioesLancamentosBar contractId={contractId} />
              <ContratoControleGeralMensalCard contractId={contractId} />
            </div>
          ) : null}

          {isSplit && splitWith ? (
            <div className="space-y-6">
              {renderPanel(config, {
                compact: false,
                formVariant: 'modal',
                consumeOpenQuery: openKind === config.kind,
              })}
              {renderPanel(splitWith, {
                compact: false,
                formVariant: 'modal',
                consumeOpenQuery: openKind === splitWith.kind,
              })}
            </div>
          ) : (
            renderPanel(config, { compact: false, formVariant: 'modal', consumeOpenQuery: true })
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}

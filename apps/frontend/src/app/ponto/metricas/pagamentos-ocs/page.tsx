'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  AlertTriangle,
  Clock,
  CreditCard,
  Filter,
  Pencil,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { ListPagination } from '@/components/ui/ListPagination';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import {
  cadastroListClasses,
  listTableRowClasses,
  RowActionMenuCell,
  RowActionMenuPortal,
} from '@/components/ui/RowActionMenu';
import { getListTableRowClassName } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

const PAGE_SIZE = 50;
const ROUTE = '/ponto/metricas/pagamentos-ocs';

type OcsBoletoPixItem = {
  coligada: number | null;
  filial: number | null;
  poloSigla: string | null;
  idMov: number | null;
  numeroMovimento: string;
  dataEmissao: string | null;
  fornecedor: string;
  valorLiquido: number;
  condicaoDePagamento: string;
  centroCusto: string;
  status: string;
  dataVencimento: string | null;
  numeroNf: string | null;
  dataEmissaoNf: string | null;
};

type OcsBoletoPixRow = OcsBoletoPixItem & { id: string };

type OcsBoletoPixResponse = {
  configured: boolean;
  items: OcsBoletoPixItem[];
  total: number;
  message?: string | null;
};

type ExtraForm = {
  dataVencimento: string;
  numeroNf: string;
  dataEmissaoNf: string;
};

const EMPTY_EXTRA_FORM: ExtraForm = {
  dataVencimento: '',
  numeroNf: '',
  dataEmissaoNf: '',
};

type ListFilters = {
  filial: string;
  centroCusto: string;
  status: string;
  dataEmissaoDe: string;
  dataEmissaoAte: string;
};

const EMPTY_LIST_FILTERS: ListFilters = {
  filial: '',
  centroCusto: '',
  status: '',
  dataEmissaoDe: '',
  dataEmissaoAte: '',
};

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {children}
    </div>
  );
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function dateFieldToYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function matchesDateRange(value: string | null | undefined, de: string, ate: string): boolean {
  if (!de && !ate) return true;
  const ymd = dateFieldToYmd(value);
  if (!ymd) return false;
  if (de && ymd < de) return false;
  if (ate && ymd > ate) return false;
  return true;
}

function statusLabel(item: OcsBoletoPixItem): string {
  return String(item.status || '').trim() || '—';
}

function statusBadgeClass(item: OcsBoletoPixItem): string {
  const s = String(item.status || '').trim().toUpperCase();
  if (s === 'PAGO') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  }
  if (s === 'PAGO PARCIALMENTE') {
    return 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300';
  }
  if (s === 'PENDENTE') {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

function formatPolo(item: OcsBoletoPixItem): string {
  return item.poloSigla || (item.filial != null ? String(item.filial) : '—');
}

/** Vencida = ainda pendente (não paga, nem parcialmente) e com vencimento no passado. */
function isOverdueItem(item: OcsBoletoPixItem, todayYmd: string): boolean {
  if (String(item.status || '').trim().toUpperCase() !== 'PENDENTE') return false;
  const ymd = dateFieldToYmd(item.dataVencimento);
  if (!ymd) return false;
  return ymd < todayYmd;
}

function todayYmdString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function itemRowId(item: OcsBoletoPixItem, index: number): string {
  return `${item.coligada ?? 'x'}:${item.idMov ?? 'x'}:${item.filial ?? 'f'}:${index}`;
}

function hasExtraData(item: OcsBoletoPixItem): boolean {
  return Boolean(item.dataVencimento || item.numeroNf || item.dataEmissaoNf);
}

function canEditExtras(item: OcsBoletoPixItem): boolean {
  return item.coligada != null && item.idMov != null;
}

function matchesSearch(item: OcsBoletoPixItem, q: string) {
  if (!q) return true;
  const hay = [
    item.idMov,
    item.numeroMovimento,
    item.coligada,
    item.filial,
    formatPolo(item),
    item.fornecedor,
    item.condicaoDePagamento,
    item.centroCusto,
    item.dataEmissao,
    item.status,
    statusLabel(item),
    item.dataVencimento,
    item.numeroNf,
    item.dataEmissaoNf,
    formatMoney(item.valorLiquido),
  ]
    .filter((v) => v != null && v !== '')
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export default function OcsBoletoPixPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [listFilters, setListFilters] = useState<ListFilters>(EMPTY_LIST_FILTERS);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OcsBoletoPixItem | null>(null);
  const [extraForm, setExtraForm] = useState<ExtraForm>(EMPTY_EXTRA_FORM);
  const [onlyVencidas, setOnlyVencidas] = useState(false);
  const todayYmd = useMemo(() => todayYmdString(), []);

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

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['ocs-boleto-pix'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; message?: string; data: OcsBoletoPixResponse }>(
        '/ocs-boleto-pix',
        { timeout: 180_000 }
      );
      if (!res.data?.success && res.data?.message) {
        throw new Error(res.data.message);
      }
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const items = data?.items ?? [];
  const q = searchTerm.trim().toLowerCase();

  const filialOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.filial == null) continue;
      const value = String(item.filial);
      if (!map.has(value)) map.set(value, formatPolo(item));
    }
    return [...map.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([value, label]) => ({ value, label }));
  }, [items]);

  const centroCustoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const cc = String(item.centroCusto || '').trim();
      if (cc) set.add(cc);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [items]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const s = String(item.status || '').trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [items]);

  const filteredBase = useMemo(() => {
    return items.filter((item) => {
      if (listFilters.filial && String(item.filial ?? '') !== listFilters.filial) {
        return false;
      }
      if (
        listFilters.centroCusto &&
        String(item.centroCusto || '').trim() !== listFilters.centroCusto
      ) {
        return false;
      }
      if (
        !matchesDateRange(
          item.dataEmissao,
          listFilters.dataEmissaoDe,
          listFilters.dataEmissaoAte
        )
      ) {
        return false;
      }
      return matchesSearch(item, q);
    });
  }, [items, listFilters.filial, listFilters.centroCusto, listFilters.dataEmissaoDe, listFilters.dataEmissaoAte, q]);

  const pendingValor = useMemo(
    () =>
      filteredBase
        .filter((item) => String(item.status || '').trim().toUpperCase() === 'PENDENTE')
        .reduce((acc, item) => acc + (Number.isFinite(item.valorLiquido) ? item.valorLiquido : 0), 0),
    [filteredBase]
  );

  const overdueCount = useMemo(
    () => filteredBase.filter((item) => isOverdueItem(item, todayYmd)).length,
    [filteredBase, todayYmd]
  );

  const filtered = useMemo(() => {
    return filteredBase.filter((item) => {
      if (listFilters.status && String(item.status || '').trim() !== listFilters.status) {
        return false;
      }
      if (onlyVencidas && !isOverdueItem(item, todayYmd)) return false;
      return true;
    });
  }, [filteredBase, listFilters.status, onlyVencidas, todayYmd]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo((): OcsBoletoPixRow[] => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE).map((item, index) => ({
      ...item,
      id: itemRowId(item, start + index),
    }));
  }, [filtered, currentPage]);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(pageItems);

  const totalValor = useMemo(
    () =>
      filtered.reduce(
        (acc, item) => acc + (Number.isFinite(item.valorLiquido) ? item.valorLiquido : 0),
        0
      ),
    [filtered]
  );

  const hasActiveFilter = Boolean(
    listFilters.filial ||
      listFilters.centroCusto ||
      listFilters.status ||
      listFilters.dataEmissaoDe ||
      listFilters.dataEmissaoAte ||
      onlyVencidas
  );

  const listRange = getCadastroListRange(currentPage, PAGE_SIZE, filtered.length);
  const errorMessage =
    (error as { response?: { data?: { message?: string } }; message?: string } | null)?.response
      ?.data?.message ||
    (error as { message?: string } | null)?.message ||
    data?.message ||
    'Não foi possível carregar as OCs do TOTVS.';

  const setFilter =
    <K extends keyof ListFilters>(key: K) =>
    (value: ListFilters[K]) => {
      setListFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    };

  const clearFilters = () => {
    setListFilters(EMPTY_LIST_FILTERS);
    setOnlyVencidas(false);
    setPage(1);
  };

  const openExtraEditor = (item: OcsBoletoPixItem) => {
    if (!canEditExtras(item)) {
      toast.error('Esta OC não tem coligada/ID MOV para salvar os dados.');
      return;
    }
    setEditingItem(item);
    setExtraForm({
      dataVencimento: item.dataVencimento || '',
      numeroNf: item.numeroNf || '',
      dataEmissaoNf: item.dataEmissaoNf || '',
    });
    closeRowActionMenu();
  };

  const closeExtraEditor = () => {
    setEditingItem(null);
    setExtraForm(EMPTY_EXTRA_FORM);
  };

  const saveExtraMutation = useMutation({
    mutationFn: async () => {
      if (!editingItem || !canEditExtras(editingItem)) {
        throw new Error('OC inválida para edição.');
      }
      const res = await api.put('/ocs-boleto-pix/extras', {
        coligada: editingItem.coligada,
        idMov: editingItem.idMov,
        filial: editingItem.filial,
        dataVencimento: extraForm.dataVencimento || null,
        numeroNf: extraForm.numeroNf.trim() || null,
        dataEmissaoNf: extraForm.dataEmissaoNf || null,
      });
      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Falha ao salvar.');
      }
      return res.data.data as {
        dataVencimento: string | null;
        numeroNf: string | null;
        dataEmissaoNf: string | null;
      };
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['ocs-boleto-pix'], (prev: OcsBoletoPixResponse | undefined) => {
        if (!prev || !editingItem) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.coligada === editingItem.coligada && item.idMov === editingItem.idMov
              ? {
                  ...item,
                  dataVencimento: saved.dataVencimento,
                  numeroNf: saved.numeroNf,
                  dataEmissaoNf: saved.dataEmissaoNf,
                }
              : item
          ),
        };
      });
      toast.success('Dados da NF salvos.');
      closeExtraEditor();
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(err?.response?.data?.message || err?.message || 'Erro ao salvar.');
    },
  });

  if (loadingUser) {
    return (
      <ProtectedRoute route={ROUTE}>
        <MainLayout userRole="EMPLOYEE" userName="Usuário" onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const editingHasExtras = editingItem ? hasExtraData(editingItem) : false;

  return (
    <ProtectedRoute route={ROUTE}>
      <MainLayout userRole="EMPLOYEE" userName={user.name || 'Usuário'} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="flex w-full flex-col items-center text-center">
            <h1 className="w-full text-center text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Pagamentos de OCs
            </h1>
            <p className="mt-2 w-full text-center text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Acompanhe o pagamento das ordens de compra
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            <FilterStatCard
              label="Valor líquido"
              count={formatMoney(totalValor)}
              icon={Wallet}
              iconBg="bg-emerald-50 dark:bg-emerald-950/40"
              iconColor="text-emerald-600 dark:text-emerald-400"
              loading={isLoading}
            />
            <FilterStatCard
              label="Valor pendente"
              count={formatMoney(pendingValor)}
              icon={Clock}
              iconBg="bg-amber-50 dark:bg-amber-950/40"
              iconColor="text-amber-600 dark:text-amber-400"
              loading={isLoading}
            />
            <FilterStatCard
              label="OCs vencidas"
              count={overdueCount.toLocaleString('pt-BR')}
              icon={AlertTriangle}
              iconBg="bg-red-50 dark:bg-red-950/40"
              iconColor="text-red-600 dark:text-red-400"
              loading={isLoading}
            />
          </div>

          {data?.configured === false ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {data.message ||
                  'Integração TOTVS RM não configurada no backend.'}
              </p>
            </div>
          ) : null}

          {isError ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          ) : null}

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-50 p-2 sm:p-3 dark:bg-red-950/40">
                    <CreditCard
                      className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400"
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                      Lista de OCs
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {filtered.length.toLocaleString('pt-BR')} registro(s)
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchFilterGroup}>
                    <div className={cadastroListClasses.searchFieldInGroup}>
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="search"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setPage(1);
                        }}
                        placeholder="Buscar por movimento, OC, fornecedor, CC..."
                        className="box-border h-full w-full rounded-lg border border-gray-300 bg-white py-0 pl-9 pr-9 text-sm font-medium leading-10 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      {searchTerm ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm('');
                            setPage(1);
                          }}
                          aria-label="Limpar busca"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <div className={cadastroListClasses.filterIconButtonWrap}>
                      <button
                        type="button"
                        onClick={() => setIsFiltersModalOpen(true)}
                        className={`${cadastroListClasses.filterIconButton} transition-colors ${
                          hasActiveFilter
                            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                        aria-label="Abrir filtros"
                        title={hasActiveFilter ? 'Filtros ativos' : 'Filtros'}
                      >
                        <Filter className="h-4 w-4" />
                        {hasActiveFilter ? (
                          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                        ) : null}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando OCs do TOTVS..." />
              ) : filtered.length === 0 ? (
                <CadastroListEmpty
                  icon={CreditCard}
                  title="Nenhuma OC encontrada"
                  hint={
                    searchTerm || hasActiveFilter
                      ? 'Tente ajustar a busca ou os filtros.'
                      : 'Quando a consulta OCSBOLETOPIX retornar dados, eles aparecem aqui.'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={filtered.length}
                    itemLabel="OC"
                    itemLabelPlural="OCs"
                    currentPage={currentPage}
                    totalPages={listRange.totalPages}
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={`${cadastroListClasses.table} min-w-[72rem]`}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>Número da OC</th>
                          <th className={cadastroListClasses.thCenter}>Status</th>
                          <th className={cadastroListClasses.th}>Emissão</th>
                          <th className={cadastroListClasses.th}>Fornecedor</th>
                          <th className={cadastroListClasses.th}>Centro de custo</th>
                          <th className={cadastroListClasses.th}>Data de vencimento</th>
                          <th className={cadastroListClasses.th}>Número da NF</th>
                          <th className={cadastroListClasses.th}>Condição</th>
                          <th className={cadastroListClasses.thNumeric}>Valor líquido</th>
                          <th className={cadastroListClasses.thCenter}>Polo</th>
                          <th className={listTableRowClasses.actionTh}>Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {pageItems.map((item) => {
                          return (
                            <tr key={item.id} className={getListTableRowClassName(false)}>
                              <td className={cadastroListClasses.tdMono}>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                  {item.numeroMovimento || '—'}
                                </span>
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(item)}`}
                                >
                                  {statusLabel(item)}
                                </span>
                              </td>
                              <td className={`${cadastroListClasses.td} whitespace-nowrap`}>
                                {formatDate(item.dataEmissao)}
                              </td>
                              <td className={cadastroListClasses.td}>
                                <span className="line-clamp-2 max-w-[280px]">
                                  {item.fornecedor || '—'}
                                </span>
                              </td>
                              <td className={cadastroListClasses.td}>
                                <span
                                  className="line-clamp-2 max-w-[220px]"
                                  title={item.centroCusto || undefined}
                                >
                                  {item.centroCusto || '—'}
                                </span>
                              </td>
                              <td className={`${cadastroListClasses.td} whitespace-nowrap`}>
                                {formatDate(item.dataVencimento)}
                              </td>
                              <td className={cadastroListClasses.tdMono}>
                                {item.numeroNf || '—'}
                              </td>
                              <td className={cadastroListClasses.td}>
                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                  {item.condicaoDePagamento || '—'}
                                </span>
                              </td>
                              <td
                                className={`${cadastroListClasses.tdNumeric} font-semibold text-gray-900 dark:text-white`}
                              >
                                {formatMoney(item.valorLiquido)}
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                {formatPolo(item)}
                              </td>
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(item.id)}
                                onToggle={(e) =>
                                  toggleRowActionMenu(item.id, e.currentTarget as HTMLButtonElement)
                                }
                              />
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      hideDelete
                      hideDefaultActions
                      extraItems={[
                        {
                          label: hasExtraData(rowForActionMenu)
                            ? 'Editar NF / vencimento'
                            : 'Adicionar NF / vencimento',
                          icon: (
                            <Pencil className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" />
                          ),
                          onClick: () => openExtraEditor(rowForActionMenu),
                        },
                      ]}
                    />
                  ) : null}
                  <ListPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={isFiltersModalOpen}
          onClose={() => setIsFiltersModalOpen(false)}
          title="Filtros"
          size="md"
        >
          <div className="space-y-4">
            <FilterField label="Polo">
              <StringSingleSelectDropdown
                value={listFilters.filial}
                onChange={setFilter('filial')}
                options={filialOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                matchTriggerWidth
              />
            </FilterField>
            <FilterField label="Centro de custo">
              <StringSingleSelectDropdown
                value={listFilters.centroCusto}
                onChange={setFilter('centroCusto')}
                options={centroCustoOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                matchTriggerWidth
              />
            </FilterField>
            <FilterField label="Status">
              <StringSingleSelectDropdown
                value={listFilters.status}
                onChange={setFilter('status')}
                options={statusOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                matchTriggerWidth
              />
            </FilterField>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={onlyVencidas}
                onChange={(e) => {
                  setOnlyVencidas(e.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-600"
              />
              Mostrar somente OCs vencidas
            </label>
            <FilterField label="Data de emissão">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    De
                  </span>
                  <DatePickerField
                    value={listFilters.dataEmissaoDe}
                    onChange={setFilter('dataEmissaoDe')}
                    placeholder="dd/mm/aaaa"
                    noFocusRing
                    className="w-full"
                    aria-label="Data de emissão inicial"
                  />
                </div>
                <div className="min-w-0">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Até
                  </span>
                  <DatePickerField
                    value={listFilters.dataEmissaoAte}
                    onChange={setFilter('dataEmissaoAte')}
                    placeholder="dd/mm/aaaa"
                    noFocusRing
                    className="w-full"
                    aria-label="Data de emissão final"
                  />
                </div>
              </div>
            </FilterField>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={Boolean(editingItem)}
          onClose={() => {
            if (saveExtraMutation.isPending) return;
            closeExtraEditor();
          }}
          title={editingHasExtras ? 'Editar NF / vencimento' : 'Adicionar NF / vencimento'}
          size="md"
          contentOverflowVisible
        >
          {editingItem ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                OC {editingItem.numeroMovimento || editingItem.idMov || '—'}
                {editingItem.fornecedor ? ` · ${editingItem.fornecedor}` : ''}
              </p>
              <FilterField label="Data vencimento">
                <DatePickerField
                  value={extraForm.dataVencimento}
                  onChange={(value) =>
                    setExtraForm((prev) => ({ ...prev, dataVencimento: value }))
                  }
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                  className="w-full"
                  aria-label="Data de vencimento"
                />
              </FilterField>
              <FilterField label="Número da NF">
                <input
                  type="text"
                  value={extraForm.numeroNf}
                  onChange={(e) =>
                    setExtraForm((prev) => ({ ...prev, numeroNf: e.target.value }))
                  }
                  placeholder="Ex.: 12345"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </FilterField>
              <FilterField label="Data de emissão NF">
                <DatePickerField
                  value={extraForm.dataEmissaoNf}
                  onChange={(value) =>
                    setExtraForm((prev) => ({ ...prev, dataEmissaoNf: value }))
                  }
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                  className="w-full"
                  aria-label="Data de emissão da NF"
                />
              </FilterField>
              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeExtraEditor}
                  disabled={saveExtraMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => saveExtraMutation.mutate()}
                  disabled={saveExtraMutation.isPending}
                >
                  {saveExtraMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          ) : null}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

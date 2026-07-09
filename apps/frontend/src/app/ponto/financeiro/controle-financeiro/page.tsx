'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Filter,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Download,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { listTableRowClasses, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FinancialControlEntryModal } from '@/components/financeiro/FinancialControlEntryModal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import api from '@/lib/api';
import { formatDateBr, parseDateSafe } from '@/lib/dateTimeBr';
import { exportFinancialControlEntries } from '@/lib/exportFinancialControl';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  FINANCIAL_CONTROL_STATUS_FILTER_OPTIONS,
  FINANCIAL_CONTROL_STATUS_STYLES,
  type FinancialControlStatus,
  isFinancialControlPaidStatus,
} from '@/lib/financialControlStatus';
import { ListPagination } from '@/components/ui/ListPagination';

const MONTH_GROUP_PAGE_SIZE = 25;

type FinancialControlEntry = {
  id: string;
  paymentMonth: number;
  paymentYear: number;
  status: FinancialControlStatus;
  osCode: string | null;
  supplierName: string | null;
  parcelNumber: string | null;
  emissionDate: string | null;
  boleto: string | null;
  dueDate: string | null;
  originalValue: string | number | null;
  ocNumber: string | null;
  finalValue: string | number | null;
  paidDate: string | null;
  remainingDays: number | null;
  receivedNote: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_STYLES = FINANCIAL_CONTROL_STATUS_STYLES;
const STATUS_FILTER_OPTIONS = FINANCIAL_CONTROL_STATUS_FILTER_OPTIONS;

const DASHBOARD_STATUS_CARDS: {
  key: 'PROCESSO_COMPLETO' | 'PAGO_AGUARDAR_NOTA' | 'AGUARDAR_PAGAMENTO';
  title: string;
  Icon: LucideIcon;
  cardIcon: string;
  iconColor: string;
}[] = [
  {
    key: 'PROCESSO_COMPLETO',
    title: 'Processo Completo',
    Icon: ClipboardCheck,
    cardIcon: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  {
    key: 'PAGO_AGUARDAR_NOTA',
    title: 'Aguardando Nota',
    Icon: FileText,
    cardIcon: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  {
    key: 'AGUARDAR_PAGAMENTO',
    title: 'Aguardando Pagamento',
    Icon: Clock,
    cardIcon: 'bg-sky-100 dark:bg-sky-900/30',
    iconColor: 'text-sky-600 dark:text-sky-400',
  },
];

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return '-';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = parseDateSafe(value);
  if (!d || d.getFullYear() < 1990) return '—';
  return formatDateBr(value, '—');
}

/**
 * Converte a string digitada pelo usuário (ex.: "5000", "5.000,00", "5000,5") em um número.
 * Retorna null para valores inválidos/vazios.
 */
function parseCurrencyInput(value: string): number | null {
  if (!value) return null;
  const digitsOnly = value.replace(/\D/g, '');
  if (!digitsOnly) return null;
  // Tratamos os dois últimos dígitos como centavos.
  const n = parseInt(digitsOnly, 10) / 100;
  return isNaN(n) ? null : n;
}

/**
 * Formata um valor numérico (ou string numérica) em "5.000,00" (sem o "R$").
 */
function formatCurrencyValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Calcula a diferença em dias entre a data de vencimento e a data de pagamento
 * (ou entre vencimento e a data de hoje, se não houver pagamento).
 * Retorna número (pode ser negativo se o vencimento já passou) ou null.
 */
function calcRemainingDays(dueDate: string, paidDate: string): number | null {
  const due = parseDateSafe(dueDate);
  if (!due) return null;
  const ref = paidDate
    ? parseDateSafe(paidDate)
    : (() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
      })();
  if (!ref) return null;
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

function dateInputValue(value: string | null | undefined): string {
  const d = parseDateSafe(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface EntryFormState {
  id?: string;
  paymentMonth: number;
  paymentYear: number;
  status: FinancialControlStatus;
  osCode: string;
  supplierName: string;
  parcelNumber: string;
  emissionDate: string;
  boleto: string;
  dueDate: string;
  originalValue: string;
  ocNumber: string;
  finalValue: string;
  paidDate: string;
  remainingDays: string;
  receivedNote: string;
  notes: string;
}

function buildInitialForm(month: number, year: number): EntryFormState {
  return {
    paymentMonth: month,
    paymentYear: year,
    status: 'AGUARDAR_PAGAMENTO',
    osCode: '',
    supplierName: '',
    parcelNumber: '',
    emissionDate: '',
    boleto: 'Não',
    dueDate: '',
    originalValue: '',
    ocNumber: '',
    finalValue: '',
    paidDate: '',
    remainingDays: '',
    receivedNote: '',
    notes: '',
  };
}

function entryToForm(entry: FinancialControlEntry): EntryFormState {
  return {
    id: entry.id,
    paymentMonth: entry.paymentMonth,
    paymentYear: entry.paymentYear,
    status: entry.status,
    osCode: entry.osCode || '',
    supplierName: entry.supplierName || '',
    parcelNumber: entry.parcelNumber || '',
    emissionDate: dateInputValue(entry.emissionDate),
    boleto: entry.boleto || '',
    dueDate: dateInputValue(entry.dueDate),
    originalValue: formatCurrencyValue(entry.originalValue),
    ocNumber: entry.ocNumber || '',
    finalValue: formatCurrencyValue(entry.finalValue),
    paidDate: dateInputValue(entry.paidDate),
    remainingDays:
      entry.remainingDays !== null && entry.remainingDays !== undefined ? String(entry.remainingDays) : '',
    receivedNote: entry.receivedNote || '',
    notes: entry.notes || '',
  };
}

export default function ControleFinanceiroPage() {
  const queryClient = useQueryClient();

  const now = new Date();
  const currentYear = now.getFullYear();

  const [filters, setFilters] = useState({
    year: currentYear,
    month: 0, // 0 = todos os meses
    status: '' as '' | FinancialControlStatus,
    search: '',
    overdueOnly: false,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinancialControlEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => searchInputRef.current?.blur());
    return () => cancelAnimationFrame(id);
  }, []);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [importResult, setImportResult] = useState<
    | null
    | {
        created: number;
        removed: number;
        warnings: string[];
        months: { year: number; month: number; label: string }[];
      }
  >(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.year > 0) params.append('year', String(filters.year));
    if (filters.month) params.append('month', String(filters.month));
    // "Aguardar nota" inclui PAGO no cliente; não filtra só AGUARDAR_NOTA na API.
    if (filters.status && filters.status !== 'AGUARDAR_NOTA') {
      params.append('status', filters.status);
    }
    if (filters.search.trim()) params.append('search', filters.search.trim());
    return params.toString();
  }, [filters]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['financial-control', queryParams],
    queryFn: async () => {
      const res = await api.get(`/financial-control${queryParams ? `?${queryParams}` : ''}`);
      return (res.data?.data as FinancialControlEntry[]) || [];
    },
  });

  const rawEntries = data || [];

  // Filtros de status (aguardar nota) e "apenas em atraso" no cliente.
  const entries = useMemo(() => {
    let result = rawEntries;
    if (filters.status === 'AGUARDAR_NOTA') {
      result = result.filter(
        (entry) => entry.status === 'AGUARDAR_NOTA' || entry.status === 'PAGO',
      );
    }
    if (!filters.overdueOnly) return result;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return result.filter((entry) => {
      const isPago = isFinancialControlPaidStatus(entry.status);
      const isCancelado = entry.status === 'CANCELADO';
      if (isPago || isCancelado || !entry.dueDate) return false;
      const due = parseDateSafe(entry.dueDate);
      if (!due || due.getFullYear() < 1990) return false;
      return due < todayStart;
    });
  }, [rawEntries, filters.status, filters.overdueOnly]);

  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, { year: number; month: number; items: FinancialControlEntry[] }>();
    for (const entry of entries) {
      const key = `${entry.paymentYear}-${String(entry.paymentMonth).padStart(2, '0')}`;
      if (!groups.has(key)) {
        groups.set(key, { year: entry.paymentYear, month: entry.paymentMonth, items: [] });
      }
      groups.get(key)!.items.push(entry);
    }
    const grouped = Array.from(groups.values());
    grouped.forEach((group) => {
      group.items.sort((a, b) => {
        const dueA = a.dueDate ? (parseDateSafe(a.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
        const dueB = b.dueDate ? (parseDateSafe(b.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
        if (dueA !== dueB) return dueA - dueB;
        return (a.supplierName || '').localeCompare(b.supplierName || '', 'pt-BR');
      });
    });
    return grouped.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [entries]);

  /**
   * Métricas exibidas nos cards do topo. Calculadas sobre o `finalValue`
   * (valor real a pagar/pago). Reflete os filtros vigentes (ano/mês/status/
   * busca/atraso) para dar uma visão do recorte atual.
   */
  const stats = useMemo(() => {
    let totalFinalSum = 0;
    let totalPagoSum = 0;
    const byStatus: Record<
      FinancialControlStatus,
      { count: number; sum: number }
    > = {
      PROCESSO_COMPLETO: { count: 0, sum: 0 },
      PAGO: { count: 0, sum: 0 },
      AGUARDAR_NOTA: { count: 0, sum: 0 },
      AGUARDAR_PAGAMENTO: { count: 0, sum: 0 },
      CANCELADO: { count: 0, sum: 0 },
    };

    for (const entry of entries) {
      const final = Number(entry.finalValue ?? 0) || 0;
      const isCancelado = entry.status === 'CANCELADO';

      if (!isCancelado) {
        totalFinalSum += final;
      }

      byStatus[entry.status].count += 1;
      if (!isCancelado) {
        byStatus[entry.status].sum += final;
      }

      if (isFinancialControlPaidStatus(entry.status)) {
        totalPagoSum += final;
      }
    }

    return {
      total: entries.length,
      totalFinalSum,
      totalPagoSum,
      byStatus,
      pagoAguardarNota: {
        count: byStatus.PAGO.count + byStatus.AGUARDAR_NOTA.count,
        sum: byStatus.PAGO.sum + byStatus.AGUARDAR_NOTA.sum,
      },
    };
  }, [entries]);

  function dashboardCardStats(
    key: 'PROCESSO_COMPLETO' | 'PAGO_AGUARDAR_NOTA' | 'AGUARDAR_PAGAMENTO',
  ) {
    if (key === 'PAGO_AGUARDAR_NOTA') return stats.pagoAguardarNota;
    return stats.byStatus[key];
  }

  const availableYears = useMemo(() => {
    const setYears = new Set<number>();
    // Garante anos de 2023 até o ano atual (ou maior, se houver dados futuros)
    const minYear = 2023;
    const maxYear = Math.max(currentYear, ...entries.map((e) => e.paymentYear));
    for (let y = minYear; y <= maxYear; y++) {
      setYears.add(y);
    }
    entries.forEach((e) => setYears.add(e.paymentYear));
    return Array.from(setYears).sort((a, b) => b - a);
  }, [entries, currentYear]);

  const yearFilterOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '0', label: 'Todos os anos' },
        ...availableYears.map((year) => ({ value: String(year), label: String(year) })),
      ]),
    [availableYears],
  );

  const monthFilterOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '0', label: 'Todos os meses' },
        ...MONTHS_PT.map((label, idx) => ({ value: String(idx + 1), label })),
      ]),
    []
  );

  const statusFilterOptions = useMemo(() => {
    const present = new Set(rawEntries.map((entry) => entry.status));
    const hasAguardarNota = present.has('AGUARDAR_NOTA') || present.has('PAGO');
    const options = STATUS_FILTER_OPTIONS.filter((opt) => {
      if (opt.value === 'AGUARDAR_NOTA') return hasAguardarNota;
      return present.has(opt.value);
    });
    return labeledToSelectOptions([
      { value: '', label: 'Todos' },
      ...options.map((opt) => ({ value: opt.value, label: opt.label })),
    ]);
  }, [rawEntries]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/financial-control/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Lançamento excluído');
      queryClient.invalidateQueries({ queryKey: ['financial-control'] });
      setDeletingId(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao excluir lançamento');
      setDeletingId(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: async ({ file, mode }: { file: File; mode: 'append' | 'replace' }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', mode);
      const res = await api.post('/financial-control/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.message || 'Planilha importada com sucesso');
      setImportResult(data?.data || null);
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['financial-control'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao importar planilha');
    },
  });

  const openImportModal = () => {
    setImportFile(null);
    setImportMode('append');
    setImportResult(null);
    setIsImportOpen(true);
  };

  const closeImportModal = () => {
    setIsImportOpen(false);
    setImportFile(null);
    setImportResult(null);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) {
      toast.error('Selecione um arquivo .xlsx, .xls ou .csv para importar');
      return;
    }
    importMutation.mutate({ file: importFile, mode: importMode });
  };

  const openCreateModal = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const openEditModal = (entry: FinancialControlEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  const handleExport = () => {
    if (entries.length === 0) {
      toast.error('Nenhum lançamento para exportar com os filtros atuais.');
      return;
    }
    try {
      const yearPart = filters.year > 0 ? String(filters.year) : 'todos-anos';
      const monthPart =
        filters.month > 0
          ? `-${String(filters.month).padStart(2, '0')}`
          : '';
      const statusPart = filters.status ? `-${filters.status.toLowerCase()}` : '';
      const suffix = `${yearPart}${monthPart}${statusPart}_${new Date().toISOString().slice(0, 10)}`;
      exportFinancialControlEntries(entries, suffix);
      toast.success(`${entries.length} lançamento(s) exportado(s).`);
    } catch {
      toast.error('Erro ao exportar planilha.');
    }
  };

  return (
    <ProtectedRoute route="/ponto/financeiro/controle-financeiro">
      <MainLayout userRole="EMPLOYEE" userName="">
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Controle Financeiro
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Controle de Material e Serviço Aplicado com acompanhamento de pagamentos.
            </p>
          </div>

          {/* Barra de ações */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Pesquisar lançamento..."
                className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              {filters.search && (
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, search: '' })}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsFiltersModalOpen(true)}
              className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                filters.overdueOnly
                  ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
              aria-label="Abrir filtro"
              title={filters.overdueOnly ? 'Filtro (em atraso ativo)' : 'Filtro'}
            >
              <Filter className="h-4 w-4" />
              {filters.overdueOnly && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
              )}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isLoading || entries.length === 0}
              className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>Exportar</span>
            </button>
            <button
              type="button"
              onClick={openImportModal}
              className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              <Upload className="h-4 w-4 shrink-0" />
              <span>Importar</span>
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>Novo Lançamento</span>
            </button>
          </div>

          {/* Dashboards — valor total (sem cancelados) + status da planilha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex-shrink-0">
                    <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">
                      Valor Total
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">
                      {formatCurrency(stats.totalFinalSum)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {DASHBOARD_STATUS_CARDS.map((card) => {
              const bucket = dashboardCardStats(card.key);
              const StatusIcon = card.Icon;
              return (
                <Card key={card.key}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${card.cardIcon}`}>
                        <StatusIcon
                          className={`w-5 h-5 sm:w-6 sm:h-6 ${card.iconColor}`}
                          aria-hidden
                        />
                      </div>
                      <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal leading-snug">
                          {card.title}{' '}
                          <span className="text-gray-400 dark:text-gray-500">({bucket.count})</span>
                        </p>
                        <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">
                          {formatCurrency(bucket.sum)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Taxa de pagamento — barra de progresso */}
          {stats.total > 0 && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Taxa de pagamento
                    </span>
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {stats.totalFinalSum > 0
                        ? `${Math.round(
                            (stats.totalPagoSum / stats.totalFinalSum) * 100
                          )}%`
                        : '0%'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-green-500 dark:bg-green-500 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          stats.totalFinalSum > 0
                            ? (stats.totalPagoSum / stats.totalFinalSum) * 100
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatCurrency(stats.totalPagoSum)} pagos de{' '}
                    {formatCurrency(stats.totalFinalSum)} ao todo
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Conteúdo */}
          {isLoading ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Carregando lançamentos...
                </div>
              </CardContent>
            </Card>
          ) : error ? (
            <Card className="border-red-300 dark:border-red-700">
              <CardContent className="py-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">
                      Erro ao carregar dados
                    </p>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                      {(error as any)?.response?.data?.message ||
                        (error as any)?.message ||
                        'Tente novamente.'}
                    </p>
                    <button
                      onClick={() => refetch()}
                      className="mt-2 text-sm font-medium text-red-700 dark:text-red-300 underline"
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : groupedByMonth.length === 0 ? (
            <Card>
              <CardContent className="p-8">
                <div className="text-center">
                  <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Nenhum lançamento encontrado para os filtros selecionados.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4 sm:gap-6">
              {groupedByMonth.map((group) => (
                <MonthGroup
                  key={`${group.year}-${group.month}`}
                  year={group.year}
                  month={group.month}
                  items={group.items}
                  onEdit={openEditModal}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                />
              ))}
            </div>
          )}
        </div>

        <FinancialControlEntryModal
          isOpen={isModalOpen}
          onClose={closeModal}
          editingEntry={editingEntry}
          defaultPaymentMonth={filters.month || now.getMonth() + 1}
          defaultPaymentYear={filters.year || currentYear}
        />

        {/* Modal de Filtros */}
        <Modal
          isOpen={isFiltersModalOpen}
          onClose={() => setIsFiltersModalOpen(false)}
          title="Filtros"
          size="md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ano
                </label>
                <StringSingleSelectDropdown
                  value={String(filters.year)}
                  onChange={(v) => setFilters({ ...filters, year: parseInt(v, 10) })}
                  options={yearFilterOptions}
                  allowEmpty={false}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Mês
                </label>
                <StringSingleSelectDropdown
                  value={String(filters.month)}
                  onChange={(v) => setFilters({ ...filters, month: parseInt(v, 10) })}
                  options={monthFilterOptions}
                  allowEmpty={false}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <StringSingleSelectDropdown
                  value={filters.status}
                  onChange={(v) =>
                    setFilters({ ...filters, status: v as '' | FinancialControlStatus })
                  }
                  options={statusFilterOptions}
                  allowEmpty={false}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60 group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={filters.overdueOnly}
                      onChange={(e) =>
                        setFilters({ ...filters, overdueOnly: e.target.checked })
                      }
                      className="sr-only"
                    />
                    <div
                      className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                        filters.overdueOnly
                          ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                      }`}
                    >
                      {filters.overdueOnly && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Apenas em atraso
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Mostra somente lançamentos pendentes com vencimento passado
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setFilters({
                    year: currentYear,
                    month: 0,
                    status: '',
                    search: filters.search,
                    overdueOnly: false,
                  });
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal de Importação */}
        <Modal
          isOpen={isImportOpen}
          onClose={closeImportModal}
          title="Importar Planilha de Controle Financeiro"
          size="lg"
        >
          <form onSubmit={handleImportSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Arquivo da planilha <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setImportFile(f);
                    setImportResult(null);
                  }}
                  className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-red-50 dark:file:bg-red-900/30 file:text-red-700 dark:file:text-red-300 hover:file:bg-red-100 dark:hover:file:bg-red-900/50"
                />
              </div>
              {importFile && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Selecionado: <span className="font-medium">{importFile.name}</span> (
                  {(importFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div>
              <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Modo de importação
              </p>
              <div className="space-y-2">
                <ImportModeRadio
                  value="append"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                  title="Adicionar lançamentos"
                  description={
                    <>
                      Os lançamentos da planilha serão adicionados aos existentes. Pode gerar duplicatas se já existirem
                      dados para o mesmo mês.
                    </>
                  }
                />
                <ImportModeRadio
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  title="Substituir meses importados"
                  description={
                    <>
                      Para cada mês/ano detectado na planilha, todos os lançamentos existentes serão
                      <span className="font-semibold"> apagados </span>e substituídos pelos da planilha. Recomendado para
                      reimportações.
                    </>
                  }
                />
              </div>
            </div>

            {importResult && (
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-sm">
                <div className="flex items-start gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900 dark:text-green-200">
                      Importação concluída
                    </p>
                    <p className="text-green-700 dark:text-green-300">
                      {importResult.created} lançamento(s) criado(s)
                      {importResult.removed > 0 && ` · ${importResult.removed} substituído(s)`}
                    </p>
                  </div>
                </div>
                {importResult.months.length > 0 && (
                  <div className="ml-7 mt-1">
                    <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">
                      Meses detectados:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {importResult.months.map((m) => (
                        <span
                          key={`${m.year}-${m.month}`}
                          className="text-xs px-2 py-0.5 rounded-full bg-green-200 dark:bg-green-900/40 text-green-900 dark:text-green-200"
                        >
                          {m.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {importResult.warnings.length > 0 && (
                  <div className="ml-7 mt-2 text-xs text-yellow-700 dark:text-yellow-300">
                    <p className="font-medium">Avisos:</p>
                    <ul className="list-disc list-inside">
                      {importResult.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={closeImportModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {importResult ? 'Fechar' : 'Cancelar'}
              </button>
              {!importResult && (
                <button
                  type="submit"
                  disabled={!importFile || importMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Importar
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

interface ImportModeRadioProps {
  value: 'append' | 'replace';
  checked: boolean;
  onChange: () => void;
  title: string;
  description: React.ReactNode;
}

function ImportModeRadio({
  value,
  checked,
  onChange,
  title,
  description,
}: ImportModeRadioProps) {
  return (
    <label
      className="group flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700/60"
    >
      <div className="relative shrink-0 pt-0.5">
        <input
          type="radio"
          name="importMode"
          value={value}
          checked={checked}
          onChange={onChange}
          className="sr-only"
        />
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200 ${
            checked
              ? 'border-red-600 dark:border-red-500'
              : 'border-gray-300 bg-white group-hover:border-red-400 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
          }`}
        >
          {checked && <div className="h-2.5 w-2.5 rounded-full bg-red-600 dark:bg-red-500" />}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </label>
  );
}

interface MonthGroupProps {
  year: number;
  month: number;
  items: FinancialControlEntry[];
  onEdit: (entry: FinancialControlEntry) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

const ACTION_MENU_WIDTH_PX = 192;

function MonthGroup({ year, month, items, onEdit, onDelete, deletingId }: MonthGroupProps) {
  const monthLabel = MONTHS_PT[month - 1] || '';
  const totalFinal = items.reduce((sum, it) => {
    const v = it.finalValue === null || it.finalValue === undefined ? 0 : parseFloat(String(it.finalValue));
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
  const totalOriginal = items.reduce((sum, it) => {
    const v =
      it.originalValue === null || it.originalValue === undefined ? 0 : parseFloat(String(it.originalValue));
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  const titleMonth = monthLabel.charAt(0) + monthLabel.slice(1).toLowerCase();

  const [listExpanded, setListExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [actionMenu, setActionMenu] = useState<{
    entryId: string;
    top: number;
    left: number;
  } | null>(null);

  const totalPages = Math.max(1, Math.ceil(items.length / MONTH_GROUP_PAGE_SIZE));
  const startIndex = (page - 1) * MONTH_GROUP_PAGE_SIZE;
  const paginatedItems = items.slice(startIndex, startIndex + MONTH_GROUP_PAGE_SIZE);
  const rangeStart = items.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = Math.min(startIndex + MONTH_GROUP_PAGE_SIZE, items.length);

  useEffect(() => {
    setPage(1);
  }, [items.length, year, month]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const entryForMenu = useMemo(() => {
    if (!actionMenu) return null;
    return paginatedItems.find((it) => it.id === actionMenu.entryId) ?? null;
  }, [actionMenu, paginatedItems]);

  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [actionMenu]);

  useEffect(() => {
    if (actionMenu && !paginatedItems.some((it) => it.id === actionMenu.entryId)) {
      setActionMenu(null);
    }
  }, [actionMenu, paginatedItems]);

  useEffect(() => {
    if (!listExpanded) setActionMenu(null);
  }, [listExpanded]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b-0 !pb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Pagamentos de {titleMonth} de {year}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {items.length} {items.length === 1 ? 'lançamento' : 'lançamentos'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 border-t border-gray-100 dark:border-gray-700/80 pt-3 sm:border-t-0 sm:pt-0">
            <dl className="flex items-baseline gap-4 sm:gap-5 text-sm">
              <div>
                <dt className="text-xs text-gray-500 dark:text-gray-400 font-medium">Original</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {formatCurrency(totalOriginal)}
                </dd>
              </div>
              <div className="hidden sm:block w-px h-9 self-center bg-gray-200 dark:bg-gray-600" aria-hidden />
              <div>
                <dt className="text-xs text-red-600/90 dark:text-red-400 font-medium">Final</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-red-700 dark:text-red-300">
                  {formatCurrency(totalFinal)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setListExpanded((v) => !v)}
              className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/80 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              aria-expanded={listExpanded}
              aria-controls={`month-list-${year}-${month}`}
              title={listExpanded ? 'Recolher lista' : 'Expandir lista'}
            >
              {listExpanded ? (
                <ChevronUp className="w-5 h-5" aria-hidden />
              ) : (
                <ChevronDown className="w-5 h-5" aria-hidden />
              )}
              <span className="sr-only">{listExpanded ? 'Recolher lista' : 'Expandir lista'}</span>
            </button>
          </div>
        </div>
      </CardHeader>
      <div id={`month-list-${year}-${month}`} className={listExpanded ? '' : 'hidden'}>
        <CardContent className="px-0 !pt-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <tr>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  O.S.
                </th>
                <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Nome do Fornecedor
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Número da Parcela
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Data Emissão
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Boleto
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Data de Vencimento
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor Original
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  O.C.
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor Final
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Data de Pagamento
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Diferença de Dias
                </th>
                <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Observação
                </th>
                <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Ação
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedItems.map((entry) => {
                const statusStyle =
                  STATUS_STYLES[entry.status] ?? STATUS_STYLES.AGUARDAR_PAGAMENTO;
                const isDeleting = deletingId === entry.id;
                const isOverdue =
                  entry.remainingDays !== null &&
                  entry.remainingDays !== undefined &&
                  entry.remainingDays < 0;

                return (
                  <tr
                    key={entry.id}
                    className={listTableRowClasses.tr}
                  >
                    <td className="px-3 sm:px-6 py-3 text-center">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                      {entry.osCode || '—'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-left">
                      <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">{entry.supplierName || '—'}</span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                      {entry.parcelNumber || '—'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                      {formatDate(entry.emissionDate)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                      {entry.boleto || '—'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center font-medium text-gray-900 dark:text-gray-100">
                      {formatDate(entry.dueDate)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums">
                      {formatCurrency(entry.originalValue)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                      {entry.ocNumber || '—'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {formatCurrency(entry.finalValue)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                      {formatDate(entry.paidDate)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center">
                      {(() => {
                        // Sempre recalcula a partir das datas quando ambas estão presentes,
                        // garantindo que diferença = 0 seja exibida como "0" (e não "—").
                        const computed =
                          entry.dueDate && entry.paidDate
                            ? calcRemainingDays(entry.dueDate, entry.paidDate)
                            : entry.remainingDays;
                        if (computed === null || computed === undefined) {
                          return <span className="text-gray-400 dark:text-gray-500">—</span>;
                        }
                        return (
                          <span
                            className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${
                              isOverdue
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {computed}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                      {entry.receivedNote || <span className="text-gray-400 dark:text-gray-500">—</span>}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-right">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setActionMenu((prev) => {
                              if (prev?.entryId === entry.id) return null;
                              let left = r.right - ACTION_MENU_WIDTH_PX;
                              left = Math.max(
                                8,
                                Math.min(left, window.innerWidth - ACTION_MENU_WIDTH_PX - 8)
                              );
                              return { entryId: entry.id, top: r.bottom + 4, left };
                            });
                          }}
                          disabled={isDeleting}
                          className={`${rowActionMenuButtonClass(actionMenu?.entryId === entry.id)} disabled:opacity-50`}
                          aria-label="Menu de ações"
                          aria-expanded={actionMenu?.entryId === entry.id}
                          aria-haspopup="menu"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <MoreVertical className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {items.length > MONTH_GROUP_PAGE_SIZE && (
          <div className="border-t border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-6">
            <p className="mb-3 text-center text-sm text-gray-600 dark:text-gray-400">
              Exibindo {rangeStart}–{rangeEnd} de {items.length} lançamentos
            </p>
            <ListPagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
        </CardContent>
      </div>

      {actionMenu &&
        entryForMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="app-modal-overlay fixed inset-0 z-[2000]"
              aria-hidden
              onClick={() => setActionMenu(null)}
            />
            <div
              role="menu"
              className="fixed z-[201] w-48 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
              style={{
                top: actionMenu.top,
                left: actionMenu.left,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setActionMenu(null);
                  onEdit(entryForMenu);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Pencil className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Editar lançamento</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setActionMenu(null);
                  onDelete(entryForMenu.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 border-t border-gray-200 dark:border-gray-700"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Excluir lançamento</span>
              </button>
            </div>
          </>,
          document.body,
        )}
    </Card>
  );
}

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Input formatado como moeda brasileira (ex.: "5.000,00") sem as setinhas do tipo number.
 * Internamente trabalha com a string já formatada; ao salvar usa parseCurrencyInput().
 */
function CurrencyInput({ value, onChange, placeholder = '0,00' }: CurrencyInputProps) {
  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      onChange('');
      return;
    }
    const number = parseInt(digits, 10) / 100;
    const formatted = number.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    onChange(formatted);
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400 pointer-events-none">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white text-right tabular-nums"
      />
    </div>
  );
}

interface RemainingDaysDisplayProps {
  dueDate: string;
  paidDate: string;
}

/**
 * Exibe (somente leitura) o cálculo de "Falta Dias" entre a Data de Vencto e a Data de Pagamento
 * (ou a data atual, se ainda não pago).
 */
function RemainingDaysDisplay({ dueDate, paidDate }: RemainingDaysDisplayProps) {
  const v = calcRemainingDays(dueDate, paidDate);

  let label: string;
  let tone = 'text-gray-900 dark:text-gray-100';

  if (v === null) {
    label = 'Informe a data de vencimento';
    tone = 'text-gray-400 dark:text-gray-500';
  } else if (v > 0) {
    label = `${v} ${v === 1 ? 'dia' : 'dias'}${paidDate ? ' (pago antes)' : ''}`;
  } else if (v === 0) {
    label = paidDate ? 'Pago no dia' : 'Vence hoje';
    tone = 'text-yellow-700 dark:text-yellow-300 font-semibold';
  } else {
    const days = Math.abs(v);
    label = `${days} ${days === 1 ? 'dia' : 'dias'} ${paidDate ? 'após o vencimento' : 'em atraso'}`;
    tone = 'text-red-700 dark:text-red-300 font-semibold';
  }

  return (
    <div
      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/60 text-sm h-[42px] flex items-center ${tone}`}
    >
      {label}
    </div>
  );
}

interface BoletoToggleProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Checkbox "Sim" / "Não" para o campo Boleto, no mesmo estilo do "Lembre de mim" da página de login.
 * - Marcado → grava "Sim"
 * - Desmarcado → grava "Não"
 * - Valores especiais vindos da planilha (ex.: "CANCELADA") são exibidos como badge somente leitura.
 */
function BoletoToggle({ value, onChange }: BoletoToggleProps) {
  const normalized = (value || '').trim().toLowerCase();
  const isSpecialValue =
    normalized !== '' && normalized !== 'sim' && normalized !== 'não' && normalized !== 'nao';

  if (isSpecialValue) {
    return (
      <div className="flex items-center gap-2 h-[42px]">
        <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-sm font-medium uppercase">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange('Não')}
          className="text-xs text-gray-500 dark:text-gray-400 underline hover:text-gray-700 dark:hover:text-gray-200"
        >
          Limpar
        </button>
      </div>
    );
  }

  const isYes = normalized === 'sim';

  return (
    <label className="flex items-center gap-3 cursor-pointer group h-[42px] select-none">
      <div className="relative">
        <input
          type="checkbox"
          checked={isYes}
          onChange={(e) => onChange(e.target.checked ? 'Sim' : 'Não')}
          className="sr-only"
        />
        <div
          className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
            isYes
              ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
          }`}
        >
          {isYes && (
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {isYes ? 'Sim' : 'Não'}
      </span>
    </label>
  );
}


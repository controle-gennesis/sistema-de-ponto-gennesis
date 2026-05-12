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
  CircleDollarSign,
  ClipboardList,
  Filter,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import api from '@/lib/api';

type FinancialControlStatus =
  | 'PROCESSO_COMPLETO'
  | 'PAGO'
  | 'AGUARDAR_NOTA'
  | 'CANCELADO';

interface FinancialControlEntry {
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
}

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

const STATUS_OPTIONS: { value: FinancialControlStatus; label: string }[] = [
  { value: 'PAGO', label: 'PAGO' },
  { value: 'AGUARDAR_NOTA', label: 'PENDENTE' },
  { value: 'CANCELADO', label: 'CANCELADO' },
];

const STATUS_STYLES: Record<FinancialControlStatus, { bg: string; text: string; label: string }> = {
  PROCESSO_COMPLETO: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-200',
    label: 'PAGO',
  },
  PAGO: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-200',
    label: 'PAGO',
  },
  AGUARDAR_NOTA: {
    bg: 'bg-yellow-200 dark:bg-yellow-900/40',
    text: 'text-yellow-900 dark:text-yellow-200',
    label: 'PENDENTE',
  },
  CANCELADO: {
    bg: 'bg-red-200 dark:bg-red-900/40',
    text: 'text-red-900 dark:text-red-200',
    label: 'CANCELADO',
  },
};

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return '-';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  // Considera datas antes de 1990 como inválidas (provavelmente lixo da importação)
  if (d.getFullYear() < 1990) return '—';
  return d.toLocaleDateString('pt-BR');
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
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return null;
  const ref = paidDate ? new Date(paidDate) : new Date();
  if (isNaN(ref.getTime())) return null;
  // Normalizar para meia-noite para diferença em dias inteiros
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

function dateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
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
    status: 'AGUARDAR_NOTA',
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
  const [form, setForm] = useState<EntryFormState>(() => buildInitialForm(now.getMonth() + 1, currentYear));
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

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
    if (filters.year) params.append('year', String(filters.year));
    if (filters.month) params.append('month', String(filters.month));
    if (filters.status) params.append('status', filters.status);
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

  // Aplica o filtro "apenas em atraso" no cliente (o backend não conhece esse filtro).
  const entries = useMemo(() => {
    if (!filters.overdueOnly) return rawEntries;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return rawEntries.filter((entry) => {
      const isPago = entry.status === 'PAGO' || entry.status === 'PROCESSO_COMPLETO';
      const isCancelado = entry.status === 'CANCELADO';
      if (isPago || isCancelado || !entry.dueDate) return false;
      const due = new Date(entry.dueDate);
      if (isNaN(due.getTime()) || due.getFullYear() < 1990) return false;
      return due < todayStart;
    });
  }, [rawEntries, filters.overdueOnly]);

  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, { year: number; month: number; items: FinancialControlEntry[] }>();
    for (const entry of entries) {
      const key = `${entry.paymentYear}-${String(entry.paymentMonth).padStart(2, '0')}`;
      if (!groups.has(key)) {
        groups.set(key, { year: entry.paymentYear, month: entry.paymentMonth, items: [] });
      }
      groups.get(key)!.items.push(entry);
    }
    return Array.from(groups.values()).sort((a, b) => {
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
    let totalPendenteSum = 0;
    let qtdPago = 0;
    let qtdPendente = 0;

    for (const entry of entries) {
      const final = Number(entry.finalValue ?? 0) || 0;

      const isPago = entry.status === 'PAGO' || entry.status === 'PROCESSO_COMPLETO';
      const isPendente = entry.status === 'AGUARDAR_NOTA';
      const isCancelado = entry.status === 'CANCELADO';

      // Cancelados não somam no total final (valor "vai a zero").
      if (!isCancelado) {
        totalFinalSum += final;
      }

      if (isPago) {
        totalPagoSum += final;
        qtdPago += 1;
      } else if (isPendente) {
        totalPendenteSum += final;
        qtdPendente += 1;
      }
    }

    return {
      total: entries.length,
      totalFinalSum,
      totalPagoSum,
      totalPendenteSum,
      qtdPago,
      qtdPendente,
    };
  }, [entries]);

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

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/financial-control', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Lançamento criado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['financial-control'] });
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao criar lançamento');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await api.patch(`/financial-control/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Lançamento atualizado');
      queryClient.invalidateQueries({ queryKey: ['financial-control'] });
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao atualizar lançamento');
    },
  });

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
    const month = filters.month || now.getMonth() + 1;
    const year = filters.year || currentYear;
    setEditingEntry(null);
    setForm(buildInitialForm(month, year));
    setIsModalOpen(true);
  };

  const openEditModal = (entry: FinancialControlEntry) => {
    setEditingEntry(entry);
    setForm(entryToForm(entry));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const computedRemainingDays = calcRemainingDays(form.dueDate, form.paidDate);
    const payload = {
      paymentMonth: form.paymentMonth,
      paymentYear: form.paymentYear,
      status: form.status,
      osCode: form.osCode || null,
      supplierName: form.supplierName || null,
      parcelNumber: form.parcelNumber || null,
      emissionDate: form.emissionDate || null,
      boleto: form.boleto || null,
      dueDate: form.dueDate || null,
      originalValue: parseCurrencyInput(form.originalValue),
      ocNumber: form.ocNumber || null,
      finalValue: parseCurrencyInput(form.finalValue),
      paidDate: form.paidDate || null,
      remainingDays: computedRemainingDays,
      receivedNote: form.receivedNote || null,
      notes: form.notes || null,
    };
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
    setDeletingId(id);
    deleteMutation.mutate(id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <ProtectedRoute route="/ponto/financeiro/controle-financeiro">
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={() => {}}>
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

          {/* Dashboards — métricas do recorte filtrado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">
                      Total de Lançamentos
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {stats.total}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex-shrink-0">
                    <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">
                      Valor Final
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">
                      {formatCurrency(stats.totalFinalSum)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">
                      Pago{' '}
                      <span className="text-gray-400 dark:text-gray-500">
                        ({stats.qtdPago})
                      </span>
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">
                      {formatCurrency(stats.totalPagoSum)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex-shrink-0">
                    <CircleDollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">
                      Pendente{' '}
                      <span className="text-gray-400 dark:text-gray-500">
                        ({stats.qtdPendente})
                      </span>
                    </p>
                    <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">
                      {formatCurrency(stats.totalPendenteSum)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
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

          {/* Barra de ações */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Pesquisar lançamento..."
                className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
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
              <CardContent className="py-16">
                <div className="text-center">
                  <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Nenhum lançamento encontrado para os filtros selecionados.
                  </p>
                  <button
                    onClick={openCreateModal}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar primeiro lançamento
                  </button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
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

        {/* Modal de criar/editar */}
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={editingEntry ? 'Editar Lançamento' : 'Novo Lançamento'}
          size="xl"
        >
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            {/* Truque para impedir o Chrome de oferecer autocomplete de cartão/pagamento */}
            <input type="text" name="prevent-autofill" autoComplete="off" className="hidden" tabIndex={-1} />

            {/* Período de Pagamento */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Mês <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.paymentMonth}
                  onChange={(e) => setForm({ ...form, paymentMonth: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                >
                  {MONTHS_PT.map((label, idx) => (
                    <option key={idx} value={idx + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Ano <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.paymentYear}
                  onChange={(e) => setForm({ ...form, paymentYear: parseInt(e.target.value, 10) })}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as FinancialControlStatus })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Identificação */}
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  O.S.
                </label>
                <input
                  type="text"
                  value={form.osCode}
                  onChange={(e) => setForm({ ...form, osCode: e.target.value })}
                  placeholder="Ex.: ADM, IMP-20/SC-01"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nome do Fornecedor
                </label>
                <input
                  type="text"
                  value={form.supplierName}
                  onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                  placeholder="Ex.: POTENCIAL SEGURADORA"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Número da Parcela
                </label>
                <input
                  type="text"
                  value={form.parcelNumber}
                  onChange={(e) => setForm({ ...form, parcelNumber: e.target.value })}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  O.C.
                </label>
                <input
                  type="text"
                  value={form.ocNumber}
                  onChange={(e) => setForm({ ...form, ocNumber: e.target.value })}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Boleto
                  </label>
                  <BoletoToggle
                    value={form.boleto}
                    onChange={(v) => setForm({ ...form, boleto: v })}
                  />
                </div>
              </div>
            </div>

            {/* Datas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Data de Emissão
                </label>
                <input
                  type="date"
                  value={form.emissionDate}
                  onChange={(e) => setForm({ ...form, emissionDate: e.target.value })}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Data de Vencimento
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Data de Pagamento
                </label>
                <input
                  type="date"
                  value={form.paidDate}
                  onChange={(e) => setForm({ ...form, paidDate: e.target.value })}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>

            {/* Valores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Valor Original
                </label>
                <CurrencyInput
                  value={form.originalValue}
                  onChange={(v) => setForm({ ...form, originalValue: v })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Valor Final
                </label>
                <CurrencyInput
                  value={form.finalValue}
                  onChange={(v) => setForm({ ...form, finalValue: v })}
                />
              </div>
            </div>

            {/* Observação */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Observação
              </label>
              <textarea
                value={form.receivedNote}
                onChange={(e) => setForm({ ...form, receivedNote: e.target.value })}
                placeholder="Ex.: PAGO TED, PAGO PIX, CANCELADO"
                rows={3}
                autoComplete="off"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white resize-y"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingEntry ? 'Salvar alterações' : 'Criar lançamento'}
              </button>
            </div>
          </form>
        </Modal>

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
                <select
                  value={filters.year}
                  onChange={(e) => setFilters({ ...filters, year: parseInt(e.target.value, 10) })}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Mês
                </label>
                <select
                  value={filters.month}
                  onChange={(e) => setFilters({ ...filters, month: parseInt(e.target.value, 10) })}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value={0}>Todos os meses</option>
                  {MONTHS_PT.map((label, idx) => (
                    <option key={idx} value={idx + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value as '' | FinancialControlStatus })
                  }
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="">Todos</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
                Aplicar
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
                <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <input
                    type="radio"
                    name="importMode"
                    value="append"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Adicionar lançamentos
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Os lançamentos da planilha serão adicionados aos existentes. Pode gerar duplicatas se já existirem
                      dados para o mesmo mês.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Substituir meses importados
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Para cada mês/ano detectado na planilha, todos os lançamentos existentes serão
                      <span className="font-semibold"> apagados </span>e substituídos pelos da planilha. Recomendado para
                      reimportações.
                    </p>
                  </div>
                </label>
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

  const [actionMenu, setActionMenu] = useState<{
    entryId: string;
    top: number;
    left: number;
  } | null>(null);

  const entryForMenu = useMemo(() => {
    if (!actionMenu) return null;
    return items.find((it) => it.id === actionMenu.entryId) ?? null;
  }, [actionMenu, items]);

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
    if (actionMenu && !items.some((it) => it.id === actionMenu.entryId)) {
      setActionMenu(null);
    }
  }, [actionMenu, items]);

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
              {items.map((entry) => {
                const statusStyle = STATUS_STYLES[entry.status];
                const isDeleting = deletingId === entry.id;
                const isOverdue =
                  entry.remainingDays !== null &&
                  entry.remainingDays !== undefined &&
                  entry.remainingDays < 0;

                return (
                  <tr
                    key={entry.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
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
                    <td className="px-3 sm:px-6 py-3 text-sm text-left font-medium text-gray-900 dark:text-gray-100">
                      {entry.supplierName || '—'}
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
                          className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
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
        </CardContent>
      </div>

      {actionMenu &&
        entryForMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[200]"
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


'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ClipboardList,
  Edit,
  Trash2,
  Search,
  X,
  AlertCircle,
  Filter,
  MoreVertical,
} from 'lucide-react';

const ROW_ACTION_MENU_WIDTH_PX = 224;
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { listTableRowClasses, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import {
  budgetStatusPillClass,
  executionStatusPillClass,
  pleitoStatusReadOnlySpanClass,
  pleitoStatusSelectBase
} from '@/lib/pleitoStatusStyles';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const RVI_RVF_OPCOES = ['FEITO', 'PENDENTE'];

const STATUS_EXECUCAO_OPCOES = [
  'CONCLUÍDA',
  'EXECUÇÃO',
  'FINALIZADA',
  'GARANTIA',
  'GARANTIA RESOLVIDA',
  'PD. EXECUÇÃO',
  'PENDÊNCIA',
  'STANDBY'
];

const STATUS_ORCAMENTO_OPCOES = [
  'Analise Fiscal',
  'Engenharia',
  'Equipe de Orçamento',
  'Aprovado',
  'Faturado',
  'Stand By'
];
const OUTRO_STATUS = '__OUTRO__';

const ANO_ATUAL = new Date().getFullYear();
const ANOS_FILTRO = Array.from({ length: 16 }, (_, i) => ANO_ATUAL - 6 + i);

const MESES = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' }
];

const CREATION_MONTH_SELECT_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Selecione' },
  ...MESES.map((m) => ({ value: m.value, label: m.label })),
]);
const BUDGET_STATUS_SELECT_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Selecione' },
  ...STATUS_ORCAMENTO_OPCOES.map((op) => ({ value: op, label: op })),
  { value: OUTRO_STATUS, label: 'Outro (cadastrar novo)' },
]);
const EXECUTION_STATUS_SELECT_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Selecione' },
  ...STATUS_EXECUCAO_OPCOES.map((op) => ({ value: op, label: op })),
]);
const RVI_RVF_SELECT_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Selecione' },
  ...RVI_RVF_OPCOES.map((op) => ({ value: op, label: op })),
]);
const FILTER_MONTH_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  ...MESES.map((m) => ({ value: m.value, label: m.label })),
]);
const FILTER_YEAR_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  ...ANOS_FILTRO.map((y) => ({ value: String(y), label: String(y) })),
]);
const FILTER_BUDGET_STATUS_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  ...STATUS_ORCAMENTO_OPCOES.map((op) => ({ value: op, label: op })),
]);
const FILTER_PENDING_BILLING_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  { value: 'sim', label: 'Com valor pendente' },
  { value: 'nao', label: 'Sem pendência' },
]);
const BILLING_STATUS_ROW_OPTIONS = labeledToSelectOptions([
  { value: 'nao-pago', label: 'Não pago' },
  { value: 'pago', label: 'Pago' },
]);

function getCurrentMonthYear() {
  const d = new Date();
  return {
    creationMonth: String(d.getMonth() + 1).padStart(2, '0'),
    creationYear: String(d.getFullYear())
  };
}

export interface Pleito {
  id: string;
  updatedContract?: { id: string; name: string; number: string } | null;
  creationMonth: string | null;
  creationYear: number | null;
  startDate: string | null;
  endDate: string | null;
  budgetStatus: string | null;
  folderNumber: string | null;
  lot: string | null;
  divSe: string | null;
  location: string | null;
  unit: string | null;
  serviceDescription: string;
  budget: string | null;
  executionStatus: string | null;
  billingStatus: string | null;
  accumulatedBilled: number | null;
  billingRequest: number | null;
  budgetAmount1: number | null;
  budgetAmount2: number | null;
  budgetAmount3: number | null;
  budgetAmount4: number | null;
  pv: string | null;
  ipi: string | null;
  reportsBilling: string | null;
  engineer: string | null;
  supervisor: string | null;
}

const emptyForm = (): Record<string, string> => {
  const { creationMonth, creationYear } = getCurrentMonthYear();
  return {
  creationMonth,
  creationYear,
  startDate: '',
  endDate: '',
  budgetStatus: '',
  budgetStatusCustom: '',
  folderNumber: '',
  lot: '',
  divSe: '',
  location: '',
  unit: '',
  serviceDescription: '',
  executionStatus: '',
  billingStatus: '',
  accumulatedBilled: '',
  billingRequest: '',
  budgetAmount1: '',
  budgetAmount2: '',
  budgetAmount3: '',
  budgetAmount4: '',
  pv: '',
  ipi: '',
  reportsBilling: '',
  engineer: '',
  supervisor: ''
  };
};

function pleitoToForm(p: Pleito): Record<string, string> {
  const m = p.creationMonth;
  const num = m ? parseInt(String(m).replace(/\D/g, ''), 10) : NaN;
  const monthVal = num >= 1 && num <= 12 ? String(num).padStart(2, '0') : (m || '');
  return {
    creationMonth: monthVal,
    creationYear: p.creationYear != null ? String(p.creationYear) : '',
    startDate: p.startDate ? p.startDate.split('T')[0] : '',
    endDate: p.endDate ? p.endDate.split('T')[0] : '',
    budgetStatus: STATUS_ORCAMENTO_OPCOES.includes(p.budgetStatus || '') ? (p.budgetStatus || '') : (p.budgetStatus ? OUTRO_STATUS : ''),
    budgetStatusCustom: STATUS_ORCAMENTO_OPCOES.includes(p.budgetStatus || '') ? '' : (p.budgetStatus || ''),
    folderNumber: p.folderNumber || '',
    lot: p.lot || '',
    divSe: p.divSe || '',
    location: p.location || '',
    unit: p.unit || '',
    serviceDescription: p.serviceDescription || '',
    executionStatus: p.executionStatus || '',
    billingStatus: (p.billingStatus || '').replace('%', '').trim(),
    accumulatedBilled: formatBudgetForInput(p.accumulatedBilled != null ? String(p.accumulatedBilled) : null),
    billingRequest: formatBudgetForInput(p.billingRequest != null ? String(p.billingRequest) : null),
    budgetAmount1: formatBudgetForInput(p.budgetAmount1 != null ? String(p.budgetAmount1) : null),
    budgetAmount2: formatBudgetForInput(p.budgetAmount2 != null ? String(p.budgetAmount2) : null),
    budgetAmount3: formatBudgetForInput(p.budgetAmount3 != null ? String(p.budgetAmount3) : null),
    budgetAmount4: formatBudgetForInput(p.budgetAmount4 != null ? String(p.budgetAmount4) : null),
    pv: p.pv || '',
    ipi: p.ipi || '',
    reportsBilling: p.reportsBilling || '',
    engineer: p.engineer || '',
    supervisor: p.supervisor || ''
  };
}

const toPayloadNum = (v: string) => { const n = parseBudgetToNumber(v); return n !== 0 ? n : null; };
const toPayloadStr = (v: string) => (v?.trim() || null);
const currencyChange = (form: Record<string, string>, setForm: (f: Record<string, string>) => void, key: string) =>
  (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '');
    setForm({ ...form, [key]: v ? (Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' });
  };

function formToPayload(f: Record<string, string>) {
  const nBudget = parseBudgetToNumber(getLatestBudgetFromForm(f));
  return {
    creationMonth: toPayloadStr(f.creationMonth),
    creationYear: toPayloadStr(f.creationYear),
    startDate: toPayloadStr(f.startDate),
    endDate: toPayloadStr(f.endDate),
    budgetStatus: (f.budgetStatus === OUTRO_STATUS ? f.budgetStatusCustom?.trim() : f.budgetStatus?.trim()) || null,
    folderNumber: toPayloadStr(f.folderNumber),
    lot: toPayloadStr(f.lot),
    divSe: toPayloadStr(f.divSe),
    location: toPayloadStr(f.location),
    unit: toPayloadStr(f.unit),
    serviceDescription: f.serviceDescription.trim(),
    budget: nBudget !== 0 ? nBudget.toFixed(2) : null,
    executionStatus: toPayloadStr(f.executionStatus),
    billingStatus: f.billingStatus ? String(f.billingStatus).replace(',', '.').trim() : null,
    updatedContractId: null,
    accumulatedBilled: toPayloadNum(f.accumulatedBilled)?.toFixed(2) ?? null,
    billingRequest: toPayloadNum(f.billingRequest)?.toFixed(2) ?? null,
    invoiceNumber: null,
    estimator: null,
    budgetAmount1: toPayloadNum(f.budgetAmount1),
    budgetAmount2: toPayloadNum(f.budgetAmount2),
    budgetAmount3: toPayloadNum(f.budgetAmount3),
    budgetAmount4: toPayloadNum(f.budgetAmount4),
    pv: toPayloadStr(f.pv),
    ipi: toPayloadStr(f.ipi),
    reportsBilling: toPayloadStr(f.reportsBilling),
    engineer: toPayloadStr(f.engineer),
    supervisor: toPayloadStr(f.supervisor)
  };
}

function formatDate(s: string | null) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('pt-BR');
}

function formatMoney(n: number | null) {
  if (n == null) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function parseBudgetToNumber(v: string | null): number {
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function formatBudgetForInput(v: string | null): string {
  const n = parseBudgetToNumber(v);
  return n === 0 ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Retorna o valor do orçamento mais atual (último R0X preenchido: R04 > R03 > R02 > R01) */
function getLatestBudgetFromForm(f: Record<string, string>): string {
  for (let i = 4; i >= 1; i--) {
    const n = parseBudgetToNumber(f[`budgetAmount${i}`]);
    if (n !== 0) return formatBudgetForInput(String(n));
  }
  return '';
}

function formatBudgetCurrency(v: string | null): string {
  if (!v) return '-';
  const n = parseBudgetToNumber(v);
  return n === 0 ? '-' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatCreationMonthYear(month: string | null, year: number | null): string {
  if (!month && !year) return '-';
  const m = month ? parseInt(String(month).replace(/\D/g, ''), 10) : NaN;
  const monthLabel = m >= 1 && m <= 12 ? MESES[m - 1]?.label : month || '';
  const yearStr = year ? String(year) : '';
  if (monthLabel && yearStr) return `${monthLabel}/${yearStr}`;
  return monthLabel || yearStr || '-';
}

function Input({
  label,
  name,
  form,
  setForm,
  type = 'text',
  textarea = false,
  step
}: {
  label: string;
  name: string;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  type?: string;
  textarea?: boolean;
  step?: string;
}) {
  const base =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      {textarea ? (
        <textarea
          rows={3}
          value={form[name] || ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          className={base}
        />
      ) : (
        <input
          type={type}
          step={step}
          value={form[name] || ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          className={base}
        />
      )}
    </div>
  );
}

export default function AndamentoDaOsPage() {
  return (
    <ProtectedRoute route="/ponto/andamento-da-os">
      <AndamentoDaOsPageContent />
    </ProtectedRoute>
  );
}

function AndamentoDaOsPageContent() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterContractId, setFilterContractId] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterLot, setFilterLot] = useState('');
  const [filterBudgetStatus, setFilterBudgetStatus] = useState('');
  const [filterPendingBilling, setFilterPendingBilling] = useState<'sim' | 'nao' | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Pleito | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [rowActionMenu, setRowActionMenu] = useState<{
    pleitoId: string;
    top: number;
    left: number;
  } | null>(null);

  const hasActiveOsFilters = Boolean(
    filterContractId ||
      filterMonth ||
      filterYear ||
      filterLot.trim() ||
      filterBudgetStatus ||
      filterPendingBilling
  );

  const clearOsFilters = () => {
    setFilterContractId('');
    setFilterMonth('');
    setFilterYear('');
    setFilterLot('');
    setFilterBudgetStatus('');
    setFilterPendingBilling('');
    setCurrentPage(1);
  };

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
    }
  });

  const { data: contractsListData } = useQuery({
    queryKey: ['contracts-list-os-filters'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    }
  });

  const { data: listData, isLoading: loadingList, refetch: refetchList } = useQuery({
    queryKey: [
      'pleitos',
      searchTerm,
      currentPage,
      filterContractId,
      filterMonth,
      filterYear,
      filterLot,
      filterBudgetStatus,
      filterPendingBilling
    ],
    queryFn: async () => {
      const res = await api.get('/pleitos', {
        params: {
          search: searchTerm || undefined,
          page: currentPage,
          limit: 20,
          contractId: filterContractId || undefined,
          creationMonth: filterMonth || undefined,
          creationYear: filterYear || undefined,
          lot: filterLot.trim() || undefined,
          budgetStatus: filterBudgetStatus || undefined,
          pendingBilling: filterPendingBilling || undefined
        }
      });
      return res.data;
    }
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => api.patch(`/pleitos/${id}`, data),
    onSuccess: async () => {
      await refetchList();
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm());
      toast.success('Atualizado!');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Erro ao atualizar')
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/pleitos/${id}`, { params: { excluirOrdemServico: true } }),
    onSuccess: async () => {
      await refetchList();
      setDeleteId(null);
      toast.success('Excluído!');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Erro ao excluir')
  });

  const rows = (listData?.data || []) as Pleito[];
  const pagination = listData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };
  const contractsForFilter = (contractsListData?.data || []) as Array<{ id: string; name: string; number: string }>;

  const contractFilterOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '', label: 'Todos' },
        ...contractsForFilter.map((c) => ({
          value: c.id,
          label: c.number ? `${c.number} — ${c.name}` : c.name,
        })),
      ]),
    [contractsForFilter]
  );

  const itemsPerPage = 20;
  const totalFiltered = pagination.total;
  const totalPages = Math.max(1, pagination.totalPages);
  const startItem = totalFiltered === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = totalFiltered === 0 ? 0 : Math.min(currentPage * itemsPerPage, totalFiltered);

  const openEdit = (p: Pleito) => {
    setEditing(p);
    setForm(pleitoToForm(p));
    setShowForm(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.serviceDescription.trim()) {
      toast.error('Descrição do serviço é obrigatória');
      return;
    }
    if (!editing) {
      toast.error('Abra um registro pela lista para editar.');
      return;
    }
    const payload = formToPayload(form);
    updateMut.mutate({ id: editing.id, data: payload });
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const isListEmpty = !loadingList && pagination.total === 0;
  const pleitoForActionMenu = rowActionMenu
    ? rows.find((r) => r.id === rowActionMenu.pleitoId) ?? null
    : null;

  useEffect(() => {
    if (!rowActionMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRowActionMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rowActionMenu]);

  useEffect(() => {
    if (rowActionMenu && !rows.some((r) => r.id === rowActionMenu.pleitoId)) {
      setRowActionMenu(null);
    }
  }, [rowActionMenu, rows]);

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Ordem de Serviço
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Acompanhamento e controle das ordens de serviço
            </p>
          </div>

          <Modal
            isOpen={isFiltersModalOpen}
            onClose={() => setIsFiltersModalOpen(false)}
            title="Filtros"
            size="lg"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Contrato
                </label>
                <StringSingleSelectDropdown
                  value={filterContractId}
                  onChange={(v) => {
                    setFilterContractId(v);
                    setCurrentPage(1);
                  }}
                  options={contractFilterOptions}
                  allowEmpty={false}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Mês de criação
                </label>
                <StringSingleSelectDropdown
                  value={filterMonth}
                  onChange={(v) => {
                    setFilterMonth(v);
                    setCurrentPage(1);
                  }}
                  options={FILTER_MONTH_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ano de criação
                </label>
                <StringSingleSelectDropdown
                  value={filterYear}
                  onChange={(v) => {
                    setFilterYear(v);
                    setCurrentPage(1);
                  }}
                  options={FILTER_YEAR_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Lote
                </label>
                <input
                  type="text"
                  value={filterLot}
                  onChange={(e) => {
                    setFilterLot(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Contém..."
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Status orçamento
                </label>
                <StringSingleSelectDropdown
                  value={filterBudgetStatus}
                  onChange={(v) => {
                    setFilterBudgetStatus(v);
                    setCurrentPage(1);
                  }}
                  options={FILTER_BUDGET_STATUS_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Pendente faturamento
                </label>
                <StringSingleSelectDropdown
                  value={filterPendingBilling}
                  onChange={(v) => {
                    setFilterPendingBilling((v as 'sim' | 'nao' | '') || '');
                    setCurrentPage(1);
                  }}
                  options={FILTER_PENDING_BILLING_OPTIONS}
                  allowEmpty={false}
                />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={clearOsFilters}
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
          </Modal>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <ClipboardList className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Ordens de serviço
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Acompanhamento e controle das ordens de serviço
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar descrição, pasta, nota, local, contrato..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setCurrentPage(1);
                        }}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveOsFilters
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtros"
                    title={hasActiveOsFilters ? 'Filtros ativos' : 'Filtros'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveOsFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <div className="py-8 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="loading-spinner h-6 w-6" />
                    <span className="text-gray-600 dark:text-gray-400">
                      Carregando ordens de serviço...
                    </span>
                  </div>
                </div>
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <ClipboardList className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma ordem de serviço encontrada</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                    {searchTerm.trim() || hasActiveOsFilters
                      ? 'Tente ajustar a busca ou os filtros'
                      : 'As ordens de serviço são cadastradas no módulo de Contratos'}
                  </p>
                </div>
              ) : (
              <>
                <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span>
                    Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                    {totalFiltered === 1 ? 'ordem de serviço' : 'ordens de serviço'}
                  </span>
                  <span>
                    Página {currentPage} de {totalPages}
                  </span>
                </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[2950px] text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {[
                        'Contrato',
                        'Mês/Ano criação',
                        'Data início',
                        'Data término',
                        'Status orçamento',
                        'Nº pasta',
                        'Lote',
                        'OS / SE',
                        'Local',
                        'Unidade',
                        'Descrição serviço',
                        'Orçamento',
                        'Status execução',
                        'Status faturamento (%)',
                        'Acumulado faturado',
                        'Pendente faturamento',
                        'Orçamento R01',
                        'Orçamento R02',
                        'Orçamento R03',
                        'Orçamento R04',
                        'RVI',
                        'RVF',
                        'Feedback Relatorios',
                        'Engenheiro',
                        'Encarregado',
                        'Ação'
                      ].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {rows.map((p) => (
                        <tr key={p.id} className={listTableRowClasses.tr}>
                          <td className="px-2 py-2 max-w-[200px] truncate" title={p.updatedContract ? `${p.updatedContract.number} ${p.updatedContract.name}` : ''}>
                            {p.updatedContract ? (
                              <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
                                {p.updatedContract.name}
                                {p.updatedContract.number ? (
                                  <span className="text-gray-500 dark:text-gray-400"> ({p.updatedContract.number})</span>
                                ) : null}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatCreationMonthYear(p.creationMonth, p.creationYear)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatDate(p.startDate)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatDate(p.endDate)}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">
                            <span className={pleitoStatusReadOnlySpanClass('budget', p.budgetStatus)} title={p.budgetStatus || ''}>
                              {p.budgetStatus || '—'}
                            </span>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{p.folderNumber || '-'}</td>
                          <td className="px-2 py-2">{p.lot || '-'}</td>
                          <td className="px-2 py-2">{p.divSe || '-'}</td>
                          <td className="px-2 py-2 max-w-[120px] truncate">{p.location || '-'}</td>
                          <td className="px-2 py-2">{p.unit || '-'}</td>
                          <td className="px-2 py-2 max-w-[200px] truncate" title={p.serviceDescription}>
                            {p.serviceDescription}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatBudgetCurrency(p.budget)}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">
                            <span className={pleitoStatusReadOnlySpanClass('execution', p.executionStatus)} title={p.executionStatus || ''}>
                              {p.executionStatus || '—'}
                            </span>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{p.billingStatus != null && p.billingStatus !== '' ? `${String(p.billingStatus).replace('.', ',')}%` : '-'}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.accumulatedBilled)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.billingRequest)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.budgetAmount1)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.budgetAmount2)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.budgetAmount3)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.budgetAmount4)}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">{p.pv || '-'}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">{p.ipi || '-'}</td>
                          <td className="px-2 py-2 max-w-[120px] truncate">{p.reportsBilling || '-'}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">{p.engineer || '-'}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">{p.supervisor || '-'}</td>
                          <td className="px-3 py-4 text-right sm:px-6">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setRowActionMenu((prev) => {
                                    if (prev?.pleitoId === p.id) return null;
                                    let left = r.right - ROW_ACTION_MENU_WIDTH_PX;
                                    left = Math.max(
                                      8,
                                      Math.min(left, window.innerWidth - ROW_ACTION_MENU_WIDTH_PX - 8)
                                    );
                                    return { pleitoId: p.id, top: r.bottom + 4, left };
                                  });
                                }}
                                className={rowActionMenuButtonClass(rowActionMenu?.pleitoId === p.id)}
                                aria-label="Menu de ações"
                                aria-expanded={rowActionMenu?.pleitoId === p.id}
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

              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                  >
                    Anterior
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNumber = i + 1;
                    const isActive = pageNumber === currentPage;
                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setCurrentPage(pageNumber)}
                        className={`rounded-md px-3 py-2 text-sm font-medium ${
                          isActive
                            ? 'bg-red-600 text-white'
                            : 'border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                  >
                    Próxima
                  </button>
                </div>
              )}

              {rowActionMenu &&
                pleitoForActionMenu &&
                typeof document !== 'undefined' &&
                createPortal(
                  <>
                    <div
                      className="fixed inset-0 z-[200]"
                      aria-hidden
                      onClick={() => setRowActionMenu(null)}
                    />
                    <div
                      role="menu"
                      className="fixed z-[201] w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                      style={{ top: rowActionMenu.top, left: rowActionMenu.left }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowActionMenu(null);
                          openEdit(pleitoForActionMenu);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Edit className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowActionMenu(null);
                          setDeleteId(pleitoForActionMenu.id);
                        }}
                        className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </>,
                  document.body
                )}
              </>
              )}
            </CardContent>
          </Card>
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
            <div className="absolute inset-0" onClick={() => setShowForm(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
              <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b bg-white dark:bg-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Editar Ordem de Serviço</h3>
                <button onClick={() => setShowForm(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={submit} className="p-4 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mês de criação</label>
                      <StringSingleSelectDropdown
                        value={form.creationMonth || ''}
                        onChange={(v) => setForm({ ...form, creationMonth: v })}
                        options={CREATION_MONTH_SELECT_OPTIONS}
                        allowEmpty={false}
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ano</label>
                      <input
                        type="number"
                        min={2000}
                        max={2100}
                        value={form.creationYear || ''}
                        onChange={(e) => setForm({ ...form, creationYear: e.target.value })}
                        placeholder="Ano"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>
                  </div>
                  <Input label="Data início" name="startDate" form={form} setForm={setForm} type="date" />
                  <Input label="Data término" name="endDate" form={form} setForm={setForm} type="date" />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status orçamento</label>
                    <StringSingleSelectDropdown
                      value={form.budgetStatus || ''}
                      onChange={(v) => setForm({ ...form, budgetStatus: v })}
                      options={BUDGET_STATUS_SELECT_OPTIONS}
                      allowEmpty={false}
                      className={
                        form.budgetStatus && form.budgetStatus !== ''
                          ? form.budgetStatus === OUTRO_STATUS
                            ? budgetStatusPillClass(form.budgetStatusCustom || null)
                            : budgetStatusPillClass(form.budgetStatus)
                          : ''
                      }
                    />
                    {form.budgetStatus === OUTRO_STATUS && (
                      <input
                        type="text"
                        value={form.budgetStatusCustom || ''}
                        onChange={(e) => setForm({ ...form, budgetStatusCustom: e.target.value })}
                        placeholder="Digite o novo status"
                        className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    )}
                  </div>
                  <div className="w-28">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nº pasta</label>
                    <input
                      type="number"
                      min={0}
                      value={form.folderNumber || ''}
                      onChange={(e) => setForm({ ...form, folderNumber: e.target.value })}
                      placeholder="Nº"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                  <Input label="Lote" name="lot" form={form} setForm={setForm} />
                  <Input label="OS / SE" name="divSe" form={form} setForm={setForm} />
                  <Input label="Local" name="location" form={form} setForm={setForm} />
                  <Input label="Unidade" name="unit" form={form} setForm={setForm} />
                  <div className="md:col-span-2 lg:col-span-3">
                    <Input label="Descrição do serviço *" name="serviceDescription" form={form} setForm={setForm} textarea />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Orçamento (somente leitura — valor mais atual)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium text-sm">
                        R$
                      </span>
                      <div className="w-full pl-12 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 text-sm">
                        {getLatestBudgetFromForm(form) || '-'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status execução</label>
                    <StringSingleSelectDropdown
                      value={form.executionStatus || ''}
                      onChange={(v) => setForm({ ...form, executionStatus: v })}
                      options={EXECUTION_STATUS_SELECT_OPTIONS}
                      allowEmpty={false}
                      className={
                        form.executionStatus && form.executionStatus !== ''
                          ? executionStatusPillClass(form.executionStatus)
                          : ''
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status faturamento (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={form.billingStatus || ''}
                        onChange={(e) => setForm({ ...form, billingStatus: e.target.value })}
                        placeholder="0"
                        className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium text-sm">
                        %
                      </span>
                    </div>
                  </div>
                  {[
                    { key: 'accumulatedBilled', label: 'Acumulado faturado' },
                    { key: 'billingRequest', label: 'Pendente faturamento' },
                    { key: 'budgetAmount1', label: 'Orçamento R01' },
                    { key: 'budgetAmount2', label: 'Orçamento R02' },
                    { key: 'budgetAmount3', label: 'Orçamento R03' },
                    { key: 'budgetAmount4', label: 'Orçamento R04' }
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium text-sm">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={form[key] || ''}
                          onChange={currencyChange(form, setForm, key)}
                          placeholder="0,00"
                          className="w-full pl-12 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">RVI</label>
                    <StringSingleSelectDropdown
                      value={form.pv || ''}
                      onChange={(v) => setForm({ ...form, pv: v })}
                      options={RVI_RVF_SELECT_OPTIONS}
                      allowEmpty={false}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">RVF</label>
                    <StringSingleSelectDropdown
                      value={form.ipi || ''}
                      onChange={(v) => setForm({ ...form, ipi: v })}
                      options={RVI_RVF_SELECT_OPTIONS}
                      allowEmpty={false}
                    />
                  </div>
                  <Input label="Feedback Relatorios" name="reportsBilling" form={form} setForm={setForm} />
                  <Input label="Engenheiro" name="engineer" form={form} setForm={setForm} />
                  <Input label="Encarregado" name="supervisor" form={form} setForm={setForm} />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={updateMut.isPending}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
                  >
                    {updateMut.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="absolute inset-0" onClick={() => setDeleteId(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 shadow-xl">
              <div className="flex justify-center mb-3">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>
              <p className="text-center text-gray-700 dark:text-gray-300 mb-4">Excluir este registro de Ordem de Serviço?</p>
              <div className="flex justify-center gap-2">
                <button onClick={() => setDeleteId(null)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">
                  Cancelar
                </button>
                <button
                  onClick={() => deleteMut.mutate(deleteId)}
                  disabled={deleteMut.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
  );
}

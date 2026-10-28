'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  CheckCircle2,
  CircleCheck,
  Clock,
  Download,
  Filter,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCog,
  Wallet,
  X,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import {
  cadastroListClasses,
  getListTableRowClassName,
  RowActionMenuCell,
  RowActionMenuPortal,
} from '@/components/ui/RowActionMenu';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { ListPageHeader, PageStack, pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useLogout } from '@/hooks/useLogout';
import { authService } from '@/lib/auth';
import api from '@/lib/api';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { DatePickerField } from '@/components/ui/DatePickerField';

const PAGE_SIZE = 50;

type BoletoStatus = 'PAGO' | 'A_VENCER' | 'VENCIDO';

type BoletoEntry = {
  id: string;
  polo: string | null;
  supplierName: string | null;
  costCenterName: string | null;
  ocNumber: string | null;
  idMov: string | null;
  value: number | null;
  nfNumber: string | null;
  nfEmissionDate: string | null;
  paymentCondition: string | null;
  dueDate: string | null;
  status: BoletoStatus;
  effectiveStatus: BoletoStatus;
  notes: string | null;
  contractManager: string | null;
  technicalConfirmed: boolean;
  technicalConfirmedAt: string | null;
  technicalConfirmedByName: string | null;
};

type ManagerRow = { id: string; costCenterName: string; managerName: string };

type Summary = Record<'all' | BoletoStatus, { count: number; value: number }>;

type ListResponse = {
  data: BoletoEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary: Summary;
};

type ImportResult = {
  read: number;
  created: number;
  updated: number;
  skippedExisting: number;
  blankRows: number;
  errorCount: number;
  errors: Array<{ row: number; message: string }>;
  warningCount: number;
  warnings: Array<{ row: number; message: string }>;
  renamedCostCenters: Array<{ from: string; to: string; count: number }>;
  unmatchedCostCenters: Array<{ name: string; count: number }>;
};

type StatusFilter = 'ALL' | BoletoStatus;

const STATUS_LABEL: Record<BoletoStatus, string> = {
  PAGO: 'Pago',
  A_VENCER: 'À vencer',
  VENCIDO: 'Vencido',
};

const STATUS_BADGE: Record<BoletoStatus, string> = {
  PAGO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  A_VENCER: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  VENCIDO: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

const brl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dateBr = (ymd: string | null | undefined) => {
  if (!ymd) return '—';
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
};

type FormState = {
  polo: string;
  supplierName: string;
  costCenterName: string;
  ocNumber: string;
  idMov: string;
  value: string;
  nfNumber: string;
  nfEmissionDate: string;
  paymentCondition: string;
  dueDate: string;
  notes: string;
  technicalConfirmed: boolean;
};

const emptyForm = (): FormState => ({
  polo: '',
  supplierName: '',
  costCenterName: '',
  ocNumber: '',
  idMov: '',
  value: '',
  nfNumber: '',
  nfEmissionDate: '',
  paymentCondition: '',
  dueDate: '',
  notes: '',
  technicalConfirmed: false,
});

const formFromEntry = (e: BoletoEntry): FormState => ({
  polo: e.polo ?? '',
  supplierName: e.supplierName ?? '',
  costCenterName: e.costCenterName ?? '',
  ocNumber: e.ocNumber ?? '',
  idMov: e.idMov ?? '',
  value: e.value != null ? String(e.value).replace('.', ',') : '',
  nfNumber: e.nfNumber ?? '',
  nfEmissionDate: e.nfEmissionDate ?? '',
  paymentCondition: e.paymentCondition ?? '',
  dueDate: e.dueDate ?? '',
  notes: e.notes ?? '',
  technicalConfirmed: e.technicalConfirmed,
});

function errMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return msg || fallback;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function ControleBoletosPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const handleLogout = useLogout();
  const user = authService.getUser();

  const [search, setSearch] = useState('');
  const [polo, setPolo] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [manager, setManager] = useState('');
  const [technical, setTechnical] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const [editing, setEditing] = useState<BoletoEntry | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [managersOpen, setManagersOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [mgrDrafts, setMgrDrafts] = useState<Record<string, string>>({});
  const [newMgrCenter, setNewMgrCenter] = useState('');
  const [newMgrName, setNewMgrName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;
    const onDown = (ev: MouseEvent) => {
      if (!actionsRef.current?.contains(ev.target as Node)) setActionsOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [actionsOpen]);

  const filterParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      polo: polo || undefined,
      costCenter: costCenter || undefined,
      manager: manager || undefined,
      technical: technical || undefined,
      dueFrom: dueFrom || undefined,
      dueTo: dueTo || undefined,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
    }),
    [search, polo, costCenter, manager, technical, dueFrom, dueTo, statusFilter],
  );

  const { data: listData, isLoading } = useQuery({
    queryKey: ['boleto-control', filterParams, page],
    queryFn: async () => {
      const res = await api.get('/boleto-control', { params: { ...filterParams, page, limit: PAGE_SIZE } });
      return res.data as ListResponse;
    },
    enabled: !!user,
    placeholderData: (prev) => prev,
  });

  const { data: options } = useQuery({
    queryKey: ['boleto-control-options'],
    queryFn: async () => {
      const res = await api.get('/boleto-control/options');
      return res.data?.data as {
        polos: string[];
        costCenters: string[];
        managers: string[];
        officialCostCenters: string[];
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: managerRows } = useQuery({
    queryKey: ['boleto-control-managers'],
    queryFn: async () => {
      const res = await api.get('/boleto-control/managers');
      return (res.data?.data ?? []) as ManagerRow[];
    },
    enabled: !!user && managersOpen,
  });

  const rows = listData?.data ?? [];
  const total = listData?.pagination?.total ?? 0;
  const summary = listData?.summary;
  const listRange = getCadastroListRange(page, PAGE_SIZE, total);

  const { rowActionMenu, rowForActionMenu, toggleRowActionMenu, closeRowActionMenu, isRowMenuOpen } =
    useRowActionMenu(rows);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['boleto-control'] });
    void queryClient.invalidateQueries({ queryKey: ['boleto-control-options'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        value: form.value.trim() === '' ? null : form.value,
        nfEmissionDate: form.nfEmissionDate || null,
        dueDate: form.dueDate || null,
      };
      if (editing === 'new' || editing == null) {
        const res = await api.post('/boleto-control', payload);
        const created = res.data?.data as BoletoEntry;
        if (form.technicalConfirmed && created?.id) {
          await api.patch(`/boleto-control/${created.id}/technical-confirm`, { confirmed: true });
        }
        return;
      }
      await api.patch(`/boleto-control/${editing.id}`, payload);
      if (form.technicalConfirmed !== editing.technicalConfirmed) {
        await api.patch(`/boleto-control/${editing.id}/technical-confirm`, { confirmed: form.technicalConfirmed });
      }
    },
    onSuccess: () => {
      toast.success(editing === 'new' ? 'Boleto adicionado.' : 'Boleto atualizado.');
      setEditing(null);
      refresh();
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível salvar.')),
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ id, confirmed }: { id: string; confirmed: boolean }) => {
      await api.patch(`/boleto-control/${id}/technical-confirm`, { confirmed });
    },
    onSuccess: refresh,
    onError: (e) => toast.error(errMessage(e, 'Não foi possível atualizar a confirmação.')),
  });

  const saveManagerMutation = useMutation({
    mutationFn: async (v: { costCenterName: string; managerName: string }) => {
      await api.put('/boleto-control/managers', v);
    },
    onSuccess: () => {
      toast.success('Gestor salvo.');
      void queryClient.invalidateQueries({ queryKey: ['boleto-control-managers'] });
      refresh();
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível salvar o gestor.')),
  });

  const deleteManagerMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/boleto-control/managers/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boleto-control-managers'] });
      refresh();
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível remover.')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/boleto-control/${id}`);
    },
    onSuccess: () => {
      toast.success('Boleto excluído.');
      refresh();
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível excluir.')),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error('Selecione um arquivo');
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('updateExisting', updateExisting ? 'true' : 'false');
      const res = await api.post('/boleto-control/import', fd);
      return res.data?.data as ImportResult;
    },
    onSuccess: (data) => {
      setImportResult(data);
      refresh();
      toast.success(`Importação concluída: ${data.created} novas linhas.`);
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível importar a planilha.')),
  });

  const openNew = () => {
    setForm(emptyForm());
    setEditing('new');
  };
  const openEdit = (e: BoletoEntry) => {
    setForm(formFromEntry(e));
    setEditing(e);
  };

  const resetPageAnd = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/boleto-control/export', { params: filterParams, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `controle-de-boletos-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errMessage(e, 'Não foi possível exportar.'));
    } finally {
      setExporting(false);
    }
  };

  const closeImport = () => {
    if (importMutation.isPending) return;
    setImportOpen(false);
    setImportFile(null);
    setImportResult(null);
    setUpdateExisting(false);
  };

  const stats: Array<{
    key: StatusFilter;
    label: string;
    count: number;
    value: number;
    Icon: typeof Wallet;
    iconBg: string;
    iconColor: string;
  }> = [
    { key: 'ALL', label: 'Todos', count: summary?.all.count ?? 0, value: summary?.all.value ?? 0, Icon: Wallet, iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600 dark:text-blue-300' },
    { key: 'PAGO', label: 'Pagos', count: summary?.PAGO.count ?? 0, value: summary?.PAGO.value ?? 0, Icon: CircleCheck, iconBg: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600 dark:text-emerald-300' },
    { key: 'A_VENCER', label: 'À vencer', count: summary?.A_VENCER.count ?? 0, value: summary?.A_VENCER.value ?? 0, Icon: Clock, iconBg: 'bg-amber-100 dark:bg-amber-900/30', iconColor: 'text-amber-600 dark:text-amber-300' },
    { key: 'VENCIDO', label: 'Vencidos', count: summary?.VENCIDO.count ?? 0, value: summary?.VENCIDO.value ?? 0, Icon: AlertTriangle, iconBg: 'bg-red-100 dark:bg-red-900/30', iconColor: 'text-red-600 dark:text-red-300' },
  ];

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const hasActiveFilter = !!(polo || costCenter || manager || technical || dueFrom || dueTo);
  const clearModalFilters = () =>
    resetPageAnd(() => {
      setPolo('');
      setCostCenter('');
      setManager('');
      setTechnical('');
      setDueFrom('');
      setDueTo('');
    });

  if (!user) {
    return (
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
        <Loading message="Carregando..." fullScreen size="lg" />
      </MainLayout>
    );
  }

  // Tabela larga (15 colunas): espaçamento compacto para caber sem cortar a última coluna.
  const thBase = 'px-2 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400';
  const th = `${thBase} text-center`;
  const thLeft = `${thBase} text-left`;
  const thRight = `${thBase} text-right`;
  const tdCenter = 'px-2 py-3 text-center text-xs text-gray-900 dark:text-gray-100';
  const td = `${tdCenter} whitespace-nowrap`;

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <PageStack>
        <ListPageHeader
          title="Controle de Boletos"
          description="Acompanhe os boletos por fornecedor, vencimento e confirmação de pagamento."
        />

        <div className={pageStatCardsGridClass}>
          {stats.map((s) => (
            <FilterStatCard
              key={s.key}
              size="sm"
              label={s.label}
              count={s.count}
              subtitle={brl(s.value)}
              icon={s.Icon}
              iconBg={s.iconBg}
              iconColor={s.iconColor}
              isActive={statusFilter === s.key}
              onClick={() => resetPageAnd(() => setStatusFilter(statusFilter === s.key ? 'ALL' : s.key))}
            />
          ))}
        </div>

        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                  <Banknote className="h-5 w-5 text-red-600 dark:text-red-300 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">Boletos</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {statusFilter === 'ALL' ? 'Todos os boletos' : STATUS_LABEL[statusFilter]}
                  </p>
                </div>
              </div>
              <div className={cadastroListClasses.cardToolbar}>
                <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[300px] sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => resetPageAnd(() => setSearch(e.target.value))}
                    placeholder="Buscar fornecedor, OC, NF, ID…"
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
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
                  title={hasActiveFilter ? 'Filtro (ativo)' : 'Filtro'}
                >
                  <Filter className="h-4 w-4" />
                  {hasActiveFilter ? (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/ponto/financeiro/dashboard-boletos')}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  aria-label="Abrir dashboard"
                  title="Dashboard"
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
                <div ref={actionsRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setActionsOpen((v) => !v)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Ações"
                    title="Ações"
                    aria-expanded={actionsOpen}
                    aria-haspopup="menu"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {actionsOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-40 mt-1.5 min-w-[240px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        disabled={exporting}
                        onClick={() => {
                          setActionsOpen(false);
                          void handleExport();
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Download className="h-4 w-4 shrink-0 text-gray-500" />
                        {exporting ? 'Exportando…' : 'Exportar planilha'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setActionsOpen(false);
                          setImportOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Upload className="h-4 w-4 shrink-0 text-gray-500" />
                        Importar planilha
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setActionsOpen(false);
                          setManagersOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <UserCog className="h-4 w-4 shrink-0 text-gray-500" />
                        Gestores por centro de custo
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={openNew}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Novo boleto</span>
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className={cadastroListClasses.cardContent}>
            <CadastroListSummary
              startItem={listRange.startItem}
              endItem={listRange.endItem}
              total={total}
              itemLabel="boleto"
              itemLabelPlural="boletos"
              currentPage={page}
              totalPages={listRange.totalPages}
            />

            {isLoading ? (
              <CadastroListLoading message="Carregando boletos..." />
            ) : rows.length === 0 ? (
              <CadastroListEmpty
                icon={Banknote}
                title="Nenhum boleto encontrado"
                hint="Ajuste os filtros, use Importar para trazer a planilha ou Novo boleto para lançar um."
              />
            ) : (
              <div className="table-scroll">
                <table className={cadastroListClasses.table}>
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className={th}>Polo</th>
                      <th className={thLeft}>Fornecedor</th>
                      <th className={th}>Centro de custo</th>
                      <th className={th}>OC</th>
                      <th className={th}>ID</th>
                      <th className={thRight}>Valor</th>
                      <th className={th}>Nº NF</th>
                      <th className={th}>Emissão NF</th>
                      <th className={th}>Condição</th>
                      <th className={th}>Vencimento</th>
                      <th className={th}>Status</th>
                      <th className={th}>Observações</th>
                      <th className={th}>Gestor</th>
                      <th className={th}>Pgto. confirmado</th>
                      <th className={thRight}>Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                    {rows.map((r) => (
                      <tr key={r.id} className={getListTableRowClassName(true)} onClick={() => openEdit(r)}>
                        <td className={td}>{r.polo || '—'}</td>
                        <td className="max-w-[210px] truncate px-2 py-3 text-xs font-medium text-gray-900 dark:text-gray-100" title={r.supplierName ?? ''}>
                          {r.supplierName || '—'}
                        </td>
                        <td className={`${td} max-w-[150px] truncate`} title={r.costCenterName ?? ''}>
                          {r.costCenterName || '—'}
                        </td>
                        <td className={`${td} font-mono`}>{r.ocNumber || '—'}</td>
                        <td className={`${td} font-mono`}>{r.idMov || '—'}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-right text-xs font-medium tabular-nums text-gray-900 dark:text-gray-100">
                          {brl(r.value)}
                        </td>
                        <td className={`${td} font-mono`}>{r.nfNumber || '—'}</td>
                        <td className={td}>{dateBr(r.nfEmissionDate)}</td>
                        <td className={`${tdCenter} min-w-[130px] max-w-[170px]`}>{r.paymentCondition || '—'}</td>
                        <td className={td}>{dateBr(r.dueDate)}</td>
                        <td className={tdCenter}>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.effectiveStatus]}`}>
                            {STATUS_LABEL[r.effectiveStatus]}
                          </span>
                        </td>
                        <td className={`${td} max-w-[130px] truncate`} title={r.notes ?? ''}>
                          {r.notes || '—'}
                        </td>
                        <td className={td}>{r.contractManager || '—'}</td>
                        <td className={tdCenter} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={confirmMutation.isPending}
                            onClick={() => confirmMutation.mutate({ id: r.id, confirmed: !r.technicalConfirmed })}
                            title={
                              r.technicalConfirmed
                                ? `Confirmado${r.technicalConfirmedByName ? ` por ${r.technicalConfirmedByName}` : ''}${r.technicalConfirmedAt ? ` em ${dateBr(r.technicalConfirmedAt)}` : ''}. Clique para desfazer.`
                                : 'Clique para confirmar o pagamento (técnico)'
                            }
                            aria-label={r.technicalConfirmed ? 'Pagamento confirmado' : 'Confirmar pagamento'}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            {r.technicalConfirmed ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <span className="h-4 w-4 rounded-full border-2 border-gray-300 dark:border-gray-500" />
                            )}
                          </button>
                        </td>
                        <RowActionMenuCell
                          className="px-2 py-3 text-right"
                          isOpen={isRowMenuOpen(r.id)}
                          onToggle={(e) => toggleRowActionMenu(r.id, e.currentTarget)}
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {rowActionMenu && rowForActionMenu ? (
              <RowActionMenuPortal
                menu={rowActionMenu}
                onClose={closeRowActionMenu}
                onEdit={() => {
                  const r = rowForActionMenu;
                  closeRowActionMenu();
                  openEdit(r);
                }}
                onDelete={() => {
                  const r = rowForActionMenu;
                  closeRowActionMenu();
                  if (window.confirm(`Excluir o boleto de ${r.supplierName || 'fornecedor sem nome'} (OC ${r.ocNumber || '—'})?`)) {
                    deleteMutation.mutate(r.id);
                  }
                }}
              />
            ) : null}

            <ListPagination currentPage={page} totalPages={listRange.totalPages} onPageChange={setPage} />
          </CardContent>
        </Card>
      </PageStack>

      <Modal isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} title="Filtros — Controle de Boletos" size="md">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Polo</label>
            <StringSingleSelectDropdown
              value={polo}
              onChange={(v) => resetPageAnd(() => setPolo(v))}
              options={options?.polos ?? []}
              allowEmpty
              emptyOptionLabel="Todos os polos"
              placeholder="Todos os polos"
              searchPlaceholder="Pesquisar polo..."
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Centro de custo</label>
            <StringSingleSelectDropdown
              value={costCenter}
              onChange={(v) => resetPageAnd(() => setCostCenter(v))}
              options={options?.costCenters ?? []}
              allowEmpty
              emptyOptionLabel="Todos os centros de custo"
              placeholder="Todos os centros de custo"
              searchPlaceholder="Pesquisar centro de custo..."
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Gestor do contrato</label>
            <StringSingleSelectDropdown
              value={manager}
              onChange={(v) => resetPageAnd(() => setManager(v))}
              options={options?.managers ?? []}
              allowEmpty
              emptyOptionLabel="Todos os gestores"
              placeholder="Todos os gestores"
              searchPlaceholder="Pesquisar gestor..."
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Pagamento confirmado – técnico</label>
            <StringSingleSelectDropdown
              value={technical}
              onChange={(v) => resetPageAnd(() => setTechnical(v))}
              options={[
                { value: 'SIM', label: 'Confirmados pelo técnico' },
                { value: 'NAO', label: 'Não confirmados' },
              ]}
              allowEmpty
              emptyOptionLabel="Todos"
              placeholder="Todos"
              className="w-full"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Vencimento de</label>
              <DatePickerField
                value={dueFrom}
                onChange={(v) => resetPageAnd(() => setDueFrom(v))}
                placeholder="dd/mm/aaaa"
                aria-label="Vencimento a partir de"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Vencimento até</label>
              <DatePickerField
                value={dueTo}
                onChange={(v) => resetPageAnd(() => setDueTo(v))}
                placeholder="dd/mm/aaaa"
                aria-label="Vencimento até"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={clearModalFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Limpar filtros
            </button>
            <button
              type="button"
              onClick={() => setIsFiltersOpen(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={editing !== null}
        onClose={() => {
          if (!saveMutation.isPending) setEditing(null);
        }}
        title={editing === 'new' ? 'Novo boleto' : 'Editar boleto'}
        size="2xl"
        confirmBeforeClose
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Polo">
              <input list="boleto-polos" value={form.polo} onChange={(e) => set('polo', e.target.value)} className={FORM_FIELD_INPUT_CLS} placeholder="POLO DF" />
              <datalist id="boleto-polos">
                {(options?.polos ?? []).map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field label="Fornecedor" className="sm:col-span-2">
              <input value={form.supplierName} onChange={(e) => set('supplierName', e.target.value)} className={FORM_FIELD_INPUT_CLS} />
            </Field>
            <Field label="Centro de custo" className="sm:col-span-2">
              <input list="boleto-cc" value={form.costCenterName} onChange={(e) => set('costCenterName', e.target.value)} className={FORM_FIELD_INPUT_CLS} />
              <datalist id="boleto-cc">
                {(options?.officialCostCenters ?? options?.costCenters ?? []).map((c, i) => (
                  <option key={`${c}-${i}`} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="OC (TOTVS)">
              <input value={form.ocNumber} onChange={(e) => set('ocNumber', e.target.value)} className={FORM_FIELD_INPUT_CLS} />
            </Field>
            <Field label="ID (TOTVS)">
              <input value={form.idMov} onChange={(e) => set('idMov', e.target.value)} className={FORM_FIELD_INPUT_CLS} />
            </Field>
            <Field label="Valor (R$)">
              <input value={form.value} onChange={(e) => set('value', e.target.value)} inputMode="decimal" placeholder="1.234,56" className={FORM_FIELD_INPUT_CLS} />
            </Field>
            <Field label="Nº NF">
              <input value={form.nfNumber} onChange={(e) => set('nfNumber', e.target.value)} className={FORM_FIELD_INPUT_CLS} />
            </Field>
            <Field label="Emissão da NF">
              <input type="date" value={form.nfEmissionDate} onChange={(e) => set('nfEmissionDate', e.target.value)} className={FORM_FIELD_INPUT_CLS} />
            </Field>
            <Field label="Condição de pagamento" className="sm:col-span-2">
              <input value={form.paymentCondition} onChange={(e) => set('paymentCondition', e.target.value)} placeholder="BOLETO 28 DIAS" className={FORM_FIELD_INPUT_CLS} />
            </Field>
            <Field label="Vencimento">
              <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} className={FORM_FIELD_INPUT_CLS} />
            </Field>
            <Field label="Observações" className="sm:col-span-3">
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={FORM_FIELD_INPUT_CLS} />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              checked={form.technicalConfirmed}
              onChange={(e) => set('technicalConfirmed', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Pagamento confirmado pelo técnico
          </label>
          <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
            O status é automático: confirmado = Pago; senão, Vencido se a data já passou, ou À vencer. O gestor vem do centro de custo.
          </p>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={saveMutation.isPending}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={managersOpen} onClose={() => setManagersOpen(false)} title="Gestores por centro de custo" size="xl">
        <div className="space-y-4 text-sm">
          <p className="text-gray-600 dark:text-gray-300">
            O gestor de cada boleto vem do centro de custo. Ao alterar aqui, todos os boletos daquele centro mudam. Centros sem gestor aparecem como NÃO DEFINIDO.
          </p>
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-gray-500">Centro de custo</th>
                  <th className="px-3 py-2 text-left font-medium uppercase tracking-wider text-gray-500">Gestor</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                {(managerRows ?? []).map((m) => {
                  const draft = mgrDrafts[m.id] ?? m.managerName;
                  const dirty = draft.trim() !== m.managerName && draft.trim() !== '';
                  return (
                    <tr key={m.id}>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{m.costCenterName}</td>
                      <td className="px-3 py-2">
                        <input
                          value={draft}
                          onChange={(e) => setMgrDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                          onBlur={() => {
                            if (dirty) saveManagerMutation.mutate({ costCenterName: m.costCenterName, managerName: draft.trim() });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className={FORM_FIELD_INPUT_CLS}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Remover o gestor de ${m.costCenterName}? Os boletos ficam como NÃO DEFINIDO.`)) {
                              deleteManagerMutation.mutate(m.id);
                            }
                          }}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                          aria-label="Remover"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <form
            className="grid grid-cols-1 items-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newMgrCenter.trim() || !newMgrName.trim()) return;
              saveManagerMutation.mutate(
                { costCenterName: newMgrCenter.trim(), managerName: newMgrName.trim() },
                {
                  onSuccess: () => {
                    setNewMgrCenter('');
                    setNewMgrName('');
                  },
                },
              );
            }}
          >
            <Field label="Centro de custo">
              <input list="boleto-mgr-cc" value={newMgrCenter} onChange={(e) => setNewMgrCenter(e.target.value)} className={FORM_FIELD_INPUT_CLS} />
              <datalist id="boleto-mgr-cc">
                {(options?.officialCostCenters ?? []).map((c, i) => (
                  <option key={`${c}-${i}`} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Gestor">
              <input value={newMgrName} onChange={(e) => setNewMgrName(e.target.value)} placeholder="ENGª NOME" className={FORM_FIELD_INPUT_CLS} />
            </Field>
            <button
              type="submit"
              disabled={saveManagerMutation.isPending || !newMgrCenter.trim() || !newMgrName.trim()}
              className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </form>
        </div>
      </Modal>

      <Modal isOpen={importOpen} onClose={closeImport} title="Importar planilha" size="xl">
        <div className="space-y-4 text-sm">
          {!importResult ? (
            <>
              <p className="text-gray-600 dark:text-gray-300">
                Envie a planilha (.xlsx, .xls ou .csv) com as colunas: POLO, FORNECEDORES, CENTRO DE CUSTO, OC, ID, VALOR, Nº NF,
                EMISSÃO DA NF, CONDIÇÃO DE PAGAMENTO, VENCIMENTO, STATUS, OBSERVAÇÕES, GESTOR DO CONTRATO e PAGAMENTO CONFIRMADO -
                TÉCNICO. Linhas em branco são ignoradas.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-gray-700 hover:border-red-400 hover:bg-red-50/40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-red-950/20"
              >
                <Upload className="h-5 w-5" />
                {importFile ? importFile.name : 'Escolher arquivo'}
              </button>
              <label className="flex cursor-pointer items-start gap-2 text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                <span>
                  Atualizar as linhas que já existem
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Desmarcado, as linhas repetidas são ignoradas, sem duplicar e sem apagar o que foi editado na tela.
                  </span>
                </span>
              </label>
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button type="button" onClick={closeImport} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!importFile || importMutation.isPending}
                  onClick={() => importMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {importMutation.isPending ? 'Importando…' : 'Importar'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Linhas lidas', importResult.read],
                  ['Novas', importResult.created],
                  [updateExisting ? 'Atualizadas' : 'Já existiam', updateExisting ? importResult.updated : importResult.skippedExisting],
                  ['Em branco', importResult.blankRows],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
                    <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{String(value)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{String(label)}</p>
                  </div>
                ))}
              </div>
              {importResult.renamedCostCenters?.length ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                  <p className="mb-1 font-semibold">Centros de custo ajustados para o nome do cadastro:</p>
                  <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">
                    {importResult.renamedCostCenters.map((r) => (
                      <li key={`${r.from}-${r.to}`}>
                        {r.from} → {r.to} ({r.count} {r.count === 1 ? 'linha' : 'linhas'})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {importResult.unmatchedCostCenters?.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="mb-1 font-semibold">Centros de custo que não existem no cadastro (mantidos como na planilha):</p>
                  <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">
                    {importResult.unmatchedCostCenters.map((u) => (
                      <li key={u.name}>
                        {u.name} ({u.count} {u.count === 1 ? 'linha' : 'linhas'})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {importResult.errorCount > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
                  <p className="mb-1 font-semibold">{importResult.errorCount} linha(s) não importada(s):</p>
                  <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">
                    {importResult.errors.map((e) => (
                      <li key={`${e.row}-${e.message}`}>
                        Linha {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {importResult.warningCount > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="mb-1 font-semibold">{importResult.warningCount} aviso(s):</p>
                  <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">
                    {importResult.warnings.map((w) => (
                      <li key={`${w.row}-${w.message}`}>
                        Linha {w.row}: {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                <button type="button" onClick={closeImport} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                  Fechar
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </MainLayout>
  );
}

export default function Page() {
  return (
    <ProtectedRoute route="/ponto/financeiro/controle-boletos">
      <ControleBoletosPage />
    </ProtectedRoute>
  );
}

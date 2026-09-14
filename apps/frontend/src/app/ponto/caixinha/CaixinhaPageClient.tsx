'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Loader2, Minus, Plus, Search, Trash2, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  listTableRowClasses
} from '@/components/ui/RowActionMenu';
import { ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { DatePickerField } from '@/components/ui/DatePickerField';
import {
  GESTAO_OS_FORM_LABEL_CLS,
  GestaoOsModalFooter,
  GestaoOsRequiredMark
} from '@/components/gestao-os/GestaoOsModalUi';
import api from '@/lib/api';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import {
  adjustCurrency,
  currencyDigitsToFormatted,
  formatCurrencyInput,
  parseCurrencyToNumber
} from '@/lib/fichaDemandaApproval';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';

type CaixinhaPurchase = {
  id: string;
  filledAt: string;
  personName: string;
  personUserId: string | null;
  osNumber: string | null;
  contractId: string | null;
  contractName: string | null;
  obraId: string | null;
  obraName: string | null;
  caixinha: string;
  purchaseDate: string | null;
  storeName: string | null;
  invoiceNumber: string | null;
  amount: number;
  notes: string | null;
  invoicePdfUrl: string | null;
  invoicePdfName: string | null;
};

type CaixinhaOptions = {
  users: Array<{ id: string; name: string }>;
  contracts: Array<{ id: string; name: string }>;
  caixinhas: string[];
};

type ObraOption = { id: string; name: string };

type SupplierOption = {
  id: string;
  code?: string | null;
  name?: string | null;
  tradeName?: string | null;
  isActive?: boolean;
};

function supplierStoreLabel(supplier: SupplierOption) {
  const legalName = String(supplier.name || '').trim();
  const tradeName = String(supplier.tradeName || '').trim();
  const displayName = tradeName || legalName;
  return supplier.code ? `${supplier.code} - ${displayName}` : displayName;
}

function supplierStoreValue(supplier: SupplierOption) {
  return String(supplier.tradeName || supplier.name || '').trim();
}

type FormState = {
  filledAtIso: string;
  personUserId: string;
  personName: string;
  osNumber: string;
  contractId: string;
  obraId: string;
  caixinha: string;
  purchaseDate: string;
  storeName: string;
  invoiceNumber: string;
  amount: string;
  notes: string;
  invoicePdfUrl: string;
  invoicePdfName: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDateBr(value: string | null | undefined) {
  if (!value) return '—';
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function emptyForm(user: { id?: string; name?: string }): FormState {
  return {
    filledAtIso: new Date().toISOString(),
    personUserId: user.id || '',
    personName: user.name || '',
    osNumber: '',
    contractId: '',
    obraId: '',
    caixinha: '',
    purchaseDate: '',
    storeName: '',
    invoiceNumber: '',
    amount: '0,00',
    notes: '',
    invoicePdfUrl: '',
    invoicePdfName: ''
  };
}

function recordToForm(row: CaixinhaPurchase): FormState {
  return {
    filledAtIso: row.filledAt,
    personUserId: row.personUserId || '',
    personName: row.personName || '',
    osNumber: row.osNumber || '',
    contractId: row.contractId || '',
    obraId: row.obraId || '',
    caixinha: row.caixinha || '',
    purchaseDate: row.purchaseDate || '',
    storeName: row.storeName || '',
    invoiceNumber: row.invoiceNumber || '',
    amount: formatCurrencyInput(Number(row.amount) || 0) || '0,00',
    notes: row.notes || '',
    invoicePdfUrl: row.invoicePdfUrl || '',
    invoicePdfName: row.invoicePdfName || ''
  };
}

function CurrencyStepperInput({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
          R$
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(currencyDigitsToFormatted(e.target.value) || '0,00')}
          placeholder="0,00"
          autoComplete="off"
          className="w-full bg-transparent py-2 pl-9 pr-3 text-right text-sm tabular-nums text-gray-900 focus:outline-none dark:text-gray-100"
        />
      </div>
      <div className="flex border-l border-gray-300 dark:border-gray-600">
        <button
          type="button"
          onClick={() => onChange(adjustCurrency(value, -100) || '0,00')}
          className="px-3 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Diminuir valor"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onChange(adjustCurrency(value, 100) || '0,00')}
          className="border-l border-gray-300 px-3 text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Aumentar valor"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function CaixinhaPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CaixinhaPurchase | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm({}));
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [showCreateObra, setShowCreateObra] = useState(false);
  const [novaObraNome, setNovaObraNome] = useState('');
  const [showCreateCaixinha, setShowCreateCaixinha] = useState(false);
  const [novaCaixinhaNome, setNovaCaixinhaNome] = useState('');
  const [extraCaixinhas, setExtraCaixinhas] = useState<string[]>([]);

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

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE', id: '' };

  const { data: rows = [], isLoading: loadingRows } = useQuery({
    queryKey: ['caixinha-purchases', search],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: CaixinhaPurchase[] }>('/caixinha', {
        params: { search: search || undefined }
      });
      return res.data?.data ?? [];
    }
  });

  const { data: options } = useQuery({
    queryKey: ['caixinha-options'],
    enabled: formOpen,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: CaixinhaOptions }>('/caixinha/options');
      return res.data?.data;
    }
  });

  const { data: obras = [], isLoading: loadingObras } = useQuery({
    queryKey: ['caixinha-obras', form.contractId],
    enabled: formOpen && Boolean(form.contractId),
    queryFn: async () => {
      const res = await api.get('/obras', {
        params: { isActive: 'true', contratoId: form.contractId, limit: 500, page: 1 }
      });
      return ((res.data?.data || []) as ObraOption[]).filter((o) => o.id && o.name?.trim());
    }
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['caixinha-suppliers'],
    enabled: formOpen,
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { isActive: true, limit: 2000, page: 1 } });
      return ((res.data?.data || []) as SupplierOption[]).filter((s) => s.id);
    }
  });

  const { rowActionMenu, rowForActionMenu, toggleRowActionMenu, closeRowActionMenu, isRowMenuOpen } =
    useRowActionMenu(rows);

  const contractOptions = useMemo(
    () =>
      labeledToSelectOptions(
        (options?.contracts || []).map((c) => ({ value: c.id, label: c.name }))
      ),
    [options]
  );

  const obraOptions = useMemo(
    () => labeledToSelectOptions(obras.map((o) => ({ value: o.id, label: o.name }))),
    [obras]
  );

  const caixinhaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const name of options?.caixinhas || []) {
      if (name.trim()) set.add(name.trim());
    }
    for (const name of extraCaixinhas) {
      if (name.trim()) set.add(name.trim());
    }
    if (form.caixinha.trim()) set.add(form.caixinha.trim());
    return labeledToSelectOptions(
      [...set]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map((name) => ({ value: name, label: name }))
    );
  }, [options, extraCaixinhas, form.caixinha]);

  const supplierOptions = useMemo(() => {
    const opts = suppliers
      .filter((s) => s.isActive !== false && supplierStoreValue(s))
      .map((s) => ({
        value: supplierStoreValue(s),
        label: supplierStoreLabel(s),
        searchText: [s.code, s.name, s.tradeName].filter(Boolean).join(' ')
      }));
    const current = form.storeName.trim();
    if (current && !opts.some((o) => o.value === current)) {
      opts.unshift({ value: current, label: current, searchText: current });
    }
    return labeledToSelectOptions(opts);
  }, [suppliers, form.storeName]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(user));
    setExtraCaixinhas([]);
    setShowCreateObra(false);
    setShowCreateCaixinha(false);
    setNovaObraNome('');
    setNovaCaixinhaNome('');
    setFormOpen(true);
  };

  const openEdit = (row: CaixinhaPurchase) => {
    setEditing(row);
    setForm(recordToForm(row));
    setExtraCaixinhas([]);
    setShowCreateObra(false);
    setShowCreateCaixinha(false);
    setNovaObraNome('');
    setNovaCaixinhaNome('');
    setFormOpen(true);
  };

  const patchForm = (partial: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const createObraMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/obras', {
        name,
        contratoId: form.contractId
      });
      return res.data?.data as ObraOption | undefined;
    },
    onSuccess: async (created) => {
      toast.success('Obra criada');
      setShowCreateObra(false);
      setNovaObraNome('');
      await queryClient.invalidateQueries({ queryKey: ['caixinha-obras', form.contractId] });
      if (created?.id) patchForm({ obraId: created.id });
    },
    onError: (err: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Não foi possível criar a obra.');
    }
  });

  const confirmNovaCaixinha = async () => {
    const name = novaCaixinhaNome.trim();
    if (!name) return;
    try {
      await api.post('/caixinha/accounts', { name });
      setExtraCaixinhas((prev) => (prev.includes(name) ? prev : [...prev, name]));
      patchForm({ caixinha: name });
      setShowCreateCaixinha(false);
      setNovaCaixinhaNome('');
      void queryClient.invalidateQueries({ queryKey: ['caixinha-options'] });
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } } };
      toast.error(ax?.response?.data?.message || ax?.response?.data?.error || 'Não foi possível criar a caixinha.');
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const person = (options?.users || []).find((u) => u.id === form.personUserId);
      const payload = {
        filledAt: editing ? form.filledAtIso : new Date().toISOString(),
        personUserId: form.personUserId || user.id || null,
        personName: person?.name || form.personName || user.name || '',
        osNumber: form.osNumber.trim() || null,
        contractId: form.contractId || null,
        obraId: form.obraId || null,
        caixinha: form.caixinha.trim(),
        purchaseDate: form.purchaseDate || null,
        storeName: form.storeName.trim() || null,
        invoiceNumber: form.invoiceNumber.trim() || null,
        amount: parseCurrencyToNumber(form.amount),
        notes: form.notes.trim() || null,
        invoicePdfUrl: form.invoicePdfUrl || null,
        invoicePdfName: form.invoicePdfName || null
      };
      if (editing) {
        const res = await api.patch(`/caixinha/${editing.id}`, payload);
        return res.data;
      }
      const res = await api.post('/caixinha', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success(editing ? 'Lançamento atualizado' : 'Lançamento criado');
      setFormOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['caixinha-purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['caixinha-options'] });
    },
    onError: (err: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Falha ao salvar');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/caixinha/${id}`);
    },
    onSuccess: () => {
      toast.success('Lançamento excluído');
      void queryClient.invalidateQueries({ queryKey: ['caixinha-purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['caixinha-options'] });
    },
    onError: (err: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Falha ao excluir');
    }
  });

  const uploadPdf = async (file: File) => {
    setUploadingPdf(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/caixinha/upload-invoice', data);
      const uploaded = res.data?.data as { url?: string; originalName?: string } | undefined;
      if (!uploaded?.url) throw new Error('Upload sem URL');
      patchForm({
        invoicePdfUrl: uploaded.url,
        invoicePdfName: uploaded.originalName || file.name
      });
      toast.success('PDF enviado');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string; error?: string } } };
      toast.error(ax?.response?.data?.message || ax?.response?.data?.error || 'Falha no upload');
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const canSave = Boolean(form.personUserId || form.personName.trim()) && Boolean(form.caixinha.trim());

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/caixinha">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Caixinha
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Lance compras da caixinha da engenharia: loja, nota fiscal, valor e PDF.
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Wallet className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Compras
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {rows.length} registro{rows.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchField}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar compra, OS, loja..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4" />
                    Novo
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingRows ? (
                <CadastroListLoading message="Carregando lançamentos..." />
              ) : rows.length === 0 ? (
                <CadastroListEmpty
                  icon={Wallet}
                  title="Nenhum lançamento"
                  hint={
                    search.trim()
                      ? 'Tente ajustar a busca'
                      : 'Clique em Novo para abrir uma solicitação'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={rows.length}
                    total={rows.length}
                    itemLabel="lançamento"
                    itemLabelPlural="lançamentos"
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={`${cadastroListClasses.table} min-w-[72rem]`}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>Nome</th>
                          <th className={cadastroListClasses.th}>Caixinha</th>
                          <th className={cadastroListClasses.th}>N° OS</th>
                          <th className={cadastroListClasses.th}>Contrato</th>
                          <th className={cadastroListClasses.th}>Obra</th>
                          <th className={cadastroListClasses.th}>Loja</th>
                          <th className={cadastroListClasses.thCenter}>Data compra</th>
                          <th className={cadastroListClasses.thNumeric}>Valor</th>
                          <th className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {rows.map((row) => (
                          <tr
                            key={row.id}
                            role="button"
                            tabIndex={0}
                            className={listTableRowClasses.trNavigable}
                            onClick={() => openEdit(row)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openEdit(row);
                              }
                            }}
                          >
                            <td className={cadastroListClasses.td}>
                              <ListRowNavigableLabel>{row.personName}</ListRowNavigableLabel>
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {formatDateTime(row.filledAt)}
                              </p>
                            </td>
                            <td className={cadastroListClasses.td}>{row.caixinha || '—'}</td>
                            <td className={cadastroListClasses.tdMono}>{row.osNumber || '—'}</td>
                            <td className={cadastroListClasses.tdMuted}>{row.contractName || '—'}</td>
                            <td className={cadastroListClasses.tdMuted}>{row.obraName || '—'}</td>
                            <td className={cadastroListClasses.tdMuted}>{row.storeName || '—'}</td>
                            <td className={cadastroListClasses.tdCenter}>{formatDateBr(row.purchaseDate)}</td>
                            <td className={`${cadastroListClasses.td} text-right tabular-nums`}>
                              {formatBRL(Number(row.amount) || 0)}
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(row.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(row.id, e.currentTarget as HTMLButtonElement)
                              }
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {rowActionMenu && rowForActionMenu ? (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={() => openEdit(rowForActionMenu)}
                  onDelete={() => {
                    if (window.confirm('Excluir este lançamento da caixinha?')) {
                      deleteMutation.mutate(rowForActionMenu.id);
                    }
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          title={editing ? 'Editar compra' : 'Nova compra'}
          size="lg"
          confirmBeforeClose
        >
          <div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>N° OS</label>
                <input
                  className={FORM_FIELD_INPUT_CLS}
                  value={form.osNumber}
                  onChange={(e) => patchForm({ osNumber: e.target.value })}
                  placeholder="Ex.: 1234"
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Contrato</label>
                <StringSingleSelectDropdown
                  value={form.contractId}
                  onChange={(v) => {
                    setShowCreateObra(false);
                    setNovaObraNome('');
                    patchForm({ contractId: v, obraId: '' });
                  }}
                  options={contractOptions}
                  placeholder="Selecione..."
                  emptyOptionLabel="Selecione..."
                  allowEmpty
                  matchTriggerWidth
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Obra</label>
                <StringSingleSelectDropdown
                  value={form.obraId}
                  onChange={(v) => patchForm({ obraId: v })}
                  options={obraOptions}
                  placeholder={
                    !form.contractId
                      ? 'Selecione um contrato primeiro'
                      : loadingObras
                        ? 'Carregando obras...'
                        : 'Selecione...'
                  }
                  emptyOptionsMessage="Nenhuma opção disponível."
                  allowEmpty={false}
                  disabled={!form.contractId || loadingObras}
                  matchTriggerWidth
                  menuFooter={
                    form.contractId ? (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setNovaObraNome('');
                          setShowCreateObra(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        Criar nova obra neste contrato
                      </button>
                    ) : null
                  }
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>
                  Caixinha
                  <GestaoOsRequiredMark />
                </label>
                <StringSingleSelectDropdown
                  value={form.caixinha}
                  onChange={(v) => patchForm({ caixinha: v })}
                  options={caixinhaOptions}
                  placeholder="Selecione..."
                  emptyOptionLabel="Selecione..."
                  emptyOptionsMessage="Nenhuma opção disponível."
                  allowEmpty
                  matchTriggerWidth
                  menuFooter={
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setNovaCaixinhaNome('');
                        setShowCreateCaixinha(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      Criar nova caixinha
                    </button>
                  }
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Data de compra</label>
                <DatePickerField value={form.purchaseDate} onChange={(v) => patchForm({ purchaseDate: v })} />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Nome loja</label>
                <StringSingleSelectDropdown
                  value={form.storeName}
                  onChange={(v) => patchForm({ storeName: v })}
                  options={supplierOptions}
                  placeholder="Selecione o fornecedor..."
                  emptyOptionLabel="Selecione..."
                  emptyOptionsMessage="Nenhum fornecedor cadastrado."
                  allowEmpty
                  matchTriggerWidth
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Número NF</label>
                <input
                  className={FORM_FIELD_INPUT_CLS}
                  value={form.invoiceNumber}
                  onChange={(e) => patchForm({ invoiceNumber: e.target.value })}
                  placeholder="Ex.: 000123"
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Valor</label>
                <CurrencyStepperInput
                  value={form.amount}
                  onChange={(v) => patchForm({ amount: v })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Observações</label>
                <textarea
                  className={FORM_FIELD_TEXTAREA_CLS}
                  rows={3}
                  value={form.notes}
                  onChange={(e) => patchForm({ notes: e.target.value })}
                  placeholder="Ex.: material para manutenção da unidade..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className={GESTAO_OS_FORM_LABEL_CLS}>PDF nota fiscal</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadPdf(file);
                  }}
                />
                <div className="flex items-center gap-2">
                  {form.invoicePdfUrl ? (
                    <>
                      <a
                        href={resolveApiMediaUrl(form.invoicePdfUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-red-700 hover:underline dark:border-gray-600 dark:bg-gray-900/60 dark:text-red-300"
                      >
                        {form.invoicePdfName || 'nota-fiscal.pdf'}
                      </a>
                      <button
                        type="button"
                        onClick={() => patchForm({ invoicePdfUrl: '', invoicePdfName: '' })}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                        aria-label="Remover PDF"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={uploadingPdf}
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {uploadingPdf ? 'Enviando...' : 'Novo'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <GestaoOsModalFooter>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditing(null);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saveMutation.isPending || uploadingPdf || !canSave}
                onClick={() => saveMutation.mutate()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </GestaoOsModalFooter>
          </div>
        </Modal>

        <Modal
          isOpen={showCreateObra}
          onClose={() => {
            if (createObraMutation.isPending) return;
            setShowCreateObra(false);
          }}
          title="Nova obra"
          size="sm"
          elevated
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            A obra será vinculada ao contrato selecionado.
          </p>
          <div className="mt-4">
            <label className={GESTAO_OS_FORM_LABEL_CLS}>Nome da obra</label>
            <input
              className={`${FORM_FIELD_INPUT_CLS} uppercase`}
              value={novaObraNome}
              onChange={(e) => setNovaObraNome(e.target.value.toLocaleUpperCase('pt-BR'))}
              placeholder="EX.: UNIDADE CENTRO"
              autoFocus
              disabled={createObraMutation.isPending}
              autoCapitalize="characters"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const name = novaObraNome.trim().toLocaleUpperCase('pt-BR');
                if (name && !createObraMutation.isPending) createObraMutation.mutate(name);
              }}
            />
          </div>
          <GestaoOsModalFooter>
            <button
              type="button"
              disabled={createObraMutation.isPending}
              onClick={() => setShowCreateObra(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={createObraMutation.isPending || !novaObraNome.trim()}
              onClick={() => {
                const name = novaObraNome.trim().toLocaleUpperCase('pt-BR');
                if (name) createObraMutation.mutate(name);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {createObraMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Criar obra
            </button>
          </GestaoOsModalFooter>
        </Modal>

        <Modal
          isOpen={showCreateCaixinha}
          onClose={() => setShowCreateCaixinha(false)}
          title="Nova caixinha"
          size="sm"
          elevated
        >
          <div>
            <label className={GESTAO_OS_FORM_LABEL_CLS}>Nome da caixinha</label>
            <input
              className={FORM_FIELD_INPUT_CLS}
              value={novaCaixinhaNome}
              onChange={(e) => setNovaCaixinhaNome(e.target.value)}
              placeholder="Ex.: Caixinha obra centro"
              autoFocus
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                confirmNovaCaixinha();
              }}
            />
          </div>
          <GestaoOsModalFooter>
            <button
              type="button"
              onClick={() => setShowCreateCaixinha(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!novaCaixinhaNome.trim()}
              onClick={confirmNovaCaixinha}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Criar caixinha
            </button>
          </GestaoOsModalFooter>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

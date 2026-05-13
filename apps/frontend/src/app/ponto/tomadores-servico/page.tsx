'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Contact, Plus, Edit, Trash2, Search, X, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useEspelhoNfBootstrap } from '@/hooks/useEspelhoNfBootstrap';
import { useCostCenters } from '@/hooks/useCostCenters';

interface ServiceTakerRow {
  id: string;
  name?: string;
  corporateName: string;
  cnpj?: string;
  municipalRegistration?: string;
  stateRegistration?: string;
  costCenterId: string;
  taxCodeId: string;
  bankAccountId: string;
  address?: string;
  city?: string;
  state?: string;
  municipality?: string;
  contractRef?: string;
  serviceDescription?: string;
}

interface TaxOpt {
  id: string;
  cityName: string;
}

interface BankOpt {
  id: string;
  name: string;
}

function emptyForm() {
  return {
    name: '',
    corporateName: '',
    cnpj: '',
    municipalRegistration: '',
    stateRegistration: '',
    costCenterId: '',
    taxCodeId: '',
    bankAccountId: '',
    address: '',
    city: '',
    state: '',
    municipality: '',
    contractRef: '',
    serviceDescription: ''
  };
}

export default function TomadoresEspelhoNfPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ServiceTakerRow | null>(null);
  const [formData, setFormData] = useState(() => emptyForm());
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);

  const { costCenters, isLoading: loadingCc } = useCostCenters();

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

  const { data: bootstrap, isLoading, isError, error } = useEspelhoNfBootstrap();

  const taxCodes = (bootstrap?.taxCodes ?? []) as TaxOpt[];
  const bankAccounts = (bootstrap?.bankAccounts ?? []) as BankOpt[];

  const ccLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const cc of costCenters) {
      const id = (cc as { id?: string }).id;
      if (id) m.set(id, (cc as { label?: string }).label || (cc as { name?: string }).name || id);
    }
    return m;
  }, [costCenters]);

  const taxLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of taxCodes) m.set(t.id, t.cityName || t.id);
    return m;
  }, [taxCodes]);

  const bankLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bankAccounts) m.set(b.id, b.name || b.id);
    return m;
  }, [bankAccounts]);

  const rows = useMemo(() => {
    const list = (bootstrap?.takers ?? []) as ServiceTakerRow[];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => {
      const cc = ccLabelById.get(t.costCenterId) ?? '';
      const tx = taxLabelById.get(t.taxCodeId) ?? '';
      const bk = bankLabelById.get(t.bankAccountId) ?? '';
      return [t.corporateName, t.name, t.cnpj, cc, tx, bk]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [bootstrap?.takers, searchTerm, ccLabelById, taxLabelById, bankLabelById]);

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await api.post('/espelho-nf/service-takers', body);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['espelho-nf-bootstrap'] });
      setShowForm(false);
      setFormData(emptyForm());
      toast.success('Tomador cadastrado.');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao cadastrar.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, string> }) => {
      const res = await api.patch(`/espelho-nf/service-takers/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['espelho-nf-bootstrap'] });
      setShowForm(false);
      setEditing(null);
      setFormData(emptyForm());
      toast.success('Tomador atualizado.');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/espelho-nf/service-takers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['espelho-nf-bootstrap'] });
      setShowDeleteModal(null);
      toast.success('Tomador excluído.');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao excluir.');
    }
  });

  const openEdit = (t: ServiceTakerRow) => {
    setEditing(t);
    setFormData({
      name: t.name ?? '',
      corporateName: t.corporateName ?? '',
      cnpj: t.cnpj ?? '',
      municipalRegistration: t.municipalRegistration ?? '',
      stateRegistration: t.stateRegistration ?? '',
      costCenterId: t.costCenterId ?? '',
      taxCodeId: t.taxCodeId ?? '',
      bankAccountId: t.bankAccountId ?? '',
      address: t.address ?? '',
      city: t.city ?? '',
      state: t.state ?? '',
      municipality: t.municipality ?? '',
      contractRef: t.contractRef ?? '',
      serviceDescription: t.serviceDescription ?? ''
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.corporateName.trim()) {
      toast.error('Razão Social é obrigatória.');
      return;
    }
    if (!formData.costCenterId || !formData.taxCodeId || !formData.bankAccountId) {
      toast.error('Selecione Centro de Custo, Código Tributário e Conta Bancária.');
      return;
    }
    const payload: Record<string, string> = {
      ...formData,
      name: formData.name.trim() || formData.corporateName.trim()
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const loadError =
    isError &&
    ((error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (error as Error)?.message ||
      'Não foi possível carregar os tomadores.');
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/tomadores-servico">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Tomadores de Serviço
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Vinculam Centro de Custo, Código Tributário e Conta Bancária para uso no espelho de nota fiscal.
            </p>
          </div>

          <Card>
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Contact className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tomadores de Serviço</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isError ? 'Erro ao carregar.' : `${rows.length} registro(s)`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label="Limpar busca"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setFormData(emptyForm());
                      setShowForm(true);
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Novo Tomador de Serviço
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isError ? (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <AlertCircle className="h-10 w-10 text-red-500" />
                  <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">{loadError}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] table-fixed border-collapse">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="w-[22%] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4">
                          Razão Social
                        </th>
                        <th className="w-[14%] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4">
                          CNPJ
                        </th>
                        <th className="w-[20%] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4">
                          Centro de Custo
                        </th>
                        <th className="w-[18%] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4">
                          Cód. Tributário
                        </th>
                        <th className="w-[16%] px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4">
                          Conta
                        </th>
                        <th className="w-[10%] px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {isLoading || loadingCc ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-10 text-center sm:px-6">
                            <Loading message="Carregando..." />
                          </td>
                        </tr>
                      ) : rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-10 text-center sm:px-6">
                            <div className="text-gray-500 dark:text-gray-400">
                              <p className="font-medium text-gray-700 dark:text-gray-300">
                                Nenhum tomador de serviço encontrado.
                              </p>
                              <p className="mt-1 text-sm">Tente ajustar a busca ou os filtros.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        rows.map((t) => (
                          <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="min-w-0 px-3 py-4 sm:px-6">
                              <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                                {t.corporateName}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-400 sm:px-6">
                              {t.cnpj || '—'}
                            </td>
                            <td className="min-w-0 px-3 py-4 text-sm text-gray-600 dark:text-gray-400 sm:px-6">
                              <span className="block truncate">
                                {ccLabelById.get(t.costCenterId) || t.costCenterId || '—'}
                              </span>
                            </td>
                            <td className="min-w-0 px-3 py-4 text-sm text-gray-600 dark:text-gray-400 sm:px-6">
                              <span className="block truncate">
                                {taxLabelById.get(t.taxCodeId) || t.taxCodeId || '—'}
                              </span>
                            </td>
                            <td className="min-w-0 px-3 py-4 text-sm text-gray-600 dark:text-gray-400 sm:px-6">
                              <span className="block truncate">
                                {bankLabelById.get(t.bankAccountId) || t.bankAccountId || '—'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-right sm:px-6">
                              <button
                                type="button"
                                onClick={() => openEdit(t)}
                                className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowDeleteModal(t.id)}
                                className="ml-1 rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {showForm ? (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            />
            <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editing ? 'Editar Tomador de Serviço' : 'Novo Tomador de Serviço'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Razão Social *
                  </label>
                  <input
                    value={formData.corporateName}
                    onChange={(e) => setFormData({ ...formData, corporateName: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nome de exibição (opcional)
                  </label>
                  <input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Se vazio, usa a razão social"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Centro de Custo *
                    </label>
                    <select
                      value={formData.costCenterId}
                      onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      required
                    >
                      <option value="">Selecione…</option>
                      {costCenters.map((cc) => {
                        const id = (cc as { id?: string }).id;
                        if (!id) return null;
                        const lab =
                          (cc as { label?: string }).label ||
                          (cc as { name?: string }).name ||
                          (cc as { code?: string }).code ||
                          id;
                        return (
                          <option key={id} value={id}>
                            {lab}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">CNPJ</label>
                    <input
                      value={formData.cnpj}
                      onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Código Tributário *
                    </label>
                    <select
                      value={formData.taxCodeId}
                      onChange={(e) => setFormData({ ...formData, taxCodeId: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      required
                    >
                      <option value="">Selecione…</option>
                      {taxCodes.map((tx) => (
                        <option key={tx.id} value={tx.id}>
                          {tx.cityName || tx.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Conta Bancária *
                    </label>
                    <select
                      value={formData.bankAccountId}
                      onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      required
                    >
                      <option value="">Selecione…</option>
                      {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Inscrição municipal
                    </label>
                    <input
                      value={formData.municipalRegistration}
                      onChange={(e) => setFormData({ ...formData, municipalRegistration: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Inscrição estadual
                    </label>
                    <input
                      value={formData.stateRegistration}
                      onChange={(e) => setFormData({ ...formData, stateRegistration: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Endereço</label>
                  <input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Cidade</label>
                    <input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">UF</label>
                    <input
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      maxLength={2}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Município (IBGE / ref.)
                    </label>
                    <input
                      value={formData.municipality}
                      onChange={(e) => setFormData({ ...formData, municipality: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Ref. contrato
                    </label>
                    <input
                      value={formData.contractRef}
                      onChange={(e) => setFormData({ ...formData, contractRef: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Descrição do serviço
                    </label>
                    <input
                      value={formData.serviceDescription}
                      onChange={(e) => setFormData({ ...formData, serviceDescription: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditing(null);
                    }}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {showDeleteModal ? (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteModal(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir Tomador de Serviço?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Não é possível excluir se houver espelho de nota fiscal vinculado.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(showDeleteModal)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </MainLayout>
    </ProtectedRoute>
  );
}

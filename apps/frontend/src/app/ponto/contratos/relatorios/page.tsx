'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileImage, Trash2, Search, MoreVertical, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';

interface RelatorioRow {
  id: string;
  titulo: string;
  createdAt: string;
  updatedAt: string;
  contractId: string;
  contractName: string;
  contractNumber?: string;
}

interface ContractRow {
  id: string;
  name: string;
  number?: string;
}

interface CamposData {
  contrato: string;
  os: string;
  unidade: string;
  tipo: string;
  solicitante: string;
  os2: string;
  lote: string;
}

interface ActionMenuState {
  row: RelatorioRow;
  top: number;
  left: number;
}

const MENU_WIDTH_PX = 224;

const CAMPOS_VAZIOS: CamposData = {
  contrato: '',
  os: '',
  unidade: '',
  tipo: 'Relatório Fotográfico',
  solicitante: '',
  os2: '',
  lote: '',
};

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RelatoriosFotograficosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isElevatedUser, canAccessContract } = usePermissions();

  const [searchTerm, setSearchTerm] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [novoContractId, setNovoContractId] = useState('');
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoCampos, setNovoCampos] = useState<CamposData>(CAMPOS_VAZIOS);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: contractsData } = useQuery({
    queryKey: ['contracts', 'relatorios-fotograficos'],
    queryFn: async () => (await api.get('/contracts', { params: { limit: 500 } })).data,
    enabled: !loadingUser,
  });

  const { data: relatoriosData, isLoading: loadingRelatorios } = useQuery({
    queryKey: ['relatorios-fotograficos', 'todos'],
    queryFn: async () => (await api.get('/relatorios-fotograficos')).data,
    enabled: !loadingUser,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Contratos liberados (Liberado na aba Contratos), como em FD e Orçamentos.
  const contratosLiberados = useMemo<ContractRow[]>(() => {
    const raw = contractsData?.data ?? contractsData;
    const list = Array.isArray(raw) ? (raw as ContractRow[]) : [];
    return list
      .filter((c) => c?.id && (isElevatedUser || canAccessContract(c.id)))
      .sort((a, b) =>
        (a.name || a.number || '').localeCompare(b.name || b.number || '', 'pt-BR', {
          sensitivity: 'base',
        })
      );
  }, [contractsData, isElevatedUser, canAccessContract]);

  const relatorios: RelatorioRow[] = relatoriosData?.data ?? [];
  const relatoriosFiltrados = useMemo(
    () =>
      relatorios.filter(
        (r) => textMatchesSearch(r.titulo, searchTerm) || textMatchesSearch(r.contractName, searchTerm)
      ),
    [relatorios, searchTerm]
  );

  const criarMutation = useMutation({
    mutationFn: async (payload: { contractId: string; titulo: string; campos: CamposData }) =>
      (
        await api.post(`/relatorios-fotograficos/${payload.contractId}`, {
          titulo: payload.titulo,
          campos: payload.campos,
        })
      ).data,
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['relatorios-fotograficos'] });
      setCreateModalOpen(false);
      toast.success('Relatório criado!');
      router.push(`/ponto/contratos/${vars.contractId}/relatorios/${res.data.id}`);
    },
    onError: () => toast.error('Erro ao criar relatório.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: RelatorioRow) =>
      api.delete(`/relatorios-fotograficos/${row.contractId}/${row.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relatorios-fotograficos'] });
      toast.success('Relatório excluído.');
    },
    onError: () => toast.error('Erro ao excluir.'),
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const abrirRelatorio = (row: RelatorioRow) =>
    router.push(`/ponto/contratos/${row.contractId}/relatorios/${row.id}`);

  const abrirModalCriacao = () => {
    setNovoContractId('');
    setNovoTitulo('');
    setNovoCampos(CAMPOS_VAZIOS);
    setCreateModalOpen(true);
  };

  const selecionarContrato = (id: string) => {
    setNovoContractId(id);
    const c = contratosLiberados.find((x) => x.id === id);
    setNovoCampos((prev) => ({ ...prev, contrato: c?.name ?? '' }));
  };

  const confirmarCriacao = () => {
    if (!novoContractId) {
      toast.error('Selecione o contrato do relatório.');
      return;
    }
    const titulo = novoTitulo.trim();
    if (!titulo) {
      toast.error('Informe o título do relatório.');
      return;
    }
    criarMutation.mutate({ contractId: novoContractId, titulo, campos: novoCampos });
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  return (
    <ProtectedRoute route="/ponto/contratos/relatorios">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <Card className="w-full shadow-none">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center space-x-3">
                  <div className="rounded-lg bg-blue-100 p-2 sm:p-3 dark:bg-blue-900/30">
                    <FileImage className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Relatórios Fotográficos
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Relatórios fotográficos dos contratos liberados.
                    </p>
                  </div>
                </div>
                <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                  {!loadingRelatorios && relatorios.length > 0 && (
                    <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar relatório ou contrato..."
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={abrirModalCriacao}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Novo Relatório
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!loadingRelatorios && relatorios.length > 0 && (
                <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span>
                    Mostrando {relatoriosFiltrados.length > 0 ? 1 : 0} a {relatoriosFiltrados.length} de{' '}
                    {relatoriosFiltrados.length}{' '}
                    {relatoriosFiltrados.length === 1 ? 'relatório' : 'relatórios'}
                  </span>
                  <span>Página 1 de 1</span>
                </div>
              )}

              {loadingRelatorios ? (
                <div className="mt-4">
                  <CadastroListLoading message="Carregando relatórios..." />
                </div>
              ) : relatoriosFiltrados.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-gray-300 py-12 text-center text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  {relatorios.length === 0
                    ? 'Nenhum relatório fotográfico criado ainda.'
                    : 'Nenhum relatório encontrado para esta busca.'}
                </div>
              ) : (
                <div className="mt-3 table-scroll">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Relatório
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Contrato
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Atualizado
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Ação
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatoriosFiltrados.map((r) => (
                        <tr
                          key={`${r.contractId}-${r.id}`}
                          onClick={() => abrirRelatorio(r)}
                          className={`border-b border-gray-100 last:border-0 dark:border-gray-800/80 ${getListTableRowClassName(true)}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-50 dark:bg-red-900/20">
                                <FileImage className="h-4 w-4 text-red-600 dark:text-red-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <ListRowNavigableLabel className="truncate font-medium">
                                  {r.titulo}
                                </ListRowNavigableLabel>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                            {r.contractName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">
                            {formatDate(r.updatedAt)}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const bounds = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setActionMenu((prev) => {
                                    if (prev?.row.id === r.id && prev.row.contractId === r.contractId) {
                                      return null;
                                    }
                                    let left = bounds.right - MENU_WIDTH_PX;
                                    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH_PX - 8));
                                    return { row: r, top: bounds.bottom + 4, left };
                                  });
                                }}
                                className={rowActionMenuButtonClass(
                                  actionMenu?.row.id === r.id && actionMenu?.row.contractId === r.contractId
                                )}
                                aria-label="Menu de ações"
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
              )}

              {actionMenu && (
                <ActionMenuOverlay
                  open
                  onClose={() => setActionMenu(null)}
                  top={actionMenu.top}
                  left={actionMenu.left}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      const row = actionMenu.row;
                      setActionMenu(null);
                      abrirRelatorio(row);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>Ver detalhes</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      const row = actionMenu.row;
                      setActionMenu(null);
                      if (confirm(`Excluir "${row.titulo}"? Esta ação não pode ser desfeita.`)) {
                        deleteMutation.mutate(row);
                      }
                    }}
                    className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Excluir</span>
                  </button>
                </ActionMenuOverlay>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={createModalOpen}
          onClose={() => !criarMutation.isPending && setCreateModalOpen(false)}
          title="Criar novo relatório fotográfico"
          size="lg"
          closeOnOverlayClick={!criarMutation.isPending}
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Contrato *
              </label>
              <select
                value={novoContractId}
                onChange={(e) => selecionarContrato(e.target.value)}
                disabled={criarMutation.isPending}
                className={inputClass}
              >
                <option value="">Selecione o contrato...</option>
                {contratosLiberados.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.name || c.number || c.id).trim()}
                  </option>
                ))}
              </select>
              {contratosLiberados.length === 0 && (
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Nenhum contrato liberado para você. Peça a liberação na aba Contratos das permissões.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Título do relatório *
              </label>
              <input
                type="text"
                value={novoTitulo}
                onChange={(e) => setNovoTitulo(e.target.value)}
                placeholder="Ex: Relatório Fotográfico - OS 001/2025"
                className={inputClass}
                disabled={criarMutation.isPending}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  { key: 'contrato' as const, label: 'Contrato nº' },
                  { key: 'os' as const, label: 'Ordem de Serviço nº' },
                  { key: 'unidade' as const, label: 'Unidade' },
                  { key: 'tipo' as const, label: 'Tipo de Relatório' },
                  { key: 'os2' as const, label: 'OS Secundária' },
                  { key: 'lote' as const, label: 'Lote' },
                  { key: 'solicitante' as const, label: 'Solicitante' },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className={key === 'tipo' || key === 'solicitante' ? 'sm:col-span-2' : ''}>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {label}
                  </label>
                  <input
                    type="text"
                    value={novoCampos[key]}
                    onChange={(e) => setNovoCampos((prev) => ({ ...prev, [key]: e.target.value }))}
                    className={inputClass}
                    disabled={criarMutation.isPending}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={criarMutation.isPending}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarCriacao}
                disabled={criarMutation.isPending}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-70"
              >
                {criarMutation.isPending ? 'Criando...' : 'Criar relatório'}
              </button>
            </div>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

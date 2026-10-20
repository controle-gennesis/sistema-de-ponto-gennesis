'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, FileImage, Filter, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';

type RelatorioRow = {
  /** Chave única da linha (contrato + relatório), usada pelo menu de ações. */
  id: string;
  relatorioId: string;
  titulo: string;
  createdAt: string;
  updatedAt: string;
  contractId: string;
  contractName: string;
  contractNumber?: string;
  resumo?: { os?: string; unidade?: string; solicitante?: string; fotos?: number };
};

type ContractRow = {
  id: string;
  name?: string;
  number?: string;
};

type CamposData = {
  contrato: string;
  os: string;
  unidade: string;
  tipo: string;
  solicitante: string;
  os2: string;
  lote: string;
};

const ITEMS_PER_PAGE = 20;

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
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const thClass =
  'whitespace-nowrap px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6';

export default function RelatoriosFotograficosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isElevatedUser, canAccessContract } = usePermissions();

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [contratoFiltro, setContratoFiltro] = useState('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [novoContractId, setNovoContractId] = useState('');
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoCampos, setNovoCampos] = useState<CamposData>(CAMPOS_VAZIOS);
  const [deleteTarget, setDeleteTarget] = useState<RelatorioRow | null>(null);
  const [editTarget, setEditTarget] = useState<RelatorioRow | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editCampos, setEditCampos] = useState<CamposData>(CAMPOS_VAZIOS);

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

  const contratoOptions = useMemo(
    () =>
      labeledToSelectOptions(
        contratosLiberados.map((c) => ({
          value: c.id,
          label: (c.name || c.number || c.id).trim(),
        }))
      ),
    [contratosLiberados]
  );

  // Funcionários para o campo Solicitante (foto, nome e CPF) — carregados só quando um formulário abre.
  const { data: employeesData, isLoading: loadingEmployees } = useQuery({
    queryKey: ['relatorios-fotograficos', 'solicitantes'],
    queryFn: async () => {
      const now = new Date();
      const res = await api.get(
        `/payroll/employees?month=${now.getMonth() + 1}&year=${now.getFullYear()}&page=1&limit=500`
      );
      return res.data;
    },
    enabled: createModalOpen || Boolean(editTarget),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const solicitanteOptions = useMemo(() => {
    const lista = Array.isArray(employeesData?.data?.employees) ? employeesData.data.employees : [];
    const vistos = new Map<string, { value: string; name: string; cpf: string | null; profilePhotoUrl: string | null }>();
    for (const e of lista as Array<{ id?: string; name?: string; cpf?: string; profilePhotoUrl?: string }>) {
      const name = String(e?.name ?? '').trim();
      if (!e?.id || !name || vistos.has(String(e.id))) continue;
      vistos.set(String(e.id), {
        value: name,
        name,
        cpf: e.cpf ? String(e.cpf) : null,
        profilePhotoUrl: e.profilePhotoUrl ? String(e.profilePhotoUrl) : null,
      });
    }
    return toPersonSelectOptions(
      Array.from(vistos.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    );
  }, [employeesData]);

  /** Mantém no seletor um solicitante já salvo que não esteja mais na lista (texto livre antigo). */
  const opcoesSolicitante = (atual: string) =>
    atual && !solicitanteOptions.some((o) => o.value === atual)
      ? [{ value: atual, label: atual }, ...solicitanteOptions]
      : solicitanteOptions;

  const relatorios = useMemo<RelatorioRow[]>(() => {
    const raw = (relatoriosData?.data ?? []) as Array<Omit<RelatorioRow, 'id' | 'relatorioId'> & { id: string }>;
    return raw.map((r) => ({ ...r, relatorioId: r.id, id: `${r.contractId}:${r.id}` }));
  }, [relatoriosData]);

  const hasActiveFilters = Boolean(contratoFiltro);

  const relatoriosFiltrados = useMemo(
    () =>
      relatorios.filter((r) => {
        if (contratoFiltro && r.contractId !== contratoFiltro) return false;
        if (!searchTerm.trim()) return true;
        return [
          r.titulo,
          r.contractName,
          r.resumo?.os,
          r.resumo?.unidade,
          r.resumo?.solicitante,
        ].some((campo) => campo && textMatchesSearch(campo, searchTerm));
      }),
    [relatorios, searchTerm, contratoFiltro]
  );

  const totalPages = Math.max(1, Math.ceil(relatoriosFiltrados.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const pageRows = relatoriosFiltrados.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const { rowActionMenu, rowForActionMenu, toggleRowActionMenu, closeRowActionMenu, isRowMenuOpen } =
    useRowActionMenu(relatoriosFiltrados);

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
      router.push(`/ponto/relatorios-fotograficos/${vars.contractId}/${res.data.id}`);
    },
    onError: () => toast.error('Erro ao criar relatório.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: RelatorioRow) =>
      api.delete(`/relatorios-fotograficos/${row.contractId}/${row.relatorioId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relatorios-fotograficos'] });
      setDeleteTarget(null);
      toast.success('Relatório excluído.');
    },
    onError: () => toast.error('Erro ao excluir.'),
  });

  // Dados completos do relatório em edição (o PUT regrava o documento inteiro, então parte do que está salvo).
  const { data: editBodyRes, isLoading: loadingEditBody } = useQuery({
    queryKey: ['relatorio-fotografico', editTarget?.contractId, editTarget?.relatorioId],
    queryFn: async () =>
      (await api.get(`/relatorios-fotograficos/${editTarget!.contractId}/${editTarget!.relatorioId}`)).data,
    enabled: Boolean(editTarget),
    staleTime: 0,
    gcTime: 0,
  });
  const editBody = editBodyRes?.data as { campos?: CamposData } | undefined;

  useEffect(() => {
    if (editBody?.campos) setEditCampos({ ...CAMPOS_VAZIOS, ...editBody.campos });
  }, [editBody]);

  const editarMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget || !editBody) throw new Error('Dados não carregados');
      await api.put(`/relatorios-fotograficos/${editTarget.contractId}/${editTarget.relatorioId}`, {
        data: { ...editBody, campos: editCampos },
        titulo: editTitulo.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relatorios-fotograficos'] });
      queryClient.invalidateQueries({ queryKey: ['relatorio-fotografico'] });
      setEditTarget(null);
      toast.success('Relatório atualizado!');
    },
    onError: () => toast.error('Erro ao salvar alterações.'),
  });

  const abrirModalEdicao = (row: RelatorioRow) => {
    setEditTitulo(row.titulo);
    setEditCampos(CAMPOS_VAZIOS);
    setEditTarget(row);
  };

  const confirmarEdicao = () => {
    if (!editTitulo.trim()) {
      toast.error('Informe o título do relatório.');
      return;
    }
    editarMutation.mutate();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const abrirRelatorio = (row: RelatorioRow) =>
    router.push(`/ponto/relatorios-fotograficos/${row.contractId}/${row.relatorioId}`);

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
    return (
      <ProtectedRoute route="/ponto/relatorios-fotograficos">
        <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const isListEmpty = !loadingRelatorios && relatoriosFiltrados.length === 0;

  return (
    <ProtectedRoute route="/ponto/relatorios-fotograficos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Relatórios Fotográficos"
            description="Relatórios fotográficos dos contratos liberados para você."
          />

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <FileImage className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Relatórios Fotográficos
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Visualize e gerencie os relatórios fotográficos
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar relatório ou contrato"
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
                      hasActiveFilters
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveFilters ? 'Filtro (contrato ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={abrirModalCriacao}
                    disabled={loadingRelatorios || contratosLiberados.length === 0}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 active:bg-red-200/80 disabled:pointer-events-none disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40 dark:active:bg-red-900/55"
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    Novo Relatório
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingRelatorios ? (
                <CadastroListLoading message="Carregando relatórios..." />
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <FileImage className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhum relatório encontrado</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                    {searchTerm.trim() || hasActiveFilters
                      ? 'Tente ajustar os filtros'
                      : contratosLiberados.length === 0
                        ? 'Você não tem contratos liberados'
                        : 'Não há relatórios nos contratos disponíveis'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={`${thClass} min-w-[14rem] w-[26%]`}>Relatório</th>
                          <th className={`${thClass} min-w-[10rem]`}>Contrato</th>
                          <th className={`${thClass} whitespace-nowrap`}>O.S.</th>
                          <th className={`${thClass} min-w-[8rem]`}>Unidade</th>
                          <th className={`${thClass} min-w-[8rem]`}>Solicitante</th>
                          <th className={`${thClass} text-center`}>Fotos</th>
                          <th className={`${thClass} text-center`}>Atualizado</th>
                          <th className={cadastroListClasses.thRight}>Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {pageRows.map((r) => (
                          <tr
                            key={r.id}
                            onClick={() => abrirRelatorio(r)}
                            className={getListTableRowClassName(true)}
                            aria-label={`Abrir relatório ${r.titulo}`}
                          >
                            <td className="min-w-[14rem] px-3 py-3 sm:px-6">
                              <ListRowNavigableLabel className="block whitespace-normal break-words font-medium">
                                {r.titulo}
                              </ListRowNavigableLabel>
                            </td>
                            <td className="min-w-[10rem] px-3 py-3 text-left sm:px-6">
                              <span className="block whitespace-normal break-words text-sm text-gray-700 dark:text-gray-300">
                                {r.contractName}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                              {r.resumo?.os || '—'}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                              {r.resumo?.unidade || '—'}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                              {r.resumo?.solicitante || '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300 sm:px-6">
                              {r.resumo?.fotos ?? 0}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300 sm:px-6">
                              {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('pt-BR') : '—'}
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(r.id)}
                              onToggle={(e) => toggleRowActionMenu(r.id, e.currentTarget)}
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 ? (
                    <div className="mt-4">
                      <ListPagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                      />
                    </div>
                  ) : null}
                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={() => {
                        closeRowActionMenu();
                        abrirModalEdicao(rowForActionMenu);
                      }}
                      extraItems={[
                        {
                          label: 'Abrir relatório',
                          icon: <Eye className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-300" />,
                          onClick: () => abrirRelatorio(rowForActionMenu),
                        },
                      ]}
                      onDelete={() => {
                        closeRowActionMenu();
                        setDeleteTarget(rowForActionMenu);
                      }}
                    />
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Modal
            isOpen={isFiltersModalOpen}
            onClose={() => setIsFiltersModalOpen(false)}
            title="Filtros"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Contrato
                </label>
                <StringSingleSelectDropdown
                  value={contratoFiltro}
                  onChange={(value) => {
                    setContratoFiltro(value);
                    setCurrentPage(1);
                  }}
                  options={contratoOptions}
                  allowEmpty
                  emptyOptionLabel="Todos os contratos"
                  placeholder="Todos os contratos"
                  searchPlaceholder="Pesquisar contrato..."
                  emptyOptionsMessage="Nenhum contrato disponível."
                  className="w-full"
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setContratoFiltro('');
                    setCurrentPage(1);
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

          <Modal
            isOpen={createModalOpen}
            onClose={() => !criarMutation.isPending && setCreateModalOpen(false)}
            title="Novo Relatório"
            size="lg"
            closeOnOverlayClick={!criarMutation.isPending}
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Contrato *
                </label>
                <StringSingleSelectDropdown
                  value={novoContractId}
                  onChange={selecionarContrato}
                  options={contratoOptions}
                  allowEmpty
                  emptyOptionLabel="Selecione…"
                  placeholder="Selecione o contrato"
                  searchPlaceholder="Pesquisar contrato..."
                  emptyOptionsMessage="Nenhum contrato disponível."
                  className="w-full"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                    { key: 'os' as const, label: 'Ordem de Serviço nº', placeholder: 'Ex: 123/2026' },
                    { key: 'os2' as const, label: 'OS Secundária', placeholder: 'Ex: 124/2026' },
                    { key: 'unidade' as const, label: 'Unidade', placeholder: 'Ex: Taguatinga' },
                    { key: 'lote' as const, label: 'Lote', placeholder: 'Ex: Lote 01' },
                    { key: 'solicitante' as const, label: 'Solicitante', placeholder: 'Nome do solicitante' },
                  ] as const
                ).map(({ key, label, placeholder }) => (
                  <div key={key} className={key === 'solicitante' ? 'sm:col-span-2' : ''}>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {label}
                    </label>
                    {key === 'solicitante' ? (
                      <SingleSelectSearchDropdown
                        value={novoCampos.solicitante}
                        onChange={(v) => setNovoCampos((prev) => ({ ...prev, solicitante: v }))}
                        options={opcoesSolicitante(novoCampos.solicitante)}
                        allowEmpty
                        disabled={criarMutation.isPending || loadingEmployees}
                        placeholder={loadingEmployees ? 'Carregando funcionários...' : 'Selecione o solicitante'}
                        searchPlaceholder="Pesquisar funcionário..."
                        emptyOptionsMessage="Nenhum funcionário encontrado"
                        noFocusRing
                      />
                    ) : (
                      <input
                        type="text"
                        value={novoCampos[key]}
                        placeholder={placeholder}
                        onChange={(e) => setNovoCampos((prev) => ({ ...prev, [key]: e.target.value }))}
                        className={inputClass}
                        disabled={criarMutation.isPending}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={criarMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarCriacao}
                  disabled={criarMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  {criarMutation.isPending ? 'Criando...' : 'Criar relatório'}
                </button>
              </div>
            </div>
          </Modal>

          <Modal
            isOpen={Boolean(editTarget)}
            onClose={() => !editarMutation.isPending && setEditTarget(null)}
            title="Editar relatório"
            size="lg"
            closeOnOverlayClick={!editarMutation.isPending}
          >
            {loadingEditBody ? (
              <div className="py-12">
                <Loading message="Carregando dados…" size="md" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Contrato
                  </label>
                  <input type="text" value={editTarget?.contractName ?? ''} disabled className={`${inputClass} opacity-70`} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Título do relatório *
                  </label>
                  <input
                    type="text"
                    value={editTitulo}
                    onChange={(e) => setEditTitulo(e.target.value)}
                    placeholder="Ex: Relatório Fotográfico - OS 001/2025"
                    className={inputClass}
                    disabled={editarMutation.isPending}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      { key: 'os' as const, label: 'Ordem de Serviço nº', placeholder: 'Ex: 123/2026' },
                      { key: 'os2' as const, label: 'OS Secundária', placeholder: 'Ex: 124/2026' },
                      { key: 'unidade' as const, label: 'Unidade', placeholder: 'Ex: Taguatinga' },
                      { key: 'lote' as const, label: 'Lote', placeholder: 'Ex: Lote 01' },
                      { key: 'solicitante' as const, label: 'Solicitante', placeholder: 'Nome do solicitante' },
                    ] as const
                  ).map(({ key, label, placeholder }) => (
                    <div key={key} className={key === 'solicitante' ? 'sm:col-span-2' : ''}>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {label}
                      </label>
                      {key === 'solicitante' ? (
                        <SingleSelectSearchDropdown
                          value={editCampos.solicitante}
                          onChange={(v) => setEditCampos((prev) => ({ ...prev, solicitante: v }))}
                          options={opcoesSolicitante(editCampos.solicitante)}
                          allowEmpty
                          disabled={editarMutation.isPending || loadingEmployees}
                          placeholder={loadingEmployees ? 'Carregando funcionários...' : 'Selecione o solicitante'}
                          searchPlaceholder="Pesquisar funcionário..."
                          emptyOptionsMessage="Nenhum funcionário encontrado"
                          noFocusRing
                        />
                      ) : (
                        <input
                          type="text"
                          value={editCampos[key]}
                          placeholder={placeholder}
                          onChange={(e) => setEditCampos((prev) => ({ ...prev, [key]: e.target.value }))}
                          className={inputClass}
                          disabled={editarMutation.isPending}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setEditTarget(null)}
                    disabled={editarMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmarEdicao}
                    disabled={editarMutation.isPending || !editBody}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    {editarMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </div>
              </div>
            )}
          </Modal>

          <Modal
            isOpen={Boolean(deleteTarget)}
            onClose={() => {
              if (!deleteMutation.isPending) setDeleteTarget(null);
            }}
            title="Excluir relatório?"
            size="md"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Tem certeza que deseja excluir o relatório{' '}
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {deleteTarget?.titulo}
                </span>
                ? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => setDeleteTarget(null)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          </Modal>
        </PageStack>
      </MainLayout>
    </ProtectedRoute>
  );
}

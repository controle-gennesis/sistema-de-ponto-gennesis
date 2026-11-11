'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Filter, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { ListPagination } from '@/components/ui/ListPagination';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
} from '@/components/ui/RowActionMenu';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const PAGE_SIZE = 20;
const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

type DiarioRow = {
  id: string;
  date: string;
  obraId: string;
  obraName: string;
  contratoId: string;
  contratoName: string;
  contratoNumber: string;
  noActivity: boolean;
  noActivityReason: string | null;
  finalizedAt: string | null;
  activities: number;
  workers: number;
  occurrences: number;
  updatedAt: string;
  updatedByName: string;
};

type ContractOption = { id: string; name: string; number?: string };
type ObraOption = { id: string; name: string; contratoId: string; isActive?: boolean };

const pad = (n: number) => String(n).padStart(2, '0');
const todayIso = () => {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};
const brDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
};
const brDateTime = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function DiarioObraListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canCreate, canDelete } = useCadastroCrudPermissions('/ponto/diario-obra');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterContratoId, setFilterContratoId] = useState('');
  const [filterObraId, setFilterObraId] = useState('');
  const [page, setPage] = useState(1);

  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formContratoId, setFormContratoId] = useState('');
  const [formObraId, setFormObraId] = useState('');
  const [formDate, setFormDate] = useState(todayIso());
  const [creating, setCreating] = useState(false);
  const [deleteRow, setDeleteRow] = useState<DiarioRow | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: contractsData } = useQuery({
    queryKey: ['diario-obra-contracts'],
    queryFn: async () => (await api.get('/contracts', { params: { limit: 500, page: 1 } })).data,
  });
  const { data: obrasData } = useQuery({
    queryKey: ['diario-obra-obras'],
    queryFn: async () => (await api.get('/obras', { params: { limit: 500 } })).data,
  });

  const contracts: ContractOption[] = useMemo(
    () => ((contractsData?.data ?? []) as ContractOption[]).filter((c) => c.id && c.name),
    [contractsData],
  );
  const obras: ObraOption[] = useMemo(
    () => ((obrasData?.data ?? []) as ObraOption[]).filter((o) => o.isActive !== false),
    [obrasData],
  );

  const contractOptions = useMemo(
    () =>
      labeledToSelectOptions(
        contracts.map((c) => ({ value: c.id, label: c.name, searchText: `${c.name} ${c.number ?? ''}` })),
      ),
    [contracts],
  );
  // A lista de contratos já vem filtrada pelo que o usuário tem liberado; as obras seguem a mesma regra.
  const contractIdSet = useMemo(() => new Set(contracts.map((c) => c.id)), [contracts]);
  const obraOptionsFor = (contratoId: string) =>
    labeledToSelectOptions(
      obras
        .filter((o) => (contratoId ? o.contratoId === contratoId : contractIdSet.has(o.contratoId)))
        .map((o) => ({ value: o.id, label: o.name })),
    );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterContratoId, filterObraId]);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['diario-obra-list', debouncedSearch, filterContratoId, filterObraId, page],
    queryFn: async () =>
      (
        await api.get('/diario-obra', {
          params: {
            search: debouncedSearch || undefined,
            contratoId: filterContratoId || undefined,
            obraId: filterObraId || undefined,
            page,
            limit: PAGE_SIZE,
          },
        })
      ).data,
  });
  const items: DiarioRow[] = listData?.data ?? [];
  const total: number = listData?.pagination?.total ?? 0;
  const totalPages: number = listData?.pagination?.totalPages ?? 1;

  const { rowActionMenu, rowForActionMenu, toggleRowActionMenu, closeRowActionMenu, isRowMenuOpen } =
    useRowActionMenu(items);

  const deleteMutation = useMutation({
    mutationFn: async (row: DiarioRow) => api.delete(`/diario-obra/${row.obraId}/${row.date}`),
    onSuccess: () => {
      toast.success('Diário de obra excluído.');
      setDeleteRow(null);
      void queryClient.invalidateQueries({ queryKey: ['diario-obra-list'] });
    },
    onError: () => toast.error('Não foi possível excluir o diário de obra.'),
  });

  const openForm = () => {
    setFormContratoId(filterContratoId);
    setFormObraId(filterObraId);
    setFormDate(todayIso());
    setCreating(false);
    setShowForm(true);
  };

  const submitForm = async () => {
    if (!formContratoId || !formObraId || !formDate) {
      toast.error('Selecione o contrato, a obra e a data.');
      return;
    }
    setCreating(true);
    try {
      // Cria o RDO vazio só para ele aparecer na lista; para preencher, é só abrir a linha.
      const existing = await api.get(`/diario-obra/${formObraId}/${formDate}`);
      if (existing.data?.data) {
        toast.error('Já existe um diário para esta obra nesta data.');
        setCreating(false);
        return;
      }
      await api.put(`/diario-obra/${formObraId}/${formDate}`, { noActivity: false });
      toast.success('Diário de obra criado.');
      setShowForm(false);
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['diario-obra-list'] });
    } catch {
      toast.error('Não foi possível criar o diário de obra.');
      setCreating(false);
    }
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/diario-obra">
        <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  const activeFilters = !!(filterContratoId || filterObraId);
  const hasFilters = !!(debouncedSearch || activeFilters);
  const startItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  return (
    <ProtectedRoute route="/ponto/diario-obra">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Diários de Obra"
            description="Gerencie os diários de obra"
          />

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <BookOpen className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Diários de Obra</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{total} cadastrado(s)</p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por obra ou contrato..."
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
                    onClick={() => setIsFiltersModalOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      activeFilters
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={activeFilters ? 'Filtro (ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {activeFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={openForm}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>Novo Diário de Obra</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </CardHeader>

            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando diários de obra..." />
              ) : items.length === 0 ? (
                <CadastroListEmpty
                  icon={BookOpen}
                  title="Nenhum diário de obra encontrado"
                  hint={hasFilters ? 'Tente ajustar a busca ou os filtros' : 'Clique em "Novo Diário de Obra" para começar'}
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={startItem}
                    endItem={endItem}
                    total={total}
                    itemLabel="diário"
                    itemLabelPlural="diários"
                    currentPage={page}
                    totalPages={totalPages}
                  />
                  <div className="table-scroll">
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>Data</th>
                          <th className={cadastroListClasses.th}>Contrato</th>
                          <th className={`${cadastroListClasses.th} !text-center`}>Situação</th>
                          <th className={`${cadastroListClasses.th} !text-center`}>Atividades</th>
                          <th className={`${cadastroListClasses.th} !text-center`}>Equipe</th>
                          <th className={`${cadastroListClasses.th} !text-center`}>Ocorrências</th>
                          <th className={`${cadastroListClasses.th} !text-center`}>Atualizado</th>
                          {canDelete ? <th className={cadastroListClasses.thRight}>Ação</th> : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {items.map((it) => (
                          <tr
                            key={it.id}
                            className={getListTableRowClassName(true)}
                            onClick={() => router.push(`/ponto/diario-obra/${it.obraId}/${it.date}`)}
                          >
                            <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                              <ListRowNavigableLabel className="block font-medium">{brDate(it.date)}</ListRowNavigableLabel>
                              <span className="block text-xs text-gray-500 dark:text-gray-400">{weekdayOf(it.date)}</span>
                            </td>
                            <td className="px-3 py-4 sm:px-6">
                              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                {it.obraName || '—'}
                              </span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400">
                                {it.contratoName || '—'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-center sm:px-6">
                              <span
                                title={it.noActivity ? it.noActivityReason || undefined : undefined}
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                  it.finalizedAt
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                    : it.noActivity
                                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                      : it.activities > 0
                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                }`}
                              >
                                {it.finalizedAt
                                  ? 'Finalizado'
                                  : it.noActivity
                                    ? 'Sem atividade'
                                    : it.activities > 0
                                      ? 'Preenchido'
                                      : 'Em branco'}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-6">{it.activities}</td>
                            <td className="px-3 py-4 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-6">{it.workers}</td>
                            <td className="px-3 py-4 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-6">{it.occurrences}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-center sm:px-6">
                              <span className="block text-sm text-gray-900 dark:text-gray-100">
                                {brDateTime(it.updatedAt)}
                              </span>
                              {it.updatedByName ? (
                                <span className="block text-xs text-gray-500 dark:text-gray-400">{it.updatedByName}</span>
                              ) : null}
                            </td>
                            {canDelete ? (
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(it.id)}
                                onToggle={(e) => {
                                  e.stopPropagation();
                                  toggleRowActionMenu(it.id, e.currentTarget as HTMLButtonElement);
                                }}
                              />
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ListPagination currentPage={page} totalPages={totalPages} onPageChange={setPage} className="mt-4" />
                </>
              )}
              {rowActionMenu && rowForActionMenu ? (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onDelete={canDelete ? () => setDeleteRow(rowForActionMenu) : undefined}
                />
              ) : null}
            </CardContent>
          </Card>
        </PageStack>

        <Modal
          isOpen={isFiltersModalOpen}
          onClose={() => setIsFiltersModalOpen(false)}
          title="Filtros"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Contrato</label>
              <StringSingleSelectDropdown
                value={filterContratoId}
                onChange={(v) => {
                  setFilterContratoId(v);
                  setFilterObraId('');
                }}
                options={contractOptions}
                allowEmpty
                emptyOptionLabel="Todos os contratos"
                placeholder="Todos os contratos"
                searchPlaceholder="Pesquisar contrato..."
                emptyOptionsMessage="Nenhum contrato disponível."
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Obra</label>
              <StringSingleSelectDropdown
                value={filterObraId}
                onChange={setFilterObraId}
                options={obraOptionsFor(filterContratoId)}
                allowEmpty
                emptyOptionLabel="Todas as obras"
                placeholder="Todas as obras"
                searchPlaceholder="Pesquisar obra..."
                emptyOptionsMessage="Nenhuma obra disponível."
                className="w-full"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setFilterContratoId('');
                  setFilterObraId('');
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

        {showForm ? (
          <Modal
            isOpen
            onClose={() => setShowForm(false)}
            title="Novo Diário de Obra"
            size="md"
            contentOverflowVisible
            confirmBeforeClose
            footer={
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitForm()}
                  disabled={creating}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {creating ? 'Criando...' : 'Criar'}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Contrato <span className="text-red-600 dark:text-red-400">*</span></label>
                <StringSingleSelectDropdown
                  value={formContratoId}
                  onChange={(v) => {
                    setFormContratoId(v);
                    setFormObraId('');
                  }}
                  options={contractOptions}
                  placeholder="Selecione o contrato"
                  emptyOptionLabel="Selecione o contrato"
                  matchTriggerWidth
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Obra <span className="text-red-600 dark:text-red-400">*</span></label>
                <StringSingleSelectDropdown
                  value={formObraId}
                  onChange={setFormObraId}
                  options={obraOptionsFor(formContratoId)}
                  placeholder={formContratoId ? 'Selecione a obra' : 'Selecione primeiro o contrato'}
                  emptyOptionLabel="Selecione a obra"
                  emptyOptionsMessage="Nenhuma obra cadastrada neste contrato"
                  disabled={!formContratoId}
                  matchTriggerWidth
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Data <span className="text-red-600 dark:text-red-400">*</span></label>
                <DatePickerField value={formDate} onChange={setFormDate} />
              </div>
            </div>
          </Modal>
        ) : null}

        {deleteRow ? (
          <Modal
            isOpen
            onClose={() => setDeleteRow(null)}
            title="Excluir diário de obra"
            size="sm"
            footer={
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteRow(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(deleteRow)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  Excluir
                </button>
              </div>
            }
          >
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Excluir o diário de <strong>{deleteRow.obraName}</strong> de {brDate(deleteRow.date)}? Todo o conteúdo do
              dia será perdido e não dá para desfazer.
            </p>
          </Modal>
        ) : null}
      </MainLayout>
    </ProtectedRoute>
  );
}

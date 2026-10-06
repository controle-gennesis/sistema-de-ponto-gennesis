'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AlertCircle, Filter, Plus, Search, Warehouse, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { RowActionMenuCell, RowActionMenuPortal, cadastroListClasses, listTableRowClasses } from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { POLOS_LIST } from '@/constants/payrollFilters';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { ListPagination } from '@/components/ui/ListPagination';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { TOTVS_OC_FILIAL_OPTIONS, totvsFilialLabel } from '@/lib/ocTotvsDestination';

const ACTIVE_STATUS_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todos' },
  { value: 'true', label: 'Ativo' },
  { value: 'false', label: 'Inativo' },
]);

interface StockLocation {
  id: string;
  code: string;
  name: string;
  polo?: string | null;
  filial: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type StockLocationForm = {
  code: string;
  name: string;
  polo: string;
  filial: string;
  isActive: boolean;
};

const emptyForm = (): StockLocationForm => ({
  code: '',
  name: '',
  polo: '',
  filial: '1',
  isActive: true,
});

export default function LocaisEstoquePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = useCadastroCrudPermissions('/ponto/locais-estoque');
  const showActions = canEdit || canDelete;
  const [searchTerm, setSearchTerm] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('all');
  const [filialFilter, setFilialFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<StockLocation | null>(null);
  const [formData, setFormData] = useState<StockLocationForm>(emptyForm());
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

  const filialFilterSelectOptions = useMemo(
    () => [
      { value: 'all', label: 'Todas', searchText: 'Todas' },
      ...TOTVS_OC_FILIAL_OPTIONS.map((row) => ({
        value: row.value,
        label: row.label,
        searchText: row.label,
      })),
    ],
    []
  );

  const hasActiveFilters = isActiveFilter !== 'all' || filialFilter !== 'all';

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

  const { data: locationsData, isLoading: loadingLocations } = useQuery({
    queryKey: ['stock-locations-admin', searchTerm, isActiveFilter, filialFilter, currentPage, itemsPerPage],
    queryFn: async () => {
      const filial = filialFilter === '1' || filialFilter === '5' ? filialFilter : undefined;
      const res = await api.get('/stock-locations', {
        params: {
          search: searchTerm || undefined,
          isActive: isActiveFilter !== 'all' ? isActiveFilter : undefined,
          filial,
          page: currentPage,
          limit: itemsPerPage,
        },
      });
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: StockLocationForm) => {
      const res = await api.post('/stock-locations', {
        code: data.code.trim(),
        name: data.name.trim(),
        polo: data.polo.trim() || undefined,
        filial: data.filial,
        isActive: data.isActive,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-locations-admin'] });
      queryClient.invalidateQueries({ queryKey: ['stock-locations'] });
      setShowForm(false);
      resetForm();
      toast.success('Local de estoque criado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar local de estoque');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: StockLocationForm }) => {
      const res = await api.patch(`/stock-locations/${id}`, {
        code: data.code.trim(),
        name: data.name.trim(),
        polo: data.polo.trim() || undefined,
        filial: data.filial,
        isActive: data.isActive,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-locations-admin'] });
      queryClient.invalidateQueries({ queryKey: ['stock-locations'] });
      setShowForm(false);
      setEditingLocation(null);
      resetForm();
      toast.success('Local de estoque atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar local de estoque');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/stock-locations/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-locations-admin'] });
      queryClient.invalidateQueries({ queryKey: ['stock-locations'] });
      setShowDeleteModal(null);
      toast.success('Local de estoque excluído com sucesso!');
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.message || error.response?.data?.error || 'Erro ao excluir local de estoque'
      );
    },
  });

  const resetForm = () => {
    setFormData(emptyForm());
    setEditingLocation(null);
  };

  const handleEdit = (row: StockLocation) => {
    setEditingLocation(row);
    setFormData({
      code: row.code,
      name: row.name,
      polo: row.polo || '',
      filial: String(row.filial === 5 ? 5 : 1),
      isActive: row.isActive,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error('Preencha o ID e o nome do local de estoque');
      return;
    }
    if (editingLocation) {
      if (!canEdit) {
        toast.error('Você não tem permissão para editar.');
        return;
      }
      updateMutation.mutate({ id: editingLocation.id, data: formData });
    } else {
      if (!canCreate) {
        toast.error('Você não tem permissão para criar.');
        return;
      }
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (!canDelete) {
      toast.error('Você não tem permissão para excluir.');
      return;
    }
    deleteMutation.mutate(id);
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const locations = (locationsData?.data || []) as StockLocation[];
  const pagination = locationsData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, isActiveFilter, filialFilter]);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(locations);

  const listRange = getCadastroListRange(currentPage, pagination.limit, pagination.total);

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/locais-estoque">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/locais-estoque">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Gerenciar Locais de Estoque"
            description="Cadastre os locais de estoque no mesmo padrão do TOTVS (CODLOC)"
          />

          <StockLocationFormModal
            isOpen={showForm}
            onClose={() => {
              setShowForm(false);
              resetForm();
            }}
            editingLocation={editingLocation}
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            createMutation={createMutation}
            updateMutation={updateMutation}
          />

          <Modal isOpen={isFiltersModalOpen} onClose={() => setIsFiltersModalOpen(false)} title="Filtros" size="md">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <StringSingleSelectDropdown
                  value={isActiveFilter}
                  onChange={setIsActiveFilter}
                  options={ACTIVE_STATUS_FILTER_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Filial</label>
                <StringSingleSelectDropdown
                  value={filialFilter}
                  onChange={setFilialFilter}
                  options={filialFilterSelectOptions}
                  allowEmpty={false}
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setIsActiveFilter('all');
                    setFilialFilter('all');
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

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Warehouse className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Locais de Estoque</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {pagination.total} {pagination.total === 1 ? 'local' : 'locais'} cadastrado(s)
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:w-[280px] sm:min-w-[240px] sm:flex-none sm:basis-auto">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Pesquisar local de estoque..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
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
                    title="Filtro"
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setShowForm(true);
                      }}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>Novo Local de Estoque</span>
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingLocations ? (
                <CadastroListLoading message="Carregando locais de estoque..." />
              ) : pagination.total === 0 ? (
                <CadastroListEmpty
                  icon={Warehouse}
                  title="Nenhum local de estoque encontrado"
                  hint={
                    searchTerm.trim() || hasActiveFilters
                      ? 'Tente ajustar a busca ou os filtros'
                      : 'Cadastre um novo local de estoque para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={pagination.total}
                    itemLabel="local de estoque"
                    itemLabelPlural="locais de estoque"
                    currentPage={currentPage}
                    totalPages={listRange.totalPages}
                  />
                  <div className="table-scroll">
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th scope="col" className={cadastroListClasses.th}>
                            ID
                          </th>
                          <th scope="col" className={cadastroListClasses.th}>
                            Nome
                          </th>
                          <th scope="col" className={cadastroListClasses.th}>
                            Filial
                          </th>
                          <th scope="col" className={cadastroListClasses.th}>
                            Polo
                          </th>
                          <th scope="col" className={cadastroListClasses.thCenter}>
                            Status
                          </th>
                          {showActions ? (
                            <th scope="col" className={cadastroListClasses.thRight}>
                              Ação
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {locations.map((row, index) => (
                          <tr key={row.id} className={listTableRowClasses.tr}>
                            <td className={cadastroListClasses.tdMono}>
                              {formatCadastroListId(row.code, listRange.startItem + index)}
                            </td>
                            <td className="min-w-0 px-3 py-4 sm:px-6">
                              <span className="block truncate text-sm text-gray-900 dark:text-gray-100">{row.name}</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                              <span className="text-sm text-gray-700 dark:text-gray-400">{totvsFilialLabel(row.filial)}</span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                              <span className="text-sm text-gray-700 dark:text-gray-400">{row.polo || '-'}</span>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-medium ${
                                  row.isActive
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                                }`}
                              >
                                {row.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            {showActions ? (
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(row.id)}
                                onToggle={(e) => toggleRowActionMenu(row.id, e.currentTarget as HTMLButtonElement)}
                              />
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {rowActionMenu && rowForActionMenu && (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={canEdit ? () => handleEdit(rowForActionMenu) : undefined}
                      onDelete={canDelete ? () => setShowDeleteModal(rowForActionMenu.id) : undefined}
                    />
                  )}

                  <ListPagination
                    currentPage={currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </PageStack>

        {showDeleteModal && (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteModal(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir Local de Estoque?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Tem certeza que deseja excluir este local de estoque? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(showDeleteModal)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

function StockLocationFormModal({
  isOpen,
  onClose,
  editingLocation,
  formData,
  setFormData,
  onSubmit,
  createMutation,
  updateMutation,
}: {
  isOpen: boolean;
  onClose: () => void;
  editingLocation: StockLocation | null;
  formData: StockLocationForm;
  setFormData: React.Dispatch<React.SetStateAction<StockLocationForm>>;
  onSubmit: (e: React.FormEvent) => void;
  createMutation: any;
  updateMutation: any;
}) {
  const { requestClose, confirmUi } = useModalCloseConfirm(onClose, { isParentOpen: isOpen });

  if (!isOpen) return null;

  return (
    <>
      <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black bg-opacity-50">
        <div className="absolute inset-0" onClick={requestClose} />
        <div className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingLocation ? 'Editar Local de Estoque' : 'Cadastrar Local de Estoque'}
            </h3>
            <button
              onClick={requestClose}
              className="rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">ID *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Ex: 01.007"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Nome *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Ex: ESTOQUE SES LOTE 12/14"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Filial *</label>
                  <StringSingleSelectDropdown
                    value={formData.filial}
                    onChange={(filial) => setFormData({ ...formData, filial })}
                    options={labeledToSelectOptions(
                      TOTVS_OC_FILIAL_OPTIONS.map((row) => ({ value: row.value, label: row.label }))
                    )}
                    allowEmpty={false}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Polo</label>
                  <StringSingleSelectDropdown
                    value={formData.polo}
                    onChange={(polo) => setFormData({ ...formData, polo })}
                    options={POLOS_LIST}
                    placeholder="Selecione"
                    emptyOptionLabel="Selecione"
                  />
                </div>
              </div>
              <div className="flex items-center">
                <label className="group flex cursor-pointer items-center space-x-3">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="sr-only"
                    />
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200 ${
                        formData.isActive
                          ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
                          : 'border-gray-300 bg-white group-hover:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
                      }`}
                    >
                      {formData.isActive && (
                        <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-gray-100">
                    Ativo
                  </span>
                </label>
              </div>
              {(createMutation.isError || updateMutation.isError) && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {(createMutation.error as any)?.response?.data?.message ||
                      (updateMutation.error as any)?.response?.data?.message ||
                      'Ocorreu um erro inesperado. Verifique os dados e tente novamente.'}
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={requestClose}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Salvando...'
                    : editingLocation
                      ? 'Atualizar'
                      : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </AppModalOverlay>
      {confirmUi}
    </>
  );
}

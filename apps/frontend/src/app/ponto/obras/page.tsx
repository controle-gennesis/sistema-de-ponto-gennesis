'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { DraftingCompass, Plus, Search, Upload, X } from 'lucide-react';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  listTableRowClasses,
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { SpreadsheetImportModal } from '@/components/ui/SpreadsheetImportModal';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  OBRA_IMPORT_COLUMNS,
  downloadObraImportTemplate,
  parseObrasFromFile,
} from '@/lib/obraImport';

interface ObraRow {
  id: string;
  name: string;
  contratoId: string;
  contratoNome?: string;
  isActive: boolean;
}

interface ContractOption {
  id: string;
  name: string;
}

export default function ObrasPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = useCadastroCrudPermissions('/ponto/obras');
  const showActions = canEdit || canDelete;
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ObraRow | null>(null);
  const [formName, setFormName] = useState('');
  const [formContratoId, setFormContratoId] = useState('');
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);

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

  const { data: listData, isLoading } = useQuery({
    queryKey: ['obras', searchTerm],
    queryFn: async () => {
      const res = await api.get('/obras', {
        params: { search: searchTerm || undefined, limit: 500 },
      });
      return res.data;
    },
  });

  const { data: contractsData } = useQuery({
    queryKey: ['contracts-obras-cadastro'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
  });

  const contratoSelectOptions = useMemo(() => {
    const rows = ((contractsData?.data || []) as ContractOption[]).filter((c) => c.id && c.name);
    return labeledToSelectOptions(rows.map((c) => ({ value: c.id, label: c.name })));
  }, [contractsData]);

  const resetForm = () => {
    setEditingItem(null);
    setFormName('');
    setFormContratoId('');
  };

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; contratoId: string }) => {
      const res = await api.post('/obras', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obras'] });
      setShowForm(false);
      resetForm();
      toast.success('Obra salva com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao salvar');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      name,
      contratoId,
    }: {
      id: string;
      name: string;
      contratoId: string;
    }) => {
      const res = await api.patch(`/obras/${id}`, { name, contratoId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obras'] });
      setShowForm(false);
      resetForm();
      toast.success('Obra atualizada!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/obras/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obras'] });
      setShowDeleteId(null);
      toast.success('Registro excluído');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao excluir');
    },
  });

  const handleEdit = (item: ObraRow) => {
    setEditingItem(item);
    setFormName(item.name || '');
    setFormContratoId(item.contratoId || '');
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    const contratoId = formContratoId.trim();
    if (!contratoId) {
      toast.error('Selecione o contrato');
      return;
    }
    if (!name) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (editingItem) {
      if (!canEdit) {
        toast.error('Você não tem permissão para editar.');
        return;
      }
      updateMutation.mutate({ id: editingItem.id, name, contratoId });
    } else {
      if (!canCreate) {
        toast.error('Você não tem permissão para criar.');
        return;
      }
      createMutation.mutate({ name, contratoId });
    }
  };

  const closeFormModal = useCallback(() => {
    setShowForm(false);
    resetForm();
  }, []);

  const { requestClose: requestCloseForm, confirmUi: formConfirmUi } = useModalCloseConfirm(
    closeFormModal,
    { isParentOpen: showForm }
  );

  const items: ObraRow[] = listData?.data || [];

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(items);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const saving = createMutation.isPending || updateMutation.isPending;

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/obras">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/obras">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">Obras</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Cadastre as obras usadas nas Fichas de Demanda
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <DraftingCompass className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Obras</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {items.length} cadastrado(s)
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou contrato..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
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
                  {canCreate ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowImportModal(true)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        aria-label="Importar"
                        title="Importar"
                      >
                        <Upload className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          resetForm();
                          setShowForm(true);
                        }}
                        className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span>Nova Obra</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando obras..." />
              ) : items.length === 0 ? (
                <CadastroListEmpty
                  icon={DraftingCompass}
                  title="Nenhuma obra encontrada"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre uma nova obra para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={items.length}
                    total={items.length}
                    itemLabel="obra"
                    itemLabelPlural="obras"
                  />
                  <div className="table-scroll">
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>ID</th>
                          <th className={cadastroListClasses.th}>Nome</th>
                          <th className={cadastroListClasses.th}>Contrato</th>
                          {showActions ? (
                            <th className={cadastroListClasses.thRight}>Ação</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {items.map((it, index) => (
                          <tr key={it.id} className={listTableRowClasses.tr}>
                            <td className={cadastroListClasses.tdMono}>
                              {formatCadastroListId(undefined, index + 1)}
                            </td>
                            <td className="px-3 py-4 sm:px-6">
                              <span className="text-sm text-gray-900 dark:text-gray-100">
                                {it.name}
                              </span>
                            </td>
                            <td className="px-3 py-4 sm:px-6">
                              <span className="text-sm text-gray-900 dark:text-gray-100">
                                {it.contratoNome || '—'}
                              </span>
                            </td>
                            {showActions ? (
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(it.id)}
                                onToggle={(e) =>
                                  toggleRowActionMenu(it.id, e.currentTarget as HTMLButtonElement)
                                }
                              />
                            ) : null}
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
                  onEdit={canEdit ? () => handleEdit(rowForActionMenu) : undefined}
                  onDelete={canDelete ? () => setShowDeleteId(rowForActionMenu.id) : undefined}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {showForm ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={requestCloseForm} />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editingItem ? 'Editar Obra' : 'Nova Obra'}
                </h2>
                <button
                  type="button"
                  onClick={requestCloseForm}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Contrato *
                  </label>
                  <StringSingleSelectDropdown
                    value={formContratoId}
                    onChange={setFormContratoId}
                    options={contratoSelectOptions}
                    placeholder="Selecione o contrato"
                    emptyOptionLabel="Selecione o contrato"
                    matchTriggerWidth
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nome *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ex.: Obra FHE - DF"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={requestCloseForm}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {editingItem ? 'Atualizar' : 'Criar'}
                  </button>
                </div>
              </form>
            </div>
          </AppModalOverlay>
        ) : null}

        {showDeleteId ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteId(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir registro?
              </h3>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteId(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(showDeleteId)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                >
                  Excluir
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {formConfirmUi}

        <SpreadsheetImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          title="Importar obras"
          templateHint="O contrato precisa existir no cadastro (nome, número ou ID). Com ID externo, a linha atualiza a obra se já existir."
          columns={OBRA_IMPORT_COLUMNS}
          bodyKey="obras"
          importPath="/obras/import"
          downloadTemplate={downloadObraImportTemplate}
          parseFile={async (file) => {
            const report = await parseObrasFromFile(file);
            return {
              items: report.obras,
              skipped: report.skipped,
              totalRows: report.totalRows,
            };
          }}
          onImported={() => {
            void queryClient.invalidateQueries({ queryKey: ['obras'] });
          }}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}

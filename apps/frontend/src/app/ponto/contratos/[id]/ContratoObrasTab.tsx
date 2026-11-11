'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DraftingCompass, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
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
} from '@/components/ui/RowActionMenu';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';

type ObraRow = {
  id: string;
  name: string;
  contratoId: string;
  isActive: boolean;
};

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/** Aba "Obras" do contrato: lista e cadastro das obras deste contrato. */
export function ContratoObrasTab({ contractId, canManage }: { contractId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  // Quem tem a aba Obras neste contrato pode criar, editar e excluir as obras dele.
  const canCreate = canManage;
  const canEdit = canManage;
  const canDelete = canManage;
  const showActions = canEdit || canDelete;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ObraRow | null>(null);
  const [formName, setFormName] = useState('');
  const [deleteRow, setDeleteRow] = useState<ObraRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['obras', 'contrato', contractId, debouncedSearch],
    enabled: !!contractId,
    queryFn: async () =>
      (await api.get('/obras', { params: { contratoId: contractId, search: debouncedSearch || undefined, limit: 500 } }))
        .data,
  });
  const items: ObraRow[] = data?.data ?? [];

  const { rowActionMenu, rowForActionMenu, toggleRowActionMenu, closeRowActionMenu, isRowMenuOpen } =
    useRowActionMenu(items);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['obras'] });
    void queryClient.invalidateQueries({ queryKey: ['diario-obra-obras'] });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormName('');
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = formName.trim();
      if (editing) return api.patch(`/obras/${editing.id}`, { name, contratoId: contractId });
      return api.post('/obras', { name, contratoId: contractId });
    },
    onSuccess: () => {
      toast.success(editing ? 'Obra atualizada!' : 'Obra salva com sucesso!');
      closeForm();
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Erro ao salvar')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/obras/${id}`),
    onSuccess: () => {
      toast.success('Obra excluída');
      setDeleteRow(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Erro ao excluir')),
  });

  const openNew = () => {
    setEditing(null);
    setFormName('');
    setShowForm(true);
  };

  const openEdit = (row: ObraRow) => {
    setEditing(row);
    setFormName(row.name || '');
    setShowForm(true);
  };

  const submit = () => {
    if (!formName.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <>
      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                <DraftingCompass className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Obras</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{items.length} cadastrado(s)</p>
              </div>
            </div>
            <div className={cadastroListClasses.cardToolbar}>
              <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar por nome..."
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
              {canCreate ? (
                <button
                  type="button"
                  onClick={openNew}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Nova Obra</span>
                </button>
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
              hint={debouncedSearch ? 'Tente ajustar a busca' : 'Cadastre uma nova obra para começar'}
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
                <table className={cadastroListClasses.table} data-cc-skip-column-customizer="1">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className={cadastroListClasses.th} style={{ width: '5rem' }}>
                        ID
                      </th>
                      <th className={cadastroListClasses.th}>Nome</th>
                      {showActions ? <th className={cadastroListClasses.thRight}>Ação</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {items.map((it, index) => (
                      <tr
                        key={it.id}
                        className={getListTableRowClassName(true)}
                        onClick={() => router.push(`/ponto/contratos/${contractId}/obras/${it.id}`)}
                      >
                        <td className={cadastroListClasses.tdMono} style={{ width: '5rem' }}>
                          {formatCadastroListId(undefined, index + 1)}
                        </td>
                        <td className="px-3 py-4 sm:px-6">
                          <ListRowNavigableLabel className="font-medium">{it.name}</ListRowNavigableLabel>
                        </td>
                        {showActions ? (
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
            </>
          )}
          {rowActionMenu && rowForActionMenu ? (
            <RowActionMenuPortal
              menu={rowActionMenu}
              onClose={closeRowActionMenu}
              onEdit={canEdit ? () => openEdit(rowForActionMenu) : undefined}
              onDelete={canDelete ? () => setDeleteRow(rowForActionMenu) : undefined}
            />
          ) : null}
        </CardContent>
      </Card>

      {showForm ? (
        <Modal
          isOpen
          onClose={closeForm}
          title={editing ? 'Editar Obra' : 'Nova Obra'}
          size="md"
          confirmBeforeClose
          footer={
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saveMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {editing ? 'Atualizar' : 'Criar'}
              </button>
            </div>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Nome *</label>
            <input
              type="text"
              autoFocus
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Ex.: Obra FHE - DF"
              className="input w-full"
            />
          </form>
        </Modal>
      ) : null}

      {deleteRow ? (
        <Modal
          isOpen
          onClose={() => setDeleteRow(null)}
          title="Excluir obra"
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
                onClick={() => deleteMutation.mutate(deleteRow.id)}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                Excluir
              </button>
            </div>
          }
        >
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Excluir a obra <strong>{deleteRow.name}</strong>? Esta ação não pode ser desfeita.
          </p>
        </Modal>
      ) : null}
    </>
  );
}

'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import {
  addKanbanBoardShare,
  fetchKanbanBoardShares,
  removeKanbanBoardShare,
  updateKanbanBoardShare,
  type KanbanBoardShare,
} from '@/lib/kanban';
import {
  KanbanMemberPickerModal,
  type KanbanPickerUser,
} from './KanbanMemberPickerModal';
import { kanbanInput } from './kanbanFormStyles';
import { KanbanUserAvatar } from './KanbanUserAvatar';
import { textMatchesSearch } from '@/lib/normalizeSearchText';

export interface KanbanBoardShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  boardName: string;
  /** Quem está usando — não aparece no picker de convite. */
  currentUserId?: string;
}

function CreatorRow({ user }: { user: KanbanPickerUser }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
      <KanbanUserAvatar
        name={user.name}
        colorKey={user.id}
        profilePhotoUrl={user.profilePhotoUrl}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {user.name}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
      </div>
      <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
        Criador
      </span>
    </div>
  );
}

function ShareRow({
  share,
  onRemove,
  onToggleManager,
  canGrantManager,
  canRemove,
  busy,
}: {
  share: KanbanBoardShare;
  onRemove: () => void;
  onToggleManager: () => void;
  canGrantManager: boolean;
  canRemove: boolean;
  busy: boolean;
}) {
  const manager = share.canManage === true;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
      <KanbanUserAvatar
        name={share.user.name}
        colorKey={share.user.id}
        profilePhotoUrl={share.user.profilePhotoUrl}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {share.user.name}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{share.user.email}</p>
      </div>
      {canGrantManager ? (
        <button
          type="button"
          disabled={busy}
          onClick={onToggleManager}
          aria-pressed={manager}
          title={manager ? 'Deixar de ser gerente' : 'Gerente pode convidar e remover pessoas'}
          className={clsx(
            'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
            manager
              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
              : 'border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:text-gray-400',
          )}
        >
          {manager ? '✓ Gerente' : 'Tornar gerente'}
        </button>
      ) : manager ? (
        <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
          Gerente
        </span>
      ) : null}
      {canRemove ? (
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
        title="Remover acesso"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      ) : null}
    </div>
  );
}

export function KanbanBoardShareModal({
  isOpen,
  onClose,
  boardId,
  boardName,
  currentUserId,
}: KanbanBoardShareModalProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const sharesQueryKey = ['kanban-board-shares', boardId] as const;

  const { data, isLoading } = useQuery({
    queryKey: sharesQueryKey,
    queryFn: () => fetchKanbanBoardShares(boardId),
    enabled: isOpen && !!boardId,
  });
  const shares = useMemo(() => data?.shares ?? [], [data]);
  const canGrantManager = data?.canGrantManager ?? false;
  const ownerUser: KanbanPickerUser | null = data?.owner ?? null;

  const sharedUserIds = useMemo(() => new Set(shares.map((s) => s.userId)), [shares]);

  const pickerExcludeUserIds = useMemo(() => {
    const ids = Array.from(sharedUserIds);
    if (currentUserId) ids.push(currentUserId);
    if (data?.owner) ids.push(data.owner.id);
    return ids;
  }, [sharedUserIds, currentUserId, data]);

  const filteredShares = useMemo(() => {
    const q = filter.trim();
    if (!q) return shares;
    return shares.filter(
      (s) => textMatchesSearch(s.user.name, q) || textMatchesSearch(s.user.email, q),
    );
  }, [shares, filter]);

  const ownerMatchesFilter = useMemo(() => {
    if (!ownerUser) return false;
    const q = filter.trim();
    if (!q) return true;
    return textMatchesSearch(ownerUser.name, q) || textMatchesSearch(ownerUser.email, q);
  }, [ownerUser, filter]);

  const hasVisiblePeople = ownerMatchesFilter || filteredShares.length > 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: sharesQueryKey });
    queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
  };

  const addMut = useMutation({
    mutationFn: (user: KanbanPickerUser) => addKanbanBoardShare(boardId, user.id),
    onSuccess: () => {
      invalidate();
      toast.success('Pessoa adicionada ao quadro');
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error || 'Erro ao compartilhar');
    },
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeKanbanBoardShare(boardId, userId),
    onSuccess: () => {
      invalidate();
      toast.success('Acesso removido');
    },
    onError: () => toast.error('Erro ao remover acesso'),
  });

  const managerMut = useMutation({
    mutationFn: (share: KanbanBoardShare) =>
      updateKanbanBoardShare(boardId, share.userId, { canManage: !share.canManage }),
    onSuccess: (updated) => {
      invalidate();
      toast.success(updated.canManage ? 'Agora é gerente do quadro' : 'Deixou de ser gerente');
    },
    onError: () => toast.error('Erro ao alterar o gerente'),
  });

  const busy = addMut.isPending || removeMut.isPending || managerMut.isPending;

  const handleSelectUser = async (user: KanbanPickerUser) => {
    setPickerOpen(false);
    await addMut.mutateAsync(user);
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Compartilhar quadro" size="md">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar pessoas com acesso…"
                className={clsx(kanbanInput, 'pl-9')}
              />
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={busy}
              title="Adicionar pessoa"
              aria-label="Adicionar pessoa"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : !hasVisiblePeople ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              Nenhuma pessoa encontrada com esse filtro.
            </div>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {ownerUser && ownerMatchesFilter && <CreatorRow user={ownerUser} />}
              {filteredShares.map((share) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  busy={busy}
                  canGrantManager={canGrantManager}
                  canRemove={canGrantManager || !share.canManage || share.userId === currentUserId}
                  onToggleManager={() => managerMut.mutate(share)}
                  onRemove={() => removeMut.mutate(share.userId)}
                />
              ))}
              {ownerMatchesFilter && filteredShares.length === 0 && shares.length === 0 && (
                <p className="px-1 pt-1 text-center text-xs text-gray-500 dark:text-gray-400">
                  Ninguém foi convidado ainda.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      <KanbanMemberPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectUser}
        excludeUserIds={pickerExcludeUserIds}
        elevated
      />
    </>
  );
}

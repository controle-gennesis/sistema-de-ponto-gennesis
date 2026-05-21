'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { Modal } from '@/components/ui/Modal';
import { kanbanInput } from './kanbanFormStyles';
import { getKanbanInitials, resolveKanbanAvatarBg } from './kanbanAvatar';

export interface KanbanPickerUser {
  id: string;
  name: string;
  email: string;
  profilePhotoUrl?: string | null;
}

async function fetchKanbanPickerUsers(): Promise<KanbanPickerUser[]> {
  const res = await api.get('/kanban/picker-users');
  return res.data.data;
}

export interface KanbanMemberPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (user: KanbanPickerUser) => void | Promise<void>;
  excludeUserIds?: string[];
  currentUserId?: string;
  elevated?: boolean;
}

function UserRow({
  user,
  onSelect,
}: {
  user: KanbanPickerUser;
  onSelect: (user: KanbanPickerUser) => void;
}) {
  const photo = resolveApiMediaUrl(user.profilePhotoUrl ?? null);
  return (
    <button
      type="button"
      onClick={() => onSelect(user)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors text-left"
    >
      <div
        className={clsx(
          'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0 overflow-hidden',
          photo ? '' : resolveKanbanAvatarBg(null, user.id),
        )}
      >
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          getKanbanInitials(user.name)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
      </div>
    </button>
  );
}

export function KanbanMemberPickerModal({
  isOpen,
  onClose,
  onSelect,
  excludeUserIds = [],
  currentUserId,
  elevated = true,
}: KanbanMemberPickerModalProps) {
  const [search, setSearch] = useState('');

  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: ['kanban-member-picker-users'],
    queryFn: fetchKanbanPickerUsers,
    enabled: isOpen,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (excludeUserIds.includes(u.id)) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, search, excludeUserIds]);

  async function handleSelect(user: KanbanPickerUser) {
    await onSelect(user);
    setSearch('');
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Adicionar membro"
      closeOnOverlayClick
      elevated={elevated}
    >
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className={clsx(kanbanInput, 'pl-9 text-sm')}
          autoFocus
        />
      </div>

      <div className="max-h-[min(320px,50vh)] overflow-y-auto -mx-1">
        {isLoading && (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
        {isError && (
          <p className="text-sm text-red-600 dark:text-red-400 py-4 text-center">
            Não foi possível carregar os usuários.
          </p>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
            {search.trim() ? 'Nenhum usuário encontrado.' : 'Nenhum usuário disponível.'}
          </p>
        )}
        {!isLoading &&
          !isError &&
          filtered.map((user) => (
            <UserRow key={user.id} user={user} onSelect={handleSelect} />
          ))}
      </div>

      {currentUserId && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Selecione um colaborador para atribuir ao card.
        </p>
      )}
    </Modal>
  );
}

'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { getKanbanInitials, resolveKanbanAvatarBg } from './kanbanAvatar';

export interface KanbanMemberChipProps {
  userId: string;
  name: string;
  profilePhotoUrl?: string | null;
  avatarColor?: string | null;
  isHovering: boolean;
  onHover: (hovering: boolean) => void;
  onRemove: () => void;
}

export function KanbanMemberChip({
  userId,
  name,
  profilePhotoUrl,
  avatarColor,
  isHovering,
  onHover,
  onRemove,
}: KanbanMemberChipProps) {
  const photo = resolveApiMediaUrl(profilePhotoUrl ?? null);
  const bg = resolveKanbanAvatarBg(avatarColor, userId);

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onRemove}
      className={clsx(
        'w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors overflow-hidden',
        isHovering ? 'bg-red-500/15 hover:bg-red-500/25' : photo ? '' : bg,
      )}
      title={isHovering ? 'Remover membro' : name}
    >
      {isHovering ? (
        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-500" />
      ) : photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="text-xs font-bold text-white">{getKanbanInitials(name)}</span>
      )}
    </button>
  );
}

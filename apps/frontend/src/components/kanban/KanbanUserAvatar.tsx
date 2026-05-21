'use client';

import React from 'react';
import { clsx } from 'clsx';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { getKanbanInitials, resolveKanbanAvatarBg } from './kanbanAvatar';

export interface KanbanUserAvatarProps {
  name: string;
  profilePhotoUrl?: string | null;
  colorKey?: string | null;
  colorClass?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

const sizeClasses = {
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-10 h-10 text-xs',
};

export function KanbanUserAvatar({
  name,
  profilePhotoUrl,
  colorKey,
  colorClass,
  size = 'md',
  className,
}: KanbanUserAvatarProps) {
  const photo = resolveApiMediaUrl(profilePhotoUrl ?? null);
  const bg = resolveKanbanAvatarBg(colorClass, colorKey ?? name);

  return (
    <div
      className={clsx(
        'rounded-full flex items-center justify-center font-bold text-white shrink-0 overflow-hidden',
        sizeClasses[size],
        photo ? '' : bg,
        className,
      )}
      title={name}
    >
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        getKanbanInitials(name)
      )}
    </div>
  );
}

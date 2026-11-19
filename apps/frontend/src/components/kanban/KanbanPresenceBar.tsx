'use client';

import React from 'react';
import { KanbanUserAvatar } from './KanbanUserAvatar';

export type KanbanPresenceUser = {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  color: string;
  cardId: string | null;
  state: 'viewing' | 'editing' | 'dragging';
};

const MAX_VISIBLE = 5;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Texto do que a pessoa está fazendo (para dica e para a etiqueta do cartão). */
export function presenceActionLabel(state: KanbanPresenceUser['state']): string {
  if (state === 'dragging') return 'movendo';
  if (state === 'editing') return 'editando';
  return 'no quadro';
}

/** Fotos de quem está com o quadro aberto agora (sem mim), no estilo Google Docs. */
export function KanbanPresenceBar({
  users,
  selfId,
  cardTitleById,
}: {
  users: KanbanPresenceUser[];
  selfId: string | null;
  cardTitleById?: (cardId: string) => string | undefined;
}) {
  const others = users.filter((u) => u.userId !== selfId);
  if (others.length === 0) return null;
  const visible = others.slice(0, MAX_VISIBLE);
  const hidden = others.length - visible.length;

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label={`${others.length} ${others.length === 1 ? 'pessoa' : 'pessoas'} no quadro agora`}
    >
      <div className="flex -space-x-2">
        {visible.map((u) => {
          const cardTitle = u.cardId ? cardTitleById?.(u.cardId) : undefined;
          const doing =
            u.state === 'viewing'
              ? 'está no quadro'
              : `está ${presenceActionLabel(u.state)}${cardTitle ? ` "${cardTitle}"` : ' um cartão'}`;
          return (
            <span key={u.userId} className="relative inline-flex" title={`${u.name} ${doing}`}>
              <KanbanUserAvatar
                name={u.name}
                profilePhotoUrl={u.profilePhotoUrl}
                colorKey={u.userId}
                size="sm"
                showNativeTitle={false}
                className="ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-900"
                style={{ ['--tw-ring-color' as string]: u.color }}
              />
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500 dark:border-gray-900"
              />
            </span>
          );
        })}
        {hidden > 0 ? (
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-700 ring-2 ring-white dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-900"
            title={others
              .slice(MAX_VISIBLE)
              .map((u) => firstName(u.name))
              .join(', ')}
          >
            +{hidden}
          </span>
        ) : null}
      </div>
    </div>
  );
}

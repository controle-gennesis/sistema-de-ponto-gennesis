'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { KANBAN_COVER_COLORS, coverHex, type KanbanCoverSize } from './kanbanCover';

export interface KanbanCardCoverPanelProps {
  color: string | null;
  size: KanbanCoverSize;
  /** Chamado a cada escolha (cor, tamanho ou remover); a janela do cartão salva na hora. */
  onChange: (next: { color: string | null; size: KanbanCoverSize }) => void;
  onClose: () => void;
}

/** Painel "Capa" do cartão: tamanho (faixa ou cartão inteiro), cor e remover. */
export function KanbanCardCoverPanel({ color, size, onChange }: KanbanCardCoverPanelProps) {
  const hex = coverHex(color);
  const preview = (kind: KanbanCoverSize) => {
    const selected = size === kind;
    return (
      <button
        key={kind}
        type="button"
        onClick={() => onChange({ color: color ?? 'blue', size: kind })}
        aria-pressed={selected}
        aria-label={kind === 'NORMAL' ? 'Capa em faixa' : 'Capa no cartão inteiro'}
        className={clsx(
          'flex-1 rounded-lg border-2 p-1.5 transition-colors',
          selected
            ? 'border-blue-500'
            : 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500',
        )}
      >
        {kind === 'NORMAL' ? (
          <div className="overflow-hidden rounded-md bg-gray-100 dark:bg-gray-700">
            <div className="h-6" style={{ backgroundColor: hex ?? '#9ca3af' }} />
            <div className="space-y-1.5 p-2">
              <div className="h-1.5 w-4/5 rounded bg-gray-300 dark:bg-gray-500" />
              <div className="h-1.5 w-3/5 rounded bg-gray-300 dark:bg-gray-500" />
            </div>
          </div>
        ) : (
          <div className="flex h-[58px] flex-col justify-end gap-1.5 rounded-md p-2" style={{ backgroundColor: hex ?? '#9ca3af' }}>
            <div className="h-1.5 w-4/5 rounded bg-white/70" />
            <div className="h-1.5 w-3/5 rounded bg-white/70" />
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Tamanho</p>
        <div className="flex gap-3">
          {preview('NORMAL')}
          {preview('FULL')}
        </div>
      </div>

      {color ? (
        <button
          type="button"
          onClick={() => onChange({ color: null, size: 'NORMAL' })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Remover capa
        </button>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Cores</p>
        <div className="grid grid-cols-5 gap-2">
          {KANBAN_COVER_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onChange({ color: c.key, size })}
              title={c.label}
              aria-label={c.label}
              aria-pressed={color === c.key}
              className="flex h-9 items-center justify-center rounded-md text-white transition-transform hover:scale-105"
              style={{ backgroundColor: c.hex }}
            >
              {color === c.key ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

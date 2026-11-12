'use client';

import React from 'react';
import { FolderInput, Loader2, RotateCcw, Trash2, X } from 'lucide-react';

/**
 * Barra de ações dos itens selecionados no Drive, ao lado do campo de busca:
 * quantidade + Mover / Excluir (ou Restaurar / Excluir permanentemente na Lixeira) + limpar seleção.
 */
export function DriveSelectionBar({
  count,
  trashMode,
  busy,
  onMove,
  onDelete,
  onRestore,
  onClear,
}: {
  count: number;
  trashMode: boolean;
  busy: boolean;
  onMove: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  const btn =
    'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div
      role="toolbar"
      aria-label="Ações para os itens selecionados"
      className="flex h-10 max-w-full items-center gap-1 rounded-lg border border-gray-200 bg-white px-[3px] dark:border-gray-700 dark:bg-gray-900"
    >
      <button
        type="button"
        onClick={onClear}
        title="Limpar seleção (Esc)"
        aria-label="Limpar seleção"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <X className="h-4 w-4" />
      </button>
      <span className="whitespace-nowrap px-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
        {count} {count === 1 ? 'selecionado' : 'selecionados'}
      </span>
      <span aria-hidden className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />

      {trashMode ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onRestore}
            className={`${btn} text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Restaurar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className={`${btn} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30`}
          >
            <Trash2 className="h-4 w-4" />
            Excluir permanentemente
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onMove}
            className={`${btn} text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800`}
          >
            <FolderInput className="h-4 w-4" />
            Mover
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className={`${btn} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30`}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </button>
        </>
      )}
    </div>
  );
}

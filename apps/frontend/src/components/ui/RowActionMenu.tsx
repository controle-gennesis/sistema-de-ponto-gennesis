'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Edit, MoreVertical, Trash2 } from 'lucide-react';
import type { RowActionMenuState } from '@/hooks/useRowActionMenu';

type RowActionMenuCellProps = {
  isOpen: boolean;
  onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
};

const actionAlignClass = {
  left: { td: 'text-left', flex: 'justify-start' },
  center: { td: 'text-center', flex: 'justify-center' },
  right: { td: 'text-right', flex: 'justify-end' },
} as const;

export function RowActionMenuCell({
  isOpen,
  onToggle,
  align = 'right',
  className,
}: RowActionMenuCellProps) {
  const alignment = actionAlignClass[align];
  return (
    <td className={className ?? `px-3 py-3 align-middle sm:px-6 ${alignment.td}`}>
      <div className={`flex ${alignment.flex}`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(e);
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          aria-label="Menu de ações"
          aria-expanded={isOpen}
          aria-haspopup="menu"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
    </td>
  );
}

type RowActionMenuPortalProps = {
  menu: RowActionMenuState;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
  deleteDisabledTitle?: string;
  zIndex?: { backdrop: number; menu: number };
};

export function RowActionMenuPortal({
  menu,
  onClose,
  onEdit,
  onDelete,
  editDisabled = false,
  deleteDisabled = false,
  deleteDisabledTitle,
  zIndex = { backdrop: 1050, menu: 1051 }
}: RowActionMenuPortalProps) {
  if (!menu || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: zIndex.backdrop }}
        aria-hidden
        onClick={onClose}
      />
      <div
        role="menu"
        className="fixed w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
        style={{ top: menu.top, left: menu.left, zIndex: zIndex.menu }}
      >
        <button
          type="button"
          role="menuitem"
          disabled={editDisabled}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            onEdit();
          }}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <Edit className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span>Editar</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            onDelete();
          }}
          title={deleteDisabled ? deleteDisabledTitle : 'Excluir'}
          className={`flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700 ${
            deleteDisabled
              ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
              : 'text-gray-700 dark:text-gray-300'
          }`}
        >
          <Trash2
            className={`h-4 w-4 shrink-0 ${
              deleteDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-red-600 dark:text-red-400'
            }`}
          />
          <span>Excluir</span>
        </button>
      </div>
    </>,
    document.body
  );
}

/** Classes padrão para páginas de cadastro (alinhamento com Condições de Pagamento). */
export const cadastroListClasses = {
  card: 'w-full',
  cardHeader: 'border-b-0 pb-1',
  cardContent: 'pt-2',
  cardHeaderRow:
    'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
  cardHeaderIconRow: 'flex items-center space-x-3',
  cardToolbar: 'flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end',
  listSummary:
    'mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2',
  pagination: 'mt-6 flex items-center justify-center space-x-2',
  table: 'w-full text-sm',
  th: 'px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6',
  thCenter:
    'px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6',
  thRight:
    'px-3 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6',
  td: 'px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6'
} as const;

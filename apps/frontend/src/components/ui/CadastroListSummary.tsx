import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';

type CadastroListSummaryProps = {
  startItem: number;
  endItem: number;
  total: number;
  itemLabel: string;
  itemLabelPlural?: string;
  currentPage?: number;
  totalPages?: number;
};

export function getCadastroListRange(page: number, limit: number, total: number) {
  if (total === 0) {
    return { startItem: 0, endItem: 0, totalPages: 1 };
  }
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);
  return { startItem, endItem, totalPages };
}

/** Valor exibido na coluna ID das listas de cadastro (`code` ou número da linha). */
export function formatCadastroListId(code?: string | null, rowNumber?: number): string {
  const trimmed = String(code ?? '').trim();
  if (trimmed) return trimmed;
  if (rowNumber != null && rowNumber > 0) return String(rowNumber);
  return '—';
}

export function CadastroListLoading({ message }: { message: string }) {
  return (
    <div className="py-8 text-center">
      <div className="flex items-center justify-center gap-2">
        <div className="loading-spinner h-6 w-6" />
        <span className="text-gray-600 dark:text-gray-400">{message}</span>
      </div>
    </div>
  );
}

type CadastroListEmptyProps = {
  icon: LucideIcon;
  title: string;
  hint?: string;
};

export function CadastroListEmpty({ icon: Icon, title, hint }: CadastroListEmptyProps) {
  return (
    <div className="py-8 text-center">
      <Icon className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
      <p className="text-gray-600 dark:text-gray-400">{title}</p>
      {hint ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function CadastroListSummary({
  startItem,
  endItem,
  total,
  itemLabel,
  itemLabelPlural,
  currentPage = 1,
  totalPages = 1
}: CadastroListSummaryProps) {
  const plural = itemLabelPlural ?? `${itemLabel}s`;
  const label = total === 1 ? itemLabel : plural;

  return (
    <div className={cadastroListClasses.listSummary}>
      <span>
        Mostrando {startItem} a {endItem} de {total} {label}
      </span>
      <span>
        Página {currentPage} de {totalPages}
      </span>
    </div>
  );
}

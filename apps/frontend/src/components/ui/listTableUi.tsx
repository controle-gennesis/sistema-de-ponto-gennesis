'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';

export const listTableRowClasses = {
  /** Cadastro e listas sem clique na linha — hover neutro, só destaca a linha. */
  tr: 'group transition-colors duration-200 hover:bg-gray-50 dark:hover:bg-gray-700/50',
  /** Linha clicável que abre detalhes — vermelho + faixa lateral + cursor. */
  trNavigable:
    'group cursor-pointer transition-[background-color,box-shadow] duration-200 ease-out hover:bg-red-50/70 hover:shadow-[inset_3px_0_0_0_rgb(239_68_68)] active:bg-red-100/80 dark:hover:bg-red-950/25 dark:hover:shadow-[inset_3px_0_0_0_rgb(248_113_113)] dark:active:bg-red-950/40',
  highlightText:
    'transition-colors duration-200 group-hover:text-red-600 dark:group-hover:text-red-400',
  chevron:
    'pointer-events-none absolute left-full top-1/2 ml-1.5 h-4 w-4 -translate-y-1/2 -translate-x-1 text-red-500 opacity-0 transition-all duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 dark:text-red-400',
  actionTh:
    'w-[4%] min-w-[3rem] px-2 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-3',
  actionTd: 'relative w-[4%] min-w-[3rem] px-2 py-3 align-middle sm:px-3',
} as const;

/** `navigable=true` só quando a linha inteira abre outra tela (ex.: contratos). */
export function getListTableRowClassName(navigable = false, extra?: string) {
  return [
    navigable ? listTableRowClasses.trNavigable : listTableRowClasses.tr,
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export function rowActionMenuButtonClass(isOpen: boolean) {
  return [
    'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200',
    isOpen
      ? 'bg-red-100 text-red-600 opacity-100 dark:bg-red-950/50 dark:text-red-400'
      : 'text-gray-400 opacity-40 hover:bg-white/70 hover:text-gray-700 hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 dark:text-gray-500 dark:hover:bg-gray-800/70 dark:hover:text-gray-200',
  ].join(' ');
}

type ListRowNavigableLabelProps = {
  children: React.ReactNode;
  className?: string;
};

/** Nome com seta vermelha — usar apenas em linhas clicáveis (`trNavigable`). */
export function ListRowNavigableLabel({ children, className = '' }: ListRowNavigableLabelProps) {
  return (
    <span className="relative inline-block min-w-0 max-w-full">
      <span
        className={`text-sm text-gray-900 dark:text-gray-100 ${listTableRowClasses.highlightText} ${className}`}
      >
        {children}
      </span>
      <ChevronRight aria-hidden className={listTableRowClasses.chevron} />
    </span>
  );
}

/** @deprecated Use `ListRowNavigableLabel` em linhas clicáveis; texto normal nos cadastros. */
export const ListRowHighlight = ListRowNavigableLabel;

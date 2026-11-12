'use client';

import React from 'react';
import { AppTabButton } from '@/components/ui/AppTabButton';
import {
  Clock,
  Cloud,
  HardDrive,
  Loader2,
  Plus,
  Share2,
  Star,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

export type DriveSidebarView =
  | 'meu-drive'
  | 'shared'
  | 'recent'
  | 'starred'
  | 'trash';

type StorageInfo = {
  usedBytes: number;
};

type Props = {
  activeView: DriveSidebarView;
  onChangeView: (view: DriveSidebarView) => void;
  storage?: StorageInfo;
  storageLoading?: boolean;
  /** Botão "Novo" no topo do menu: recebe a posição do botão para abrir o menu logo abaixo. Sem isso, o botão não aparece. */
  onNew?: (anchor: DOMRect) => void;
  newLoading?: boolean;
};

function formatUsed(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 ** 2);
  if (mb < 1024) {
    return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
  }
  const gb = bytes / (1024 ** 3);
  return `${gb.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
}

const NAV: Array<{
  id: DriveSidebarView;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: 'meu-drive', label: 'Meu Drive', Icon: HardDrive },
  { id: 'shared', label: 'Compartilhados comigo', Icon: Share2 },
  { id: 'recent', label: 'Recentes', Icon: Clock },
  { id: 'starred', label: 'Com estrela', Icon: Star },
  { id: 'trash', label: 'Lixeira', Icon: Trash2 },
];

export function DriveSidebar({
  activeView,
  onChangeView,
  storage,
  storageLoading,
  onNew,
  newLoading,
}: Props) {
  const used = storage?.usedBytes ?? 0;

  return (
    <aside className="drive-sidebar flex w-full shrink-0 flex-col">
      {onNew ? (
        <button
          type="button"
          onClick={(e) => onNew(e.currentTarget.getBoundingClientRect())}
          className="mb-4 flex h-12 w-full items-center justify-start gap-2 rounded-xl bg-red-600 px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-red-700 active:bg-red-800 dark:bg-red-950/40 dark:text-red-300 dark:shadow-none dark:ring-1 dark:ring-inset dark:ring-red-800/60 dark:hover:bg-red-900/40 dark:active:bg-red-900/60"
          aria-label="Novo"
          aria-haspopup="menu"
        >
          {newLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Plus className="h-5 w-5" strokeWidth={2.25} />
          )}
          <span>Novo</span>
        </button>
      ) : null}
      <nav
        className="-mx-1 flex gap-0.5 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
        aria-label="Navegação do Drive"
        role="tablist"
        aria-orientation="vertical"
      >
        {NAV.map(({ id, label, Icon }) => {
          const active = activeView === id;
          return (
            <AppTabButton
              key={id}
              active={active}
              onClick={() => onChangeView(id)}
              aria-current={active ? 'page' : undefined}
              className="shrink-0 !justify-start gap-3 px-3 py-2.5 text-left text-sm font-medium lg:w-full"
            >
              <Icon strokeWidth={1.75} className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap leading-none">{label}</span>
            </AppTabButton>
          );
        })}
      </nav>

      <div className="mt-5 hidden border-t border-gray-200 pt-5 dark:border-gray-700 lg:block">
        <div className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40">
            <Cloud className="h-6 w-6 text-red-600 dark:text-red-400" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">Armazenamento</p>
            {storageLoading ? (
              <div className="mt-1.5 h-3.5 w-16 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            ) : (
              <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatUsed(used)}
                <span className="ml-1 font-normal text-gray-500 dark:text-gray-400">
                  usados
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

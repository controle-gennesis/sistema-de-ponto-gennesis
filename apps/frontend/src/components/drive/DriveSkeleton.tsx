'use client';

import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Card } from '@/components/ui/Card';

/**
 * Esqueleto do Drive: repete o formato real da tela (pastas e arquivos em grade, ou a tabela em lista),
 * com um brilho suave que passa pelos blocos, em vez de piscar.
 */

function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('drive-bone rounded-md', className)} />;
}

/** Só devolve `true` depois de `ms`: carregamentos rápidos não mostram o esqueleto (evita o "pisca"). */
export function useDelayedFlag(active: boolean, ms = 150): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const t = window.setTimeout(() => setOn(true), ms);
    return () => window.clearTimeout(t);
  }, [active, ms]);
  return on;
}

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';
const CARD = 'rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900';
const NAME_WIDTHS = ['w-3/4', 'w-2/3', 'w-5/6', 'w-1/2', 'w-4/5', 'w-3/5'];

function FolderTile({ i }: { i: number }) {
  return (
    <div className={clsx(CARD, 'flex items-center gap-2.5 p-3')}>
      <Bone className="h-8 w-8 shrink-0 rounded-lg" />
      <Bone className={clsx('h-3.5', NAME_WIDTHS[i % NAME_WIDTHS.length])} />
    </div>
  );
}

function FileTile({ i }: { i: number }) {
  return (
    <div className={clsx(CARD, 'overflow-hidden')}>
      <div className="relative flex h-28 items-center justify-center border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/40">
        <Bone className="h-12 w-12 rounded-xl" />
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Bone className="h-5 w-5 shrink-0 rounded" />
        <Bone className={clsx('h-3.5', NAME_WIDTHS[(i + 2) % NAME_WIDTHS.length])} />
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Bone className="mb-3 h-3 w-14" />
        <div className={GRID}>
          {Array.from({ length: 6 }, (_, i) => (
            <FolderTile key={i} i={i} />
          ))}
        </div>
      </div>
      <div>
        <Bone className="mb-3 h-3 w-16" />
        <div className={GRID}>
          {Array.from({ length: 6 }, (_, i) => (
            <FileTile key={i} i={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mesmas colunas da lista real: ícone | nome | proprietário | modificado | tamanho | ação. */
const LIST_COLS = 'grid-cols-[auto,1fr,140px,150px,100px,56px]';

function ListSkeleton() {
  return (
    <Card padding="none" className="!shadow-none">
      <div className="table-scroll">
        <div className="min-w-[40rem]">
          <div
            className={`grid ${LIST_COLS} gap-4 border-b border-gray-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400`}
          >
            <div className="w-8 text-center">Nome</div>
            <div />
            <div className="text-center">Proprietário</div>
            <div className="text-center">Modificado</div>
            <div className="text-right">Tamanho</div>
            <div className="text-center">Ação</div>
          </div>
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className={`grid ${LIST_COLS} items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-0 dark:border-gray-700/50`}
            >
              <Bone className="h-8 w-8 rounded-lg" />
              <Bone className={clsx('h-3.5', NAME_WIDTHS[i % NAME_WIDTHS.length])} />
              <div className="flex items-center justify-center gap-2">
                <Bone className="h-6 w-6 shrink-0 rounded-full" />
                <Bone className="h-3 w-14" />
              </div>
              <div className="flex justify-center">
                <Bone className="h-3 w-20" />
              </div>
              <div className="flex justify-end">
                <Bone className="h-3 w-12" />
              </div>
              <div className="flex justify-center">
                <Bone className="h-7 w-7 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function DriveSkeleton({ viewMode }: { viewMode: 'grid' | 'list' }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label="Carregando arquivos">
      {viewMode === 'list' ? <ListSkeleton /> : <GridSkeleton />}
      <span className="sr-only">Carregando arquivos</span>
    </div>
  );
}

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { SkeletonBone } from '@/components/ui/PageSkeleton';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';

const ETAPAS = ['w-16', 'w-28', 'w-24', 'w-32', 'w-24', 'w-20'];

function Linha() {
  return (
    <div className="flex items-center gap-4 border-t border-gray-200 px-3 py-4 dark:border-gray-700">
      <SkeletonBone className="h-4 w-16 shrink-0" />
      <SkeletonBone className="h-4 w-32 shrink-0 sm:w-40" />
      <SkeletonBone className="hidden h-4 min-w-0 flex-1 md:block" />
      <SkeletonBone className="hidden h-6 w-28 shrink-0 rounded-full lg:block" />
      <SkeletonBone className="hidden h-4 w-24 shrink-0 lg:block" />
      <SkeletonBone className="hidden h-4 w-20 shrink-0 xl:block" />
      <SkeletonBone className="ml-auto h-8 w-8 shrink-0 rounded-lg" />
    </div>
  );
}

/**
 * Esqueleto das abas do Fluig (G3, G4, G5): faixa de etapas, cartão com título e botões, e a tabela.
 * Aparece no lugar do "Carregando processos...".
 */
export function FluigListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-busy="true" aria-label="Carregando processos">
      {/* Etapas do processo */}
      <div className="flex justify-center px-1 py-1">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-2 py-1 sm:gap-x-2">
          {ETAPAS.map((largura, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-2 sm:px-3">
              <SkeletonBone className={`h-4 ${largura}`} />
              <SkeletonBone className="h-5 w-6 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <Card className={`${cadastroListClasses.card} overflow-hidden`}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <SkeletonBone className="h-9 w-9 shrink-0 rounded-lg sm:h-12 sm:w-12" />
              <div className="space-y-2">
                <SkeletonBone className="h-5 w-52" />
                <SkeletonBone className="h-3.5 w-36" />
              </div>
            </div>
            <div className={cadastroListClasses.cardToolbar}>
              <SkeletonBone className="h-10 w-10 shrink-0 rounded-lg" />
              <SkeletonBone className="h-10 w-10 shrink-0 rounded-lg" />
              <SkeletonBone className="h-10 min-w-0 flex-1 basis-full rounded-lg sm:w-[280px] sm:flex-none sm:basis-auto" />
              <SkeletonBone className="h-10 w-10 shrink-0 rounded-lg" />
            </div>
          </div>
        </CardHeader>
        <CardContent className={cadastroListClasses.cardContent}>
          <div className="mb-3 flex items-center justify-between gap-4">
            <SkeletonBone className="h-4 w-56 max-w-full" />
            <SkeletonBone className="h-4 w-28" />
          </div>
          {/* Cabeçalho da tabela */}
          <div className="flex items-center gap-4 px-3 pb-3">
            <SkeletonBone className="h-3.5 w-16 shrink-0" />
            <SkeletonBone className="h-3.5 w-32 shrink-0 sm:w-40" />
            <SkeletonBone className="hidden h-3.5 min-w-0 flex-1 md:block" />
            <SkeletonBone className="hidden h-3.5 w-28 shrink-0 lg:block" />
            <SkeletonBone className="hidden h-3.5 w-24 shrink-0 lg:block" />
            <SkeletonBone className="hidden h-3.5 w-20 shrink-0 xl:block" />
            <SkeletonBone className="ml-auto h-3.5 w-10 shrink-0" />
          </div>
          {Array.from({ length: rows }, (_, i) => (
            <Linha key={i} />
          ))}
        </CardContent>
      </Card>
      <span className="sr-only">Carregando processos...</span>
    </div>
  );
}

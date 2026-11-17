import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { SkeletonBone } from '@/components/ui/PageSkeleton';

const ABAS = ['w-14', 'w-10', 'w-24', 'w-28', 'w-28', 'w-12', 'w-20', 'w-9', 'w-16', 'w-10'];

/** Um item do resumo do cabeçalho: ícone redondo + rótulo + valor. */
function ResumoItem({ valor = 'w-28' }: { valor?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <SkeletonBone className="h-12 w-12 shrink-0 rounded-full" />
      <div className="space-y-2">
        <SkeletonBone className="h-3.5 w-28" />
        <SkeletonBone className={`h-5 ${valor}`} />
      </div>
    </div>
  );
}

function Divisor() {
  return <span className="hidden h-8 w-px shrink-0 self-center bg-gray-200 dark:bg-gray-600 md:block" aria-hidden />;
}

/** Card de indicador do Resumo: ícone quadrado + rótulo, valor grande e linha de apoio. */
function IndicadorCard() {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <SkeletonBone className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <SkeletonBone className="h-3.5 w-24" />
            <SkeletonBone className="h-7 w-36" />
            <SkeletonBone className="h-3 w-40 max-w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Esqueleto da página de um contrato (cabeçalho, abas e a aba Resumo), no mesmo formato da tela
 * carregada. Aparece no lugar do "Carregando contrato...".
 */
export function ContractDetailSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-busy="true" aria-label="Carregando contrato">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 py-1 xl:flex-row xl:items-center xl:gap-6">
        <div className="flex min-w-0 shrink-0 items-stretch gap-3">
          <SkeletonBone className="w-1.5 shrink-0 self-stretch rounded-full" />
          <div className="space-y-3">
            <SkeletonBone className="h-8 w-56 sm:h-9 sm:w-64" />
            <SkeletonBone className="h-4 w-40" />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-2 lg:justify-end sm:gap-x-2">
          <ResumoItem valor="w-32" />
          <Divisor />
          <ResumoItem valor="w-24" />
          <Divisor />
          <ResumoItem valor="w-24" />
          <Divisor />
          <div className="flex items-center gap-3 px-3 py-2.5">
            <SkeletonBone className="h-12 w-12 shrink-0 rounded-full" />
            <div className="space-y-2">
              <SkeletonBone className="h-3.5 w-16" />
              <SkeletonBone className="h-5 w-40" />
            </div>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="mt-1 flex items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          {ABAS.map((largura, i) => (
            <div key={i} className="px-3 py-3">
              <SkeletonBone className={`h-4 ${largura}`} />
            </div>
          ))}
        </div>
        <div className="hidden shrink-0 items-center gap-2 pb-2 sm:flex">
          <SkeletonBone className="h-4 w-4 rounded" />
          <SkeletonBone className="h-4 w-44" />
          <SkeletonBone className="h-4 w-20" />
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 2xl:grid-cols-4">
        <IndicadorCard />
        <IndicadorCard />
        <IndicadorCard />
        <IndicadorCard />
      </div>

      {/* Gráfico */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2.5">
              <SkeletonBone className="h-6 w-64 max-w-full" />
              <SkeletonBone className="h-3.5 w-[28rem] max-w-full" />
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              <SkeletonBone className="h-3.5 w-20" />
              <SkeletonBone className="h-3.5 w-28" />
            </div>
          </div>
          <div className="relative h-64 w-full sm:h-72">
            <div className="absolute inset-0 flex flex-col justify-between py-2" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <SkeletonBone className="h-3 w-8 shrink-0" />
                  <div className="h-px flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between gap-2 pl-12" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <SkeletonBone key={i} className="h-3 w-6" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cards de baixo */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i}>
            <CardContent className="space-y-4 p-4 sm:p-6">
              <SkeletonBone className="h-10 w-10 rounded-lg" />
              <SkeletonBone className="h-5 w-40" />
              <SkeletonBone className="h-3.5 w-full" />
              <SkeletonBone className="h-3.5 w-4/5" />
              <SkeletonBone className="h-24 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>

      <span className="sr-only">Carregando contrato...</span>
    </div>
  );
}

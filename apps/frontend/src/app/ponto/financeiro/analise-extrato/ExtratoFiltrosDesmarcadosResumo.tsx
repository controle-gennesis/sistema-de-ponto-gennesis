'use client';

import React from 'react';
import { Filter } from 'lucide-react';
import type { ExtratoFiltroCampoDesmarcado } from '@/lib/extratoCaixaFiltrosSalvos';

type ExtratoFiltrosDesmarcadosResumoProps = {
  presetNome: string | null;
  camposDesmarcados: ExtratoFiltroCampoDesmarcado[];
  periodFrom: string;
  periodTo: string;
  hasActiveFilters: boolean;
  /** Exibe nota de que ajustes manuais entram sempre nos totais. */
  temAjustesManuais?: boolean;
};

function formatPeriodoBr(from: string, to: string): string | null {
  const fmt = (iso: string) => {
    const p = iso.trim().split('-');
    if (p.length !== 3) return iso;
    return `${p[2]}/${p[1]}/${p[0]}`;
  };
  if (!from && !to) return null;
  if (from && to) return `${fmt(from)} até ${fmt(to)}`;
  if (from) return `a partir de ${fmt(from)}`;
  return `até ${fmt(to)}`;
}

export function ExtratoFiltrosDesmarcadosResumo({
  presetNome,
  camposDesmarcados,
  periodFrom,
  periodTo,
  hasActiveFilters,
  temAjustesManuais = false
}: ExtratoFiltrosDesmarcadosResumoProps) {
  const periodoLabel = formatPeriodoBr(periodFrom, periodTo);

  if (!hasActiveFilters && !periodoLabel) return null;

  const temDesmarcados = camposDesmarcados.length > 0;

  return (
    <div className="min-w-0 flex-1 rounded-lg border border-red-200/80 bg-red-50/50 px-3 py-2.5 dark:border-red-900/50 dark:bg-red-950/20">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
        <p className="text-xs font-semibold text-red-800 dark:text-red-200">
          {presetNome ? `Filtro: ${presetNome}` : 'Filtros aplicados'}
        </p>
        {periodoLabel ? (
          <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-800/80 dark:text-gray-300">
            Período: {periodoLabel}
          </span>
        ) : null}
      </div>

      {temAjustesManuais ? (
        <p className="mb-2 text-xs text-amber-800 dark:text-amber-200/90">
          Ajustes manuais são sempre contabilizados nos totais e resumos, mesmo com filtro salvo
          (respeitam apenas período e busca).
        </p>
      ) : null}

      {!temDesmarcados ? (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Todos os itens estão marcados nos campos de lista. Apenas o período ou a busca restringem a
          visualização.
        </p>
      ) : (
        <div className="max-h-32 space-y-2 overflow-y-auto pr-1 text-xs">
          {camposDesmarcados.map((campo) => (
            <div key={campo.campo}>
              <p className="mb-1 font-medium text-gray-800 dark:text-gray-200">
                {campo.campo}{' '}
                <span className="font-normal text-gray-500 dark:text-gray-400">
                  ({campo.desmarcados.length} desmarcado
                  {campo.desmarcados.length !== 1 ? 's' : ''})
                </span>
              </p>
              <p className="leading-relaxed text-gray-700 dark:text-gray-300">
                {campo.desmarcados.join(' · ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';
import { MedicaoApprovalsSection } from './MedicaoApprovalsSection';
import { AditivoApprovalsSection } from './AditivoApprovalsSection';

type Kind = 'medicoes' | 'aditivos';

/** Aba "Medições de Entrega/Aditivos": alterna entre as duas filas de aprovação. */
export function MedicaoAditivoApprovalsSection() {
  const [kind, setKind] = useState<Kind>('medicoes');

  const { data: medicaoCount = 0 } = useQuery({
    queryKey: ['empreiteiro-daily-measurements-pending', 'tab-count'],
    queryFn: async () => {
      const res = await api.get('/empreiteiros/daily-measurements/pending');
      return Array.isArray(res.data?.data) ? res.data.data.length : 0;
    },
    refetchInterval: () => visibleTabRefetchInterval(30_000),
    staleTime: 15_000,
  });

  const { data: aditivoCount = 0 } = useQuery({
    queryKey: ['empreiteiro-addenda-pending', 'tab-count'],
    queryFn: async () => {
      const res = await api.get('/empreiteiros/addenda/pending');
      return Array.isArray(res.data?.data) ? res.data.data.length : 0;
    },
    refetchInterval: () => visibleTabRefetchInterval(30_000),
    staleTime: 15_000,
  });

  const options: Array<{ id: Kind; label: string; count: number }> = [
    { id: 'medicoes', label: 'Medições de entrega', count: medicaoCount },
    { id: 'aditivos', label: 'Aditivos', count: aditivoCount },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
        {options.map((option) => {
          const active = option.id === kind;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setKind(option.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-red-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {option.label}
              {option.count > 0 ? (
                <span
                  className={`rounded-full px-1.5 text-xs font-semibold ${
                    active ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  }`}
                >
                  {option.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {kind === 'medicoes' ? <MedicaoApprovalsSection /> : <AditivoApprovalsSection />}
    </div>
  );
}

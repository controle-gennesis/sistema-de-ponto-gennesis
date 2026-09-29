'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';

export type MensalReportPendingSummary = {
  count: number;
  contractIds: string[];
};

export const MENSAL_REPORT_PENDING_QUERY_KEY = ['reunioes-mensal-pending-count'] as const;

export function useMensalReportPendingCount(enabled = true) {
  const { data, ...rest } = useQuery({
    queryKey: MENSAL_REPORT_PENDING_QUERY_KEY,
    queryFn: async (): Promise<MensalReportPendingSummary> => {
      const res = await api.get('/reunioes/mensal/pending-count');
      const payload = res.data?.data ?? res.data;
      const count = Number(payload?.count);
      const contractIds = Array.isArray(payload?.contractIds)
        ? payload.contractIds.filter((id: unknown): id is string => typeof id === 'string')
        : [];
      return {
        count: Number.isFinite(count) && count > 0 ? count : 0,
        contractIds,
      };
    },
    enabled,
    staleTime: 20_000,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
  });

  return {
    count: data?.count ?? 0,
    contractIds: data?.contractIds ?? [],
    pendingByContractId: new Set(data?.contractIds ?? []),
    ...rest,
  };
}

'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

/** IDs das RMs criadas pela Ficha de Demanda (para a etiqueta "FD" na lista de RMs). */
export function useFdMaterialRequestIds(): Set<string> {
  const { data } = useQuery({
    queryKey: ['fd-material-request-ids'],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals/material-request-ids');
      return (res.data?.data ?? []) as string[];
    },
    staleTime: 60_000,
    retry: false,
  });
  return new Set(data ?? []);
}

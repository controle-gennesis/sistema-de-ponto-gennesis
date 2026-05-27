'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';

export type FdNotificationCounts = {
  pendingManager: number;
  pendingPurchase: number;
};

const emptyCounts: FdNotificationCounts = { pendingManager: 0, pendingPurchase: 0 };

export function useFdNotificationCounts() {
  const {
    isLoading,
    isAdministrator,
    isDepartmentCompras,
    canAccessDpApproverPages,
    can,
  } = usePermissions();

  const canFetchPurchase =
    isAdministrator || isDepartmentCompras || can(pathToModuleKey('/ponto/fds-aprovadas'));
  const canFetchManager = isAdministrator || canAccessDpApproverPages;
  const enabled = !isLoading && (canFetchPurchase || canFetchManager);

  const query = useQuery({
    queryKey: ['fd-notification-counts'],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals/notification-counts');
      const data = res.data?.data as FdNotificationCounts | undefined;
      return {
        pendingManager: Number(data?.pendingManager ?? 0) || 0,
        pendingPurchase: Number(data?.pendingPurchase ?? 0) || 0,
      };
    },
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  return {
    counts: query.data ?? emptyCounts,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { resolveEspelhoApprovalStatus } from '@/lib/espelhoNfApproval';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';

export type ApprovalNotificationCounts = {
  dp: number;
  espelho: number;
  fd: number;
  fuel: number;
  oc: number;
  rm: number;
  medicao: number;
  total: number;
};

const emptyCounts: ApprovalNotificationCounts = {
  dp: 0,
  espelho: 0,
  fd: 0,
  fuel: 0,
  oc: 0,
  rm: 0,
  medicao: 0,
  total: 0,
};

export function useApprovalNotificationCounts() {
  const {
    isLoading,
    canAccessDpApproverPages,
    canApproveFd,
    canApproveEspelhoNf,
    espelhoNfApprovalCostCenterIds,
    espelhoNfApprovalSeesAll,
    canApproveFuel,
    canApproveOc,
    canApproveMaterialRequests,
    canApproveEmpreiteiroDaily,
  } = usePermissions();

  const canFetch =
    canAccessDpApproverPages ||
    canApproveFd ||
    canApproveEspelhoNf ||
    canApproveFuel ||
    canApproveOc ||
    canApproveMaterialRequests ||
    canApproveEmpreiteiroDaily;
  const enabled = !isLoading && canFetch;

  const mainQuery = useQuery({
    queryKey: ['approval-notification-counts'],
    queryFn: async () => {
      const res = await api.get('/approvals/notification-counts');
      const data = res.data?.data as Partial<ApprovalNotificationCounts> & {
        espelhoMirrors?: number;
      };
      return {
        dp: Number(data?.dp ?? 0) || 0,
        fd: Number(data?.fd ?? 0) || 0,
        fuel: Number(data?.fuel ?? 0) || 0,
        oc: Number(data?.oc ?? 0) || 0,
        rm: Number(data?.rm ?? 0) || 0,
        espelhoMirrors: Number(data?.espelhoMirrors ?? 0) || 0,
      };
    },
    enabled,
    refetchInterval: () => visibleTabRefetchInterval(30_000),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const espelhoQuery = useQuery({
    queryKey: [
      'approval-notification-counts',
      'espelho',
      espelhoNfApprovalSeesAll,
      espelhoNfApprovalCostCenterIds,
    ],
    enabled: enabled && canApproveEspelhoNf,
    queryFn: async () => {
      const res = await api.get('/espelho-nf/bootstrap');
      const mirrors = Array.isArray(res.data?.data?.mirrors) ? res.data.data.mirrors : [];
      const allowed = new Set(espelhoNfApprovalCostCenterIds);
      return mirrors.filter(
        (m: { id?: string; approvalStatus?: string | null; costCenterId?: string | null }) => {
          if (
            resolveEspelhoApprovalStatus(String(m.id ?? ''), m.approvalStatus) !==
            'PENDING_APPROVAL'
          ) {
            return false;
          }
          if (espelhoNfApprovalSeesAll) return true;
          return allowed.has(String(m.costCenterId ?? ''));
        },
      ).length;
    },
    refetchInterval: () => visibleTabRefetchInterval(30_000),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const medicaoQuery = useQuery({
    queryKey: ['empreiteiro-daily-measurements-pending', 'count'],
    enabled: enabled && canApproveEmpreiteiroDaily,
    queryFn: async () => {
      const res = await api.get('/empreiteiros/daily-measurements/pending');
      const rows = res.data?.data;
      return Array.isArray(rows) ? rows.length : 0;
    },
    refetchInterval: () => visibleTabRefetchInterval(30_000),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const counts = useMemo((): ApprovalNotificationCounts => {
    const base = mainQuery.data;
    const espelho = canApproveEspelhoNf ? (espelhoQuery.data ?? 0) : 0;
    const dp = canAccessDpApproverPages ? (base?.dp ?? 0) : 0;
    const fd = canApproveFd ? (base?.fd ?? 0) : 0;
    const fuel = canApproveFuel ? (base?.fuel ?? 0) : 0;
    const oc = canApproveOc ? (base?.oc ?? 0) : 0;
    const rm = canApproveMaterialRequests ? (base?.rm ?? 0) : 0;
    const medicao = canApproveEmpreiteiroDaily ? (medicaoQuery.data ?? 0) : 0;
    const total = dp + espelho + fd + fuel + oc + rm + medicao;
    return { dp, espelho, fd, fuel, oc, rm, medicao, total };
  }, [
    mainQuery.data,
    espelhoQuery.data,
    medicaoQuery.data,
    canAccessDpApproverPages,
    canApproveFd,
    canApproveEspelhoNf,
    canApproveFuel,
    canApproveOc,
    canApproveMaterialRequests,
    canApproveEmpreiteiroDaily,
  ]);

  return {
    counts: enabled ? counts : emptyCounts,
    isLoading:
      mainQuery.isLoading ||
      (canApproveEspelhoNf && espelhoQuery.isLoading) ||
      (canApproveEmpreiteiroDaily && medicaoQuery.isLoading),
    refetch: async () => {
      await Promise.all([mainQuery.refetch(), espelhoQuery.refetch(), medicaoQuery.refetch()]);
    },
  };
}

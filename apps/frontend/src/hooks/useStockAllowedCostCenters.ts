import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';

type ContractCostCenterRow = {
  costCenterId?: string | null;
  costCenter?: { id?: string | null } | null;
};

/** `null` = admin (sem restrição). `Set` vazio = nenhum contrato liberado. */
export function useStockAllowedCostCenterIds() {
  const { isAdministrator, can } = usePermissions();
  const canAccessContratos = isAdministrator || can(pathToModuleKey('/ponto/contratos'));

  const { data: stockContractRows = [], isFetched: stockContractsFetched } = useQuery({
    queryKey: ['contracts-for-stock-scope'],
    queryFn: async () => {
      try {
        const res = await api.get('/contracts', { params: { page: 1, limit: 1000 } });
        return (res.data?.data || []) as ContractCostCenterRow[];
      } catch {
        return [] as ContractCostCenterRow[];
      }
    },
    enabled: !isAdministrator && canAccessContratos,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const allowedStockCostCenterIds = useMemo(() => {
    if (isAdministrator) return null;
    if (!canAccessContratos || !stockContractsFetched) return new Set<string>();
    const ids = new Set<string>();
    for (const row of stockContractRows) {
      const id = row.costCenterId || row.costCenter?.id;
      if (id) ids.add(id);
    }
    return ids;
  }, [isAdministrator, canAccessContratos, stockContractsFetched, stockContractRows]);

  return { allowedStockCostCenterIds, canAccessContratos };
}

export function filterCostCentersByStockAccess<T extends { id: string }>(
  costCenters: T[],
  allowedIds: Set<string> | null,
): T[] {
  if (!allowedIds) return costCenters;
  return costCenters.filter((cc) => allowedIds.has(cc.id));
}

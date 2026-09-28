import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';

type ContractCostCenterRow = {
  costCenterId?: string | null;
  costCenter?: { id?: string | null } | null;
};

function useContractCostCenterRows(enabled: boolean) {
  return useQuery({
    queryKey: ['contracts-for-stock-scope'],
    queryFn: async () => {
      try {
        const res = await api.get('/contracts', { params: { page: 1, limit: 1000 } });
        return (res.data?.data || []) as ContractCostCenterRow[];
      } catch {
        return [] as ContractCostCenterRow[];
      }
    },
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

function costCenterIdsFromContractRows(rows: ContractCostCenterRow[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = row.costCenterId || row.costCenter?.id;
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Contratos explicitamente liberados.
 * `null` = sem restrição por contrato (admin ou sem módulo Contratos).
 * `Set` vazio = módulo Contratos sem nenhum contrato cadastrado (ou ainda carregando).
 */
export function useAssignedContractCostCenterIds() {
  const { isAdministrator, can } = usePermissions();
  const canAccessContratos = isAdministrator || can(pathToModuleKey('/ponto/contratos'));
  const { data: contractRows = [], isFetched } = useContractCostCenterRows(
    !isAdministrator && canAccessContratos,
  );

  const allowedContractCostCenterIds = useMemo(() => {
    if (isAdministrator) return null;
    if (!canAccessContratos) return null;
    if (!isFetched) return new Set<string>();
    return costCenterIdsFromContractRows(contractRows);
  }, [isAdministrator, canAccessContratos, isFetched, contractRows]);

  return { allowedContractCostCenterIds, canAccessContratos };
}

/** `null` = admin (sem restrição). `Set` vazio = nenhum contrato liberado. */
export function useStockAllowedCostCenterIds() {
  const { allowedContractCostCenterIds, canAccessContratos } = useAssignedContractCostCenterIds();

  const allowedStockCostCenterIds = useMemo(() => {
    if (!canAccessContratos && allowedContractCostCenterIds === null) {
      return new Set<string>();
    }
    return allowedContractCostCenterIds;
  }, [allowedContractCostCenterIds, canAccessContratos]);

  return { allowedStockCostCenterIds, canAccessContratos };
}

export function filterCostCentersByStockAccess<T extends { id: string }>(
  costCenters: T[],
  allowedIds: Set<string> | null,
): T[] {
  if (!allowedIds) return costCenters;
  return costCenters.filter((cc) => allowedIds.has(cc.id));
}

export function filterRowsByAllowedCostCenterIds<T>(
  rows: T[],
  allowedIds: Set<string> | null,
  getCostCenterId: (row: T) => string | null | undefined,
): T[] {
  if (!allowedIds) return rows;
  return rows.filter((row) => {
    const id = getCostCenterId(row);
    return Boolean(id && allowedIds.has(id));
  });
}

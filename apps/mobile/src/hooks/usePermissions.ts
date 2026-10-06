import { useEffect, useMemo } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

type PermissionItem = { module: string; action: string };

type PermissionsMeData = {
  isAdmin?: boolean;
  permissions?: PermissionItem[];
  dpApprovalContractIds?: string[];
  fdApprovalContractIds?: string[];
  fuelApprovalContractIds?: string[];
};

/** Igual ao web (`@sistema-ponto/permission-modules`). */
function pathToModuleKey(href: string): string {
  const trimmed = href.replace(/\/$/, '') || '/';
  if (trimmed === '/' || trimmed === '') return 'root';
  return trimmed.replace(/^\//, '').replace(/\//g, '_');
}

const ACCESS_ACTION = 'acesso';
const COMBUSTIVEL_KEY = pathToModuleKey('/ponto/solicitar-combustivel');
const RESERVAS_KEY = pathToModuleKey('/ponto/reserva-veiculos');
const SOLICITACOES_DP_KEY = pathToModuleKey('/ponto/solicitacoes-dp');
const GESTAO_OS_KEY = pathToModuleKey('/ponto/sistema-gestao-os');
const MEUS_CHAMADOS_KEY = pathToModuleKey('/ponto/meus-chamados');

function moduleReady(isFetched: boolean, isPending: boolean) {
  return isFetched && !isPending;
}

export function usePermissions() {
  const { user, isAuthenticated } = useAuth();

  const { data, isPending, isFetched, refetch } = useQuery({
    queryKey: ['me-permissions', user?.id ?? 'anonymous'],
    enabled: isAuthenticated && !!user?.id,
    // Permissões mudam no web; não manter cache longo no mobile.
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    queryFn: async (): Promise<PermissionsMeData> => {
      const res = await api.get('/api/permissions/me');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Erro ao carregar permissões');
      }
      return (json?.data ?? json) as PermissionsMeData;
    },
  });

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void refetch();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [isAuthenticated, user?.id, refetch]);

  const isAdministrator = user?.employee?.position === 'Administrador';
  const isElevated = isAdministrator || !!data?.isAdmin;
  const isDepartmentCompras =
    !!user?.employee?.department?.toLowerCase().includes('compras');
  const isDepartmentPessoal =
    !!user?.employee?.department?.toLowerCase().includes('pessoal');

  const allowedModules = useMemo(() => {
    const set = new Set<string>();
    for (const p of data?.permissions || []) {
      if (p.action === ACCESS_ACTION) set.add(p.module);
    }
    return set;
  }, [data?.permissions]);

  const dpApprovalContractIds = data?.dpApprovalContractIds ?? [];
  const fdApprovalContractIds = data?.fdApprovalContractIds ?? [];
  const fuelApprovalContractIds = data?.fuelApprovalContractIds ?? [];

  const ready = moduleReady(isFetched, isPending);

  const can = (moduleKey: string) => {
    if (isElevated) return true;
    return allowedModules.has(moduleKey);
  };

  const hasModule = (moduleKey: string) =>
    isElevated || (ready && allowedModules.has(moduleKey));

  // Mesma regra do sidebar web (Principal)
  const canSeeCombustivel =
    isElevated || isDepartmentCompras || hasModule(COMBUSTIVEL_KEY);

  const canSeeReservas =
    isElevated || isDepartmentCompras || hasModule(RESERVAS_KEY);

  /** Licitações PNCP — oculta no mobile (só web). */
  const canSeePncp = false;

  const canSeeDpRequests =
    isElevated || isDepartmentPessoal || hasModule(SOLICITACOES_DP_KEY);

  /** Meus Chamados ou Central de Chamados (web). */
  const canSeeGestaoOs =
    isElevated || hasModule(MEUS_CHAMADOS_KEY) || hasModule(GESTAO_OS_KEY);

  /** Registros de ponto — mesmo critério do web (`requiresTimeClock`). */
  const canSeePonto = user?.employee?.requiresTimeClock !== false;

  /** Aprovações — mesmas regras do hub web `/ponto/aprovacoes`. */
  const canAccessDpApproverPages =
    isElevated ||
    can(pathToModuleKey('/ponto/controle/aprovar-solicitacoes-restritas-dp')) ||
    can(pathToModuleKey('/ponto/controle/aprovar-solicitacoes-dp'));

  const canApproveFuel =
    isElevated ||
    (can(pathToModuleKey('/ponto/controle/aprovar-combustivel')) &&
      fuelApprovalContractIds.length > 0);

  const canApproveFd =
    isElevated ||
    (can(pathToModuleKey('/ponto/controle/aprovar-fichas-demanda')) &&
      fdApprovalContractIds.length > 0);

  const canApproveMaterialRequests =
    isElevated ||
    dpApprovalContractIds.length > 0 ||
    can(pathToModuleKey('/ponto/controle/aprovar-requisicoes-materiais'));

  const canApproveOcCompras =
    isElevated || can(pathToModuleKey('/ponto/controle/aprovar-oc-compras'));
  const canApproveOcDiretoria =
    isElevated || can(pathToModuleKey('/ponto/controle/aprovar-oc-diretoria'));
  const canApproveOcGestor = isElevated || dpApprovalContractIds.length > 0;
  const canApproveOc = canApproveOcCompras || canApproveOcDiretoria || canApproveOcGestor;

  const canApproveEmpreiteiroDaily =
    isElevated || can(pathToModuleKey('/ponto/controle/aprovar-medicoes-empreita'));

  const canSeeAprovacoes =
    canAccessDpApproverPages ||
    canApproveFuel ||
    canApproveFd ||
    canApproveMaterialRequests ||
    canApproveOc ||
    canApproveEmpreiteiroDaily;

  return {
    isLoading: isAuthenticated && !!user?.id && !isElevated && (isPending || !isFetched),
    isAdministrator: isElevated,
    can,
    canSeeCombustivel,
    canSeeReservas,
    canSeePncp,
    canSeeDpRequests,
    canSeeGestaoOs,
    canSeePonto,
    canSeeAprovacoes,
    canAccessDpApproverPages,
    canApproveFuel,
    canApproveFd,
    canApproveMaterialRequests,
    canApproveOc,
    canApproveOcCompras,
    canApproveOcDiretoria,
    canApproveOcGestor,
    canApproveEmpreiteiroDaily,
  };
}

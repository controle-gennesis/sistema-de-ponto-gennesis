import { useQuery } from '@tanstack/react-query';
import {
  pathToModuleKey,
  PERMISSION_ACCESS_ACTION,
} from '@sistema-ponto/permission-modules';
import api from '@/lib/api';

type PermissionItem = { module: string; action: string };

const pk = pathToModuleKey;

export function usePermissions() {
  const { data: userData, isLoading: isLoadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const user = userData?.data;
  const userPosition = user?.employee?.position;
  const userDepartment = user?.employee?.department;
  const isAdministrator = userPosition === 'Administrador';

  const { data: permissionData, isPending: permissionsPending } = useQuery({
    queryKey: ['me-permissions'],
    queryFn: async () => {
      const res = await api.get('/permissions/me');
      return res.data?.data;
    },
    enabled: !!user,
  });

  const isLoading = isLoadingUser || (!!user && permissionsPending);

  const allowedSet = new Set<string>(
    ((permissionData?.permissions || []) as PermissionItem[])
      .filter((p) => p.action === PERMISSION_ACCESS_ACTION)
      .map((p) => p.module)
  );

  const allowedContractIds: string[] = permissionData?.allowedContractIds ?? [];
  const allowedContractIdSet = new Set(allowedContractIds);

  /** Acesso total ao submenu (módulo) identificado pela chave do registro central. */
  const can = (moduleKey: string) => {
    if (isAdministrator || permissionData?.isAdmin) {
      return true;
    }
    return allowedSet.has(moduleKey);
  };

  /** Acesso a um contrato específico (requer módulo Contratos + autorização explícita). */
  const canAccessContract = (contractId: string) => {
    if (isAdministrator || permissionData?.isAdmin) return true;
    if (!can(pk('/ponto/contratos'))) return false;
    return allowedContractIdSet.has(contractId);
  };

  const isDepartmentPessoal = userDepartment?.toLowerCase().includes('departamento pessoal') || 
                               userDepartment?.toLowerCase().includes('pessoal');

  const isDepartmentProjetos = userDepartment?.toLowerCase().includes('projetos');

  const isDepartmentFinanceiro = userDepartment?.toLowerCase().includes('financeiro');

  const isDepartmentCompras = userDepartment?.toLowerCase().includes('compras');

  const finalPermissions = {
    canAccessPayroll: can(pk('/ponto/folha-pagamento')) || can(pk('/relatorios/alocacao')),
    canManageEmployees: can(pk('/ponto/funcionarios')),
    canViewReports: can(pk('/ponto/dashboard')),
    canManageVacations:
      can(pk('/ponto/gerenciar-ferias')) ||
      can(pk('/ponto/ferias')) ||
      can(pk('/ponto/gerenciar-feriados')),
    canManageAbsences:
      can(pk('/ponto/atestados')) || can(pk('/ponto/gerenciar-atestados')),
    canManageBankHours: can(pk('/ponto/banco-horas')),
    canViewBirthdays: true,
    canRegisterTime: true,
    canViewDashboard: can(pk('/ponto/dashboard')),
  };

  return {
    user,
    userPosition,
    userDepartment,
    isAdministrator,
    isDepartmentPessoal,
    isDepartmentProjetos,
    isDepartmentFinanceiro,
    isDepartmentCompras,
    permissions: finalPermissions,
    can,
    allowedContractIds,
    canAccessContract,
    isLoading,
    canAccessPayroll: finalPermissions.canAccessPayroll,
    canManageEmployees: finalPermissions.canManageEmployees,
    canViewReports: finalPermissions.canViewReports,
    canManageVacations: finalPermissions.canManageVacations,
    canManageAbsences: finalPermissions.canManageAbsences,
    canManageBankHours: finalPermissions.canManageBankHours,
    canViewBirthdays: finalPermissions.canViewBirthdays,
    canRegisterTime: finalPermissions.canRegisterTime,
    canViewDashboard: finalPermissions.canViewDashboard,
  };
}

export function useRoutePermission(route: string) {
  const {
    permissions,
    isLoading,
    isDepartmentPessoal,
    isDepartmentProjetos,
    isDepartmentFinanceiro,
    isDepartmentCompras,
    userPosition,
    can,
  } = usePermissions();

  if (isLoading) {
    return { hasAccess: false, isLoading: true };
  }

  const isAdministrator = userPosition === 'Administrador';

  const routePermissions: Record<string, boolean> = {
    '/ponto': isAdministrator || isDepartmentPessoal || permissions.canRegisterTime,
    '/ponto/dashboard': isAdministrator || isDepartmentPessoal || permissions.canViewDashboard,
    '/ponto/funcionarios': isAdministrator || isDepartmentPessoal || permissions.canManageEmployees,
    '/ponto/aniversariantes': isAdministrator || isDepartmentPessoal || can(pk('/ponto/aniversariantes')),
    '/ponto/atestados': isAdministrator || can(pk('/ponto/atestados')),
    '/ponto/gerenciar-atestados': isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-atestados')),
    '/ponto/solicitacoes': isAdministrator || can(pk('/ponto/solicitacoes')),
    '/ponto/gerenciar-solicitacoes': isAdministrator || isDepartmentProjetos || can(pk('/ponto/gerenciar-solicitacoes')),
    '/ponto/ferias': isAdministrator || can(pk('/ponto/ferias')),
    '/ponto/gerenciar-ferias': isAdministrator || isDepartmentPessoal || permissions.canManageVacations,
    '/ponto/gerenciar-feriados': isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-feriados')),
    '/ponto/banco-horas': isAdministrator || isDepartmentPessoal || permissions.canManageBankHours,
    '/ponto/folha-pagamento': isAdministrator || isDepartmentPessoal || permissions.canAccessPayroll,
    '/relatorios/alocacao': isAdministrator || isDepartmentPessoal || permissions.canAccessPayroll,
    '/ponto/centros-custo': isAdministrator || isDepartmentPessoal || can(pk('/ponto/centros-custo')),
    '/ponto/materiais-construcao': isAdministrator || isDepartmentPessoal || can(pk('/ponto/materiais-construcao')),
    '/ponto/andamento-da-os': isAdministrator || can(pk('/ponto/andamento-da-os')),
    '/ponto/permissoes': isAdministrator,
    '/ponto/chatgpt': isAdministrator || can(pk('/ponto/chatgpt')),
    '/ponto/bi': isAdministrator || can(pk('/ponto/bi')),
    '/ponto/conversas-whatsapp': isAdministrator || isDepartmentPessoal || can(pk('/ponto/conversas-whatsapp')),
    '/ponto/financeiro': isAdministrator || can(pk('/ponto/financeiro')),
    '/ponto/financeiro/analise': isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/analise')),
    '/ponto/financeiro/analise-extrato':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/analise-extrato')),
    '/ponto/orcamento': isAdministrator || can(pk('/ponto/orcamento')),
    '/ponto/contratos': isAdministrator || can(pk('/ponto/contratos')),
    '/ponto/contratos/controle-geral': isAdministrator || can(pk('/ponto/contratos/controle-geral')),
    '/ponto/pleitos-gerados': isAdministrator || can(pk('/ponto/pleitos-gerados')),
    '/ponto/solicitar-materiais': isAdministrator || can(pk('/ponto/solicitar-materiais')),
    '/ponto/gerenciar-materiais': isAdministrator || isDepartmentCompras || can(pk('/ponto/gerenciar-materiais')),
    '/ponto/mapa-cotacao': isAdministrator || isDepartmentCompras || can(pk('/ponto/mapa-cotacao')),
    '/ponto/ordem-de-compra': isAdministrator || isDepartmentCompras || can(pk('/ponto/ordem-de-compra')),
    '/ponto/fornecedores': isAdministrator || isDepartmentCompras || can(pk('/ponto/fornecedores')),
    '/ponto/condicoes-pagamento':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/condicoes-pagamento')),
    '/ponto/natureza-orcamentaria':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/natureza-orcamentaria')),
  };

  return {
    hasAccess: routePermissions[route] ?? true,
    isLoading: false,
  };
}

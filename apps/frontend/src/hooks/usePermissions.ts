import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  pathToModuleKey,
  PERMISSION_ACCESS_ACTION,
} from '@sistema-ponto/permission-modules';
import api from '@/lib/api';
import {
  AUTH_TOKEN_REFRESHED_EVENT,
  forceAuthRedirect,
  hasStoredAuthToken,
} from '@/lib/authSession';

type PermissionItem = { module: string; action: string };

const pk = pathToModuleKey;

export function usePermissions() {
  const queryClient = useQueryClient();

  const {
    data: userData,
    isLoading: isLoadingUser,
    isError: isUserError,
    error: userError,
  } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      // Evita resposta 304 para auth/me, que o Axios trata como erro.
      const res = await api.get('/auth/me', { params: { _ts: Date.now() } });
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: () => hasStoredAuthToken(),
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 429 || status === 401 || status === 403) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    const refreshUser = () => {
      void queryClient.invalidateQueries({ queryKey: ['user'] });
      void queryClient.invalidateQueries({ queryKey: ['me-permissions'] });
    };

    window.addEventListener(AUTH_TOKEN_REFRESHED_EVENT, refreshUser);
    return () => window.removeEventListener(AUTH_TOKEN_REFRESHED_EVENT, refreshUser);
  }, [queryClient]);

  useEffect(() => {
    if (typeof window === 'undefined' || isLoadingUser) return;
    if (userData?.data) return;
    if (window.location.pathname.startsWith('/auth/')) return;

    const status = (userError as { response?: { status?: number } } | undefined)?.response?.status;

    if (!hasStoredAuthToken()) {
      forceAuthRedirect();
      return;
    }

    if (isUserError && (status === 401 || status === 403)) {
      forceAuthRedirect();
    }
  }, [isLoadingUser, isUserError, userData, userError]);

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
  const allowedActionSet = new Set<string>(
    ((permissionData?.permissions || []) as PermissionItem[]).map((p) => `${p.module}:${p.action}`)
  );

  const allowedContractIds: string[] = permissionData?.allowedContractIds ?? [];
  const allowedContractIdSet = new Set(allowedContractIds);
  const dpApprovalContractIds: string[] = permissionData?.dpApprovalContractIds ?? [];
  const dpApprovalContractIdSet = new Set(dpApprovalContractIds);

  type ContractModuleFlagRow = {
    orcamento: boolean;
    relatorios: boolean;
    ordemServico: boolean;
    producaoSemanal: boolean;
  };
  const contractModuleFlags: Record<string, ContractModuleFlagRow> =
    (permissionData?.contractModuleFlags as Record<string, ContractModuleFlagRow> | undefined) ?? {};

  const hasOrcamentoViaAnyAllowedContract =
    Object.values(contractModuleFlags).some((f) => f?.orcamento === true);
  const hasOrdemServicoViaAnyAllowedContract = Object.values(contractModuleFlags).some(
    (f) => f?.ordemServico === true
  );

  const can = (moduleKey: string) => {
    if (isAdministrator || permissionData?.isAdmin) {
      return true;
    }
    return allowedSet.has(moduleKey);
  };
  const canAction = (moduleKey: string, action: string) => {
    if (isAdministrator || permissionData?.isAdmin) return true;
    return allowedActionSet.has(`${moduleKey}:${action}`);
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

  const isDepartmentJuridico =
    userDepartment?.toLowerCase().includes('jurídico') ||
    userDepartment?.toLowerCase().includes('juridico');

  const employeesKey = pk('/ponto/funcionarios');
  /** Ações granulares persistidas além do `acesso` do módulo (matriz Ver/Criar/Editar/Excluir). */
  const EMPLOYEE_MODULE_CRUD = ['ver', 'criar', 'editar', 'excluir'] as const;
  const isElevatedUser = isAdministrator || !!permissionData?.isAdmin;
  const hasEmployeeAcesso = can(employeesKey);
  /**
   * Com matriz granular, o salvamento ainda grava `acesso` no módulo (payload base).
   * Nesse caso o `acesso` não pode liberar criar/excluir — só as linhas `ponto_funcionarios:criar` etc.
   * Cadastro antigo: só `acesso`, sem linhas CRUD → mantém comportamento de “módulo inteiro”.
   */
  const hasEmployeeGranular =
    !isElevatedUser &&
    EMPLOYEE_MODULE_CRUD.some((a) => allowedActionSet.has(`${employeesKey}:${a}`));
  /** Qualquer permissão no módulo (rota / botões da lista). */
  const canAccessEmployeesModule =
    hasEmployeeAcesso ||
    canAction(employeesKey, 'ver') ||
    canAction(employeesKey, 'criar') ||
    canAction(employeesKey, 'editar') ||
    canAction(employeesKey, 'excluir');

  const canViewEmployees = hasEmployeeGranular
    ? EMPLOYEE_MODULE_CRUD.some((a) => canAction(employeesKey, a))
    : hasEmployeeAcesso;
  const canCreateEmployees = hasEmployeeGranular
    ? canAction(employeesKey, 'criar')
    : hasEmployeeAcesso;
  const canEditEmployees = hasEmployeeGranular
    ? canAction(employeesKey, 'editar')
    : hasEmployeeAcesso;
  const canDeleteEmployees = hasEmployeeGranular
    ? canAction(employeesKey, 'excluir')
    : hasEmployeeAcesso;

  /** Rescisão / alteração função-salário: admin, equipe DP (gerenciar), Controle «criar solicitações restritas» ou Gestor DP no contrato. */
  const canCreateSensitiveDpRequestType = (contractId: string | null | undefined) => {
    if (isAdministrator || permissionData?.isAdmin) return true;
    if (can(pk('/ponto/gerenciar-solicitacoes-dp'))) return true;
    if (can(pk('/ponto/controle/criar-tipos-restritos-dp'))) return true;
    if (!contractId) return false;
    return dpApprovalContractIdSet.has(contractId);
  };

  /** Tela / API de aprovações DP: gestor por contrato ou permissão legada (Controle). */
  const canAccessDpApproverPages =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    dpApprovalContractIds.length > 0 ||
    can(pk('/ponto/controle/aprovar-solicitacoes-dp'));

  /** Bloco «Espelhos da Nota Fiscal» na tela de Aprovações: aprovação pelo Controle. */
  const canApproveEspelhoNf =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/aprovar-espelho-nf'));

  const canApproveOcCompras =
    isAdministrator || !!permissionData?.isAdmin || can(pk('/ponto/controle/aprovar-oc-compras'));
  const canApproveOcDiretoria =
    isAdministrator || !!permissionData?.isAdmin || can(pk('/ponto/controle/aprovar-oc-diretoria'));
  const canApproveOcGestor =
    isAdministrator || !!permissionData?.isAdmin || can(pk('/ponto/controle/aprovar-oc-gestor'));
  const canApproveOc = canApproveOcCompras || canApproveOcDiretoria || canApproveOcGestor;

  /** Bloco «Solicitações de Combustível» na tela de Aprovações (somente permissão Controle). */
  const canApproveFuel =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/aprovar-combustivel'));

  /** Custos/valores nos cards do Kanban (permissão Controle ou admin). */
  const canViewKanbanValues =
    isAdministrator ||
    !!permissionData?.isAdmin ||
    can(pk('/ponto/controle/ver-valores-kanban'));


  /** Lista de orçamentos: módulo Contratos + permissão checklist «Orçamento» em pelo menos um contrato. */
  const canAccessOrcamentoRoutePage =
    isElevatedUser ||
    (can(pk('/ponto/contratos')) && hasOrcamentoViaAnyAllowedContract);

  /** Tela global «Ordem de Serviço»: módulo Contratos + checklist OS em pelo menos um contrato. */
  const canAccessOsRoutePage =
    isElevatedUser ||
    (can(pk('/ponto/contratos')) && hasOrdemServicoViaAnyAllowedContract);

  /** Recebimento de entregas: módulo Contratos + ao menos um contrato liberado. */
  const canAccessRecebimentoEntregasRoutePage =
    isElevatedUser ||
    (can(pk('/ponto/contratos')) && allowedContractIds.length > 0);

  const canAccessContractOrdemServicoTab = (contractId: string) => {
    if (isElevatedUser) return true;
    return (
      canAccessContract(contractId) && contractModuleFlags[contractId]?.ordemServico === true
    );
  };

  const canAccessContractProducaoSemanalTab = (contractId: string) => {
    if (isElevatedUser) return true;
    return (
      canAccessContract(contractId) && contractModuleFlags[contractId]?.producaoSemanal === true
    );
  };

  const canAccessContractOrcamentoTab = (contractId: string) => {
    if (isElevatedUser) return true;
    return (
      canAccessContract(contractId) && contractModuleFlags[contractId]?.orcamento === true
    );
  };

  const canAccessContractRelatoriosTab = (contractId: string) => {
    if (isElevatedUser) return true;
    return (
      canAccessContract(contractId) && contractModuleFlags[contractId]?.relatorios === true
    );
  };

  const finalPermissions = {
    canAccessPayroll: can(pk('/ponto/folha-pagamento')) || can(pk('/relatorios/alocacao')),
    /** Acesso ao módulo Funcionários (inclui granularidade definida na tela de permissões). */
    canManageEmployees: canAccessEmployeesModule,
    canViewEmployees,
    canCreateEmployees,
    canEditEmployees,
    canDeleteEmployees,
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
    canCreateContracts: canAction(pk('/ponto/contratos'), 'criar'),
    canEditContracts: canAction(pk('/ponto/contratos'), 'editar'),
    canDeleteContracts: canAction(pk('/ponto/contratos'), 'excluir'),
  };

  return {
    user,
    isAuthenticated: !!user,
    userPosition,
    userDepartment,
    isAdministrator,
    isElevatedUser,
    isDepartmentPessoal,
    isDepartmentProjetos,
    isDepartmentFinanceiro,
    isDepartmentCompras,
    isDepartmentJuridico,
    permissions: finalPermissions,
    can,
    canAction,
    allowedContractIds,
    dpApprovalContractIds,
    canCreateSensitiveDpRequestType,
    canAccessDpApproverPages,
    canApproveEspelhoNf,
    canApproveOc,
    canApproveOcCompras,
    canApproveOcDiretoria,
    canApproveOcGestor,
    canApproveFuel,
    canViewKanbanValues,
    canAccessContract,
    contractModuleFlags,
    canAccessOrcamentoRoutePage,
    canAccessOsRoutePage,
    canAccessRecebimentoEntregasRoutePage,
    canAccessContractOrcamentoTab,
    canAccessContractRelatoriosTab,
    canAccessContractOrdemServicoTab,
    canAccessContractProducaoSemanalTab,
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
    canCreateContracts: finalPermissions.canCreateContracts,
    canEditContracts: finalPermissions.canEditContracts,
    canDeleteContracts: finalPermissions.canDeleteContracts,
    canViewEmployees: finalPermissions.canViewEmployees,
    canCreateEmployees: finalPermissions.canCreateEmployees,
    canEditEmployees: finalPermissions.canEditEmployees,
    canDeleteEmployees: finalPermissions.canDeleteEmployees,
  };
}

export function useRoutePermission(route: string) {
  const {
    permissions,
    isLoading,
    isElevatedUser,
    isDepartmentPessoal,
    isDepartmentProjetos,
    isDepartmentFinanceiro,
    isDepartmentCompras,
    isDepartmentJuridico,
    can,
    dpApprovalContractIds,
    canApproveEspelhoNf,
    canAccessOrcamentoRoutePage,
    canAccessOsRoutePage,
    canAccessRecebimentoEntregasRoutePage,
  } = usePermissions();

  if (isLoading) {
    return { hasAccess: false, isLoading: true };
  }

  const isAdministrator = isElevatedUser;

  const routePermissions: Record<string, boolean> = {
    '/ponto': isAdministrator || isDepartmentPessoal || permissions.canRegisterTime,
    '/ponto/dashboard': isAdministrator || isDepartmentPessoal || permissions.canViewDashboard,
    /**
     * Aprovações: a página agora aparece automaticamente para quem precisa decidir
     * sobre algum bloco. Não há mais entrada na matriz de acessos.
     *  - Gestor de algum contrato (decide Solicitações Gerais) → vê o bloco de Solicitações.
     *  - Permissão «Aprovar Espelho da Nota Fiscal» (Controle) → vê o bloco de Espelhos da Nota Fiscal.
     *  - Compras / Gerenciar materiais → vê o bloco de aprovação de OC.
     * Cada bloco é renderizado independentemente dentro da própria página.
     */
    '/ponto/aprovacoes':
      isAdministrator ||
      dpApprovalContractIds.length > 0 ||
      can(pk('/ponto/controle/aprovar-solicitacoes-dp')) ||
      canApproveEspelhoNf ||
      can(pk('/ponto/controle/aprovar-combustivel')) ||
      can(pk('/ponto/controle/aprovar-oc-compras')) ||
      can(pk('/ponto/controle/aprovar-oc-gestor')) ||
      can(pk('/ponto/controle/aprovar-oc-diretoria')),
    '/ponto/funcionarios':
      isAdministrator || isDepartmentPessoal || permissions.canManageEmployees,
    '/ponto/aniversariantes': isAdministrator || isDepartmentPessoal || can(pk('/ponto/aniversariantes')),
    '/ponto/atestados': isAdministrator || can(pk('/ponto/atestados')),
    '/ponto/gerenciar-atestados': isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-atestados')),
    '/ponto/solicitacoes': isAdministrator || can(pk('/ponto/solicitacoes')),
    '/ponto/gerenciar-solicitacoes': isAdministrator || can(pk('/ponto/gerenciar-solicitacoes')),
    '/ponto/solicitacoes-gerais':
      isAdministrator || isDepartmentPessoal || can(pk('/ponto/solicitacoes-dp')),
    '/ponto/gerenciar-solicitacoes-gerais':
      isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-solicitacoes-dp')),
    '/ponto/ferias': isAdministrator || can(pk('/ponto/ferias')),
    '/ponto/gerenciar-ferias': isAdministrator || isDepartmentPessoal || permissions.canManageVacations,
    '/ponto/gerenciar-feriados': isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-feriados')),
    '/ponto/banco-horas': isAdministrator || isDepartmentPessoal || permissions.canManageBankHours,
    '/ponto/folha-pagamento': isAdministrator || isDepartmentPessoal || permissions.canAccessPayroll,
    '/relatorios/alocacao': isAdministrator || isDepartmentPessoal || permissions.canAccessPayroll,
    '/ponto/centros-custo': isAdministrator || isDepartmentPessoal || can(pk('/ponto/centros-custo')),
    '/ponto/materiais-construcao': isAdministrator || isDepartmentPessoal || can(pk('/ponto/materiais-construcao')),
    '/ponto/andamento-da-os': canAccessOsRoutePage,
    '/ponto/permissoes': true,
    '/ponto/conversas-whatsapp': isAdministrator || isDepartmentPessoal || can(pk('/ponto/conversas-whatsapp')),
    '/ponto/financeiro': isAdministrator || can(pk('/ponto/financeiro')),
    '/ponto/financeiro/analise-extrato':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/analise-extrato')),
    '/ponto/financeiro/gestao-solicitacoes':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/gestao-solicitacoes')),
    '/ponto/orcamento': canAccessOrcamentoRoutePage,
    '/ponto/contratos': isAdministrator || can(pk('/ponto/contratos')),
    '/ponto/contratos/controle-geral': isAdministrator || can(pk('/ponto/contratos/controle-geral')),
    '/ponto/contratos/gastos-operacionais':
      isAdministrator || can(pk('/ponto/contratos/gastos-operacionais')),
    '/ponto/pleitos-gerados': isAdministrator || can(pk('/ponto/pleitos-gerados')),
    '/ponto/aprovacao-fds': isAdministrator || can(pk('/ponto/aprovacao-fds')),
    '/ponto/recebimento-entregas': canAccessRecebimentoEntregasRoutePage,
    '/ponto/espelho-nf': isAdministrator || can(pk('/ponto/espelho-nf')),
    '/ponto/prestadores-servico':
      isAdministrator ||
      can(pk('/ponto/espelho-nf/prestadores-servico')) ||
      can(pk('/ponto/espelho-nf')),
    '/ponto/tomadores-servico':
      isAdministrator ||
      can(pk('/ponto/espelho-nf/tomadores-servico')) ||
      can(pk('/ponto/espelho-nf')),
    '/ponto/contas-bancarias':
      isAdministrator ||
      can(pk('/ponto/espelho-nf/contas-bancarias')) ||
      can(pk('/ponto/espelho-nf')),
    '/ponto/codigos-tributarios':
      isAdministrator ||
      can(pk('/ponto/espelho-nf/codigos-tributarios')) ||
      can(pk('/ponto/espelho-nf')),
    '/ponto/licitacoes': isAdministrator || can(pk('/ponto/licitacoes')),
    '/ponto/contratos/medicao': isAdministrator || can(pk('/ponto/contratos/medicao')),
    '/ponto/solicitar-materiais': isAdministrator || can(pk('/ponto/solicitar-materiais')),
    '/ponto/gerenciar-materiais': isAdministrator || isDepartmentCompras || can(pk('/ponto/gerenciar-materiais')),
    '/ponto/mapa-cotacao': isAdministrator || isDepartmentCompras || can(pk('/ponto/mapa-cotacao')),
    '/ponto/ordem-de-compra': isAdministrator || isDepartmentCompras || can(pk('/ponto/ordem-de-compra')),
    '/ponto/controle-entregas': isAdministrator || can(pk('/ponto/controle-entregas')),
    '/ponto/estoque': isAdministrator || isDepartmentCompras || can(pk('/ponto/estoque')),
    '/ponto/ajuste-estoque': isAdministrator || isDepartmentCompras || can(pk('/ponto/ajuste-estoque')),
    '/ponto/furo-estoque': isAdministrator || isDepartmentCompras || can(pk('/ponto/furo-estoque')),
    '/ponto/fds-aprovadas':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/fds-aprovadas')),
    '/ponto/solicitacoes-combustivel':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/solicitacoes-combustivel')),
    '/ponto/solicitacoes-reserva-veiculos':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/solicitacoes-reserva-veiculos')),
    '/ponto/fornecedores': isAdministrator || isDepartmentCompras || can(pk('/ponto/fornecedores')),
    '/ponto/veiculos': isAdministrator || isDepartmentCompras || can(pk('/ponto/veiculos')),
    '/ponto/reserva-veiculos':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/reserva-veiculos')),
    '/ponto/condicoes-pagamento':
      isAdministrator || isDepartmentCompras || can(pk('/ponto/condicoes-pagamento')),
    '/ponto/natureza-orcamentaria':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/natureza-orcamentaria')),
    '/ponto/juridico':
      isAdministrator || isDepartmentJuridico || can(pk('/ponto/juridico')),
    '/ponto/financeiro/controle-financeiro':
      isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/controle-financeiro')),
    '/ponto/financeiro/controle-nfs':
      isAdministrator ||
      isDepartmentFinanceiro ||
      can(pk('/ponto/financeiro/controle-nfs')) ||
      can(pk('/ponto/financeiro/analise-extrato')) ||
      can(pk('/ponto/financeiro/controle-financeiro')),
  };

  return {
    hasAccess: routePermissions[route] ?? true,
    isLoading: false,
  };
}

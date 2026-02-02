import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { CARGOS_LIST } from '@/constants/cargos';

// Função para gerar permissões baseadas na lista de cargos
const generatePositionPermissions = () => {
  const permissions: Record<string, any> = {};
  
  // Permissões para Administrador - Acesso total
  permissions['Administrador'] = {
    canAccessPayroll: true,
    canManageEmployees: true,
    canViewReports: true,
    canManageVacations: true,
    canManageAbsences: true,
    canManageBankHours: true,
    canViewBirthdays: true,
    canRegisterTime: true,
    canViewDashboard: true,
  };
  
  CARGOS_LIST.forEach(cargo => {
    // Pular Administrador pois já foi definido acima
    if (cargo === 'Administrador') return;
    // Definir permissões baseadas no cargo
    if (cargo === 'Diretor') {
      // DIREÇÃO - Acesso total
      permissions[cargo] = {
        canAccessPayroll: true,
        canManageEmployees: true,
        canViewReports: true,
        canManageVacations: true,
        canManageAbsences: true,
        canManageBankHours: true,
        canViewBirthdays: true,
        canRegisterTime: true,
        canViewDashboard: true,
      };
    } else {
      // TODOS OS OUTROS CARGOS (Gerente, Coordenador, Supervisor, Encarregado, Mestre de Obras, Engenheiro, Orçamentista, etc.)
      // Permissões básicas: Registrar Ponto, Registrar Ausência, Correção de Ponto, Solicitar Férias
      permissions[cargo] = {
        canAccessPayroll: false,
        canManageEmployees: false,
        canViewReports: false,
        canManageVacations: false, // Não pode gerenciar férias de outros, mas pode solicitar suas próprias
        canManageAbsences: false, // Não pode gerenciar ausências de outros, mas pode registrar suas próprias
        canManageBankHours: false,
        canViewBirthdays: false,
        canRegisterTime: true, // Pode registrar ponto
        canViewDashboard: false,
      };
    }
  });
  
  return permissions;
};

// Definição das permissões por cargo - Gerada dinamicamente
const POSITION_PERMISSIONS = generatePositionPermissions();

export function usePermissions() {
  const { data: userData, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const user = userData?.data;
  const userPosition = user?.employee?.position;
  const userDepartment = user?.employee?.department;

  const getPermissions = () => {
    if (!userPosition) {
      return POSITION_PERMISSIONS['Analista'];
    }
    
    // Se for Administrador, retornar permissões de acesso total
    if (userPosition === 'Administrador') {
      return POSITION_PERMISSIONS['Administrador'];
    }
    
    const permissions = POSITION_PERMISSIONS[userPosition as keyof typeof POSITION_PERMISSIONS] || POSITION_PERMISSIONS['Analista'];
    return permissions;
  };

  const permissions = getPermissions();

  // Verificar se o usuário é do Departamento Pessoal
  const isDepartmentPessoal = userDepartment?.toLowerCase().includes('departamento pessoal') || 
                               userDepartment?.toLowerCase().includes('pessoal');

  // Verificar se o usuário é do setor Projetos
  const isDepartmentProjetos = userDepartment?.toLowerCase().includes('projetos');

  // Verificar se o usuário é do setor Financeiro
  const isDepartmentFinanceiro = userDepartment?.toLowerCase().includes('financeiro');

  // Se for Departamento Pessoal, tem acesso total (exceto gerenciar solicitações)
  const finalPermissions = isDepartmentPessoal ? {
    canAccessPayroll: true,
    canManageEmployees: true,
    canViewReports: true,
    canManageVacations: true,
    canManageAbsences: true,
    canManageBankHours: true,
    canViewBirthdays: true,
    canRegisterTime: true,
    canViewDashboard: true,
  } : permissions;

  return {
    user,
    userPosition,
    userDepartment,
    isDepartmentPessoal,
    isDepartmentProjetos,
    isDepartmentFinanceiro,
    permissions: finalPermissions,
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

// Hook para verificar permissão de rota específica
export function useRoutePermission(route: string) {
  const { permissions, isLoading, isDepartmentPessoal, isDepartmentProjetos, isDepartmentFinanceiro, userPosition } = usePermissions();

  if (isLoading) {
    return { hasAccess: false, isLoading: true };
  }

  // Se for Administrador, tem acesso a todas as rotas
  const isAdministrator = userPosition === 'Administrador';
  
  const routePermissions: Record<string, boolean> = {
    '/ponto': isAdministrator || isDepartmentPessoal || permissions.canRegisterTime,
    '/ponto/dashboard': isAdministrator || isDepartmentPessoal || permissions.canViewDashboard,
    '/ponto/funcionarios': isAdministrator || isDepartmentPessoal || permissions.canManageEmployees,
    '/ponto/aniversariantes': isAdministrator || isDepartmentPessoal, // Administrador ou Departamento Pessoal
    '/ponto/atestados': true, // Todos podem registrar suas próprias ausências
    '/ponto/gerenciar-atestados': isAdministrator || isDepartmentPessoal, // Administrador ou Departamento Pessoal
    '/ponto/solicitacoes': true, // Todos podem ver suas próprias solicitações
    '/ponto/gerenciar-solicitacoes': isAdministrator || isDepartmentProjetos, // Administrador ou setor Projetos (DEPARTAMENTO PESSOAL NÃO TEM ACESSO)
    '/ponto/ferias': true, // Todos podem solicitar suas próprias férias
    '/ponto/gerenciar-ferias': isAdministrator || isDepartmentPessoal || permissions.canManageVacations,
    '/ponto/banco-horas': isAdministrator || isDepartmentPessoal || permissions.canManageBankHours,
    '/ponto/folha-pagamento': isAdministrator || isDepartmentPessoal || permissions.canAccessPayroll,
    '/relatorios/alocacao': isAdministrator || isDepartmentPessoal || permissions.canAccessPayroll,
    '/ponto/centros-custo': isAdministrator || isDepartmentPessoal, // Apenas Administrador ou Departamento Pessoal
    '/ponto/materiais-construcao': isAdministrator || isDepartmentPessoal, // Apenas Administrador ou Departamento Pessoal
  };

  return {
    hasAccess: routePermissions[route] ?? true,
    isLoading: false,
  };
}
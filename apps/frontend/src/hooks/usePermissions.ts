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
    if (cargo === 'Diretor' || cargo === 'Gerente') {
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
    } else if (cargo === 'Coordenador(a)' || cargo === 'Supervisor') {
      // COORDENAÇÃO - Acesso administrativo sem folha
      permissions[cargo] = {
        canAccessPayroll: false,
        canManageEmployees: cargo === 'Coordenador(a)',
        canViewReports: true,
        canManageVacations: cargo === 'Coordenador(a)',
        canManageAbsences: true,
        canManageBankHours: true,
        canViewBirthdays: true,
        canRegisterTime: true,
        canViewDashboard: false,
      };
    } else if (cargo === 'Encarregado' || cargo === 'Mestre de obras') {
      // SUPERVISÃO OPERACIONAL
      permissions[cargo] = {
        canAccessPayroll: false,
        canManageEmployees: false,
        canViewReports: true,
        canManageVacations: false,
        canManageAbsences: true,
        canManageBankHours: true,
        canViewBirthdays: true,
        canRegisterTime: true,
        canViewDashboard: false,
      };
    } else if (cargo === 'Engenheiro' || cargo === 'Orçamentista') {
      // TÉCNICO ESPECIALIZADO COM RELATÓRIOS
      permissions[cargo] = {
        canAccessPayroll: false,
        canManageEmployees: false,
        canViewReports: true,
        canManageVacations: false,
        canManageAbsences: false,
        canManageBankHours: false,
        canViewBirthdays: true,
        canRegisterTime: true,
        canViewDashboard: false,
      };
    } else {
      // TODOS OS OUTROS CARGOS - Acesso básico
      permissions[cargo] = {
        canAccessPayroll: false,
        canManageEmployees: false,
        canViewReports: false,
        canManageVacations: false,
        canManageAbsences: false,
        canManageBankHours: false,
        canViewBirthdays: true,
        canRegisterTime: true,
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
      console.log('User data from API:', res.data);
      return res.data;
    }
  });

  const user = userData?.data;
  const userPosition = user?.employee?.position;
  const userDepartment = user?.employee?.department;

  console.log('User object:', user);
  console.log('User position:', userPosition);
  console.log('User department:', userDepartment);

  const getPermissions = () => {
    if (!userPosition) {
      console.log('No user position found, using Analista permissions');
      return POSITION_PERMISSIONS['Analista'];
    }
    
    // Se for Administrador, retornar permissões de acesso total
    if (userPosition === 'Administrador') {
      return POSITION_PERMISSIONS['Administrador'];
    }
    
    const permissions = POSITION_PERMISSIONS[userPosition as keyof typeof POSITION_PERMISSIONS] || POSITION_PERMISSIONS['Analista'];
    console.log('Permissions for position', userPosition, ':', permissions);
    return permissions;
  };

  const permissions = getPermissions();

  // Verificar se o usuário é do Departamento Pessoal
  const isDepartmentPessoal = userDepartment?.toLowerCase().includes('departamento pessoal') || 
                               userDepartment?.toLowerCase().includes('pessoal');

  // Verificar se o usuário é do setor Projetos
  const isDepartmentProjetos = userDepartment?.toLowerCase().includes('projetos');

  return {
    user,
    userPosition,
    userDepartment,
    isDepartmentPessoal,
    isDepartmentProjetos,
    permissions,
    isLoading,
    canAccessPayroll: permissions.canAccessPayroll,
    canManageEmployees: permissions.canManageEmployees,
    canViewReports: permissions.canViewReports,
    canManageVacations: permissions.canManageVacations,
    canManageAbsences: permissions.canManageAbsences,
    canManageBankHours: permissions.canManageBankHours,
    canViewBirthdays: permissions.canViewBirthdays,
    canRegisterTime: permissions.canRegisterTime,
    canViewDashboard: permissions.canViewDashboard,
  };
}

// Hook para verificar permissão de rota específica
export function useRoutePermission(route: string) {
  const { permissions, isLoading, isDepartmentPessoal, isDepartmentProjetos, userPosition } = usePermissions();

  if (isLoading) {
    return { hasAccess: false, isLoading: true };
  }

  // Se for Administrador, tem acesso a todas as rotas
  const isAdministrator = userPosition === 'Administrador';
  
  const routePermissions: Record<string, boolean> = {
    '/ponto': isAdministrator || permissions.canRegisterTime,
    '/ponto/dashboard': isAdministrator || permissions.canViewDashboard,
    '/ponto/funcionarios': isAdministrator || permissions.canManageEmployees,
    '/ponto/aniversariantes': isAdministrator || permissions.canViewBirthdays,
    '/ponto/atestados': true, // Todos podem registrar suas próprias ausências
    '/ponto/gerenciar-atestados': isAdministrator || isDepartmentPessoal, // Administrador ou Departamento Pessoal
    '/ponto/solicitacoes': true, // Todos podem ver suas próprias solicitações
    '/ponto/gerenciar-solicitacoes': isAdministrator || isDepartmentProjetos, // Administrador ou setor Projetos
    '/ponto/ferias': true, // Todos podem solicitar suas próprias férias
    '/ponto/gerenciar-ferias': isAdministrator || permissions.canManageVacations,
    '/ponto/banco-horas': isAdministrator || permissions.canManageBankHours,
    '/ponto/folha-pagamento': isAdministrator || permissions.canAccessPayroll,
    '/relatorios/alocacao': isAdministrator || permissions.canAccessPayroll,
  };

  return {
    hasAccess: routePermissions[route] ?? true,
    isLoading: false,
  };
}
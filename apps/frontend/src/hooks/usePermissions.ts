import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { CARGOS_LIST } from '@/constants/cargos';

// Função para gerar permissões baseadas na lista de cargos
const generatePositionPermissions = () => {
  const permissions: Record<string, any> = {};
  
  CARGOS_LIST.forEach(cargo => {
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
        canViewDashboard: true,
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
        canViewDashboard: true,
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
        canViewDashboard: true,
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
        canViewDashboard: true,
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

  console.log('User object:', user);
  console.log('User position:', userPosition);

  const getPermissions = () => {
    if (!userPosition) {
      console.log('No user position found, using Analista permissions');
      return POSITION_PERMISSIONS['Analista'];
    }
    
    const permissions = POSITION_PERMISSIONS[userPosition as keyof typeof POSITION_PERMISSIONS] || POSITION_PERMISSIONS['Analista'];
    console.log('Permissions for position', userPosition, ':', permissions);
    return permissions;
  };

  const permissions = getPermissions();

  return {
    user,
    userPosition,
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
  const { permissions, isLoading } = usePermissions();

  if (isLoading) {
    return { hasAccess: false, isLoading: true };
  }

  const routePermissions: Record<string, boolean> = {
    '/ponto': permissions.canRegisterTime,
    '/ponto/folha-pagamento': permissions.canAccessPayroll,
    '/ponto/ferias': permissions.canManageVacations,
    '/ponto/atestados': permissions.canManageAbsences,
    '/ponto/banco-horas': permissions.canManageBankHours,
    '/ponto/aniversariantes': permissions.canViewBirthdays,
  };

  return {
    hasAccess: routePermissions[route] ?? true,
    isLoading: false,
  };
}
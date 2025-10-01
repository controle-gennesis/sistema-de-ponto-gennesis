'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Users, 
  Clock, 
  BarChart3, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  User,
  Calendar,
  FileText,
  UserPlus,
  Shield,
  ChevronLeft,
  ChevronRight,
  Lock,
  Timer,
  Stethoscope,
  Cake,
  FileSpreadsheet
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';

interface SidebarProps {
  userRole: 'EMPLOYEE';
  userName: string;
  onLogout: () => void;
  onMenuToggle?: (collapsed: boolean) => void;
}

export function Sidebar({ userRole, userName, onLogout, onMenuToggle }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { permissions, isLoading, userPosition, user } = usePermissions();

  const isEmployee = userRole === 'EMPLOYEE';

  // Menu items baseados no cargo do funcionário
  const getMenuItems = () => {
    const allMenuItems = [
      {
        name: 'Dashboard',
        href: '/ponto/dashboard',
        icon: Home,
        description: 'Visão geral do sistema',
        permission: permissions.canViewDashboard
      },
      {
        name: 'Registrar Ponto',
        href: '/ponto',
        icon: Clock,
        description: 'Bater ponto e consultar registros',
        permission: permissions.canRegisterTime
      },
      {
        name: 'Funcionários',
        href: '/ponto/funcionarios',
        icon: Users,
        description: 'Gerenciar funcionários',
        permission: permissions.canManageEmployees
      },
      {
        name: 'Registrar Ausência',
        href: '/ponto/atestados',
        icon: Stethoscope,
        description: 'Enviar e acompanhar ausências',
        permission: true // Todos podem registrar suas próprias ausências
      },
      {
        name: 'Gerenciar Ausências',
        href: '/ponto/gerenciar-atestados',
        icon: Stethoscope,
        description: 'Gerenciar todas as ausências',
        permission: permissions.canManageAbsences
      },
      {
        name: 'Aniversariantes',
        href: '/ponto/aniversariantes',
        icon: Cake,
        description: 'Ver aniversariantes do mês',
        permission: permissions.canViewBirthdays
      },
      {
        name: 'Banco de Horas',
        href: '/ponto/banco-horas',
        icon: Timer,
        description: 'Controle de banco de horas',
        permission: permissions.canManageBankHours
      },
      {
        name: 'Folha de Pagamento',
        href: '/ponto/folha-pagamento',
        icon: FileSpreadsheet,
        description: 'Gestão de folha de pagamento',
        permission: permissions.canAccessPayroll
      },
      {
        name: 'Férias',
        href: '/ponto/ferias',
        icon: Calendar,
        description: 'Solicitar e acompanhar férias',
        permission: true // Todos podem solicitar suas próprias férias
      },
      {
        name: 'Gerenciar Férias',
        href: '/ponto/gerenciar-ferias',
        icon: Calendar,
        description: 'Gerenciar férias dos funcionários',
        permission: permissions.canManageVacations
      }
    ];

    // Filtrar apenas os itens que o usuário tem permissão para acessar
    return allMenuItems.filter(item => item.permission);
  };

  const menuItems = getMenuItems();

  const isActive = (href: string) => {
    return pathname === href;
  };

  // Notificar o MainLayout sobre mudanças no estado do menu
  React.useEffect(() => {
    if (onMenuToggle) {
      onMenuToggle(isCollapsed);
    }
  }, [isCollapsed, onMenuToggle]);

  return (
    <>
      {/* Botão de menu mobile */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md hover:bg-gray-50"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full bg-white shadow-lg transform transition-all duration-300 ease-in-out z-50 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:fixed lg:shadow-lg ${
          isCollapsed ? 'w-20' : 'w-72'
        } flex flex-col overflow-y-auto`}
      >
        {/* Header */}
        <div className={`border-b border-gray-200 ${isCollapsed ? 'p-4' : 'p-6'}`}>
          <div className="flex items-center justify-between">
            {!isCollapsed && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                    <img src="../logo.png" alt="Logo Gennesis" className="w-12 h-12 object-contain" />
                  </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Gennesis</h1>
                  <p className="text-sm text-gray-600">Engenharia</p>
                </div>
              </div>
            )}
            {isCollapsed && (
              <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center mx-auto overflow-hidden">
                <img src="/logo.png" alt="Logo Gennesis" className="w-8 h-8 object-contain" />
              </div>
            )}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={`hidden lg:flex items-center rounded-lg transition-colors duration-200 hover:bg-gray-100 ${
                  isCollapsed ? 'justify-center w-12 h-12 mx-auto' : 'justify-center w-12 h-12 mx-auto'
                }`}
                title={isCollapsed ? 'Expandir menu' : 'Colapsar menu'}
              >
                {isCollapsed ? <ChevronRight className="w-5 h-5 flex-shrink-0" /> : <ChevronLeft className="w-5 h-5 flex-shrink-0" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="lg:hidden w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className={`border-b border-gray-200 ${isCollapsed ? 'p-2' : 'p-4'}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
            <div className="rounded-lg p-3">
              <User className="w-6 h-6 text-gray-600" />
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {userName}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {userPosition || 'Funcionário'}
                </p>
                {user?.employee?.department && (
                  <p className="text-xs text-gray-400 capitalize">
                    {user.employee.department}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 space-y-2 ${isCollapsed ? 'p-2' : 'p-4'} overflow-y-auto`}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center rounded-lg transition-colors duration-200 ${
                  isCollapsed 
                    ? 'justify-center w-12 h-12 mx-auto' 
                    : 'space-x-3 px-3 py-2'
                } ${
                  active
                    ? 'text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                title={isCollapsed ? item.name : undefined}
              >
                <div className={`rounded-lg p-3 ${
                  active ? 'bg-blue-100' : ''
                }`}>
                  <Icon className={`w-5 h-5 flex-shrink-0 ${
                    active ? 'text-blue-600' : 'text-gray-600'
                  }`} />
                </div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.description}</p>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Botões de ação - sempre visíveis na parte inferior */}
        <div className="flex-shrink-0">
          {/* Alterar Senha */}
          <div className={`border-t border-gray-200 ${isCollapsed ? 'p-2' : 'p-4'}`}>
            <button
              onClick={() => {
                // Emitir evento customizado para abrir modal de alterar senha
                window.dispatchEvent(new CustomEvent('openChangePasswordModal'));
              }}
              className={`flex items-center text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors duration-200 ${
                isCollapsed 
                  ? 'justify-center w-12 h-12 mx-auto' 
                  : 'w-full space-x-3 px-3 py-2'
              }`}
              title={isCollapsed ? 'Alterar Senha' : undefined}
            >
              <Lock className="w-5 h-5 flex-shrink-0 text-blue-700" />
              {!isCollapsed && <span className="text-sm font-medium text-blue-700">Alterar Senha</span>}
            </button>
          </div>

          {/* Logout */}
          <div className={`border-t border-gray-200 ${isCollapsed ? 'p-2' : 'p-4'}`}>
            <button
              onClick={onLogout}
              className={`flex items-center text-gray-700 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors duration-200 ${
                isCollapsed 
                  ? 'justify-center w-12 h-12 mx-auto' 
                  : 'w-full space-x-3 px-3 py-2'
              }`}
              title={isCollapsed ? 'Sair' : undefined}
            >
              <LogOut className="w-5 h-5 flex-shrink-0 text-red-700" />
              {!isCollapsed && <span className="text-sm font-medium text-red-700">Sair</span>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

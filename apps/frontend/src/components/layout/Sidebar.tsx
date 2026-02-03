'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Home, 
  Users, 
  Clock, 
  LogOut, 
  Menu, 
  X,
  User,
  PanelRightOpen,
  PanelLeftOpen,
  ChevronDown,
  ChevronUp,
  Lock,
  FolderClock,
  ImagePlus,
  CalendarDays,
  FileSpreadsheet,
  BookText,
  BookPlus,
  BookImage,
  Settings,
  BarChart3,
  FileText,
  Search,
  MoreVertical,
  LayoutDashboard,
  CalendarX2,
  MailPlus,
  Moon,
  Sun,
  AlertCircle,
  MessageSquare,
  DollarSign,
  Package,
  ShoppingCart,
  Building2,
  Bot
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useTheme } from '@/context/ThemeContext';

interface SidebarProps {
  userRole: 'EMPLOYEE';
  userName: string;
  onLogout: () => void;
  onMenuToggle?: (collapsed: boolean) => void;
}

export function Sidebar({ userRole, userName, onLogout, onMenuToggle }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Carregar estado do localStorage no carregamento inicial
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showButtonText, setShowButtonText] = useState(!isCollapsed);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { permissions, isLoading, userPosition, user, isDepartmentPessoal, isDepartmentProjetos, userDepartment } = usePermissions();
  const { theme, toggleTheme, isDark } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Verificar se é administrador
  const isAdministrator = userPosition === 'Administrador';
  
  // Verificar se o funcionário precisa bater ponto
  const requiresTimeClock = user?.employee?.requiresTimeClock !== false;
  
  // Verificar se é do departamento Compras
  const isDepartmentCompras = userDepartment?.toLowerCase().includes('compras');

  const handleLogout = () => {
    setShowUserMenu(false);
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  const handleCancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  // Fechar menu quando clicar fora dele
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu && isCollapsed) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu, isCollapsed]);

  const isEmployee = userRole === 'EMPLOYEE';

  // Função para extrair iniciais do nome do usuário (primeiro e segundo nome)
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Menu items agrupados por categoria
  const getMenuItems = () => {
    const menuCategories = [
      {
        id: 'main',
        name: 'Principal',
        icon: Home,
        items: [
          {
            name: 'Dashboard',
            href: '/ponto/dashboard',
            icon: LayoutDashboard,
            description: 'Visão geral do sistema',
            permission: isAdministrator || isDepartmentPessoal || permissions.canViewDashboard
          },
          {
            name: 'Assistente Virtual',
            href: '/ponto/chatgpt',
            icon: Bot,
            description: 'Tire suas dúvidas com o ChatGPT',
            permission: true // Todos os usuários podem usar
          }
        ]
      },
      {
        id: 'departamento-pessoal',
        name: 'Departamento Pessoal',
        icon: Users,
        items: [
          {
            name: 'Folha de Pagamento',
            href: '/ponto/folha-pagamento',
            icon: FileSpreadsheet,
            description: 'Gestão de folha de pagamento',
            permission: isAdministrator || isDepartmentPessoal || permissions.canAccessPayroll
          },
          {
            name: 'Ausências',
            href: '/ponto/atestados',
            icon: CalendarX2,
            description: 'Registrar e gerenciar ausências',
            permission: true // Todos podem registrar suas próprias ausências
          },
          {
            name: 'Gerenciar Ausências',
            href: '/ponto/gerenciar-atestados',
            icon: BookText,
            description: 'Gerenciar todas as ausências',
            permission: isAdministrator || isDepartmentPessoal
          },
          {
            name: 'Solicitações',
            href: '/ponto/solicitacoes',
            icon: MailPlus,
            description: 'Minhas solicitações de correção',
            permission: true // Todos podem ver suas próprias solicitações
          },
          {
            name: 'Gerenciar Solicitações',
            href: '/ponto/gerenciar-solicitacoes',
            icon: FileText,
            description: 'Aprovar solicitações de correção',
            permission: isAdministrator || isDepartmentProjetos // Administrador ou setor Projetos
          },
          {
            name: 'Férias',
            href: '/ponto/ferias',
            icon: ImagePlus,
            description: 'Solicitar e acompanhar férias',
            permission: true // Todos podem solicitar suas próprias férias
          },
          {
            name: 'Gerenciar Férias',
            href: '/ponto/gerenciar-ferias',
            icon: BookImage,
            description: 'Gerenciar férias dos funcionários',
            permission: isAdministrator || isDepartmentPessoal || permissions.canManageVacations
          },
          {
            name: 'Gerenciar Feriados',
            href: '/ponto/gerenciar-feriados',
            icon: CalendarDays,
            description: 'Gerenciar calendário de feriados',
            permission: isAdministrator || isDepartmentPessoal || permissions.canManageVacations
          },
          {
            name: 'Banco de Horas',
            href: '/ponto/banco-horas',
            icon: FolderClock,
            description: 'Controle de banco de horas',
            permission: isAdministrator || isDepartmentPessoal || permissions.canManageBankHours
          },
          {
            name: 'Alocação',
            href: '/relatorios/alocacao',
            icon: Users,
            description: 'Alocação de funcionários',
            permission: isAdministrator || permissions.canAccessPayroll
          }
        ]
      },
      {
        id: 'financeiro',
        name: 'Financeiro',
        icon: DollarSign,
        items: [
          {
            name: 'Financeiro',
            href: '/ponto/financeiro',
            icon: DollarSign,
            description: 'Gerar borderô e CNAB400 para pagamentos',
            permission: isAdministrator // Apenas administrador
          }
        ]
      },
      {
        id: 'suprimentos',
        name: 'Suprimentos',
        icon: Package,
        items: [
          {
            name: 'Solicitar Materiais',
            href: '/ponto/solicitar-materiais',
            icon: ShoppingCart,
            description: 'Solicitar materiais para compra',
            permission: true // Todos podem solicitar materiais
          },
          {
            name: 'Gerenciar Requisições de Materiais',
            href: '/ponto/gerenciar-materiais',
            icon: Package,
            description: 'Aprovar e gerenciar requisições de materiais',
            permission: isAdministrator || isDepartmentCompras // Administrador ou departamento Compras
          }
        ]
      },
      {
        id: 'cadastros',
        name: 'Cadastros',
        icon: BarChart3,
        items: [
          {
            name: 'Centros de Custo',
            href: '/ponto/centros-custo',
            icon: Building2,
            description: 'Gerenciar centros de custo',
            permission: isAdministrator || isDepartmentPessoal // Apenas Administrador ou Departamento Pessoal
          },
          {
            name: 'Materiais de Construção',
            href: '/ponto/materiais-construcao',
            icon: Package,
            description: 'Gerenciar materiais de construção civil',
            permission: isAdministrator || isDepartmentPessoal // Apenas Administrador ou Departamento Pessoal
          }
        ]
      },
      {
        id: 'time-control',
        name: 'Registros de Ponto',
        icon: Clock,
        items: [
          {
            name: 'Registros de Ponto',
            href: '/ponto',
            icon: FolderClock,
            description: 'Gerencie seus registros',
            permission: (isAdministrator || isDepartmentPessoal || permissions.canRegisterTime) && requiresTimeClock
          }
        ]
      }
    ];

    // Filtrar categorias que têm pelo menos um item com permissão
    let filteredCategories = menuCategories.filter(category => 
      category.items.some(item => item.permission)
    );

    // Aplicar filtro de pesquisa se houver termo de busca
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filteredCategories = filteredCategories
        .map(category => {
          // Filtrar itens dentro da categoria
          const filteredItems = category.items.filter(item => {
            if (!item.permission) return false;
            const matchesName = item.name.toLowerCase().includes(searchLower);
            const matchesDescription = item.description?.toLowerCase().includes(searchLower) || false;
            return matchesName || matchesDescription;
          });

          // Retornar categoria apenas se tiver itens após o filtro
          return filteredItems.length > 0 ? { ...category, items: filteredItems } : null;
        })
        .filter(category => category !== null) as typeof menuCategories;
    }

    return filteredCategories;
  };

  const menuItems = getMenuItems();

  const isActive = (href: string) => {
    return pathname === href;
  };

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(menuId)) {
        newSet.delete(menuId);
      } else {
        newSet.add(menuId);
      }
      return newSet;
    });
  };

  const isMenuExpanded = (menuId: string) => {
    return expandedMenus.has(menuId);
  };

  // Expandir automaticamente grupos com páginas ativas na inicialização
  React.useEffect(() => {
    const activeCategories = menuItems.filter(category => 
      category.items.some(item => isActive(item.href))
    );
    
    if (activeCategories.length > 0) {
      const newExpandedMenus = new Set(expandedMenus);
      activeCategories.forEach(category => {
        newExpandedMenus.add(category.id);
      });
      setExpandedMenus(newExpandedMenus);
    }
  }, [pathname]); // Executa quando a rota muda

  // Expandir automaticamente todos os grupos quando houver pesquisa
  React.useEffect(() => {
    if (searchTerm.trim()) {
      const allCategoryIds = menuItems.map(category => category.id);
      setExpandedMenus(new Set(allCategoryIds));
    }
  }, [searchTerm]); // Executa quando o termo de pesquisa muda

  // Salvar estado no localStorage sempre que mudar
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed));
    }
  }, [isCollapsed]);

  // Notificar o MainLayout sobre mudanças no estado do menu
  React.useEffect(() => {
    if (onMenuToggle) {
      onMenuToggle(isCollapsed);
    }
  }, [isCollapsed, onMenuToggle]);

  // Controlar quando mostrar o texto dos botões
  React.useEffect(() => {
    setShowButtonText(!isCollapsed);
  }, [isCollapsed]);

  return (
    <>
      {/* Botão de menu mobile */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-900 rounded-lg shadow-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
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
        className={`fixed top-0 left-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-all duration-500 ease-in-out z-50 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:fixed ${
          isCollapsed ? 'w-20' : 'w-72'
        } flex flex-col ${isCollapsed ? 'overflow-visible' : 'overflow-hidden'}`}
      >
        {/* Header */}
        <div className={`${isCollapsed ? 'p-4' : 'p-4'} overflow-hidden`}>
          <div className={`flex items-center overflow-hidden ${
            isCollapsed ? 'flex-col justify-center space-y-3' : 'justify-between'
          }`}>
            {isCollapsed ? (
              /* Quando colapsada: logo acima do botão */
              <>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
                  <img src="../loogo.png" alt="Logo Gennesis" className="w-12 h-12 object-contain" />
                </div>
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="hidden lg:flex items-center justify-center rounded-lg transition-colors duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-8 h-8"
                  title="Expandir menu"
                >
                  <PanelLeftOpen className="w-5 h-5 flex-shrink-0" />
                </button>
              </>
            ) : (
              /* Quando expandida: logo e texto à esquerda, botão à direita */
              <>
                <div className="flex items-center space-x-3 transition-opacity duration-500 ease-in-out">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
                    <img src="../loogo.png" alt="Logo Gennesis" className="w-12 h-12 object-contain" />
                  </div>
                  <div className="transition-all duration-500 ease-in-out">
                    <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 transition-all duration-500">Attendance</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 transition-all duration-500">v1.0.2</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="hidden lg:flex items-center justify-center rounded-lg transition-colors duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-8 h-8"
                    title="Colapsar menu"
                  >
                    <PanelRightOpen className="w-5 h-5 flex-shrink-0" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="lg:hidden w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search Bar */}
        {!isCollapsed ? (
          <div className="px-4">
            <div className="relative flex items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mt-2 mb-2 text-sm w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4">
            <div className="flex justify-center">
              <button
                onClick={() => {
                  setIsCollapsed(false);
                  // Focar no input após a sidebar abrir (aguardar a transição)
                  setTimeout(() => {
                    searchInputRef.current?.focus();
                  }, 300);
                }}
                className="w-10 h-10 rounded-xl bg-white hover:bg-gray-200 hover:text-gray-400 dark:bg-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-transparent"
                title="Buscar"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-1 space-y-2 p-4 ${isCollapsed ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden'}`}>
          {(() => {
            return menuItems.map((category, index) => {
            const CategoryIcon = category.icon;
            const hasActiveItem = category.items.some(item => isActive(item.href));
            const isExpanded = isMenuExpanded(category.id);
            const visibleItems = category.items.filter(item => item.permission);
            const isSingleItem = visibleItems.length === 1;
            const singleItem = isSingleItem ? visibleItems[0] : null;
            
            // Verificar se é o primeiro grupo (categoria com mais de um item visível)
            const previousCategories = menuItems.slice(0, index).filter(cat => {
              const catVisibleItems = cat.items.filter(item => item.permission);
              return catVisibleItems.length > 0;
            });
            const previousGroups = previousCategories.filter(cat => {
              const catVisibleItems = cat.items.filter(item => item.permission);
              return catVisibleItems.length > 1;
            });
            const isFirstGroup = previousGroups.length === 0 && visibleItems.length > 1;
            
            // Se tiver apenas um item, renderizar como link direto
            if (isSingleItem && singleItem) {
              
              const active = isActive(singleItem.href);
              const SingleItemIcon = singleItem.icon || CategoryIcon;
              
              return (
                <div key={category.id}>
                  <div className={`${isCollapsed ? 'space-y-2' : 'space-y-1'}`}>
                    {isCollapsed ? (
                      <div className="flex justify-center">
                        <Link
                          href={singleItem.href}
                          onClick={() => setIsOpen(false)}
                          className={`w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center ${
                            active 
                              ? 'text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                          title={singleItem.name}
                        >
                          <SingleItemIcon className="w-5 h-5" />
                        </Link>
                      </div>
                    ) : (
                      <Link
                        href={singleItem.href}
                        onClick={() => setIsOpen(false)}
                        className={`w-full flex items-center space-x-2 rounded-xl transition-all duration-200 overflow-hidden ${
                          active 
                            ? 'text-red-700 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div className="rounded-xl transition-all duration-200 p-3">
                          <SingleItemIcon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-red-600 dark:text-red-500' : 'text-gray-600 dark:text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className={`text-sm font-medium whitespace-nowrap ${active ? 'text-red-700 dark:text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>{singleItem.name}</p>
                        </div>
                      </Link>
                    )}
                  </div>
                </div>
              );
            }
            
            return (
              <div key={category.id} className="overflow-hidden">
                {/* Título "Menu" antes do primeiro grupo */}
                {isFirstGroup && !isCollapsed && (
                  <div className="px-3 pt-2 pb-2">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Menu</p>
                  </div>
                )}
                {/* Separador entre grupos */}
                
                <div className={`${isCollapsed ? 'space-y-2' : 'space-y-1'} overflow-hidden`}>
                {/* Categoria Header */}
                {isCollapsed ? (
                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        // Abrir a sidebar e expandir o grupo
                        setIsCollapsed(false);
                        setExpandedMenus(prev => {
                          const newSet = new Set(prev);
                          newSet.add(category.id);
                          return newSet;
                        });
                      }}
                        className={`w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center ${
                          hasActiveItem 
                            ? 'text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      title={category.name}
                    >
                      <CategoryIcon className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => toggleMenu(category.id)}
                    className={`w-full flex items-center space-x-2 rounded-xl transition-all duration-200 overflow-hidden ${
                      hasActiveItem 
                        ? 'text-red-700 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="rounded-xl transition-all duration-200 p-3">
                      <CategoryIcon className={`w-5 h-5 flex-shrink-0 ${hasActiveItem ? 'text-red-600 dark:text-red-500' : 'text-gray-600 dark:text-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0 text-left overflow-hidden">
                        <p className={`text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis ${hasActiveItem ? 'text-red-700 dark:text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>{category.name}</p>
                    </div>
                    {category.items.filter(item => item.permission).length > 0 && (
                      <div className="flex-shrink-0 pr-3">
                        {isExpanded ? (
                          <ChevronUp className={`w-4 h-4 ${hasActiveItem ? 'text-red-600 dark:text-red-500' : 'text-gray-600 dark:text-gray-400'}`} />
                        ) : (
                          <ChevronDown className={`w-4 h-4 ${hasActiveItem ? 'text-red-600 dark:text-red-500' : 'text-gray-600 dark:text-gray-400'}`} />
                        )}
                      </div>
                    )}
                  </button>
                )}

                {/* Submenu Items */}
                {isExpanded && !isCollapsed && (
                  <div className="relative ml-6 pl-4 border-l border-gray-300 dark:border-gray-700 space-y-2">
                    {category.items
                      .filter(item => item.permission)
                      .map((item) => {
                        const active = isActive(item.href);
            
                        return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                            className={`flex items-center px-3 py-2 rounded-xl transition-all duration-200 overflow-hidden ${
                              active
                                ? 'text-red-700 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            <p className={`text-sm font-medium ${active ? '' : 'text-gray-700 dark:text-gray-300'}`}>{item.name}</p>
              </Link>
                        );
                      })}
                  </div>
                )}
                </div>
              </div>
            );
            });
          })()}
        </nav>

        {/* Perfil do usuário */}
        <div className={`flex-shrink-0 relative ${isCollapsed ? 'overflow-visible' : 'overflow-hidden'}`}>
          {/* Linha separadora acima do perfil */}
          <div className="mx-4">
            <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
          </div>
          
          <div className="relative">
            {/* Seção de perfil - sempre visível quando expandida */}
            <div className="bg-white dark:bg-gray-900">
              <div className={`${isCollapsed ? 'p-2' : 'p-4'}`}>
                {isCollapsed ? (
                  /* Quando colapsada: apenas os 3 pontos */
                  <div className="flex justify-center">
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="Menu do usuário"
                    >
                      <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>
                ) : (
                  /* Quando expandida: foto, nome, cargo e botão de menu */
                  <div className="flex items-center space-x-3">
                    {/* Foto do perfil */}
                    <div className="flex-shrink-0 relative">
                      {user?.photo ? (
                        <img 
                          src={user.photo} 
                          alt={user?.name || userName} 
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-transparent border-2 border-red-500 flex items-center justify-center">
                          <span className="text-sm font-semibold text-red-500">
                            {getInitials(user?.name || userName)}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Informações do usuário */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {isAdministrator ? 'Administrador' : (user?.name || userName)}
                      </p>
                      {!isAdministrator && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {user?.position || userPosition}
                        </p>
                      )}
                    </div>
                    
                    {/* Botão de menu (3 pontos) */}
                    <div className="relative">
                      <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        title="Menu do usuário"
                      >
                        <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Menu de botões que desliza de baixo para cima com animação */}
            <div 
              className={`bg-white dark:bg-gray-900 transition-all duration-300 ease-in-out overflow-hidden ${
                showUserMenu 
                  ? 'max-h-[300px] opacity-100 translate-y-0' 
                  : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'
              }`}
            >
                {/* Linha separadora superior */}
                <div className="mx-4">
                  <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
                </div>
                
                {isCollapsed ? (
                  /* Quando colapsada: apenas ícones */
                  <div className="p-2 flex flex-col items-center space-y-2">
                    <button
                      onClick={() => {
                        toggleTheme();
                      }}
                      className="w-10 h-10 flex items-center justify-center group transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      title={isDark ? 'Modo Claro' : 'Modo Escuro'}
                    >
                      {isDark ? (
                        <Sun className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-yellow-600 dark:group-hover:text-yellow-500" />
                      ) : (
                        <Moon className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('openChangePasswordModal'));
                        setShowUserMenu(false);
                      }}
                      className="w-10 h-10 flex items-center justify-center group transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      title="Alterar Senha"
                    >
                      <Lock className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-blue-700 dark:group-hover:text-blue-500" />
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-10 h-10 flex items-center justify-center group transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      title="Sair"
                    >
                      <LogOut className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-red-700 dark:group-hover:text-red-500" />
                    </button>
                  </div>
                ) : (
                  /* Quando expandida: ícones com texto */
                  <div className="p-2">
                    <button
                      onClick={() => {
                        toggleTheme();
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 group transition-colors rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {isDark ? (
                        <Sun className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-yellow-600 dark:group-hover:text-yellow-500" />
                      ) : (
                        <Moon className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300" />
                      )}
                      <span className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                        {isDark ? 'Modo Claro' : 'Modo Escuro'}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('openChangePasswordModal'));
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 group transition-colors rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Lock className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-blue-700 dark:group-hover:text-blue-500" />
                      <span className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">Alterar Senha</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-3 px-4 py-3 group transition-colors rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <LogOut className="w-5 h-5 flex-shrink-0 text-gray-600 dark:text-gray-400 group-hover:text-red-700 dark:group-hover:text-red-500" />
                      <span className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">Sair</span>
                    </button>
                  </div>
                )}
              </div>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação de Logout */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={handleCancelLogout} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
              <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
              Deseja sair?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
              Tem certeza que deseja sair do sistema? Você precisará fazer login novamente para acessar.
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                type="button"
                onClick={handleCancelLogout}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

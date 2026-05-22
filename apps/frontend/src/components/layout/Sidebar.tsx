'use client';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { CircularPhotoCropModal } from '@/components/conversas/CircularPhotoCropModal';
import { 
  Home, 
  Users, 
  Clock, 
  LogOut, 
  Menu, 
  X,
  User,
  ArrowLeftToLine,
  Lock,
  Settings,
  FolderClock,
  ImagePlus,
  CalendarDays,
  FileSpreadsheet,
  BookText,
  BookPlus,
  BookImage,
  BarChart3,
  FileText,
  Search,
  LayoutDashboard,
  CalendarX2,
  MailPlus,
  Moon,
  Sun,
  AlertCircle,
  MessageSquare,
  MessagesSquare,
  FileCheck,
  DollarSign,
  Package,
  PackageX,
  Warehouse,
  ShoppingCart,
  Building2,
  Cake,
  DraftingCompass,
  Database,
  ClipboardList,
  CreditCard,
  HardDrive,
  SquareKanban,
  Truck,
  Landmark,
  Percent,
  Contact,
  Scale,
  ScrollText,
  Camera,
  Loader2
} from 'lucide-react';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { usePermissions } from '@/hooks/usePermissions';
import { readSidebarCollapsed, writeSidebarCollapsed } from '@/lib/sidebarStorage';

const pk = pathToModuleKey;
import { useTheme } from '@/context/ThemeContext';

/** Atalhos do rodapé do rail — fora das categorias do menu lateral */
const RAIL_FOOTER_ROUTES = ['/ponto/conversas', '/ponto/kanban', '/ponto/drive'] as const;

function isRailFooterRoute(pathname: string | null): boolean {
  if (pathname == null) return false;
  return RAIL_FOOTER_ROUTES.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`)
  );
}

interface SidebarProps {
  userRole: 'EMPLOYEE';
  userName: string;
  onLogout: () => void;
  onMenuToggle?: (collapsed: boolean) => void;
}

export function Sidebar({ userRole, userName, onLogout, onMenuToggle }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [sidebarHydrated, setSidebarHydrated] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('main');
  const [searchTerm, setSearchTerm] = useState('');
  const tier2Visible = !isCollapsed || isOpen;
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const {
    permissions,
    isLoading,
    userPosition,
    user,
    isDepartmentPessoal,
    isDepartmentProjetos,
    userDepartment,
    can,
    canAccessDpApproverPages,
    canApproveEspelhoNf,
    canAccessOsRoutePage,
  } = usePermissions();
  const { theme, toggleTheme, isDark } = useTheme();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarSectionRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [profileAvatarMenu, setProfileAvatarMenu] = useState(false);
  const [profileCropSrc, setProfileCropSrc] = useState<string | null>(null);

  const { data: chatUnreadCount = 0 } = useQuery({
    queryKey: ['chat-unread-count', user?.id],
    queryFn: async () => {
      const res = await api.get('/chats/direct');
      const chats = (res.data?.data ?? []) as Array<{ messages?: Array<{ isRead: boolean; senderId: string }> }>;
      return chats.reduce((acc, chat) => {
        const unread = (chat.messages ?? []).filter(
          (m) => !m.isRead && m.senderId !== user?.id
        ).length;
        return acc + unread;
      }, 0);
    },
    enabled: !!user?.id,
    refetchInterval: 5000,
  });
  
  // Verificar se é administrador
  const isAdministrator = userPosition === 'Administrador';
  
  // Verificar se o funcionário precisa bater ponto
  const requiresTimeClock = user?.employee?.requiresTimeClock !== false;
  
  // Verificar se é do departamento Compras
  const isDepartmentCompras = userDepartment?.toLowerCase().includes('compras');
  
  // Verificar se é do departamento Financeiro
  const isDepartmentFinanceiro = userDepartment?.toLowerCase().includes('financeiro');

  // Verificar se é do departamento Jurídico
  const isDepartmentJuridico = userDepartment?.toLowerCase().includes('jurídico') ||
    userDepartment?.toLowerCase().includes('juridico');

  const handleLogout = () => {
    setProfileAvatarMenu(false);
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  const handleCancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  const uploadProfilePhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('profileAvatar', file);
      await api.patch('/auth/me/photo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Foto de perfil atualizada');
      setProfileCropSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    },
    onError: () => toast.error('Não foi possível atualizar a foto'),
  });

  const removeProfilePhotoMutation = useMutation({
    mutationFn: async () => {
      await api.delete('/auth/me/photo');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Foto removida');
      setProfileAvatarMenu(false);
    },
    onError: () => toast.error('Não foi possível remover a foto'),
  });

  const profilePhotoHref = resolveApiMediaUrl(user?.profilePhotoUrl ?? null);

  // Fechar menu quando clicar fora dele
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (profileAvatarSectionRef.current?.contains(t)) return;
      setProfileAvatarMenu(false);
    };

    if (profileAvatarMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileAvatarMenu]);

  const isEmployee = userRole === 'EMPLOYEE';

  // Função para extrair iniciais do nome do usuário (primeiro e segundo nome)
  const getInitials = (name: string | undefined | null) => {
    if (!name) return 'U';
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
            name: 'Processos do Fluig',
            href: '/ponto/financeiro/gestao-solicitacoes',
            icon: BarChart3,
            description: 'Solicitações do Fluig na visão financeira',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/gestao-solicitacoes'))
          },
          {
            name: 'Central de Atendimentos',
            href: '/ponto/conversas-whatsapp',
            icon: MessageSquare,
            description: 'Conversas do chatbot WhatsApp para o pessoal ver',
            permission: isAdministrator || isDepartmentPessoal || can(pk('/ponto/conversas-whatsapp'))
          },
          {
            name: 'Aprovações',
            href: '/ponto/aprovacoes',
            icon: FileCheck,
            description: 'Caixa de entrada de aprovações',
            // Aparece automaticamente para quem é gestor (decide Solicitações Gerais)
            // ou tem a permissão «Aprovar Espelho da Nota Fiscal» (Controle).
            permission: canAccessDpApproverPages || canApproveEspelhoNf,
          },
          {
            name: 'Solicitações Gerais',
            href: '/ponto/solicitacoes-gerais',
            icon: MailPlus,
            description: 'Minhas solicitações ao DP',
            permission: isAdministrator || can(pk('/ponto/solicitacoes-dp'))
          },
        ]
      },
      {
        id: 'departamento-pessoal',
        name: 'Departamento Pessoal',
        icon: Users,
        items: [
          {
            name: 'Funcionários',
            href: '/ponto/funcionarios',
            icon: Users,
            description: 'Cadastrar e gerenciar funcionários',
            permission: isAdministrator || isDepartmentPessoal || permissions.canManageEmployees
          },
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
            permission: isAdministrator || can(pk('/ponto/atestados'))
          },
          {
            name: 'Gerenciar Ausências',
            href: '/ponto/gerenciar-atestados',
            icon: BookText,
            description: 'Gerenciar todas as ausências',
            permission: isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-atestados'))
          },
          {
            name: 'Alterações de Ponto',
            href: '/ponto/solicitacoes',
            icon: MailPlus,
            description: 'Solicitar e acompanhar alterações de marcação do ponto',
            permission: isAdministrator || can(pk('/ponto/solicitacoes'))
          },
          {
            name: 'Gerenciar Alterações de Ponto',
            href: '/ponto/gerenciar-solicitacoes',
            icon: FileText,
            description: 'Analisar e aprovar alterações de marcação dos colaboradores',
            permission: isAdministrator || can(pk('/ponto/gerenciar-solicitacoes'))
          },
          {
            name: 'Gerenciar Solicitações Gerais',
            href: '/ponto/gerenciar-solicitacoes-gerais',
            icon: FileText,
            description: 'Aprovar solicitações do DP',
            permission:
              isAdministrator || isDepartmentPessoal || can(pk('/ponto/gerenciar-solicitacoes-dp')),
          },
          {
            name: 'Férias',
            href: '/ponto/ferias',
            icon: ImagePlus,
            description: 'Solicitar e acompanhar férias',
            permission: isAdministrator || can(pk('/ponto/ferias'))
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
          },
          {
            name: 'Aniversariantes',
            href: '/ponto/aniversariantes',
            icon: Cake,
            description: 'Ver aniversariantes do mês',
            permission: isAdministrator || can(pk('/ponto/aniversariantes'))
          }
        ]
      },
      {
        id: 'financeiro',
        name: 'Financeiro',
        icon: Landmark,
        items: [
          {
            name: 'Controle Financeiro',
            href: '/ponto/financeiro/controle-financeiro',
            icon: ClipboardList,
            description: 'Controle de Material/Serviço Aplicado por mês e ano',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/controle-financeiro'))
          },
          {
            name: 'Extrato de Caixa',
            href: '/ponto/financeiro/analise-extrato',
            icon: BarChart3,
            description: 'Acompanhe o extrato de caixa',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/financeiro/analise-extrato'))
          },
          {
            name: 'Financeiro',
            href: '/ponto/financeiro',
            icon: DollarSign,
            description: 'Gerar borderô e CNAB400 para pagamentos',
            permission: isAdministrator || can(pk('/ponto/financeiro'))
          },
        ]
      },
      {
        id: 'engenharia',
        name: 'Engenharia',
        icon: DraftingCompass,
        items: [
          {
            name: 'Contratos',
            href: '/ponto/contratos',
            icon: FileText,
            description: 'Cadastro de contratos da engenharia',
            permission: isAdministrator || can(pk('/ponto/contratos'))
          },
          {
            name: 'Controle Geral de Contratos',
            href: '/ponto/contratos/controle-geral',
            icon: LayoutDashboard,
            description: 'Visão consolidada de todos os contratos',
            permission: isAdministrator || can(pk('/ponto/contratos/controle-geral'))
          },
          {
            name: 'Ordem de Serviço',
            href: '/ponto/andamento-da-os',
            icon: ClipboardList,
            description: 'Acompanhamento e controle das ordens de serviço',
            permission: canAccessOsRoutePage
          },
          {
            name: 'Pleitos Gerados',
            href: '/ponto/pleitos-gerados',
            icon: FileCheck,
            description: 'Visualizar todos os pleitos com valor pleiteado',
            permission: isAdministrator || can(pk('/ponto/pleitos-gerados'))
          }
        ]
      },
      {
        id: 'contratos-licitacoes',
        name: 'Contratos e Licitações',
        icon: ScrollText,
        items: [
          {
            name: 'Espelho da Nota Fiscal',
            href: '/ponto/espelho-nf',
            icon: FileSpreadsheet,
            description: 'Montar o espelho da nota fiscal',
            permission: isAdministrator || can(pk('/ponto/espelho-nf'))
          },
          {
            name: 'Licitações',
            href: '/ponto/licitacoes',
            icon: ClipboardList,
            description: 'Acompanhar processos de licitação',
            permission: isAdministrator || can(pk('/ponto/licitacoes'))
          },
          {
            name: 'Medições',
            href: '/ponto/contratos/medicao',
            icon: FileSpreadsheet,
            description: 'Importar e visualizar planilhas de medição',
            permission: isAdministrator || can(pk('/ponto/contratos/medicao'))
          }
        ]
      },
      {
        id: 'juridico',
        name: 'Jurídico',
        icon: Scale,
        items: [
          {
            name: 'Processos Trabalhistas',
            href: '/ponto/juridico',
            icon: Scale,
            description: 'Acompanhe status, acordos e valores dos processos',
            permission: isAdministrator || isDepartmentJuridico || can(pk('/ponto/juridico'))
          }
        ]
      },
      {
        id: 'suprimentos',
        name: 'Suprimentos',
        icon: Warehouse,
        items: [
          {
            name: 'Solicitar Materiais',
            href: '/ponto/solicitar-materiais',
            icon: ShoppingCart,
            description: 'Solicitar materiais para compra (SC)',
            permission: isAdministrator || can(pk('/ponto/solicitar-materiais'))
          },
          {
            name: 'Requisições de Materiais',
            href: '/ponto/gerenciar-materiais',
            icon: Package,
            description: 'Aprovar SC e criar OC',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/gerenciar-materiais'))
          },
          {
            name: 'Mapa de Cotação',
            href: '/ponto/mapa-cotacao',
            icon: FileSpreadsheet,
            description: 'Comparar cotações entre fornecedores e gerar OC por vencedor',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/mapa-cotacao'))
          },
          {
            name: 'Ordens de Compra',
            href: '/ponto/ordem-de-compra',
            icon: FileText,
            description: 'Listar e gerenciar ordens de compra',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/ordem-de-compra'))
          },
          {
            name: 'Estoque',
            href: '/ponto/estoque',
            icon: Package,
            description: 'Gerenciar estoque de materiais',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/estoque'))
          },
          {
            name: 'Furo de Estoque',
            href: '/ponto/furo-estoque',
            icon: PackageX,
            description: 'Pendências de entrega após recebimento parcial',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/furo-estoque'))
          },
          {
            name: 'Ajuste de Estoque',
            href: '/ponto/ajuste-estoque',
            icon: Package,
            description: 'Realizar entradas e saídas de ajuste no estoque',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/ajuste-estoque'))
          },
        ]
      },
      {
        id: 'cadastros',
        name: 'Cadastros',
        icon: Database,
        items: [
          {
            name: 'Centros de Custo',
            href: '/ponto/centros-custo',
            icon: Building2,
            description: 'Gerenciar centros de custo',
            permission: isAdministrator || isDepartmentPessoal || can(pk('/ponto/centros-custo'))
          },
          {
            name: 'Materiais de Construção',
            href: '/ponto/materiais-construcao',
            icon: Package,
            description: 'Gerenciar materiais de construção civil',
            permission: isAdministrator || isDepartmentPessoal || can(pk('/ponto/materiais-construcao'))
          },
          {
            name: 'Fornecedores',
            href: '/ponto/fornecedores',
            icon: Building2,
            description: 'Cadastro de fornecedores',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/fornecedores'))
          },
          {
            name: 'Condições de Pagamento',
            href: '/ponto/condicoes-pagamento',
            icon: CreditCard,
            description: 'Condições para ordens de compra',
            permission: isAdministrator || isDepartmentCompras || can(pk('/ponto/condicoes-pagamento'))
          },
          {
            name: 'Natureza Orçamentária',
            href: '/ponto/natureza-orcamentaria',
            icon: BookPlus,
            description: 'Cadastrar naturezas orçamentárias',
            permission: isAdministrator || isDepartmentFinanceiro || can(pk('/ponto/natureza-orcamentaria'))
          },
          {
            name: 'Prestadores de Serviço',
            href: '/ponto/prestadores-servico',
            icon: Truck,
            description: 'Cadastro de prestadores para espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/prestadores-servico')) ||
              can(pk('/ponto/espelho-nf'))
          },
          {
            name: 'Tomadores de Serviço',
            href: '/ponto/tomadores-servico',
            icon: Contact,
            description: 'Cadastro de tomadores para espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/tomadores-servico')) ||
              can(pk('/ponto/espelho-nf'))
          },
          {
            name: 'Contas Bancárias',
            href: '/ponto/contas-bancarias',
            icon: Landmark,
            description: 'Contas usadas em tomadores e no espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/contas-bancarias')) ||
              can(pk('/ponto/espelho-nf'))
          },
          {
            name: 'Códigos Tributários',
            href: '/ponto/codigos-tributarios',
            icon: Percent,
            description: 'Parâmetros por município para espelho de nota fiscal',
            permission:
              isAdministrator ||
              can(pk('/ponto/espelho-nf/codigos-tributarios')) ||
              can(pk('/ponto/espelho-nf'))
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

  const isFooterShortcutActive = (href: string) => {
    if (pathname == null) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isActive = (href: string) => {
    if (pathname == null) return false;
    if (href === '/ponto/contratos') {
      if (pathname === '/ponto/contratos') return true;
      // Rotas fixas sob /ponto/contratos (ex.: controle geral) — não marcam "Contratos", só o item próprio.
      if (pathname.startsWith('/ponto/contratos/controle-geral')) return false;
      // Detalhe do contrato e subpáginas (orçamento, permissões, etc.)
      return /^\/ponto\/contratos\/[^/]+/.test(pathname);
    }

    return pathname === href;
  };

  const selectedModule = menuItems.find((c) => c.id === selectedModuleId) ?? menuItems[0];

  const activeModuleId = menuItems.find((category) =>
    category.items.some((item) => item.permission && isActive(item.href))
  )?.id;

  const onRailFooterRoute = isRailFooterRoute(pathname);

  /** Um único módulo destacado no rail: painel aberto → módulo selecionado; recolhido → rota do menu (não atalhos do rodapé) */
  const railModuleActiveId: string | null = onRailFooterRoute && !tier2Visible
    ? null
    : tier2Visible
      ? selectedModuleId
      : activeModuleId ?? selectedModuleId;

  const handleCollapseSidebar = () => {
    if (activeModuleId) {
      setSelectedModuleId(activeModuleId);
    } else if (onRailFooterRoute && menuItems[0]) {
      setSelectedModuleId(menuItems[0].id);
    }
    setIsCollapsed(true);
  };

  // Selecionar módulo conforme rota ativa
  React.useEffect(() => {
    const activeCategory = menuItems.find((category) =>
      category.items.some((item) => item.permission && isActive(item.href))
    );
    if (activeCategory) {
      setSelectedModuleId(activeCategory.id);
    } else if (menuItems.length > 0 && !menuItems.some((c) => c.id === selectedModuleId)) {
      setSelectedModuleId(menuItems[0].id);
    }
  }, [pathname, menuItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectModule = (categoryId: string) => {
    const panelOpen = !isCollapsed || isOpen;
    if (panelOpen && selectedModuleId === categoryId) {
      setIsCollapsed(true);
      setIsOpen(false);
      return;
    }
    setSelectedModuleId(categoryId);
    if (isCollapsed) setIsCollapsed(false);
  };

  useLayoutEffect(() => {
    const collapsed = readSidebarCollapsed();
    setIsCollapsed(collapsed);
    onMenuToggle?.(collapsed);
    setSidebarHydrated(true);
  }, [onMenuToggle]);

  // Salvar estado no localStorage sempre que mudar (após hidratação)
  React.useEffect(() => {
    if (!sidebarHydrated) return;
    writeSidebarCollapsed(isCollapsed);
  }, [isCollapsed, sidebarHydrated]);

  // Notificar o MainLayout sobre mudanças no estado do menu (onMenuToggle deve ser estável — useCallback no pai)
  React.useEffect(() => {
    if (!sidebarHydrated) return;
    onMenuToggle?.(isCollapsed);
  }, [isCollapsed, onMenuToggle, sidebarHydrated]);

  return (
    <>
      {/* Botão de menu mobile */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-[100] p-2 bg-white dark:bg-gray-900 rounded-lg shadow-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Dual-tier Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full flex transform transition-all duration-500 ease-in-out z-[100] ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Tier 1 — Rail de módulos */}
        <div className="w-20 flex-shrink-0 h-full flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
          <div className="p-5 flex flex-col items-center">
            <Link
              href="/ponto/home"
              className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden transition-transform hover:scale-105"
              title="Ir para a página inicial"
              aria-label="Página inicial"
            >
              <img src="/loogo.png" alt="Logo Gennesis" className="w-10 h-10 object-contain" />
            </Link>
          </div>

          <nav className="flex-1 overflow-y-auto overflow-x-hidden pb-4 px-2 space-y-3">
            {menuItems.map((category) => {
              const CategoryIcon = category.icon;
              const isRailActive = category.id === railModuleActiveId;
              const visibleItems = category.items.filter((item) => item.permission);
              const forceAsGroup = !(category as { preferDirectLink?: boolean }).preferDirectLink;
              const isSingleItem = visibleItems.length === 1 && !forceAsGroup;
              const singleItem = isSingleItem ? visibleItems[0] : null;

              if (isSingleItem && singleItem) {
                const active = isActive(singleItem.href);
                const SingleItemIcon = singleItem.icon || CategoryIcon;
                return (
                  <div key={category.id} className="flex justify-center">
                    <Link
                      href={singleItem.href}
                      onClick={() => setIsOpen(false)}
                      className={`w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center ${
                        active
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      title={singleItem.name}
                    >
                      <SingleItemIcon className="w-5 h-5" />
                    </Link>
                  </div>
                );
              }

              return (
                <div key={category.id} className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleSelectModule(category.id)}
                    className={`w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center ${
                      isRailActive
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                    title={category.name}
                    aria-label={category.name}
                    aria-current={isRailActive ? 'true' : undefined}
                  >
                    <CategoryIcon className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </nav>

          {/* Rodapé: atalhos, divisor e perfil */}
          <div className="flex-shrink-0 relative z-20 overflow-visible px-2 pb-4 flex flex-col items-center">
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/ponto/conversas"
                onClick={() => setIsOpen(false)}
                title="Chat"
                aria-label={`Chat${chatUnreadCount > 0 ? `, ${chatUnreadCount} não lidas` : ''}`}
                className={`relative w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center ${
                  isFooterShortcutActive('/ponto/conversas')
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <MessagesSquare className="w-5 h-5" strokeWidth={2} />
                {chatUnreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-0.5 rounded-md bg-red-600 text-white text-[10px] font-bold inline-flex items-center justify-center leading-none shadow-sm ring-2 ring-white dark:ring-gray-900 animate-chat-unread-badge">
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </span>
                )}
              </Link>
              <Link
                href="/ponto/kanban"
                onClick={() => setIsOpen(false)}
                title="Tasks"
                aria-label="Tasks"
                className={`w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center ${
                  isFooterShortcutActive('/ponto/kanban')
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <SquareKanban className="w-5 h-5" />
              </Link>
              <Link
                href="/ponto/drive"
                onClick={() => setIsOpen(false)}
                title="Drive"
                aria-label="Drive"
                className={`w-10 h-10 rounded-xl transition-all duration-200 flex items-center justify-center ${
                  isFooterShortcutActive('/ponto/drive')
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-500'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <HardDrive className="w-5 h-5" />
              </Link>
            </div>
            <div className="mt-2 flex flex-col items-center gap-2">
              <div className="h-px w-12 shrink-0 bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="pt-4 flex justify-center w-full">
            <div ref={profileAvatarSectionRef} className="relative size-12 shrink-0">
                      <button
                        type="button"
                        aria-haspopup="true"
                        aria-expanded={profileAvatarMenu}
                        aria-label="Configurações e foto de perfil"
                        onClick={() => setProfileAvatarMenu((v) => !v)}
                        className="group relative block size-12 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-red-500/50"
                      >
                        <div className="size-12 rounded-full overflow-hidden bg-red-600 flex items-center justify-center relative">
                          {profilePhotoHref ? (
                            <img
                              src={profilePhotoHref}
                              alt=""
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="font-semibold text-white text-sm">
                              {getInitials(user?.name || userName || 'U')}
                            </span>
                          )}
                          <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5 pointer-events-none">
                            <Settings size={14} className="text-white shrink-0" strokeWidth={2} />
                          </div>
                          {(uploadProfilePhotoMutation.isPending ||
                            removeProfilePhotoMutation.isPending) && (
                            <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                              <Loader2 size={20} className="animate-spin text-white" />
                            </div>
                          )}
                        </div>
                      </button>

                      <input
                        ref={profileAvatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setProfileCropSrc(URL.createObjectURL(file));
                          setProfileAvatarMenu(false);
                          e.target.value = '';
                        }}
                      />

                      {profileAvatarMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-[100]"
                            aria-hidden="true"
                            onClick={() => setProfileAvatarMenu(false)}
                          />
                          <div
                            role="menu"
                            className="absolute z-[120] min-w-[200px] rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden py-1 left-full ml-2 bottom-0"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setProfileAvatarMenu(false);
                                profileAvatarInputRef.current?.click();
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Camera size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                              <span className="font-medium">Carregar foto</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                toggleTheme();
                                setProfileAvatarMenu(false);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              {isDark ? (
                                <Sun size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                              ) : (
                                <Moon size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                              )}
                              <span className="font-medium">{isDark ? 'Modo Claro' : 'Modo Escuro'}</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent('openChangePasswordModal'));
                                setProfileAvatarMenu(false);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Lock size={15} className="text-gray-500 dark:text-gray-400 shrink-0" />
                              <span className="font-medium">Alterar Senha</span>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={handleLogout}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-red-900/20 transition-colors group"
                            >
                              <LogOut size={15} className="text-gray-500 dark:text-gray-400 shrink-0 group-hover:text-red-600 dark:group-hover:text-red-400" />
                              <span className="font-medium group-hover:text-red-600 dark:group-hover:text-red-400">Sair</span>
                            </button>
                          </div>
                        </>
                      )}
            </div>
            </div>
          </div>
        </div>

        {/* Tier 2 — Painel de páginas do módulo */}
        <div
          className={`h-full flex-shrink-0 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-500 ease-in-out overflow-hidden ${
            tier2Visible ? 'w-72 opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
        >
          {/* Header do módulo */}
          <div className="p-4 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {searchTerm.trim() ? 'Busca' : selectedModule?.name ?? 'Menu'}
              </h2>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleCollapseSidebar}
                  className="hidden lg:flex items-center justify-center rounded-lg transition-colors duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-8 h-8"
                  title="Recolher menu"
                >
                  <ArrowLeftToLine className="w-5 h-5 flex-shrink-0" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="lg:hidden w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-600 dark:text-gray-300"
                  aria-label="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Busca */}
          <div className="px-4 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-sm w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Lista de páginas */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden p-4 pt-4 space-y-3">
            {searchTerm.trim() ? (
              menuItems.map((category) => {
                const filteredItems = category.items.filter(
                  (item) =>
                    item.permission &&
                    (item.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
                      item.description?.toLowerCase().includes(searchTerm.toLowerCase().trim()))
                );
                if (filteredItems.length === 0) return null;
                return (
                  <div key={category.id} className="mb-4">
                    <p className="px-3 pb-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {category.name}
                    </p>
                    <div className="space-y-3">
                      {filteredItems.map((item) => {
                        const ItemIcon = item.icon;
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                              active
                                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-500'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            <ItemIcon
                              className={`w-4 h-4 flex-shrink-0 ${
                                active ? 'text-red-600 dark:text-red-500' : 'text-gray-500 dark:text-gray-400'
                              }`}
                            />
                            <span className="text-sm font-medium truncate">{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              selectedModule?.items
                .filter((item) => item.permission)
                .map((item) => {
                  const ItemIcon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                        active
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-500'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <ItemIcon
                        className={`w-4 h-4 flex-shrink-0 ${
                          active ? 'text-red-600 dark:text-red-500' : 'text-gray-500 dark:text-gray-400'
                        }`}
                      />
                      <span className="text-sm font-medium truncate">{item.name}</span>
                    </Link>
                  );
                })
            )}
          </nav>

        </div>
      </div>

      {/* Modal de Confirmação de Logout */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
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

      <CircularPhotoCropModal
        open={!!profileCropSrc}
        imageSrc={profileCropSrc ?? ''}
        onClose={() => {
          if (profileCropSrc) URL.revokeObjectURL(profileCropSrc);
          setProfileCropSrc(null);
        }}
        onConfirm={async (file: File) => {
          await uploadProfilePhotoMutation.mutateAsync(file);
        }}
        onPickReplacement={(file) => {
          if (profileCropSrc) URL.revokeObjectURL(profileCropSrc);
          setProfileCropSrc(URL.createObjectURL(file));
        }}
      />

    </>
  );
}

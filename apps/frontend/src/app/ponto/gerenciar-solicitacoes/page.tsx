'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { 
  Clock, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Eye,
  FileText,
  User,
  MessageSquare,
  Users,
  Filter,
  Search,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { ListPageHeader, PageStack, pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { MainLayout } from '@/components/layout/MainLayout';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { DEPARTMENTS_LIST, COMPANIES_LIST } from '@/constants/payrollFilters';
import { CARGOS_LIST } from '@/constants/cargos';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';

interface PointCorrectionRequest {
  id: string;
  title: string;
  description: string;
  justification: string;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  originalDate: string;
  originalTime: string;
  originalType: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT';
  correctedDate: string;
  correctedTime: string;
  correctedType: 'ENTRY' | 'LUNCH_START' | 'LUNCH_END' | 'EXIT';
  createdAt: string;
  approvedAt?: string;
  rejectionReason?: string;
  employee: {
    id: string;
    employeeId: string;
    department: string;
    position: string;
    company?: string;
    user: {
      id: string;
      name: string;
    };
  };
  approver?: {
    id: string;
    name: string;
    email: string;
  };
  comments: Array<{
    id: string;
    comment: string;
    isInternal: boolean;
    createdAt: string;
    user: {
      id: string;
      name: string;
    };
  }>;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'PENDING':
      return { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle };
    case 'IN_REVIEW':
      return { label: 'Em Análise', color: 'bg-blue-100 text-blue-800', icon: Eye };
    case 'APPROVED':
      return { label: 'Aprovada', color: 'bg-green-100 text-green-800', icon: CheckCircle };
    case 'REJECTED':
      return { label: 'Rejeitada', color: 'bg-red-100 text-red-800', icon: XCircle };
    case 'CANCELLED':
      return { label: 'Cancelada', color: 'bg-gray-100 text-gray-800', icon: XCircle };
    default:
      return { label: 'Desconhecido', color: 'bg-gray-100 text-gray-800', icon: AlertCircle };
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'ENTRY': return 'Entrada';
    case 'LUNCH_START': return 'Início Almoço';
    case 'LUNCH_END': return 'Fim Almoço';
    case 'EXIT': return 'Saída';
    default: return type;
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('pt-BR');
};

const formatTime = (timeString: string) => {
  return timeString.substring(0, 5); // HH:MM
};

const STATUS_LIST_HEADER: Record<
  'all' | 'PENDING' | 'APPROVED' | 'REJECTED',
  { title: string; subtitle: string; Icon: React.ElementType; iconBg: string; iconColor: string }
> = {
  all: {
    title: 'Todas as solicitações',
    subtitle: 'Todas as alterações de ponto registradas',
    Icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  PENDING: {
    title: 'Solicitações pendentes',
    subtitle: 'Alterações de ponto aguardando análise',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  APPROVED: {
    title: 'Solicitações aprovadas',
    subtitle: 'Alterações de ponto já aprovadas',
    Icon: CheckCircle,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  REJECTED: {
    title: 'Solicitações rejeitadas',
    subtitle: 'Alterações de ponto que foram rejeitadas',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

function listHeaderFor(tab: string) {
  return STATUS_LIST_HEADER[tab as keyof typeof STATUS_LIST_HEADER] ?? STATUS_LIST_HEADER.all;
}

export default function GerenciarSolicitacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [selectedRequest, setSelectedRequest] = useState<PointCorrectionRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionComment, setRejectionComment] = useState('');
  const [activeStatusTab, setActiveStatusTab] = useState<'all' | 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('PENDING');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    department: '',
    position: '',
    company: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  // Buscar solicitações para aprovação
  // Buscar todas as solicitações (sem filtro de status) para que o filtro seja feito no frontend
  const { data: requestsData, isLoading: loadingRequests, refetch } = useQuery({
    queryKey: ['point-corrections-gerenciar'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes/gerenciar', {
        params: {
          status: 'all' // Buscar todas as solicitações
        }
      });
      return res.data;
    }
  });

  const allRequests = requestsData?.data || requestsData || [];

  // Calcular estatísticas
  const listHeader = listHeaderFor(activeStatusTab);
  const ListHeaderIcon = listHeader.Icon;

  const stats = {
    total: allRequests.length,
    pending: allRequests.filter((r: PointCorrectionRequest) => r.status === 'PENDING').length,
    approved: allRequests.filter((r: PointCorrectionRequest) => r.status === 'APPROVED').length,
    rejected: allRequests.filter((r: PointCorrectionRequest) => r.status === 'REJECTED').length,
    cancelled: allRequests.filter((r: PointCorrectionRequest) => r.status === 'CANCELLED').length,
    inReview: allRequests.filter((r: PointCorrectionRequest) => r.status === 'IN_REVIEW').length
  };

  // Filtrar solicitações
  const filteredRequests = allRequests.filter((request: PointCorrectionRequest) => {
    // Filtro de status (tabs)
    if (activeStatusTab !== 'all') {
      if (request.status !== activeStatusTab) return false;
    }

    // Filtro de busca (sem acento/caixa)
    if (filters.search) {
      const matchesName = textMatchesSearch(request.employee.user.name, filters.search);
      const matchesTitle = textMatchesSearch(request.title, filters.search);
      const matchesJustification = textMatchesSearch(request.justification, filters.search);
      if (!matchesName && !matchesTitle && !matchesJustification) return false;
    }

    // Filtro de setor
    if (filters.department) {
      if (request.employee.department !== filters.department) return false;
    }

    // Filtro de cargo
    if (filters.position) {
      if (request.employee.position !== filters.position) return false;
    }

    // Filtro de empresa
    if (filters.company) {
      if (request.employee.company !== filters.company) return false;
    }

    // Filtro de mês e ano
    if (filters.month || filters.year) {
      const requestDate = new Date(request.createdAt);
      const requestMonth = requestDate.getMonth() + 1;
      const requestYear = requestDate.getFullYear();
      
      if (filters.month && requestMonth !== filters.month) return false;
      if (filters.year && requestYear !== filters.year) return false;
    }

    return true;
  });

  const PAGE_SIZE = 10;
  const listRange = getCadastroListRange(page, PAGE_SIZE, filteredRequests.length);
  const currentPage = Math.min(page, listRange.totalPages);
  const pagedRequests = filteredRequests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Contar solicitações por status
  const statusCounts = {
    all: allRequests.length,
    PENDING: stats.pending,
    IN_REVIEW: stats.inReview,
    APPROVED: stats.approved,
    REJECTED: stats.rejected,
    CANCELLED: stats.cancelled
  };

  // Opções de mês e ano
  const monthOptions = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' }
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  const monthFilterSelectOptions = useMemo(
    () => monthOptions.map((m) => ({ value: String(m.value), label: m.label })),
    []
  );
  const yearFilterSelectOptions = useMemo(
    () => yearOptions.map((y) => ({ value: String(y), label: String(y) })),
    [yearOptions]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ ...filters, search: e.target.value });
  };

  const handleMonthChange = (value: string) => {
    setFilters({ ...filters, month: parseInt(value) });
  };

  const handleYearChange = (value: string) => {
    setFilters({ ...filters, year: parseInt(value) });
  };

  const handleDepartmentChange = (value: string) => {
    setFilters({ ...filters, department: value });
  };

  const handlePositionChange = (value: string) => {
    setFilters({ ...filters, position: value });
  };

  const handleCompanyChange = (value: string) => {
    setFilters({ ...filters, company: value });
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      department: '',
      position: '',
      company: '',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear()
    });
  };

  // Mutation para aprovar solicitação
  const approveMutation = useMutation({
    mutationFn: async ({ requestId, comment }: { requestId: string; comment: string }) => {
      const res = await api.post(`/solicitacoes/${requestId}/aprovar`, {
        comment,
        isInternal: false
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação aprovada com sucesso!');
      setShowApprovalModal(false);
      setApprovalComment('');
      setSelectedRequest(null);
      // Mudar para aba de aprovados para mostrar a solicitação aprovada
      setActiveStatusTab('APPROVED');
      // Invalidar cache e refetch - igual à página de registrar solicitação
      queryClient.invalidateQueries({ queryKey: ['point-corrections-gerenciar'] });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao aprovar solicitação');
    }
  });

  // Mutation para rejeitar solicitação
  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, reason, comment }: { requestId: string; reason: string; comment: string }) => {
      const res = await api.post(`/solicitacoes/${requestId}/rejeitar`, {
        reason,
        comment,
        isInternal: false
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação rejeitada com sucesso!');
      setShowRejectionModal(false);
      setRejectionReason('');
      setRejectionComment('');
      // Mudar para aba de rejeitados para mostrar a solicitação rejeitada
      setActiveStatusTab('REJECTED');
      // Invalidar cache e refetch - igual à página de registrar solicitação
      queryClient.invalidateQueries({ queryKey: ['point-corrections-gerenciar'] });
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao rejeitar solicitação');
    }
  });


  const handleApprove = () => {
    if (!selectedRequest || !approvalComment.trim()) {
      toast.error('Comentário é obrigatório');
      return;
    }
    
    approveMutation.mutate({
      requestId: selectedRequest.id,
      comment: approvalComment
    });
  };

  const handleReject = () => {
    if (!selectedRequest || !rejectionReason.trim() || !rejectionComment.trim()) {
      toast.error('Motivo e comentário são obrigatórios');
      return;
    }
    
    rejectMutation.mutate({
      requestId: selectedRequest.id,
      reason: rejectionReason,
      comment: rejectionComment
    });
  };

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  const hasAdvancedFilters = !!(
    filters.department ||
    filters.position ||
    filters.company
  );

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/gerenciar-solicitacoes">
        <MainLayout
          userRole={user.role}
          userName={user.name}
          onLogout={handleLogout}
        >
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/gerenciar-solicitacoes">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <PageStack>
        <ListPageHeader
          title="Gerenciar Alterações de Ponto"
          description="Aprove ou rejeite solicitações de correção de ponto"
        />

        {/* Estatísticas */}
        <div className={pageStatCardsGridClass}>
          <FilterStatCard
            label="Todas"
            count={stats.total}
            icon={Users}
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconColor="text-blue-600 dark:text-blue-400"
            isActive={activeStatusTab === 'all'}
            onClick={() => setActiveStatusTab('all')}
          />
          <FilterStatCard
            label="Pendentes"
            count={stats.pending}
            icon={Clock}
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconColor="text-amber-600 dark:text-amber-400"
            isActive={activeStatusTab === 'PENDING'}
            onClick={() => setActiveStatusTab('PENDING')}
          />
          <FilterStatCard
            label="Aprovados"
            count={stats.approved}
            icon={CheckCircle}
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconColor="text-emerald-600 dark:text-emerald-400"
            isActive={activeStatusTab === 'APPROVED'}
            onClick={() => setActiveStatusTab('APPROVED')}
          />
          <FilterStatCard
            label="Rejeitados"
            count={stats.rejected}
            icon={XCircle}
            iconBg="bg-red-100 dark:bg-red-900/30"
            iconColor="text-red-600 dark:text-red-400"
            isActive={activeStatusTab === 'REJECTED'}
            onClick={() => setActiveStatusTab('REJECTED')}
          />
        </div>

        {/* Lista de Solicitações */}
        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                  <ListHeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{listHeader.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{listHeader.subtitle}</p>
                </div>
              </div>
              <div className={cadastroListClasses.cardToolbar}>
                <div className={cadastroListClasses.searchFilterGroup}>
                  <div className={cadastroListClasses.searchFieldInGroup}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={filters.search}
                      onChange={handleSearchChange}
                      placeholder="Buscar nome, título ou justificativa..."
                      className={`${FORM_FIELD_INPUT_CLS} h-10 pl-9`}
                    />
                  </div>
                  <div className={cadastroListClasses.filterIconButtonWrap}>
                    <button
                      type="button"
                      onClick={() => setIsFiltersOpen(true)}
                      className={`${cadastroListClasses.filterIconButton} transition-colors ${
                        hasAdvancedFilters
                          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                      title="Filtros"
                      aria-label="Abrir filtros"
                    >
                      <Filter className="h-4 w-4" />
                      {hasAdvancedFilters ? (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                      ) : null}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            <div className="space-y-4">
              {/* Tabs de Status */}
              <AppUnderlineTabList aria-label="Status das solicitações" centered={false}>
                {(
                  [
                    { id: 'PENDING' as const, label: `Pendentes (${statusCounts.PENDING})` },
                    { id: 'APPROVED' as const, label: `Aprovados (${statusCounts.APPROVED})` },
                    { id: 'REJECTED' as const, label: `Rejeitados (${statusCounts.REJECTED})` },
                    { id: 'CANCELLED' as const, label: `Cancelados (${statusCounts.CANCELLED})` },
                    { id: 'all' as const, label: `Todas (${statusCounts.all})` },
                  ] as const
                ).map((tab) => (
                  <AppUnderlineTabButton
                    key={tab.id}
                    active={activeStatusTab === tab.id}
                    onClick={() => setActiveStatusTab(tab.id)}
                    className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm"
                  >
                    {tab.label}
                  </AppUnderlineTabButton>
                ))}
              </AppUnderlineTabList>

              {/* Lista de solicitações */}
              {loadingRequests ? (
                <CadastroListLoading message="Carregando solicitações..." />
              ) : filteredRequests.length === 0 ? (
                <CadastroListEmpty
                  icon={FileText}
                  title="Nenhuma solicitação encontrada"
                  hint={
                    activeStatusTab !== 'all'
                      ? `Não há solicitações ${getStatusInfo(activeStatusTab).label.toLowerCase()} no momento.`
                      : (filters.search || filters.department || filters.position || filters.company)
                        ? 'Nenhum registro encontrado com os filtros selecionados.'
                        : 'Nenhuma solicitação encontrada.'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={filteredRequests.length}
                    itemLabel="solicitação"
                    itemLabelPlural="solicitações"
                    currentPage={currentPage}
                    totalPages={listRange.totalPages}
                  />
                  <div className="table-scroll">
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>Solicitação</th>
                          <th className={cadastroListClasses.th}>Colaborador</th>
                          <th className={cadastroListClasses.thCenter}>Original</th>
                          <th className={cadastroListClasses.thCenter}>Corrigido</th>
                          <th className={cadastroListClasses.thCenter}>Registrada em</th>
                          <th className={cadastroListClasses.thCenter}>Status</th>
                          <th className={cadastroListClasses.thCenter}>Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                        {pagedRequests.map((request: PointCorrectionRequest) => {
                          const statusInfo = getStatusInfo(request.status);
                          const StatusIcon = statusInfo.icon;
                          return (
                            <tr
                              key={request.id}
                              className={getListTableRowClassName(true)}
                              onClick={() => setSelectedRequest(request)}
                            >
                              <td className={cadastroListClasses.tdTruncate}>
                                <ListRowNavigableLabel className="font-medium">
                                  {request.title}
                                </ListRowNavigableLabel>
                                {request.justification ? (
                                  <p className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                                    {request.justification}
                                  </p>
                                ) : null}
                                {request.rejectionReason && request.status === 'REJECTED' ? (
                                  <p className="text-xs text-red-600 dark:text-red-400">
                                    Rejeição: {request.rejectionReason}
                                  </p>
                                ) : null}
                              </td>
                              <td className={cadastroListClasses.td}>
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {request.employee.user.name}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {request.employee.position} · {request.employee.department}
                                </p>
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                <p>{formatDate(request.originalDate)} {formatTime(request.originalTime)}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {getTypeLabel(request.originalType)}
                                </p>
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                <p>{formatDate(request.correctedDate)} {formatTime(request.correctedTime)}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {getTypeLabel(request.correctedType)}
                                </p>
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                {formatDate(request.createdAt)}
                                {request.comments.length > 0 ? (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {request.comments.length} comentário(s)
                                  </p>
                                ) : null}
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusInfo.color}`}
                                >
                                  <StatusIcon className="h-3 w-3" />
                                  {statusInfo.label}
                                </span>
                              </td>
                              <td className={cadastroListClasses.tdCenter} onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1">
                                  {request.status === 'PENDING' && (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          setSelectedRequest(request);
                                          setShowApprovalModal(true);
                                        }}
                                        disabled={approveMutation.isPending}
                                        className="h-8 bg-green-600 px-2 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
                                        title="Aprovar"
                                      >
                                        <CheckCircle className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setSelectedRequest(request);
                                          setShowRejectionModal(true);
                                        }}
                                        disabled={rejectMutation.isPending}
                                        className="h-8 border-red-500 px-2 text-red-600 hover:text-red-700 dark:border-red-500 dark:text-red-400 dark:hover:text-red-500"
                                        title="Rejeitar"
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedRequest(request)}
                                    className="h-8 shrink-0 px-2"
                                    title="Ver detalhes"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <ListPagination
                    currentPage={currentPage}
                    totalPages={listRange.totalPages}
                    onPageChange={setPage}
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — Gerenciar Alterações de Ponto"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Setor</label>
              <StringSingleSelectDropdown
                value={filters.department}
                onChange={handleDepartmentChange}
                options={DEPARTMENTS_LIST}
                emptyOptionLabel="Todos os setores"
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Cargo</label>
              <StringSingleSelectDropdown
                value={filters.position}
                onChange={handlePositionChange}
                options={CARGOS_LIST}
                emptyOptionLabel="Todos os cargos"
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Empresa</label>
              <StringSingleSelectDropdown
                value={filters.company}
                onChange={handleCompanyChange}
                options={COMPANIES_LIST}
                emptyOptionLabel="Todas as empresas"
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Mês</label>
              <StringSingleSelectDropdown
                value={String(filters.month)}
                onChange={handleMonthChange}
                options={monthFilterSelectOptions}
                allowEmpty={false}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Ano</label>
              <StringSingleSelectDropdown
                value={String(filters.year)}
                onChange={handleYearChange}
                options={yearFilterSelectOptions}
                allowEmpty={false}
                className="w-full"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>

        {/* Modal de detalhes */}
        <Modal
          isOpen={!!selectedRequest && !showApprovalModal && !showRejectionModal}
          onClose={() => setSelectedRequest(null)}
          title="Detalhes da Solicitação"
          size="xl"
        >
          {selectedRequest && (
            <div className="space-y-6">
              <div>
                <h4 className="mb-2 font-medium text-gray-900 dark:text-gray-100">{selectedRequest.title}</h4>
              </div>

              <div>
                <h5 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Justificativa:</h5>
                <p className="rounded bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  {selectedRequest.justification}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded bg-red-50 p-3 dark:bg-red-900/30">
                  <h6 className="mb-2 font-medium text-red-800 dark:text-red-300">Dados Originais</h6>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {formatDate(selectedRequest.originalDate)} às {formatTime(selectedRequest.originalTime)}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {getTypeLabel(selectedRequest.originalType)}
                  </p>
                </div>

                <div className="rounded bg-green-50 p-3 dark:bg-green-900/30">
                  <h6 className="mb-2 font-medium text-green-800 dark:text-green-300">Dados Corrigidos</h6>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {formatDate(selectedRequest.correctedDate)} às {formatTime(selectedRequest.correctedTime)}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {getTypeLabel(selectedRequest.correctedType)}
                  </p>
                </div>
              </div>

              {selectedRequest.comments.length > 0 && (
                <div>
                  <h6 className="mb-3 font-medium text-gray-900 dark:text-gray-100">Comentários:</h6>
                  <div className="space-y-2">
                    {selectedRequest.comments.map((comment) => (
                      <div key={comment.id} className="rounded bg-gray-50 p-3 dark:bg-gray-700">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{comment.user.name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(comment.createdAt)}</span>
                          {comment.isInternal && (
                            <Badge size="sm" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                              Interno
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{comment.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* Modal de aprovação */}
        <Modal
          isOpen={showApprovalModal && !!selectedRequest}
          onClose={() => {
            setShowApprovalModal(false);
            setSelectedRequest(null);
          }}
          title="Aprovar Solicitação"
          size="md"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setShowApprovalModal(false);
                  setSelectedRequest(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending || !approvalComment.trim()}
                className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800"
              >
                {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Comentário de Aprovação *
              </label>
              <textarea
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder="Digite um comentário sobre a aprovação..."
                className={FORM_FIELD_TEXTAREA_CLS}
                rows={3}
              />
            </div>
          </div>
        </Modal>

        {/* Modal de rejeição */}
        <Modal
          isOpen={showRejectionModal && !!selectedRequest}
          onClose={() => {
            setShowRejectionModal(false);
            setSelectedRequest(null);
          }}
          title="Rejeitar Solicitação"
          size="md"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectionModal(false);
                  setSelectedRequest(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleReject}
                disabled={rejectMutation.isPending || !rejectionReason.trim() || !rejectionComment.trim()}
                className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
              >
                {rejectMutation.isPending ? 'Rejeitando...' : 'Rejeitar'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Motivo da Rejeição *
              </label>
              <Input
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ex: Dados inconsistentes"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Comentário *
              </label>
              <textarea
                value={rejectionComment}
                onChange={(e) => setRejectionComment(e.target.value)}
                placeholder="Explique o motivo da rejeição..."
                className={FORM_FIELD_TEXTAREA_CLS}
                rows={3}
              />
            </div>
          </div>
        </Modal>
      </PageStack>
    </MainLayout>
    </ProtectedRoute>
  );
}
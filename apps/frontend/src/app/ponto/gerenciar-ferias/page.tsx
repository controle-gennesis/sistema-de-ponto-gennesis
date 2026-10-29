'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Users,
  AlertTriangle,
  Check,
  X
} from 'lucide-react';
import { Vacation, ComplianceReport } from '@/types';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { ExpandableListSearch } from '@/components/ui/ExpandableListSearch';
import { ListPageHeader, PageStack, pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { getListTableRowClassName } from '@/components/ui/listTableUi';
import { ListPagination } from '@/components/ui/ListPagination';

function GerenciarFeriasPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<'pending' | 'all' | 'compliance'>('pending');
  const [pendingPage, setPendingPage] = useState(1);
  const [allPage, setAllPage] = useState(1);
  const PAGE_SIZE = 10;
  const totalPagesOf = (n: number) => Math.max(1, Math.ceil(n / PAGE_SIZE));
  const paginate = <T,>(items: T[], page: number): T[] => {
    const safe = Math.min(page, totalPagesOf(items.length));
    return items.slice((safe - 1) * PAGE_SIZE, safe * PAGE_SIZE);
  };
  const pageRange = (total: number, page: number) => {
    const safe = Math.min(page, totalPagesOf(total));
    return { start: total === 0 ? 0 : (safe - 1) * PAGE_SIZE + 1, end: Math.min(safe * PAGE_SIZE, total) };
  };
  const [showExpiringModal, setShowExpiringModal] = useState(false);
  const [searchExpiring, setSearchExpiring] = useState('');
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [searchExpired, setSearchExpired] = useState('');

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  // Buscar férias pendentes
  const { data: pendingVacations, isLoading: loadingPending } = useQuery({
    queryKey: ['pending-vacations'],
    queryFn: async () => {
      const res = await api.get('/vacations/pending');
      return res.data;
    },
  });

  // Buscar todas as férias
  const { data: allVacations, isLoading: loadingAll } = useQuery({
    queryKey: ['all-vacations'],
    queryFn: async () => {
      const res = await api.get('/vacations');
      return res.data;
    },
  });

  // Buscar relatório de conformidade
  const { data: complianceData, isLoading: loadingCompliance } = useQuery({
    queryKey: ['vacation-compliance'],
    queryFn: async () => {
      const res = await api.get('/vacations/reports/compliance');
      return res.data;
    },
  });

  // Buscar férias vencendo
  const { data: expiringVacations } = useQuery({
    queryKey: ['expiring-vacations'],
    queryFn: async () => {
      const res = await api.get('/vacations/expiring?days=30');
      return res.data;
    },
  });

  // Mutation para aprovar férias
  const approveVacationMutation = useMutation({
    mutationFn: async (vacationId: string) => {
      const res = await api.put(`/vacations/${vacationId}/approve`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Férias aprovada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['pending-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['all-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-compliance'] });
    },
    onError: () => {
      toast.error('Erro ao aprovar férias');
    }
  });

  // Mutation para rejeitar férias
  const rejectVacationMutation = useMutation({
    mutationFn: async ({ vacationId, reason }: { vacationId: string, reason: string }) => {
      const res = await api.put(`/vacations/${vacationId}/reject`, { reason });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Férias rejeitada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['pending-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['all-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-compliance'] });
    },
    onError: () => {
      toast.error('Erro ao rejeitar férias');
    }
  });

  const handleApprove = (vacationId: string) => {
    if (confirm('Tem certeza que deseja aprovar esta solicitação de férias?')) {
      approveVacationMutation.mutate(vacationId);
    }
  };

  const handleReject = (vacationId: string) => {
    const reason = prompt('Digite o motivo da rejeição:');
    if (reason && reason.trim()) {
      rejectVacationMutation.mutate({ vacationId, reason: reason.trim() });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING': return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'APPROVED': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'REJECTED': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'CANCELLED': return <XCircle className="w-5 h-5 text-gray-500" />;
      default: return <AlertCircle className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Pendente';
      case 'APPROVED': return 'Aprovado';
      case 'REJECTED': return 'Rejeitado';
      case 'CANCELLED': return 'Cancelado';
      case 'NOTICE_SENT': return 'Aviso Enviado';
      case 'NOTICE_CONFIRMED': return 'Aviso Confirmado';
      case 'IN_PROGRESS': return 'Em Andamento';
      case 'COMPLETED': return 'Concluído';
      case 'EXPIRED': return 'Vencido';
      default: return status;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'ANNUAL': return 'Anual';
      case 'FRACTIONED_1': return '1º Período Fracionado';
      case 'FRACTIONED_2': return '2º Período Fracionado';
      case 'FRACTIONED_3': return '3º Período Fracionado';
      case 'SICK': return 'Por Doença';
      case 'MATERNITY': return 'Maternidade';
      case 'PATERNITY': return 'Paternidade';
      case 'EMERGENCY': return 'Emergência';
      case 'COLLECTIVE': return 'Coletiva';
      default: return type;
    }
  };

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <MainLayout
        userRole={user.role}
        userName={user.name}
        onLogout={() => {
          localStorage.removeItem('token');
          router.push('/auth/login');
        }}
      >
        <Loading message="Carregando..." fullScreen size="lg" />
      </MainLayout>
    );
  }

  

  const pendingVacationsList: Vacation[] = pendingVacations?.data || [];
  const allVacationsList: Vacation[] = allVacations?.data || [];
  const compliance: ComplianceReport = complianceData?.data;
  const expiringList = expiringVacations?.data || [];

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={() => {
        localStorage.removeItem('token');
        router.push('/auth/login');
      }}
    >
      <PageStack>
        <ListPageHeader
          title="Gestão de Férias"
          description="Gerencie as solicitações de férias dos funcionários"
        />

        {/* Cards de Estatísticas */}
        <div className={pageStatCardsGridClass}>
          <FilterStatCard
            label="Pendentes"
            count={loadingPending ? '...' : pendingVacationsList.length}
            icon={Clock}
            iconBg="bg-yellow-100 dark:bg-yellow-900/30"
            iconColor="text-yellow-600 dark:text-yellow-400"
          />
          <FilterStatCard
            label="Aprovadas"
            count={loadingAll ? '...' : allVacationsList.filter(v => v.status === 'APPROVED').length}
            icon={CheckCircle}
            iconBg="bg-green-100 dark:bg-green-900/30"
            iconColor="text-green-600 dark:text-green-400"
          />
          <FilterStatCard
            label="Vencendo"
            count={expiringList.length}
            icon={AlertTriangle}
            iconBg="bg-orange-100 dark:bg-orange-900/30"
            iconColor="text-orange-600 dark:text-orange-400"
            onClick={expiringList.length > 0 ? () => setShowExpiringModal(true) : undefined}
          />
          <FilterStatCard
            label="Vencidas"
            count={loadingCompliance ? '...' : (compliance?.expiredVacations?.length || 0)}
            icon={XCircle}
            iconBg="bg-red-100 dark:bg-red-900/30"
            iconColor="text-red-600 dark:text-red-400"
            onClick={
              compliance?.expiredVacations && compliance.expiredVacations.length > 0
                ? () => setShowExpiredModal(true)
                : undefined
            }
          />
        </div>

        {/* Tabs */}
        <AppUnderlineTabList aria-label="Abas de férias" centered={false}>
          <AppUnderlineTabButton
            active={selectedTab === 'pending'}
            onClick={() => setSelectedTab('pending')}
            className="whitespace-nowrap px-3 py-2 text-sm"
          >
            Pendentes ({pendingVacationsList.length})
          </AppUnderlineTabButton>
          <AppUnderlineTabButton
            active={selectedTab === 'all'}
            onClick={() => setSelectedTab('all')}
            className="whitespace-nowrap px-3 py-2 text-sm"
          >
            Todas ({allVacationsList.length})
          </AppUnderlineTabButton>
          <AppUnderlineTabButton
            active={selectedTab === 'compliance'}
            onClick={() => setSelectedTab('compliance')}
            className="whitespace-nowrap px-3 py-2 text-sm"
          >
            Conformidade
          </AppUnderlineTabButton>
        </AppUnderlineTabList>

        {/* Conteúdo das Tabs */}
        {selectedTab === 'pending' && (
          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Solicitações Pendentes</h2>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingPending ? (
                <CadastroListLoading message="Carregando solicitações..." />
              ) : pendingVacationsList.length === 0 ? (
                <CadastroListEmpty icon={CheckCircle} title="Nenhuma solicitação pendente" />
              ) : (
                <>
                  <div className={cadastroListClasses.listSummary}>
                    <span>
                      Mostrando {pageRange(pendingVacationsList.length, pendingPage).start} a {pageRange(pendingVacationsList.length, pendingPage).end} de {pendingVacationsList.length}{' '}
                      {pendingVacationsList.length === 1 ? 'solicitação' : 'solicitações'}
                    </span>
                    <span>
                      Página {Math.min(pendingPage, totalPagesOf(pendingVacationsList.length))} de {totalPagesOf(pendingVacationsList.length)}
                    </span>
                  </div>
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>Funcionário</th>
                          <th className={cadastroListClasses.thCenter}>Setor</th>
                          <th className={cadastroListClasses.thCenter}>Tipo</th>
                          <th className={cadastroListClasses.thCenter}>Período</th>
                          <th className={cadastroListClasses.thCenter}>Dias</th>
                          
                          <th className={cadastroListClasses.th}>Motivo</th>
                          <th className={cadastroListClasses.thCenter}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginate(pendingVacationsList, pendingPage).map((vacation) => (
                          <tr key={vacation.id} className={getListTableRowClassName(false)}>
                            <td className={cadastroListClasses.td}>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(vacation.status)}
                                <span className="font-medium">{vacation.user.name}</span>
                              </div>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>{vacation.employee.department}</td>
                            <td className={cadastroListClasses.tdCenter}>{getTypeText(vacation.type)}</td>
                            <td className={cadastroListClasses.tdCenter}>
                              {new Date(vacation.startDate).toLocaleDateString('pt-BR')} - {new Date(vacation.endDate).toLocaleDateString('pt-BR')}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>{vacation.days}</td>

                            <td className={cadastroListClasses.tdMuted}>{vacation.reason || '—'}</td>
                        <td className="px-2 py-3 text-center sm:px-6 sm:py-4">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApprove(vacation.id)}
                              disabled={approveVacationMutation.isPending}
                              className="bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-800"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReject(vacation.id)}
                              disabled={rejectVacationMutation.isPending}
                              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Rejeitar
                            </Button>
                          </div>
                        </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ListPagination
                    currentPage={Math.min(pendingPage, totalPagesOf(pendingVacationsList.length))}
                    totalPages={totalPagesOf(pendingVacationsList.length)}
                    onPageChange={setPendingPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {selectedTab === 'all' && (
          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Todas as Férias</h2>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingAll ? (
                <CadastroListLoading message="Carregando férias..." />
              ) : allVacationsList.length === 0 ? (
                <CadastroListEmpty icon={Calendar} title="Nenhuma férias encontrada" />
              ) : (
                <>
                  <div className={cadastroListClasses.listSummary}>
                    <span>
                      Mostrando {pageRange(allVacationsList.length, allPage).start} a {pageRange(allVacationsList.length, allPage).end} de {allVacationsList.length}{' '}
                      {allVacationsList.length === 1 ? 'solicitação' : 'solicitações'}
                    </span>
                    <span>
                      Página {Math.min(allPage, totalPagesOf(allVacationsList.length))} de {totalPagesOf(allVacationsList.length)}
                    </span>
                  </div>
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>Funcionário</th>
                          <th className={cadastroListClasses.thCenter}>Setor</th>
                          <th className={cadastroListClasses.thCenter}>Tipo</th>
                          <th className={cadastroListClasses.thCenter}>Período</th>
                          <th className={cadastroListClasses.thCenter}>Dias</th>
                          <th className={cadastroListClasses.thCenter}>Status</th>
                          
                          <th className={cadastroListClasses.thCenter}>Solicitado em</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginate(allVacationsList, allPage).map((vacation) => (
                          <tr key={vacation.id} className={getListTableRowClassName(false)}>
                            <td className={cadastroListClasses.td}>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(vacation.status)}
                                <span className="font-medium">{vacation.user.name}</span>
                              </div>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>{vacation.employee.department}</td>
                            <td className={cadastroListClasses.tdCenter}>{getTypeText(vacation.type)}</td>
                            <td className={cadastroListClasses.tdCenter}>
                              {new Date(vacation.startDate).toLocaleDateString('pt-BR')} - {new Date(vacation.endDate).toLocaleDateString('pt-BR')}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>{vacation.days}</td>
                        <td className="px-2 py-3 text-center sm:px-6 sm:py-4">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            vacation.status === 'PENDING' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' :
                            vacation.status === 'APPROVED' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                            vacation.status === 'REJECTED' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                            'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                          }`}>
                            {getStatusText(vacation.status)}
                          </span>
                        </td>
                            
                        <td className={cadastroListClasses.tdCenter}>
                          {new Date(vacation.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ListPagination
                    currentPage={Math.min(allPage, totalPagesOf(allVacationsList.length))}
                    totalPages={totalPagesOf(allVacationsList.length)}
                    onPageChange={setAllPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {selectedTab === 'compliance' && (
          <div className="space-y-6">
            {/* Relatório de Conformidade */}
            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Relatório de Conformidade</h2>
              </CardHeader>
              <CardContent className={cadastroListClasses.cardContent}>
                {loadingCompliance ? (
                  <CadastroListLoading message="Carregando relatório..." />
                ) : compliance ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                      <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{compliance.complianceRate.toFixed(1)}%</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Taxa de Conformidade</p>
                    </div>
                    <div className="text-center p-4 bg-red-50 dark:bg-red-900/30 rounded-lg">
                      <p className="text-3xl font-bold text-red-600 dark:text-red-400">{compliance.expiredVacations.length}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Férias Vencidas</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                      <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{compliance.upcomingExpirations}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Vencendo em 30 dias</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 dark:text-gray-400">Nenhum dado de conformidade disponível</p>
                )}
              </CardContent>
            </Card>

            {/* Férias Vencendo */}
            {expiringList.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Férias Vencendo</h2>
                </CardHeader>
                <CardContent className={cadastroListClasses.cardContent}>
                  <div className="space-y-4">
                    {expiringList.map((item: any) => (
                      <div
                        key={item.userId}
                        className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium text-red-900 dark:text-red-300">{item.employeeName}</h3>
                            <p className="text-sm text-red-700 dark:text-red-300">
                              {item.department} • {item.availableDays} dias disponíveis
                            </p>
                            <p className="text-sm text-red-600 dark:text-red-400">
                              Vence em: {new Date(item.expiresAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </PageStack>

      {/* Modal de Funcionários com Férias Vencendo */}
      {showExpiringModal && (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            setShowExpiringModal(false);
            setSearchExpiring('');
          }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Funcionários com Férias Vencendo ({expiringList.length})
              </h3>
              <button
                onClick={() => {
                  setShowExpiringModal(false);
                  setSearchExpiring('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Barra de pesquisa */}
            <div className="px-6 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
              <ExpandableListSearch
                value={searchExpiring}
                onChange={setSearchExpiring}
                placeholder="Pesquisar por nome, departamento..."
                aria-label="Pesquisar por nome ou departamento"
              />
            </div>
            <div className="overflow-y-auto p-6">
              {(() => {
                const filtered = expiringList.filter((item: any) => {
                  if (!searchExpiring.trim()) return true;
                  return (
                    textMatchesSearch(item.employeeName, searchExpiring) ||
                    textMatchesSearch(item.department, searchExpiring)
                  );
                });
                
                return filtered.length > 0 ? (
                  <div className="space-y-3">
                    {filtered.map((item: any) => (
                      <div
                        key={item.userId}
                        className="p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-red-900 dark:text-red-300">{item.employeeName}</p>
                            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                              {item.department} • {item.availableDays} dias disponíveis
                            </p>
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                              Vence em: {new Date(item.expiresAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400 flex-shrink-0 ml-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {searchExpiring.trim() 
                      ? 'Nenhum funcionário encontrado com o termo pesquisado'
                      : 'Nenhum funcionário com férias vencendo'}
                  </p>
                );
              })()}
            </div>
          </div>
        </AppModalOverlay>
      )}

      {/* Modal de Funcionários com Férias Vencidas */}
      {showExpiredModal && (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => {
            setShowExpiredModal(false);
            setSearchExpired('');
          }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Funcionários com Férias Vencidas ({compliance?.expiredVacations?.length || 0})
              </h3>
              <button
                onClick={() => {
                  setShowExpiredModal(false);
                  setSearchExpired('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Barra de pesquisa */}
            <div className="px-6 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
              <ExpandableListSearch
                value={searchExpired}
                onChange={setSearchExpired}
                placeholder="Pesquisar por nome, departamento..."
                aria-label="Pesquisar por nome ou departamento"
              />
            </div>
            <div className="overflow-y-auto p-6">
              {(() => {
                const expiredList = compliance?.expiredVacations || [];
                const filtered = expiredList.filter((item: any) => {
                  if (!searchExpired.trim()) return true;
                  return (
                    textMatchesSearch(item.employeeName, searchExpired) ||
                    textMatchesSearch(item.employee?.name, searchExpired) ||
                    textMatchesSearch(item.department, searchExpired) ||
                    textMatchesSearch(item.employee?.department, searchExpired)
                  );
                });
                
                return filtered.length > 0 ? (
                  <div className="space-y-3">
                    {filtered.map((item: any, index: number) => {
                      const employeeName = item.employeeName || item.employee?.name || 'N/A';
                      const department = item.department || item.employee?.department || 'N/A';
                      const availableDays = item.availableDays || item.daysAvailable || 0;
                      const expiresAt = item.expiresAt || item.expiredAt;
                      
                      return (
                        <div
                          key={item.userId || item.employeeId || index}
                          className="p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-red-900 dark:text-red-300">{employeeName}</p>
                              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                                {department} • {availableDays} dias disponíveis
                              </p>
                              {expiresAt && (
                                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                                  Venceu em: {new Date(expiresAt).toLocaleDateString('pt-BR')}
                                </p>
                              )}
                            </div>
                            <XCircle className="w-6 h-6 text-red-500 dark:text-red-400 flex-shrink-0 ml-4" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {searchExpired.trim() 
                      ? 'Nenhum funcionário encontrado com o termo pesquisado'
                      : 'Nenhum funcionário com férias vencidas'}
                  </p>
                );
              })()}
            </div>
          </div>
        </AppModalOverlay>
      )}
    </MainLayout>
  );
}

export default function GerenciarFeriasPage() {
  return (
    <ProtectedRoute route="/ponto/gerenciar-ferias">
      <GerenciarFeriasPageContent />
    </ProtectedRoute>
  );
}

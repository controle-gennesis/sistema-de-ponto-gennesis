'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import {
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Plus,
  Eye,
  Trash2,
  CalendarDays,
  CalendarCheck,
  CalendarX,
} from 'lucide-react';
import { VacationFormData, VacationBalance, Vacation } from '@/types';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { ListPageHeader, PageStack, pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { getListTableRowClassName } from '@/components/ui/listTableUi';
import { ListPagination } from '@/components/ui/ListPagination';
import { FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';

const VACATION_TYPE_OPTIONS = labeledToSelectOptions([
  { value: 'ANNUAL', label: 'Férias Completas' },
  { value: 'FRACTIONED', label: 'Fracionado' },
]);

const VACATION_FRACTION_OPTIONS = labeledToSelectOptions([
  { value: '1', label: '1º Período' },
  { value: '2', label: '2º Período' },
  { value: '3', label: '3º Período' },
]);

// Função helper para formatar data corretamente (evita problemas de timezone)
const formatDate = (dateString: string | Date): string => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  // Usar UTC para evitar problemas de timezone ao exibir datas do banco
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
};

function VacationsPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const [formData, setFormData] = useState<VacationFormData>({
    startDate: '',
    endDate: '',
    type: 'ANNUAL',
    reason: '',
    fraction: undefined,
  });

  // Calcular quantidade de dias entre as datas (inclusive)
  const calculateDays = (start: string, end: string): number | null => {
    if (!start || !end) return null;

    // Parse das datas no formato YYYY-MM-DD
    const startParts = start.split('-');
    const endParts = end.split('-');

    if (startParts.length !== 3 || endParts.length !== 3) return null;

    // Criar datas no timezone local (sem hora) para cálculo correto
    const startYear = parseInt(startParts[0]);
    const startMonth = parseInt(startParts[1]) - 1;
    const startDay = parseInt(startParts[2]);

    const endYear = parseInt(endParts[0]);
    const endMonth = parseInt(endParts[1]) - 1;
    const endDay = parseInt(endParts[2]);

    // Calcular diferença diretamente: (endDay - startDay) + 1
    // Mas precisamos considerar meses e anos também
    const startDate = new Date(startYear, startMonth, startDay);
    const endDate = new Date(endYear, endMonth, endDay);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
    if (endDate < startDate) return null;

    // Calcular diferença em dias (inclusive): (endDate - startDate) + 1
    // Usar Math.floor para garantir cálculo correto
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 para incluir ambos os dias
    return diffDays;
  };

  const vacationDays = calculateDays(formData.startDate, formData.endDate);

  // Quando o tipo mudar para ANNUAL, limpar o fraction
  const handleTypeChange = (newType: string) => {
    if (newType === 'ANNUAL') {
      setFormData({ ...formData, type: newType, fraction: undefined });
    } else {
      setFormData({ ...formData, type: newType });
    }
  };

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  // Buscar saldo de férias
  const { data: balanceData, isLoading: loadingBalance } = useQuery({
    queryKey: ['vacation-balance'],
    queryFn: async () => {
      const res = await api.get('/vacations/my-vacations/balance');
      return res.data;
    },
  });

  // Buscar férias do usuário
  const { data: vacationsData, isLoading: loadingVacations } = useQuery({
    queryKey: ['my-vacations'],
    queryFn: async () => {
      const res = await api.get('/vacations/my-vacations');
      return res.data;
    },
  });

  // Mutation para solicitar férias
  const requestVacationMutation = useMutation({
    mutationFn: async (data: VacationFormData) => {
      const res = await api.post('/vacations/request', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação de férias criada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['my-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-balance'] });
      setShowForm(false);
      setFormData({
        startDate: '',
        endDate: '',
        type: 'ANNUAL',
        reason: '',
        fraction: undefined,
      });
    },
    onError: (error: any) => {
      const errorData = error.response?.data;
      if (errorData?.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
        // Mostrar todos os erros de validação
        errorData.errors.forEach((err: string) => {
          toast.error(err);
        });
      } else if (errorData?.warnings && Array.isArray(errorData.warnings) && errorData.warnings.length > 0) {
        // Se só houver avisos, mostrar mas permitir continuar
        errorData.warnings.forEach((warn: string) => {
          toast.error(warn);
        });
      } else {
        const message = errorData?.message || 'Erro ao criar solicitação';
        toast.error(message);
      }
    },
  });

  // Mutation para cancelar férias
  const cancelVacationMutation = useMutation({
    mutationFn: async (vacationId: string) => {
      const res = await api.put(`/vacations/${vacationId}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação cancelada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['my-vacations'] });
      queryClient.invalidateQueries({ queryKey: ['vacation-balance'] });
    },
    onError: (error: any) => {
      toast.error('Erro ao cancelar solicitação');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.startDate || !formData.endDate) {
      toast.error('Informe as datas de início e fim');
      return;
    }

    // Validação: se for fracionado, o período fracionado é obrigatório
    if (formData.type === 'FRACTIONED' && !formData.fraction) {
      toast.error('Por favor, selecione o período fracionado');
      return;
    }

    // Se for anual, garantir que fraction seja undefined
    const dataToSubmit = formData.type === 'ANNUAL' ? { ...formData, fraction: undefined } : formData;
    requestVacationMutation.mutate(dataToSubmit);
  };

  const handleCancel = (vacationId: string) => {
    if (confirm('Tem certeza que deseja cancelar esta solicitação?')) {
      cancelVacationMutation.mutate(vacationId);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'APPROVED':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'REJECTED':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'CANCELLED':
        return <XCircle className="w-5 h-5 text-gray-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Pendente';
      case 'APPROVED':
        return 'Aprovado';
      case 'REJECTED':
        return 'Rejeitado';
      case 'CANCELLED':
        return 'Cancelado';
      case 'NOTICE_SENT':
        return 'Aviso Enviado';
      case 'NOTICE_CONFIRMED':
        return 'Aviso Confirmado';
      case 'IN_PROGRESS':
        return 'Em Andamento';
      case 'COMPLETED':
        return 'Concluído';
      case 'EXPIRED':
        return 'Vencido';
      default:
        return status;
    }
  };

  const getTypeText = (type: string, fraction?: number) => {
    switch (type) {
      case 'ANNUAL':
        return 'Férias Completas';
      case 'FRACTIONED_1':
        return '1º Período Fracionado';
      case 'FRACTIONED_2':
        return '2º Período Fracionado';
      case 'FRACTIONED_3':
        return '3º Período Fracionado';
      case 'FRACTIONED':
        if (fraction === 1) return '1º Período Fracionado';
        if (fraction === 2) return '2º Período Fracionado';
        if (fraction === 3) return '3º Período Fracionado';
        return 'Fracionado';
      case 'SICK':
        return 'Por Doença';
      case 'MATERNITY':
        return 'Maternidade';
      case 'PATERNITY':
        return 'Paternidade';
      case 'EMERGENCY':
        return 'Emergência';
      case 'COLLECTIVE':
        return 'Coletiva';
      default:
        return type;
    }
  };

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE',
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

  // Removido: verificação de role - agora usamos apenas cargos

  const balance: VacationBalance = balanceData?.data;
  const vacations: Vacation[] = vacationsData?.data || [];
  const totalPages = Math.max(1, Math.ceil(vacations.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedVacations = vacations.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const startItem = vacations.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(safePage * PAGE_SIZE, vacations.length);

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
        <ListPageHeader title="Minhas Férias" description="Solicite e acompanhe suas férias" />

        {/* Saldo de Férias */}
        {balance && (
          <div className={pageStatCardsGridClass}>
            <FilterStatCard
              label="Total"
              count={balance.totalDays}
              icon={CalendarDays}
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
            />
            <FilterStatCard
              label="Disponível"
              count={balance.availableDays}
              icon={CalendarCheck}
              iconBg="bg-green-100 dark:bg-green-900/30"
              iconColor="text-green-600 dark:text-green-400"
            />
            <FilterStatCard
              label="Usado"
              count={balance.usedDays}
              icon={CalendarX}
              iconBg="bg-yellow-100 dark:bg-yellow-900/30"
              iconColor="text-yellow-600 dark:text-yellow-400"
            />
            <FilterStatCard
              label="Vencidos"
              count={balance.expiredDays || 0}
              icon={XCircle}
              iconBg="bg-red-100 dark:bg-red-900/30"
              iconColor="text-red-600 dark:text-red-400"
            />
          </div>
        )}

        {/* Formulário de solicitação */}
        <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Nova Solicitação de Férias" size="lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de Início *</label>
                <DatePickerField
                  value={formData.startDate}
                  onChange={(v) => setFormData({ ...formData, startDate: v })}
                  min={new Date().toISOString().split('T')[0]}
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                  className="w-full"
                  aria-label="Data de início"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de Fim *</label>
                <DatePickerField
                  value={formData.endDate}
                  onChange={(v) => setFormData({ ...formData, endDate: v })}
                  min={formData.startDate || new Date().toISOString().split('T')[0]}
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                  className="w-full"
                  aria-label="Data de fim"
                />
              </div>
            </div>
            {vacationDays !== null && vacationDays > 0 && (
              <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {vacationDays} {vacationDays === 1 ? 'dia' : 'dias'} de férias
                </span>
              </div>
            )}

            <div className={`grid gap-4 ${formData.type === 'FRACTIONED' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-1'}`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Férias *</label>
                <StringSingleSelectDropdown
                  value={formData.type}
                  onChange={handleTypeChange}
                  options={VACATION_TYPE_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              {formData.type === 'FRACTIONED' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Período Fracionado *</label>
                  <StringSingleSelectDropdown
                    value={formData.fraction != null ? String(formData.fraction) : ''}
                    onChange={(v) =>
                      setFormData({
                        ...formData,
                        fraction: v ? Number(v) : undefined,
                      })
                    }
                    options={VACATION_FRACTION_OPTIONS}
                    placeholder="Selecione o período"
                    emptyOptionLabel="Selecione o período"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo (opcional)</label>
              <textarea
                value={formData.reason || ''}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3}
                className={FORM_FIELD_TEXTAREA_CLS}
                placeholder="Descreva o motivo da solicitação..."
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="px-6 py-2">
                Cancelar
              </Button>
              <Button type="submit" disabled={requestVacationMutation.isPending} className="px-6 py-2">
                {requestVacationMutation.isPending ? 'Enviando...' : 'Solicitar'}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Lista de Férias */}
        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                  <Calendar className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Histórico de Férias</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Acompanhe suas solicitações de férias</p>
                </div>
              </div>
              <div className={cadastroListClasses.cardToolbar}>
                <button
                  type="button"
                  onClick={() => setShowForm(!showForm)}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Solicitar Férias</span>
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            {loadingVacations ? (
              <CadastroListLoading message="Carregando férias..." />
            ) : vacations.length === 0 ? (
              <CadastroListEmpty icon={Calendar} title="Nenhuma solicitação de férias encontrada" />
            ) : (
              <>
                <div className={cadastroListClasses.listSummary}>
                  <span>
                    Mostrando {startItem} a {endItem} de {vacations.length} {vacations.length === 1 ? 'solicitação' : 'solicitações'}
                  </span>
                  <span>
                    Página {safePage} de {totalPages}
                  </span>
                </div>
                <div className={cadastroListClasses.tableScroll}>
                  <table className={cadastroListClasses.table}>
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className={cadastroListClasses.th}>Tipo</th>
                        <th className={cadastroListClasses.thCenter}>Período</th>
                        <th className={cadastroListClasses.thCenter}>Dias</th>
                        <th className={cadastroListClasses.thCenter}>Status</th>
                        <th className={cadastroListClasses.th}>Motivo</th>
                        <th className={cadastroListClasses.thCenter}>Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {paginatedVacations.map((vacation) => (
                        <tr key={vacation.id} className={getListTableRowClassName(false)}>
                          <td className={cadastroListClasses.td}>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(vacation.status)}
                              <span>{getTypeText(vacation.type, vacation.fraction || undefined)}</span>
                            </div>
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            {formatDate(vacation.startDate)} - {formatDate(vacation.endDate)}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>{vacation.days}</td>
                          <td className="px-2 py-3 text-center sm:px-6 sm:py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                vacation.status === 'PENDING'
                                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                                  : vacation.status === 'APPROVED'
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                                    : vacation.status === 'REJECTED'
                                      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                              }`}
                            >
                              {getStatusText(vacation.status)}
                            </span>
                          </td>
                          <td className={cadastroListClasses.tdMuted}>{vacation.reason || '—'}</td>
                          <td className="px-2 py-3 text-center sm:px-6 sm:py-4">
                            {vacation.status === 'PENDING' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCancel(vacation.id)}
                                title="Cancelar solicitação"
                                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPagination currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} />
              </>
            )}
          </CardContent>
        </Card>
      </PageStack>
    </MainLayout>
  );
}

export default function VacationsPage() {
  return (
    <ProtectedRoute route="/ponto/ferias">
      <VacationsPageContent />
    </ProtectedRoute>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
  CalendarClock
} from 'lucide-react';
import { VacationFormData, VacationBalance, Vacation } from '@/types';

export default function VacationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<VacationFormData>({
    startDate: '',
    endDate: '',
    type: 'ANNUAL',
    reason: '',
    fraction: undefined
  });

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
        fraction: undefined
      });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Erro ao criar solicitação';
      toast.error(message);
    }
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
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestVacationMutation.mutate(formData);
  };

  const handleCancel = (vacationId: string) => {
    if (confirm('Tem certeza que deseja cancelar esta solicitação?')) {
      cancelVacationMutation.mutate(vacationId);
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

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  // Removido: verificação de role - agora usamos apenas cargos

  const balance: VacationBalance = balanceData?.data;
  const vacations: Vacation[] = vacationsData?.data || [];

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={() => {
        localStorage.removeItem('token');
        router.push('/auth/login');
      }}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Minhas Férias</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600">
            Solicite e acompanhe suas férias
          </p>
        </div>

        {/* Saldo de Férias */}
        {balance && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                    <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Total</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{balance.totalDays}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-green-100 rounded-lg flex-shrink-0">
                    <CalendarCheck className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Disponível</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{balance.availableDays}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-yellow-100 rounded-lg flex-shrink-0">
                    <CalendarX className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Usado</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{balance.usedDays}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-orange-100 rounded-lg flex-shrink-0">
                    <CalendarClock className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-gray-600">Pendente</p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{balance.pendingDays}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Alertas de Férias */}
        {balance && (
          <div className="space-y-4">
            {balance.expiresAt && balance.availableDays > 0 && (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="p-2 sm:p-3 bg-yellow-100 rounded-lg flex-shrink-0">
                      <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
                    </div>
                    <div className="ml-3 sm:ml-4 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-yellow-800">
                        <strong>Atenção:</strong> Suas férias vencem em{' '}
                        {new Date(balance.expiresAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {balance.totalDays === 0 && (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="p-2 sm:p-3 bg-blue-100 rounded-lg flex-shrink-0">
                      <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                    </div>
                    <div className="ml-3 sm:ml-4 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-blue-800">
                        <strong>Informação:</strong> Você ainda não tem direito a férias. 
                        É necessário trabalhar pelo menos 12 meses completos.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Botão para solicitar férias */}
        <div className="flex justify-end">
          <Button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Solicitar Férias</span>
          </Button>
        </div>

        {/* Formulário de solicitação */}
        {showForm && (
          <Card>
            <CardHeader className="px-6 py-4 border-b">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Nova Solicitação de Férias</h3>
                  <p className="text-sm text-gray-600">Preencha os dados para solicitar suas férias</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Início *
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Fim *
                    </label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      required
                      min={formData.startDate || new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de Férias *
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ANNUAL">Anual</option>
                      <option value="FRACTIONED_1">1º Período Fracionado</option>
                      <option value="FRACTIONED_2">2º Período Fracionado</option>
                      <option value="FRACTIONED_3">3º Período Fracionado</option>
                      <option value="SICK">Por Doença</option>
                      <option value="EMERGENCY">Emergência</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Período Fracionado (se aplicável)
                    </label>
                    <select
                      value={formData.fraction || ''}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        fraction: e.target.value ? Number(e.target.value) : undefined 
                      })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Não fracionado</option>
                      <option value="1">1º Período</option>
                      <option value="2">2º Período</option>
                      <option value="3">3º Período</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Motivo (opcional)
                  </label>
                  <textarea
                    value={formData.reason || ''}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Descreva o motivo da solicitação..."
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                    className="px-6 py-2"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={requestVacationMutation.isPending}
                    className="px-6 py-2"
                  >
                    {requestVacationMutation.isPending ? 'Enviando...' : 'Solicitar'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Lista de Férias */}
        <Card>
          <CardHeader className="px-6 py-4 border-b">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Histórico de Férias</h3>
                <p className="text-sm text-gray-600">Acompanhe suas solicitações de férias</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {loadingVacations ? (
              <div className="text-center py-8">
                <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
                <p className="text-gray-600">Carregando férias...</p>
              </div>
            ) : vacations.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhuma solicitação de férias encontrada</p>
              </div>
            ) : (
              <div className="space-y-4">
                {vacations.map((vacation) => (
                  <div
                    key={vacation.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(vacation.status)}
                        <div>
                          <h3 className="font-medium text-gray-900">
                            {getTypeText(vacation.type)}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {new Date(vacation.startDate).toLocaleDateString('pt-BR')} -{' '}
                            {new Date(vacation.endDate).toLocaleDateString('pt-BR')} ({vacation.days} dias)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          vacation.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                          vacation.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                          vacation.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {getStatusText(vacation.status)}
                        </span>
                        {vacation.status === 'PENDING' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancel(vacation.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {vacation.reason && (
                      <p className="mt-2 text-sm text-gray-600">
                        <strong>Motivo:</strong> {vacation.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

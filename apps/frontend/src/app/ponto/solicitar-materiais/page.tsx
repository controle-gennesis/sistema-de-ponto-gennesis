'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, Plus, List, X, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

export default function SolicitarMateriaisPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [formData, setFormData] = useState({
    costCenterId: '',
    serviceOrder: '',
    description: '',
    priority: 'MEDIUM',
    items: [{ materialId: '', quantity: 1, unit: '', observation: '' }]
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

  // Buscar centros de custo (apenas ativos)
  const { data: costCentersData, isLoading: loadingCostCenters } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => {
      const res = await api.get('/cost-centers', {
        params: { isActive: 'true', limit: 100 }
      });
      return res.data;
    }
  });


  // Buscar materiais
  const { data: materialsData } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => {
      const res = await api.get('/material-requests/materials');
      return res.data;
    }
  });

  // Buscar requisições do usuário
  const { data: requestsData, isLoading: loadingRequests } = useQuery({
    queryKey: ['material-requests'],
    queryFn: async () => {
      const res = await api.get('/material-requests', {
        params: { requestedBy: userData?.data?.id }
      });
      return res.data;
    },
    enabled: !!userData?.data?.id && activeTab === 'list'
  });

  // Criar requisição
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/material-requests', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      setActiveTab('list');
      setFormData({
        costCenterId: '',
        serviceOrder: '',
        description: '',
        priority: 'MEDIUM',
        items: [{ materialId: '', quantity: 1, unit: '', observation: '' }]
      });
    }
  });

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <Loading 
        message="Carregando..."
        fullScreen
        size="lg"
      />
    );
  }

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { materialId: '', quantity: 1, unit: '', observation: '' }]
    });
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Enviar serviceOrder como projectId para compatibilidade com o backend
    createMutation.mutate({
      ...formData,
      projectId: formData.serviceOrder || undefined,
      serviceOrder: formData.serviceOrder || undefined
    });
  };

  const requests = requestsData?.data?.requests || requestsData?.data || [];

  return (
    <ProtectedRoute route="/ponto/solicitar-materiais">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Cabeçalho */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Solicitar Materiais</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Solicite materiais para seus projetos</p>
          </div>

          {/* Navegação */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('list')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'list'
                    ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <List className="w-4 h-4" />
                Minhas Solicitações
              </button>
              <button
                onClick={() => setActiveTab('new')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'new'
                    ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Plus className="w-4 h-4" />
                Nova Solicitação
              </button>
            </nav>
          </div>

          {/* Conteúdo */}
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <ShoppingCart className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {activeTab === 'list' ? 'Minhas Solicitações' : 'Nova Solicitação de Material'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {activeTab === 'list' ? 'Visualize suas solicitações de materiais' : 'Preencha os dados para criar uma nova solicitação'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activeTab === 'list' ? (
                <div className="space-y-4">
                  {loadingRequests ? (
                    <div className="text-center py-8">
                      <Loading message="Carregando solicitações..." />
                    </div>
                  ) : requests.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400">Nenhuma solicitação encontrada</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {requests.map((request: any) => (
                        <div
                          key={request.id}
                          className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">
                                Requisição #{request.id.slice(0, 8)}
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {request.description || 'Sem descrição'}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                                Status: <span className={`font-medium ${
                                  request.status === 'APPROVED' ? 'text-green-600' :
                                  request.status === 'REJECTED' ? 'text-red-600' :
                                  request.status === 'PENDING' ? 'text-yellow-600' :
                                  'text-gray-600'
                                }`}>
                                  {request.status === 'APPROVED' ? 'Aprovada' :
                                   request.status === 'REJECTED' ? 'Rejeitada' :
                                   request.status === 'PENDING' ? 'Pendente' :
                                   request.status === 'IN_REVIEW' ? 'Em Análise' :
                                   request.status === 'CANCELLED' ? 'Cancelada' :
                                   request.status}
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Centro de Custo *
                    </label>
                    {loadingCostCenters ? (
                      <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        Carregando centros de custo...
                      </div>
                    ) : (
                      <select
                        required
                        value={formData.costCenterId}
                        onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Selecione um centro de custo</option>
                        {(costCentersData?.data || []).map((cc: any) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.code} - {cc.name} {cc.description ? `(${cc.description})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {!loadingCostCenters && (!costCentersData?.data || costCentersData.data.length === 0) && (
                      <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                        Nenhum centro de custo disponível. Execute o seed do banco de dados.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ordem de Serviço
                    </label>
                    <input
                      type="text"
                      value={formData.serviceOrder}
                      onChange={(e) => setFormData({ ...formData, serviceOrder: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Digite o número da ordem de serviço (opcional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Descrição
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Descreva a necessidade dos materiais..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Prioridade
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="LOW">Baixa</option>
                      <option value="MEDIUM">Média</option>
                      <option value="HIGH">Alta</option>
                      <option value="URGENT">Urgente</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Itens *
                      </label>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar Item
                      </button>
                    </div>
                    <div className="space-y-3">
                      {formData.items.map((item, index) => (
                        <div key={index} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex items-start justify-between mb-3">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Item {index + 1}</span>
                            {formData.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="text-red-600 dark:text-red-400 hover:text-red-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Material *
                              </label>
                              <select
                                required
                                value={item.materialId}
                                onChange={(e) => handleItemChange(index, 'materialId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              >
                                <option value="">Selecione um material</option>
                                {(materialsData?.data || []).map((material: any) => (
                                  <option key={material.id} value={material.id}>
                                    {material.name} - {material.code}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Quantidade *
                              </label>
                              <input
                                type="number"
                                required
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Unidade
                              </label>
                              <input
                                type="text"
                                value={item.unit}
                                onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                                placeholder="Ex: kg, m, un"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Observação
                              </label>
                              <input
                                type="text"
                                value={item.observation}
                                onChange={(e) => handleItemChange(index, 'observation', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {createMutation.isError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {(createMutation.error as any)?.response?.data?.message || 'Erro ao criar solicitação'}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('list')}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50"
                    >
                      {createMutation.isPending ? 'Criando...' : 'Criar Solicitação'}
                    </button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}

'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Edit, Trash2, Search, X, Check, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function CentrosCustoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    isActive: true
  });
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);

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

  // Buscar centros de custo
  const { data: costCentersData, isLoading: loadingCostCenters } = useQuery({
    queryKey: ['cost-centers-admin', searchTerm],
    queryFn: async () => {
      const res = await api.get('/cost-centers', {
        params: {
          search: searchTerm || undefined,
          limit: 100
        }
      });
      return res.data;
    }
  });

  // Criar centro de custo
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/cost-centers', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers-admin'] });
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] }); // Invalida também a lista usada no formulário
      setShowForm(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error('Erro ao criar centro de custo:', error);
    }
  });

  // Atualizar centro de custo
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/cost-centers/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers-admin'] });
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      setEditingCostCenter(null);
      resetForm();
    }
  });

  // Deletar centro de custo
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/cost-centers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cost-centers-admin'] });
      queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
      setShowDeleteModal(null);
    }
  });

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      isActive: true
    });
    setEditingCostCenter(null);
  };

  const handleEdit = (costCenter: CostCenter) => {
    setEditingCostCenter(costCenter);
    setFormData({
      code: costCenter.code,
      name: costCenter.name,
      description: costCenter.description || '',
      isActive: costCenter.isActive
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação básica - código não é mais obrigatório na criação
    if (!formData.name.trim()) {
      return;
    }
    
    if (editingCostCenter) {
      updateMutation.mutate({ id: editingCostCenter.id, data: formData });
    } else {
      createMutation.mutate({
        // Código será gerado automaticamente no backend
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        isActive: formData.isActive
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  const costCenters = costCentersData?.data || [];

  if (loadingUser) {
    return (
      <Loading 
        message="Carregando..."
        fullScreen
        size="lg"
      />
    );
  }

  return (
    <ProtectedRoute route="/ponto/centros-custo">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Gerenciar Centros de Custo</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Cadastre e gerencie os centros de custo da empresa</p>
          </div>

          {/* Barra de pesquisa e botão novo */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar por código, nome ou descrição..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <button
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar Centro de Custo
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Formulário */}
          {showForm && (
            <Card>
              <CardHeader className="border-b-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {editingCostCenter ? 'Editar Centro de Custo' : 'Centro de Custo'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {editingCostCenter && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Código
                        </label>
                        <input
                          type="text"
                          value={formData.code}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                          disabled
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          O código é gerado automaticamente e não pode ser alterado
                        </p>
                      </div>
                    )}
                    <div className={editingCostCenter ? '' : 'md:col-span-2'}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Nome *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="Ex: Secretaria de Estado de Desenvolvimento Social"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Descrição
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Descrição do centro de custo..."
                    />
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                          formData.isActive 
                            ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500' 
                            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                        }`}>
                          {formData.isActive && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                        Ativo
                      </span>
                    </label>
                  </div>
                  {(createMutation.isError || updateMutation.isError) && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                          Erro ao salvar centro de custo
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400">
                          {(createMutation.error as any)?.response?.data?.message || 
                           (updateMutation.error as any)?.response?.data?.message || 
                           (createMutation.error as any)?.message ||
                           (updateMutation.error as any)?.message ||
                           'Ocorreu um erro inesperado. Verifique os dados e tente novamente.'}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        resetForm();
                      }}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                    >
                      {createMutation.isPending || updateMutation.isPending
                        ? 'Salvando...'
                        : editingCostCenter
                        ? 'Atualizar'
                        : 'Criar'}
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Lista de centros de custo */}
          <Card>
            <CardHeader className="border-b-0">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Centros de Custo
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {costCenters.length} {costCenters.length === 1 ? 'centro de custo cadastrado' : 'centros de custo cadastrados'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingCostCenters ? (
                <div className="text-center py-8">
                  <Loading message="Carregando centros de custo..." />
                </div>
              ) : costCenters.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">
                    {searchTerm ? 'Nenhum centro de custo encontrado' : 'Nenhum centro de custo cadastrado'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Código</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nome</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Descrição</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {costCenters.map((cc: CostCenter) => (
                        <tr key={cc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white font-mono">{cc.code}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">{cc.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{cc.description || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              cc.isActive
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                            }`}>
                              {cc.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEdit(cc)}
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setShowDeleteModal(cc.id)}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Modal de confirmação de exclusão */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteModal(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
                Excluir Centro de Custo?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
                Tem certeza que deseja excluir este centro de custo? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(showDeleteModal)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
              {deleteMutation.isError && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                        Não é possível excluir este centro de custo
                      </p>
                      <div className="text-sm text-red-700 dark:text-red-300 whitespace-pre-line leading-relaxed">
                        {(deleteMutation.error as any)?.response?.data?.error || 
                         (deleteMutation.error as any)?.response?.data?.message || 
                         (deleteMutation.error as any)?.message || 
                         'Erro ao excluir centro de custo'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

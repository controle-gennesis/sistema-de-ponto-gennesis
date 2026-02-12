'use client';

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Package, Plus, Edit, Trash2, Search, X, Check, AlertCircle, Upload, Download } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface ConstructionMaterial {
  id: string;
  sinapiCode: string;
  description: string;
  unit: string;
  medianPrice?: number | string;
  state?: string;
  referenceMonth?: number;
  referenceYear?: number;
  categoryId?: string;
  costCenterId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function MateriaisConstrucaoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<ConstructionMaterial | null>(null);
  const [formData, setFormData] = useState({
    sinapiCode: '',
    description: '',
    unit: '',
    medianPrice: '',
    state: '',
    referenceMonth: '',
    referenceYear: '',
    categoryId: '',
    costCenterId: '',
    isActive: true
  });
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Buscar materiais
  const { data: materialsData, isLoading: loadingMaterials } = useQuery({
    queryKey: ['construction-materials', searchTerm],
    queryFn: async () => {
      const res = await api.get('/construction-materials', {
        params: {
          search: searchTerm || undefined,
          limit: 100
        }
      });
      return res.data;
    }
  });

  // Criar material
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/construction-materials', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowForm(false);
      resetForm();
      toast.success('Material criado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao criar material:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Erro ao criar material';
      toast.error(errorMessage);
    }
  });

  // Atualizar material
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/construction-materials/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setEditingMaterial(null);
      resetForm();
      toast.success('Material atualizado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao atualizar material:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Erro ao atualizar material';
      toast.error(errorMessage);
    }
  });

  // Deletar material
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/construction-materials/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowDeleteModal(null);
    }
  });

  // Importar materiais
  const importMutation = useMutation({
    mutationFn: async (materials: any[]) => {
      const res = await api.post('/construction-materials/import', { materials });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['construction-materials'] });
      setShowImportModal(false);
      setImportData('');
      alert(`Importação concluída: ${data.data.created} materiais criados`);
    },
    onError: (error: any) => {
      console.error('Erro ao importar materiais:', error);
      alert('Erro ao importar materiais: ' + (error.response?.data?.message || error.message));
    }
  });

  const resetForm = () => {
    setFormData({
      sinapiCode: '',
      description: '',
      unit: '',
      medianPrice: '',
      state: '',
      referenceMonth: '',
      referenceYear: '',
      categoryId: '',
      costCenterId: '',
      isActive: true
    });
    setEditingMaterial(null);
  };

  const handleEdit = (material: ConstructionMaterial) => {
    setEditingMaterial(material);
    setFormData({
      sinapiCode: material.sinapiCode || '',
      description: material.description || '',
      unit: material.unit,
      medianPrice: material.medianPrice?.toString() || '',
      state: material.state || '',
      referenceMonth: material.referenceMonth?.toString() || '',
      referenceYear: material.referenceYear?.toString() || '',
      categoryId: material.categoryId || '',
      costCenterId: material.costCenterId || '',
      isActive: material.isActive
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação básica
    if (!formData.sinapiCode.trim() || !formData.description.trim() || !formData.unit.trim()) {
      toast.error('Por favor, preencha todos os campos obrigatórios (Código SINAPI, Descrição e Unidade)');
      return;
    }
    
    // Limpar dados: remover campos vazios e manter apenas os necessários
    const dataToSend: any = {
      sinapiCode: formData.sinapiCode.trim(),
      description: formData.description.trim(),
      unit: formData.unit.trim(),
      isActive: formData.isActive
    };
    
    // Adicionar campos opcionais apenas se tiverem valor
    if (formData.medianPrice && formData.medianPrice.toString().trim()) {
      dataToSend.medianPrice = parseFloat(formData.medianPrice.toString()) || undefined;
    }
    if (formData.state && formData.state.trim()) {
      dataToSend.state = formData.state.trim();
    }
    if (formData.referenceMonth && formData.referenceMonth.toString().trim()) {
      dataToSend.referenceMonth = parseInt(formData.referenceMonth.toString()) || undefined;
    }
    if (formData.referenceYear && formData.referenceYear.toString().trim()) {
      dataToSend.referenceYear = parseInt(formData.referenceYear.toString()) || undefined;
    }
    if (formData.categoryId && formData.categoryId.trim()) {
      dataToSend.categoryId = formData.categoryId.trim();
    }
    if (formData.costCenterId && formData.costCenterId.trim()) {
      dataToSend.costCenterId = formData.costCenterId.trim();
    }
    
    console.log('Enviando dados:', dataToSend);
    
    if (editingMaterial) {
      updateMutation.mutate({ id: editingMaterial.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        let materials: any[] = [];

        if (file.name.endsWith('.json')) {
          materials = JSON.parse(text);
        } else if (file.name.endsWith('.csv')) {
          const lines = text.split('\n').filter(line => line.trim());
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const material: any = {};
            headers.forEach((header, index) => {
              if (header === 'codigo' || header === 'code' || header === 'sinapicode') {
                material.sinapiCode = values[index];
              } else if (header === 'descrição' || header === 'description' || header === 'descricao') {
                material.description = values[index];
              } else if (header === 'unidade' || header === 'unit') {
                material.unit = values[index];
              } else if (header === 'ativo' || header === 'isactive' || header === 'is_active') {
                material.isActive = values[index]?.toLowerCase() === 'true' || values[index] === '1';
              }
            });
            if (material.sinapiCode && material.description && material.unit) {
              materials.push(material);
            }
          }
        }

        if (materials.length > 0) {
          setImportData(JSON.stringify(materials, null, 2));
          setShowImportModal(true);
        } else {
          alert('Nenhum material válido encontrado no arquivo');
        }
      } catch (error) {
        alert('Erro ao processar arquivo: ' + (error as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    try {
      const materials = JSON.parse(importData);
      if (Array.isArray(materials) && materials.length > 0) {
        importMutation.mutate(materials);
      } else {
        alert('Formato inválido. Deve ser um array de materiais.');
      }
    } catch (error) {
      alert('Erro ao processar dados: ' + (error as Error).message);
    }
  };

  const handleExport = () => {
    const materials = materialsData?.data || [];
    const json = JSON.stringify(materials, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `materiais-construcao-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const materials = materialsData?.data || [];
  const filteredMaterials = materials.filter((material: ConstructionMaterial) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      material.sinapiCode.toLowerCase().includes(search) ||
      material.description?.toLowerCase().includes(search) ||
      material.unit.toLowerCase().includes(search)
    );
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

  return (
    <ProtectedRoute route="/ponto/materiais-construcao">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Materiais de Construção
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Gerencie os materiais de construção civil
            </p>
          </div>

          {/* Busca e ações */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar por código SINAPI, descrição ou unidade..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    Exportar
                  </button>
                  <button
                    onClick={() => {
                      setShowImportModal(true);
                      setImportData('');
                    }}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                  >
                    <Upload className="w-4 h-4" />
                    Importar
                  </button>
                  <button
                    onClick={() => {
                      resetForm();
                      setShowForm(true);
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    Cadastrar Material
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Formulário */}
          {showForm && (
            <Card>
              <CardHeader className="border-b-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {editingMaterial ? 'Editar Material' : 'Material'}
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Código SINAPI *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.sinapiCode}
                      onChange={(e) => setFormData({ ...formData, sinapiCode: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Ex: 12345"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Descrição *
                    </label>
                    <textarea
                      required
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Descrição do material..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Unidade de Medida *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Ex: kg, m, m², un"
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
                          Erro ao salvar material
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
                        : editingMaterial
                        ? 'Atualizar'
                        : 'Criar'}
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Lista de materiais */}
          <Card>
            <CardHeader className="border-b-0">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Materiais de Construção
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {filteredMaterials.length} {filteredMaterials.length === 1 ? 'material cadastrado' : 'materiais cadastrados'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingMaterials ? (
                <div className="text-center py-8">
                  <Loading message="Carregando materiais..." />
                </div>
              ) : filteredMaterials.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">
                    {searchTerm ? 'Nenhum material encontrado' : 'Nenhum material cadastrado'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Código SINAPI
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Descrição
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Unidade
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredMaterials.map((material: ConstructionMaterial) => (
                        <tr
                          key={material.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {material.sinapiCode}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {material.description || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                            {material.unit}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                material.isActive
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                              }`}
                            >
                              {material.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEdit(material)}
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setShowDeleteModal(material.id)}
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
                Excluir Material?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
                Tem certeza que deseja excluir este material? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(showDeleteModal)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de importação */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => {
              setShowImportModal(false);
              setImportData('');
            }} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Upload className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Importar Materiais
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportData('');
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Carregar arquivo (CSV ou JSON)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileUpload}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Formato CSV: nome,descrição,unidade,ativo (com cabeçalho na primeira linha)
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Formato JSON: Array de objetos com campos: name, description, unit, isActive
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ou cole os dados JSON aqui:
                  </label>
                  <textarea
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm"
                    placeholder='[{"sinapiCode": "12345", "description": "Cimento Portland", "unit": "kg", "isActive": true}]'
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportData('');
                    }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!importData.trim() || importMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                  >
                    {importMutation.isPending ? 'Importando...' : 'Importar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

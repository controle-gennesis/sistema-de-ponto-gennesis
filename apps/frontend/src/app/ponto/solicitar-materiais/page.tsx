'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart,
  Plus,
  List,
  X,
  AlertCircle,
  Send,
  Pencil,
  Paperclip,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useCostCenters } from '@/hooks/useCostCenters';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

function absoluteUploadUrl(relative: string) {
  if (!relative) return '';
  if (relative.startsWith('http')) return relative;
  return `${API_ORIGIN}${relative.startsWith('/') ? '' : '/'}${relative}`;
}

function SolicitarMateriaisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [formData, setFormData] = useState({
    costCenterId: '',
    serviceOrder: '',
    description: '',
    priority: 'MEDIUM',
    items: [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
  });

  const [correctionEditId, setCorrectionEditId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    costCenterId: '',
    serviceOrder: '',
    description: '',
    priority: 'MEDIUM',
    items: [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
  });

  const [uploadingAttachment, setUploadingAttachment] = useState<{ form: 'new' | 'edit'; index: number } | null>(
    null
  );

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

  const { costCenters, isLoading: loadingCostCenters } = useCostCenters();


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
    enabled: !!userData?.data?.id && (activeTab === 'list' || !!correctionEditId)
  });

  const { data: correctionRmDetail } = useQuery({
    queryKey: ['material-request', correctionEditId],
    queryFn: async () => {
      const res = await api.get(`/material-requests/${correctionEditId}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!correctionEditId && !!userData?.data?.id
  });

  const resubmitAfterCorrectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'PENDING' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      toast.success('Requisição reenviada para análise.');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Não foi possível reenviar');
    }
  });

  type EditFormShape = typeof editFormData;

  const updateCorrectionMutation = useMutation({
    mutationFn: async ({
      id,
      submitForApproval,
      form
    }: {
      id: string;
      submitForApproval: boolean;
      form: EditFormShape;
    }) => {
      const res = await api.patch(`/material-requests/${id}`, {
        costCenterId: form.costCenterId,
        projectId: form.serviceOrder || undefined,
        description: form.description,
        priority: form.priority,
        items: form.items.map((item) => ({
          materialId: item.materialId,
          quantity: item.quantity,
          observation: item.observation,
          attachmentUrl: item.attachmentUrl || undefined,
          attachmentName: item.attachmentName || undefined
        })),
        submitForApproval
      });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      setCorrectionEditId(null);
      toast.success(
        variables.submitForApproval
          ? 'Alterações salvas e requisição reenviada para aprovação.'
          : 'Alterações salvas. Você pode continuar editando ou reenviar quando estiver pronto.'
      );
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Não foi possível salvar');
    }
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
        items: [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
      });
    }
  });

  const requests = requestsData?.data?.requests || requestsData?.data || [];

  useEffect(() => {
    const id = searchParams?.get('editRm') ?? null;
    if (!id) return;
    setCorrectionEditId(id);
    setActiveTab('list');
    router.replace('/ponto/solicitar-materiais', { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    if (!correctionEditId) return;
    const fromList = requests.find((x: { id: string }) => x.id === correctionEditId);
    const r = (correctionRmDetail as typeof fromList | undefined) || fromList;
    if (!r) return;
    const itemsFromApi = Array.isArray(r.items) ? r.items : [];
    setEditFormData({
      costCenterId: (r as { costCenterId?: string }).costCenterId || (r as { costCenter?: { id?: string } }).costCenter?.id || '',
      serviceOrder:
        (r as { projectId?: string }).projectId && (r as { project?: { code?: string; name?: string } }).project
          ? String(
              (r as { project?: { code?: string; name?: string } }).project?.code ||
                (r as { project?: { code?: string; name?: string } }).project?.name ||
                ''
            )
          : '',
      description: (r.description as string) || '',
      priority: (r.priority as string) || 'MEDIUM',
      items:
        itemsFromApi.length > 0
          ? itemsFromApi.map(
              (it: {
                materialId?: string;
                material?: { id?: string; unit?: string };
                quantity?: unknown;
                unit?: string;
                notes?: string | null;
                attachmentUrl?: string | null;
                attachmentName?: string | null;
              }) => ({
                materialId: it.materialId || it.material?.id || '',
                quantity: Math.max(1, Math.floor(Number(it.quantity)) || 1),
                unit: it.unit || it.material?.unit || '',
                observation: it.notes || '',
                attachmentUrl: it.attachmentUrl || '',
                attachmentName: it.attachmentName || ''
              })
            )
          : [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
    });
  }, [correctionEditId, correctionRmDetail, requests]);

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
      items: [
        ...formData.items,
        { materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }
      ]
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
    if (field === 'materialId') {
      if (value) {
        const material = (materialsData?.data || []).find((m: any) => m.id === value);
        newItems[index].unit = material?.unit || '';
      } else {
        newItems[index].unit = '';
      }
    }
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      costCenterId: formData.costCenterId,
      serviceOrder: formData.serviceOrder || undefined,
      description: formData.description,
      priority: formData.priority,
      projectId: formData.serviceOrder || undefined,
      items: formData.items.map((item) => ({
        materialId: item.materialId,
        quantity: Number(item.quantity),
        observation: item.observation,
        attachmentUrl: item.attachmentUrl?.trim() || undefined,
        attachmentName: item.attachmentName?.trim() || undefined
      }))
    });
  };

  const handleEditAddItem = () => {
    setEditFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }
      ]
    }));
  };

  const handleItemAttachmentFile = async (form: 'new' | 'edit', index: number, file: File | null) => {
    if (!file) return;
    setUploadingAttachment({ form, index });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/material-requests/upload-item-attachment', fd);
      const d = res.data?.data as { url?: string; originalName?: string } | undefined;
      if (!d?.url) throw new Error('Resposta inválida do servidor');
      if (form === 'new') {
        setFormData((prev) => {
          const next = [...prev.items];
          next[index] = {
            ...next[index],
            attachmentUrl: d.url!,
            attachmentName: d.originalName || ''
          };
          return { ...prev, items: next };
        });
      } else {
        setEditFormData((prev) => {
          const next = [...prev.items];
          next[index] = {
            ...next[index],
            attachmentUrl: d.url!,
            attachmentName: d.originalName || ''
          };
          return { ...prev, items: next };
        });
      }
      toast.success('Anexo enviado');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Não foi possível enviar o anexo');
    } finally {
      setUploadingAttachment(null);
    }
  };

  const clearItemAttachment = (form: 'new' | 'edit', index: number) => {
    if (form === 'new') {
      setFormData((prev) => {
        const next = [...prev.items];
        next[index] = { ...next[index], attachmentUrl: '', attachmentName: '' };
        return { ...prev, items: next };
      });
    } else {
      setEditFormData((prev) => {
        const next = [...prev.items];
        next[index] = { ...next[index], attachmentUrl: '', attachmentName: '' };
        return { ...prev, items: next };
      });
    }
  };

  const handleEditRemoveItem = (index: number) => {
    setEditFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleEditItemChange = (index: number, field: string, value: unknown) => {
    setEditFormData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      if (field === 'materialId' && typeof value === 'string' && value) {
        const material = (materialsData?.data || []).find((m: { id: string }) => m.id === value);
        newItems[index].unit = material?.unit || '';
      } else if (field === 'materialId' && value === '') {
        newItems[index].unit = '';
      }
      return { ...prev, items: newItems };
    });
  };

  const submitCorrectionEdit = (submitForApproval: boolean) => {
    if (!correctionEditId) return;
    if (!editFormData.costCenterId) {
      toast.error('Selecione o centro de custo.');
      return;
    }
    const validItems = editFormData.items.filter((i) => i.materialId);
    if (validItems.length === 0) {
      toast.error('Inclua ao menos um material.');
      return;
    }
    updateCorrectionMutation.mutate({
      id: correctionEditId,
      submitForApproval,
      form: editFormData
    });
  };

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
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-900 dark:text-gray-100">
                                OS: {String(request?.serviceOrder || request?.project?.name || request?.projectId || request?.requestNumber || '—')}
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {request.description || 'Sem descrição'}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                                Status: <span className={`font-medium ${
                                  request.status === 'APPROVED' ? 'text-green-600' :
                                  request.status === 'PENDING' ? 'text-yellow-600' :
                                  request.status === 'IN_REVIEW' ? 'text-orange-600' :
                                  request.status === 'CANCELLED' ? 'text-gray-600' :
                                  'text-gray-600'
                                }`}>
                                  {request.status === 'APPROVED' ? 'Aprovada' :
                                   request.status === 'PENDING' ? 'Pendente' :
                                   request.status === 'IN_REVIEW' ? 'Correção RM' :
                                   request.status === 'CANCELLED' ? 'Cancelada' :
                                   request.status}
                                </span>
                              </p>
                              {request.status === 'IN_REVIEW' && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                  Ajuste os dados se necessário e reenvie para o compras analisar novamente.
                                </p>
                              )}
                            </div>
                            {request.status === 'IN_REVIEW' && (
                              <div className="shrink-0 flex flex-col sm:flex-row gap-2">
                                <button
                                  type="button"
                                  onClick={() => setCorrectionEditId(request.id)}
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                >
                                  <Pencil className="w-4 h-4" />
                                  Editar requisição
                                </button>
                                <button
                                  type="button"
                                  onClick={() => resubmitAfterCorrectionMutation.mutate(request.id)}
                                  disabled={resubmitAfterCorrectionMutation.isPending}
                                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                                >
                                  <Send className="w-4 h-4" />
                                  Reenviar sem alterar
                                </button>
                              </div>
                            )}
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
                        {costCenters.map((cc: any) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.code} - {cc.name} {cc.description ? `(${cc.description})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {!loadingCostCenters && costCenters.length === 0 && (
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
                                    {material.description || material.name}
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
                                readOnly
                                placeholder="Ex: kg, m, un"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm cursor-not-allowed"
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
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Anexo (opcional)
                              </label>
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">
                                  {uploadingAttachment?.form === 'new' && uploadingAttachment.index === index ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Paperclip className="w-4 h-4" />
                                  )}
                                  <span>
                                    {uploadingAttachment?.form === 'new' && uploadingAttachment.index === index
                                      ? 'Enviando...'
                                      : 'Escolher arquivo'}
                                  </span>
                                  <input
                                    key={`new-att-${index}-${item.attachmentUrl || 'empty'}`}
                                    type="file"
                                    className="hidden"
                                    disabled={!!uploadingAttachment}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void handleItemAttachmentFile('new', index, f);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                                {item.attachmentUrl ? (
                                  <>
                                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                                      {item.attachmentName || 'Anexo'}
                                    </span>
                                    <a
                                      href={absoluteUploadUrl(item.attachmentUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      Abrir
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => clearItemAttachment('new', index)}
                                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                    >
                                      Remover
                                    </button>
                                  </>
                                ) : null}
                              </div>
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

        {correctionEditId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => !updateCorrectionMutation.isPending && setCorrectionEditId(null)}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Editar requisição (Correção RM)
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Ajuste os dados e salve. Use &quot;Salvar e reenviar&quot; quando quiser voltar a fila de aprovação do compras.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Centro de Custo *
                  </label>
                  <select
                    value={editFormData.costCenterId}
                    onChange={(e) => setEditFormData({ ...editFormData, costCenterId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    <option value="">Selecione</option>
                    {costCenters.map((cc: any) => (
                      <option key={String(cc.id ?? cc.value)} value={String(cc.id ?? cc.value)}>
                        {cc.code} - {cc.name || cc.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Ordem de Serviço
                  </label>
                  <input
                    type="text"
                    value={editFormData.serviceOrder}
                    onChange={(e) => setEditFormData({ ...editFormData, serviceOrder: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Opcional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Descrição
                  </label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Prioridade
                  </label>
                  <select
                    value={editFormData.priority}
                    onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Itens *</span>
                    <button
                      type="button"
                      onClick={handleEditAddItem}
                      className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar item
                    </button>
                  </div>
                  <div className="space-y-3">
                    {editFormData.items.map((item, index) => (
                      <div
                        key={index}
                        className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Item {index + 1}</span>
                          {editFormData.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleEditRemoveItem(index)}
                              className="text-red-600 dark:text-red-400"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Material *</label>
                            <select
                              value={item.materialId}
                              onChange={(e) => handleEditItemChange(index, 'materialId', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                            >
                              <option value="">Selecione</option>
                              {(materialsData?.data || []).map((m: { id: string; description?: string; name?: string }) => (
                                <option key={m.id} value={m.id}>
                                  {m.description || m.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Quantidade *</label>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                handleEditItemChange(index, 'quantity', parseInt(e.target.value, 10) || 1)
                              }
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Unidade</label>
                            <input
                              type="text"
                              readOnly
                              value={item.unit}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Observação</label>
                            <input
                              type="text"
                              value={item.observation}
                              onChange={(e) => handleEditItemChange(index, 'observation', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-gray-500 mb-0.5">Anexo (opcional)</label>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                                {uploadingAttachment?.form === 'edit' && uploadingAttachment.index === index ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Paperclip className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {uploadingAttachment?.form === 'edit' && uploadingAttachment.index === index
                                    ? 'Enviando...'
                                    : 'Arquivo'}
                                </span>
                                <input
                                  key={`edit-att-${index}-${item.attachmentUrl || 'empty'}`}
                                  type="file"
                                  className="hidden"
                                  disabled={!!uploadingAttachment}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void handleItemAttachmentFile('edit', index, f);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {item.attachmentUrl ? (
                                <>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]">
                                    {item.attachmentName || 'Anexo'}
                                  </span>
                                  <a
                                    href={absoluteUploadUrl(item.attachmentUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Abrir
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => clearItemAttachment('edit', index)}
                                    className="text-xs text-red-600 dark:text-red-400"
                                  >
                                    Remover
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => setCorrectionEditId(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => submitCorrectionEdit(false)}
                  className="px-4 py-2 border border-blue-600 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30"
                >
                  {updateCorrectionMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => submitCorrectionEdit(true)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {updateCorrectionMutation.isPending ? 'Enviando...' : 'Salvar e reenviar para aprovação'}
                </button>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

/** Next.js exige Suspense em volta de `useSearchParams` na geração estática. */
export default function SolicitarMateriaisPageWithSuspense() {
  return (
    <Suspense fallback={<Loading />}>
      <SolicitarMateriaisPage />
    </Suspense>
  );
}

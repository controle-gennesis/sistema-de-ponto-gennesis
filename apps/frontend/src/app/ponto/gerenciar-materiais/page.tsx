'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { 
  Package, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Eye,
  Search,
  ThumbsUp,
  ThumbsDown,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface MaterialRequest {
  id: string;
  requestNumber?: string;
  description: string;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  createdAt: string;
  requestedBy: {
    id: string;
    name: string;
    email: string;
  };
  costCenter: {
    id: string;
    name: string;
  };
  project?: {
    id: string;
    name: string;
  };
  items: Array<{
    id: string;
    quantity: number;
    unit: string;
    observation: string;
    unitPrice?: number;
    material: {
      id: string;
      name: string;
      code: string;
      medianPrice?: number;
    };
  }>;
  approvedBy?: {
    id: string;
    name: string;
  };
  rejectedBy?: {
    id: string;
    name: string;
  };
  rejectionReason?: string;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'PENDING':
      return { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: AlertCircle };
    case 'IN_REVIEW':
      return { label: 'Em Análise', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Eye };
    case 'APPROVED':
      return { label: 'Aprovada', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle };
    case 'REJECTED':
      return { label: 'Rejeitada', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle };
    case 'CANCELLED':
      return { label: 'Cancelada', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400', icon: XCircle };
    default:
      return { label: 'Desconhecido', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400', icon: AlertCircle };
  }
};

const getPriorityInfo = (priority: string) => {
  switch (priority) {
    case 'URGENT':
      return { label: 'Urgente', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
    case 'HIGH':
      return { label: 'Alta', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' };
    case 'MEDIUM':
      return { label: 'Média', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' };
    case 'LOW':
      return { label: 'Baixa', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
    default:
      return { label: 'Média', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400' };
  }
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function GerenciarMateriaisPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [selectedRequest, setSelectedRequest] = useState<MaterialRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [showCreateOCModal, setShowCreateOCModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [ocSupplierId, setOcSupplierId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeStatusTab, setActiveStatusTab] = useState<'all' | 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('PENDING');
  const [searchTerm, setSearchTerm] = useState('');

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

  // Buscar requisições de materiais
  const { data: requestsData, isLoading: loadingRequests, refetch } = useQuery({
    queryKey: ['material-requests-manage'],
    queryFn: async () => {
      const res = await api.get('/material-requests');
      return res.data;
    }
  });

  // Aprovar requisição
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, {
        status: 'APPROVED'
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      setShowApprovalModal(false);
      setSelectedRequest(null);
    }
  });

  // Buscar fornecedores para criar OC
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { limit: 200 } });
      return res.data;
    },
    enabled: showCreateOCModal
  });

  // Criar Ordem de Compra
  const createOCMutation = useMutation({
    mutationFn: async ({ request, supplierId }: { request: MaterialRequest; supplierId: string }) => {
      const items = request.items.map((item) => ({
        materialRequestItemId: item.id,
        materialId: item.material.id,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: Number(item.material.medianPrice) || Number(item.unitPrice) || 0,
        notes: item.observation
      }));
      const res = await api.post('/purchase-orders', {
        materialRequestId: request.id,
        supplierId,
        items
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setShowCreateOCModal(false);
      setSelectedRequest(null);
      setOcSupplierId('');
      toast.success('Ordem de compra criada com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar OC');
    }
  });

  // Rejeitar requisição
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.patch(`/material-requests/${id}/status`, {
        status: 'REJECTED',
        rejectionReason: reason
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      setShowRejectionModal(false);
      setSelectedRequest(null);
      setRejectionReason('');
    }
  });

  const allRequests = requestsData?.data?.requests || requestsData?.data || [];

  // Calcular estatísticas
  const stats = {
    total: allRequests.length,
    pending: allRequests.filter((r: MaterialRequest) => r.status === 'PENDING').length,
    approved: allRequests.filter((r: MaterialRequest) => r.status === 'APPROVED').length,
    rejected: allRequests.filter((r: MaterialRequest) => r.status === 'REJECTED').length,
    cancelled: allRequests.filter((r: MaterialRequest) => r.status === 'CANCELLED').length,
    inReview: allRequests.filter((r: MaterialRequest) => r.status === 'IN_REVIEW').length
  };

  // Filtrar requisições
  const filteredRequests = allRequests.filter((request: MaterialRequest) => {
    // Filtro de status
    if (activeStatusTab !== 'all') {
      if (request.status !== activeStatusTab) return false;
    }

    // Filtro de busca
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesName = request.requestedBy.name.toLowerCase().includes(searchLower);
      const matchesDescription = request.description?.toLowerCase().includes(searchLower) || false;
      const matchesCostCenter = request.costCenter.name.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesDescription && !matchesCostCenter) return false;
    }

    return true;
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

  const handleApprove = () => {
    if (selectedRequest) {
      approveMutation.mutate(selectedRequest.id);
    }
  };

  const handleReject = () => {
    if (selectedRequest && rejectionReason.trim()) {
      rejectMutation.mutate({ id: selectedRequest.id, reason: rejectionReason });
    }
  };

  return (
    <ProtectedRoute route="/ponto/gerenciar-materiais">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Cabeçalho */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Gerenciar Requisições de Materiais</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Aprove ou rejeite requisições de materiais</p>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Pendentes</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pending}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Aprovadas</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.approved}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Rejeitadas</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.rejected}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Em Análise</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.inReview}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nome, descrição ou centro de custo..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs de Status */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8 overflow-x-auto">
              {[
                { id: 'all', label: 'Todas', count: stats.total },
                { id: 'PENDING', label: 'Pendentes', count: stats.pending },
                { id: 'IN_REVIEW', label: 'Em Análise', count: stats.inReview },
                { id: 'APPROVED', label: 'Aprovadas', count: stats.approved },
                { id: 'REJECTED', label: 'Rejeitadas', count: stats.rejected },
                { id: 'CANCELLED', label: 'Canceladas', count: stats.cancelled }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveStatusTab(tab.id as any)}
                  className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                    activeStatusTab === tab.id
                      ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeStatusTab === tab.id
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          {/* Lista de Requisições */}
          <Card>
            <CardContent className="p-6">
              {loadingRequests ? (
                <div className="text-center py-8">
                  <Loading message="Carregando requisições..." />
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">Nenhuma requisição encontrada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRequests.map((request: MaterialRequest) => {
                    const statusInfo = getStatusInfo(request.status);
                    const priorityInfo = getPriorityInfo(request.priority);
                    const StatusIcon = statusInfo.icon;

                    return (
                      <div
                        key={request.id}
                        className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${priorityInfo.color}`}>
                                {priorityInfo.label}
                              </span>
                            </div>
                            <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                              Requisição #{request.id.slice(0, 8)}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {request.description || 'Sem descrição'}
                            </p>
                            <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                              <span>Solicitante: {request.requestedBy.name}</span>
                              <span>Centro de Custo: {request.costCenter.name}</span>
                              {request.project && <span>Projeto: {request.project.name}</span>}
                              <span>Itens: {request.items.length}</span>
                              <span>Criado em: {formatDate(request.createdAt)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {request.status === 'APPROVED' && (
                              <button
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setShowCreateOCModal(true);
                                  setOcSupplierId('');
                                }}
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title="Criar Ordem de Compra"
                              >
                                <FileText className="w-5 h-5" />
                              </button>
                            )}
                            {(request.status === 'PENDING' || request.status === 'IN_REVIEW') && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setShowApprovalModal(true);
                                  }}
                                  className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                  title="Aprovar"
                                >
                                  <ThumbsUp className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setShowRejectionModal(true);
                                  }}
                                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                  title="Rejeitar"
                                >
                                  <ThumbsDown className="w-5 h-5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowDetailsModal(true);
                              }}
                              className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="Ver detalhes"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Modal Detalhes */}
        {showDetailsModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => { setShowDetailsModal(false); setSelectedRequest(null); }} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Detalhes da Requisição
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Número</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{selectedRequest.requestNumber || `#${selectedRequest.id.slice(0, 8)}`}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusInfo(selectedRequest.status).color}`}>
                    {getStatusInfo(selectedRequest.status).label}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Solicitante</p>
                  <p className="text-gray-900 dark:text-gray-100">{selectedRequest.requestedBy?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Centro de Custo</p>
                  <p className="text-gray-900 dark:text-gray-100">{selectedRequest.costCenter?.name}</p>
                </div>
                {selectedRequest.project && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Projeto</p>
                    <p className="text-gray-900 dark:text-gray-100">{selectedRequest.project.name}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Descrição</p>
                  <p className="text-gray-900 dark:text-gray-100">{selectedRequest.description || 'Sem descrição'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Itens</p>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                          <th className="text-left p-2">Material</th>
                          <th className="text-right p-2">Qtd</th>
                          <th className="text-right p-2">Unidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRequest.items?.map((item: any) => (
                          <tr key={item.id} className="border-t border-gray-200 dark:border-gray-600">
                            <td className="p-2 text-gray-900 dark:text-gray-100">{item.material?.description || item.material?.name || '-'}</td>
                            <td className="p-2 text-right">{item.quantity}</td>
                            <td className="p-2 text-right">{item.unit || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => { setShowDetailsModal(false); setSelectedRequest(null); }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Aprovação */}
        {showApprovalModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowApprovalModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Aprovar Requisição
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Tem certeza que deseja aprovar esta requisição de material?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowApprovalModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 disabled:opacity-50"
                >
                  {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Criar OC */}
        {showCreateOCModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateOCModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Criar Ordem de Compra (OC)
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                SC: {selectedRequest.requestNumber || selectedRequest.id.slice(0, 8)}
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Fornecedor *
                </label>
                <select
                  value={ocSupplierId}
                  onChange={(e) => setOcSupplierId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione o fornecedor</option>
                  {(suppliersData?.data || []).filter((s: any) => s.isActive).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                  ))}
                </select>
                {(suppliersData?.data || []).length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Cadastre fornecedores em Suprimentos → Fornecedores
                  </p>
                )}
              </div>
              <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                <p className="font-medium mb-1">Itens da SC:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {selectedRequest.items.map((item) => (
                    <li key={item.id}>
                      {item.material.name || item.material.code} - {item.quantity} {item.unit}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCreateOCModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => createOCMutation.mutate({ request: selectedRequest, supplierId: ocSupplierId })}
                  disabled={!ocSupplierId || createOCMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {createOCMutation.isPending ? 'Criando...' : 'Criar OC'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Rejeição */}
        {showRejectionModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowRejectionModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Rejeitar Requisição
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Motivo da Rejeição *
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Informe o motivo da rejeição..."
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowRejectionModal(false);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejectMutation.isPending || !rejectionReason.trim()}
                  className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 disabled:opacity-50"
                >
                  {rejectMutation.isPending ? 'Rejeitando...' : 'Rejeitar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

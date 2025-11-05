'use client';

import React, { useState } from 'react';
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
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { MainLayout } from '@/components/layout/MainLayout';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';

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

export default function GerenciarSolicitacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [selectedRequest, setSelectedRequest] = useState<PointCorrectionRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionComment, setRejectionComment] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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
  const { data: requestsData, isLoading: loadingRequests, refetch } = useQuery({
    queryKey: ['point-corrections-gerenciar', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) {
        params.append('status', statusFilter);
      }
      // Se não selecionou nada, não enviar parâmetro (padrão: apenas pendentes)
      
      const res = await api.get(`/solicitacoes/gerenciar?${params.toString()}`);
      return res.data;
    }
  });

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

  if (loadingUser || loadingRequests) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  const requests = requestsData?.data || requestsData || [];

  // Debug: verificar o que está sendo retornado
  console.log('requestsData:', requestsData);
  console.log('requests:', requests);
  console.log('statusFilter:', statusFilter);

  return (
    <MainLayout 
      userRole={user.role} 
      userName={user.name} 
      onLogout={handleLogout}
    >
      <div className="space-y-6 w-full px-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Gerenciar Solicitações</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Aprove ou rejeite solicitações de correção de ponto</p>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-48">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Pendentes</option>
                  <option value="all">Todos os status</option>
                  <option value="IN_REVIEW">Em Análise</option>
                  <option value="APPROVED">Aprovada</option>
                  <option value="REJECTED">Rejeitada</option>
                  <option value="CANCELLED">Cancelada</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de solicitações */}
        <div className="space-y-4">
          {requests.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">Nenhuma solicitação encontrada</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ajuste os filtros ou aguarde novas solicitações</p>
              </CardContent>
            </Card>
          ) : (
            requests.map((request: PointCorrectionRequest) => {
              const statusInfo = getStatusInfo(request.status);
              const StatusIcon = statusInfo.icon;

              return (
                <Card key={request.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{request.title}</h3>
                          <Badge className={statusInfo.color}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <User className="w-4 h-4" />
                              <span className="font-medium">{request.employee.user.name}</span>
                              <span className="text-gray-400 dark:text-gray-500">•</span>
                              <span>{request.employee.department}</span>
                            </div>
                            
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <Calendar className="w-4 h-4" />
                              <span>Criado em {formatDate(request.createdAt)}</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
                              <span className="font-medium">Original:</span>
                              <span>{formatDate(request.originalDate)} às {formatTime(request.originalTime)}</span>
                            </div>
                            
                            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                              <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                              <span className="font-medium">Corrigido:</span>
                              <span>{formatDate(request.correctedDate)} às {formatTime(request.correctedTime)}</span>
                            </div>
                          </div>
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                          {request.description}
                        </p>

                        {request.comments.length > 0 && (
                          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <MessageSquare className="w-4 h-4" />
                            <span>{request.comments.length} comentário(s)</span>
                          </div>
                        )}
                      </div>

                      <div className="ml-4 flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedRequest(request)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Ver Detalhes
                        </Button>
                        
                        {request.status === 'PENDING' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowApprovalModal(true);
                              }}
                            >
                              <ThumbsUp className="w-4 h-4 mr-1" />
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowRejectionModal(true);
                              }}
                            >
                              <ThumbsDown className="w-4 h-4 mr-1" />
                              Rejeitar
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Modal de detalhes */}
        {selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedRequest(null)} />
            <div className="relative w-full max-w-3xl bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden max-h-[90vh]">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Detalhes da Solicitação
                </h3>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              
              <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 space-y-6">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{selectedRequest.title}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{selectedRequest.description}</p>
                </div>

                <div>
                  <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Justificativa:</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-3 rounded">
                    {selectedRequest.justification}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded">
                    <h6 className="font-medium text-red-800 dark:text-red-300 mb-2">Dados Originais</h6>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {formatDate(selectedRequest.originalDate)} às {formatTime(selectedRequest.originalTime)}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {getTypeLabel(selectedRequest.originalType)}
                    </p>
                  </div>

                  <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded">
                    <h6 className="font-medium text-green-800 dark:text-green-300 mb-2">Dados Corrigidos</h6>
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
                    <h6 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Comentários:</h6>
                    <div className="space-y-2">
                      {selectedRequest.comments.map((comment) => (
                        <div key={comment.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{comment.user.name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(comment.createdAt)}</span>
                            {comment.isInternal && (
                              <Badge size="sm" className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
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
            </div>
          </div>
        )}

        {/* Modal de aprovação */}
        {showApprovalModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowApprovalModal(false)} />
            <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-2xl">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Aprovar Solicitação</h3>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Comentário de Aprovação *
                  </label>
                  <textarea
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    placeholder="Digite um comentário sobre a aprovação..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowApprovalModal(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending || !approvalComment.trim()}
                  className="bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-800"
                >
                  {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de rejeição */}
        {showRejectionModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowRejectionModal(false)} />
            <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-2xl">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Rejeitar Solicitação</h3>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Motivo da Rejeição *
                  </label>
                  <Input
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Ex: Dados inconsistentes"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Comentário *
                  </label>
                  <textarea
                    value={rejectionComment}
                    onChange={(e) => setRejectionComment(e.target.value)}
                    placeholder="Explique o motivo da rejeição..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowRejectionModal(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={rejectMutation.isPending || !rejectionReason.trim() || !rejectionComment.trim()}
                  className="bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800"
                >
                  {rejectMutation.isPending ? 'Rejeitando...' : 'Rejeitar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

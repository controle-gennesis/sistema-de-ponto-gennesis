'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Clock, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Eye,
  FileText,
  User
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';

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
  approvedBy?: {
    id: string;
    name: string;
    email: string;
  };
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

export const PointCorrectionList: React.FC = () => {
  const [selectedRequest, setSelectedRequest] = useState<PointCorrectionRequest | null>(null);

  const { data: requestsData, isLoading, error } = useQuery({
    queryKey: ['point-corrections'],
    queryFn: async () => {
      const response = await api.get('/solicitacoes/minhas-solicitacoes');
      return response.data;
    }
  });

  const requests = requestsData || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Carregando solicitações...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
        <p className="text-red-600 dark:text-red-400">Erro ao carregar solicitações</p>
      </div>
    );
  }

  if (!requests || requests.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Nenhuma solicitação encontrada</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Crie sua primeira solicitação de correção</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Minhas Solicitações ({requests.length})
        </h3>
      </div>

      <div className="space-y-3">
        {requests.map((request: PointCorrectionRequest) => {
          const statusInfo = getStatusInfo(request.status);
          const StatusIcon = statusInfo.icon;

          return (
            <Card key={request.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{request.title}</h4>
                      <Badge className={statusInfo.color}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusInfo.label}
                      </Badge>
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                      {request.description}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
                          <span className="font-medium">Original:</span>
                          <span>{formatDate(request.originalDate)} às {formatTime(request.originalTime)}</span>
                        </div>
                        <div className="ml-6 text-gray-500 dark:text-gray-400">
                          {getTypeLabel(request.originalType)}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                          <span className="font-medium">Corrigido:</span>
                          <span>{formatDate(request.correctedDate)} às {formatTime(request.correctedTime)}</span>
                        </div>
                        <div className="ml-6 text-gray-500 dark:text-gray-400">
                          {getTypeLabel(request.correctedType)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                        <span>Criado em {formatDate(request.createdAt)}</span>
                      </div>
                      {request.approvedAt && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                          <span>Aprovado em {formatDate(request.approvedAt)}</span>
                        </div>
                      )}
                    </div>

                    {request.approvedBy && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <User className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                        <span>Aprovado por {request.approvedBy.name}</span>
                      </div>
                    )}

                    {request.rejectionReason && (
                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
                        <strong>Motivo da rejeição:</strong> {request.rejectionReason}
                      </div>
                    )}
                  </div>

                  <div className="ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedRequest(request)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Ver Detalhes
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal de detalhes */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedRequest(null)} />
          <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden">
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
            
            <div className="px-6 py-4 space-y-4">
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

              {selectedRequest.rejectionReason && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded">
                  <h6 className="font-medium text-red-800 dark:text-red-300 mb-2">Motivo da Rejeição:</h6>
                  <p className="text-sm text-red-700 dark:text-red-300">{selectedRequest.rejectionReason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

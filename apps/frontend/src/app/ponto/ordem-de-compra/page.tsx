'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Eye, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  status: string;
  orderDate: string;
  expectedDelivery?: string;
  supplier: { id: string; code: string; name: string };
  materialRequest?: { requestNumber: string };
  items: { quantity: number; unitPrice: number; totalPrice: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  SENT: 'Enviada',
  PARTIALLY_RECEIVED: 'Parcialmente Recebida',
  RECEIVED: 'Recebida',
  CANCELLED: 'Cancelada'
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  SENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  RECEIVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
};

export default function OrdemDeCompraPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['purchase-orders', statusFilter],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', {
        params: statusFilter ? { status: statusFilter } : {}
      });
      return res.data;
    }
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { limit: 500 } });
      return res.data;
    },
    enabled: showNewModal
  });

  const { data: approvedRequestsData } = useQuery({
    queryKey: ['material-requests-approved'],
    queryFn: async () => {
      const res = await api.get('/material-requests', { params: { status: 'APPROVED', limit: 100 } });
      return res.data;
    },
    enabled: showNewModal
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'APPROVED' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setSelectedOrder(null);
      toast.success('Ordem de compra aprovada!');
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Erro ao aprovar')
  });

  const orders = ordersData?.data || [];
  const suppliers = suppliersData?.data || [];
  const approvedRequests = approvedRequestsData?.data || [];
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const totalOrder = (items: { totalPrice: number }[]) => items.reduce((s, i) => s + Number(i.totalPrice), 0);

  return (
    <ProtectedRoute route="/ponto/ordem-de-compra">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Ordens de Compra</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Gerencie ordens de compra no fluxo SC → OC</p>
          </div>

          <Card>
            <CardHeader className="border-b-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ordens de Compra</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {orders.length} {orders.length === 1 ? 'ordem' : 'ordens'} encontrada(s)
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label htmlFor="status-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Status
                    </label>
                    <select
                      id="status-filter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="min-w-[160px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="">Todos</option>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => setShowNewModal(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    Nova OC
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="px-6 py-12 text-center">
                  <Loading message="Carregando ordens..." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nº OC</th>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fornecedor</th>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">SC</th>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Data</th>
                        <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valor Total</th>
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {orders.map((o: PurchaseOrder) => (
                        <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <td className="px-3 sm:px-6 py-4 text-sm font-mono font-medium text-gray-900 dark:text-gray-100">{o.orderNumber}</td>
                          <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{o.supplier?.name || '-'}</td>
                          <td className="px-3 sm:px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{o.materialRequest?.requestNumber || '-'}</td>
                          <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{formatDate(o.orderDate)}</td>
                          <td className="px-3 sm:px-6 py-4 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(totalOrder(o.items))}</td>
                          <td className="px-3 sm:px-6 py-4 text-center">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                              {STATUS_LABELS[o.status] || o.status}
                            </span>
                          </td>
                          <td className="px-3 sm:px-6 py-4 text-right">
                            <button onClick={() => setSelectedOrder(o)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Ver detalhes">
                              <Eye className="w-4 h-4" />
                            </button>
                            {o.status === 'DRAFT' && (
                              <button onClick={() => approveMutation.mutate(o.id)} className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors ml-1" title="Aprovar">
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {orders.length === 0 && !isLoading && (
                    <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      Nenhuma ordem de compra encontrada. Crie uma nova a partir de uma SC aprovada em Gerenciar Requisições.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Modal Nova OC */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowNewModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Nova Ordem de Compra</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Para criar uma OC, acesse <strong>Gerenciar Requisições de Materiais</strong>, aprove uma SC e use o botão &quot;Criar OC&quot; na requisição aprovada.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowNewModal(false)} className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  Fechar
                </button>
                <button onClick={() => { router.push('/ponto/gerenciar-materiais'); setShowNewModal(false); }} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Ir para Gerenciar Requisições
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Detalhes */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedOrder(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedOrder.orderNumber}</h2>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <p><span className="font-medium text-gray-700 dark:text-gray-300">Fornecedor:</span> <span className="text-gray-600 dark:text-gray-400">{selectedOrder.supplier?.name}</span></p>
                <p><span className="font-medium text-gray-700 dark:text-gray-300">SC:</span> <span className="text-gray-600 dark:text-gray-400">{selectedOrder.materialRequest?.requestNumber || '-'}</span></p>
                <p><span className="font-medium text-gray-700 dark:text-gray-300">Data:</span> <span className="text-gray-600 dark:text-gray-400">{formatDate(selectedOrder.orderDate)}</span></p>
                <p><span className="font-medium text-gray-700 dark:text-gray-300">Valor Total:</span> <span className="text-gray-600 dark:text-gray-400">{formatCurrency(totalOrder(selectedOrder.items))}</span></p>
                <p><span className="font-medium text-gray-700 dark:text-gray-300">Status:</span> <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selectedOrder.status] || ''}`}>{STATUS_LABELS[selectedOrder.status] || selectedOrder.status}</span></p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="mt-6 w-full px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Fechar
              </button>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

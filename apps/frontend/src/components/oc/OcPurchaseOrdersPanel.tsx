'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Eye, Check, X, Wrench, Send, Download, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { exportPurchaseOrderPdf } from '@/lib/exportPurchaseOrderPdf';

export interface PurchaseOrder {
  id: string;
  materialRequestId?: string | null;
  orderNumber: string;
  status: string;
  orderDate: string;
  expectedDelivery?: string;
  deliveryAddress?: string | null;
  notes?: string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentDetails?: string | null;
  boletoAttachmentUrl?: string | null;
  boletoAttachmentName?: string | null;
  amountToPay?: number | string | null;
  supplier: {
    id: string;
    code: string;
    name: string;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    contactName?: string | null;
  };
  materialRequest?: {
    id?: string;
    requestNumber: string;
    serviceOrder?: string | null;
    description?: string | null;
    quoteMaps?: Array<{ id: string; createdAt: string }>;
  };
  quoteMap?: {
    id: string;
    createdAt: string;
    suppliers?: Array<{
      supplierId: string;
      freight?: number | string | null;
      supplier?: { id: string; name: string; code?: string | null };
    }>;
    winners?: Array<{
      id: string;
      materialRequestItemId: string;
      winnerUnitPrice: number | string;
      winnerScore: number | string;
      winnerSupplier?: { id: string; name: string; code?: string | null };
      materialRequestItem?: {
        id: string;
        material?: { name?: string | null; description?: string | null; sinapiCode?: string | null };
      };
    }>;
  } | null;
  creator?: { id: string; name: string };
  items: Array<{
    materialRequestItemId?: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unit?: string;
    material?: {
      id: string;
      name?: string | null;
      description?: string | null;
      sinapiCode?: string | null;
    };
  }>;
}

const OC_PAYMENT_TYPE_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO: 'Boleto'
};

const OC_PAYMENT_CONDITION_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO_30: 'Boleto 30 dias',
  BOLETO_28: 'Boleto 28 dias'
};

function apiOriginForFiles(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
}

function nextApprovalStatus(currentStatus: string): string {
  if (currentStatus === 'PENDING_DIRETORIA') return 'APPROVED';
  if (currentStatus === 'PENDING') return 'PENDING_DIRETORIA';
  return 'PENDING';
}

function approvalLabel(currentStatus: string): string {
  if (currentStatus === 'PENDING_DIRETORIA') return 'Aprovar (Diretoria)';
  if (currentStatus === 'PENDING') return 'Aprovar (Gestor)';
  return 'Aprovar (Compras)';
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING_COMPRAS: 'OC - Aprovação Compras',
  PENDING: 'OC - Aprovação Gestor',
  PENDING_DIRETORIA: 'OC - Aprovação Diretoria',
  IN_REVIEW: 'CORREÇÃO OC',
  APPROVED: 'Aprovada',
  SENT: 'Enviada',
  PARTIALLY_RECEIVED: 'Parcialmente Recebida',
  RECEIVED: 'Recebida',
  REJECTED: 'Reprovada',
  CANCELLED: 'Cancelada'
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  PENDING_COMPRAS: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PENDING_DIRETORIA: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300',
  IN_REVIEW: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  SENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PARTIALLY_RECEIVED: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  RECEIVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
};

export type OcTab = 'all' | 'compras' | 'gestor' | 'diretoria' | 'IN_REVIEW' | 'APPROVED' | 'outras';

export type OcPurchaseOrdersPanelProps = {
  /** Quando true, painel integrado ao fluxo SC/RM (mesma página). */
  embedded?: boolean;
  /** Esconde a barra de abas interna (abas unificadas na página pai). */
  hideTabs?: boolean;
  /** Aba OC ativa quando `hideTabs` (controlado pelo pai). */
  activeTab?: OcTab;
};

export function OcPurchaseOrdersPanel({
  embedded = false,
  hideTabs = false,
  activeTab: activeTabProp
}: OcPurchaseOrdersPanelProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [internalActiveTab, setInternalActiveTab] = useState<OcTab>('all');
  const activeTab = hideTabs ? (activeTabProp ?? 'all') : internalActiveTab;
  const setActiveTab = (t: OcTab) => {
    if (!hideTabs) setInternalActiveTab(t);
  };
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PurchaseOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [correctionTarget, setCorrectionTarget] = useState<PurchaseOrder | null>(null);
  const [pdfExportingId, setPdfExportingId] = useState<string | null>(null);
  const [showEditOcModal, setShowEditOcModal] = useState(false);
  const [orderDetailLoadingId, setOrderDetailLoadingId] = useState<string | null>(null);

  const [editOcForm, setEditOcForm] = useState<{
    expectedDelivery: string; // input date: YYYY-MM-DD
    deliveryAddress: string;
    paymentType: string;
    paymentCondition: string;
    paymentDetails: string;
    amountToPay: string;
    notes: string;
    items: Array<{
      materialId: string;
      quantity: number;
      unit: string;
      unitPrice: number;
    }>;
  } | null>(null);

  const handleExportPdf = async (id: string) => {
    setPdfExportingId(id);
    try {
      await exportPurchaseOrderPdf(id);
      toast.success('PDF gerado com sucesso.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar PDF';
      toast.error(msg);
    } finally {
      setPdfExportingId(null);
    }
  };

  const toDateInputValue = (d?: string | null) => {
    if (!d) return '';
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    return x.toISOString().slice(0, 10);
  };

  const parseMoneyInput = (value: string): number | null => {
    const cleaned = value.trim().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    if (!cleaned) return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['purchase-orders', 'list-full'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500 } });
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
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const nextStatus = nextApprovalStatus(currentStatus);
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: nextStatus });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setSelectedOrder(null);
      if (variables.currentStatus === 'PENDING_DIRETORIA') {
        toast.success('OC aprovada pela diretoria.');
      } else if (variables.currentStatus === 'PENDING') {
        toast.success('OC enviada para aprovação da diretoria.');
      } else {
        toast.success('OC aprovada pelo compras e enviada para aprovação do gestor.');
      }
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao aprovar')
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'REJECTED',
        rejectionReason: reason
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setRejectTarget(null);
      setRejectReason('');
      setSelectedOrder(null);
      toast.success('Ordem de compra reprovada.');
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao reprovar')
  });

  const correctionOcMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'IN_REVIEW' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setCorrectionTarget(null);
      setSelectedOrder(null);
      toast.success('OC enviada para CORREÇÃO OC.');
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao enviar para correção')
  });

  const resubmitOcMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'PENDING_COMPRAS' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setSelectedOrder(null);
      toast.success('OC reenviada para aprovação.');
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao reenviar')
  });

  const updateOcDetailsMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await api.patch(`/purchase-orders/${id}/details`, payload);
      return res.data;
    },
    onSuccess: (resp: any) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      const updatedOrder = resp?.data;
      if (updatedOrder) setSelectedOrder(updatedOrder);
      setShowEditOcModal(false);
      toast.success('OC atualizada com sucesso.');
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao atualizar OC')
  });

  const allOrders: PurchaseOrder[] = ordersData?.data || [];

  const tabCounts = useMemo(() => {
    const compras = allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT').length;
    const gestor = allOrders.filter((o) => o.status === 'PENDING').length;
    const diretoria = allOrders.filter((o) => o.status === 'PENDING_DIRETORIA').length;
    const emCorrecao = allOrders.filter((o) => o.status === 'IN_REVIEW').length;
    const aprovadas = allOrders.filter((o) => o.status === 'APPROVED').length;
    const outras = allOrders.filter(
      (o) =>
        !['PENDING_COMPRAS', 'PENDING', 'DRAFT', 'PENDING_DIRETORIA', 'IN_REVIEW', 'APPROVED'].includes(o.status)
    ).length;
    return {
      all: allOrders.length,
      compras,
      gestor,
      diretoria,
      IN_REVIEW: emCorrecao,
      APPROVED: aprovadas,
      outras
    };
  }, [allOrders]);

  const orders = useMemo(() => {
    if (activeTab === 'all') return allOrders;
    if (activeTab === 'compras') {
      return allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT');
    }
    if (activeTab === 'gestor') {
      return allOrders.filter((o) => o.status === 'PENDING');
    }
    if (activeTab === 'diretoria') {
      return allOrders.filter((o) => o.status === 'PENDING_DIRETORIA');
    }
    if (activeTab === 'IN_REVIEW') {
      return allOrders.filter((o) => o.status === 'IN_REVIEW');
    }
    if (activeTab === 'APPROVED') {
      return allOrders.filter((o) => o.status === 'APPROVED');
    }
    if (activeTab === 'outras') {
      return allOrders.filter(
        (o) =>
          !['PENDING_COMPRAS', 'PENDING', 'DRAFT', 'PENDING_DIRETORIA', 'IN_REVIEW', 'APPROVED'].includes(o.status)
      );
    }
    return allOrders;
  }, [allOrders, activeTab]);

  void suppliersData;
  void approvedRequestsData;

  const currentUserId = userData?.data?.id as string | undefined;

  const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString('pt-BR') : '-');
  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const totalOrder = (items: { totalPrice: number }[]) =>
    items.reduce((s, i) => s + Number(i.totalPrice), 0);

  const materialLineLabel = (
    m?:
      | PurchaseOrder['items'][number]['material']
      | {
          name?: string | null;
          description?: string | null;
          sinapiCode?: string | null;
        }
  ) => {
    if (!m) return '—';
    const d = m.description?.trim();
    const n = m.name?.trim();
    if (d) return d;
    if (n) return n;
    if (m.sinapiCode) return m.sinapiCode;
    return '—';
  };

  const openOrderDetail = async (o: PurchaseOrder) => {
    setOrderDetailLoadingId(o.id);
    try {
      const res = await api.get(`/purchase-orders/${o.id}`);
      const order = res.data?.data as PurchaseOrder | undefined;
      if (!order) {
        toast.error('Não foi possível carregar a OC.');
        return;
      }
      setSelectedOrder(order);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Erro ao carregar detalhes da OC.');
    } finally {
      setOrderDetailLoadingId(null);
    }
  };

  const handleOpenEditOc = () => {
    if (!selectedOrder) return;
    if (selectedOrder.status !== 'IN_REVIEW') return;
    if (!selectedOrder.creator?.id || selectedOrder.creator.id !== currentUserId) return;

    const items = (selectedOrder.items || []).map((it) => ({
      materialId: it.material?.id || '',
      quantity: Number(it.quantity),
      unit: it.unit || 'UN',
      unitPrice: Number(it.unitPrice)
    }));

    // Segurança: o backend precisa de materialId e unit
    const invalid = items.some((it) => !it.materialId || !it.unit);
    if (invalid) {
      toast.error('Não foi possível carregar os itens da OC para edição.');
      return;
    }

    setEditOcForm({
      expectedDelivery: toDateInputValue(selectedOrder.expectedDelivery),
      deliveryAddress: selectedOrder.deliveryAddress || '',
      paymentType: selectedOrder.paymentType || 'AVISTA',
      paymentCondition: selectedOrder.paymentCondition || 'AVISTA',
      paymentDetails: selectedOrder.paymentDetails || '',
      amountToPay: selectedOrder.amountToPay != null ? String(selectedOrder.amountToPay) : '',
      notes: selectedOrder.notes || '',
      items
    });
    setShowEditOcModal(true);
  };

  const handleSaveEditOc = () => {
    if (!selectedOrder || !editOcForm) return;
    const amountToPay = parseMoneyInput(editOcForm.amountToPay);

    const payload = {
      expectedDelivery: editOcForm.expectedDelivery ? new Date(editOcForm.expectedDelivery).toISOString() : null,
      deliveryAddress: editOcForm.deliveryAddress.trim() || null,
      paymentType: editOcForm.paymentType,
      paymentCondition: editOcForm.paymentCondition,
      paymentDetails: editOcForm.paymentDetails.trim() || null,
      amountToPay,
      notes: editOcForm.notes.trim() || null,
      items: editOcForm.items.map((it) => ({
        materialId: it.materialId,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unitPrice)
      }))
    };

    updateOcDetailsMutation.mutate({
      id: selectedOrder.id,
      payload
    });
  };

  return (
    <>
      <section id="fluxo-oc" className="scroll-mt-4">
        <Card>
          <CardHeader
            className={
              hideTabs
                ? 'border-b border-gray-200 dark:border-gray-700'
                : 'border-b-0'
            }
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                  <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-3 sm:ml-4 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {embedded ? 'Ordens de compra (OC)' : 'Ordens de Compra'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {orders.length} {orders.length === 1 ? 'ordem' : 'ordens'} encontrada(s)
                    {embedded && (
                      <span className="block sm:inline sm:ml-1 text-xs text-gray-500 dark:text-gray-500 mt-1 sm:mt-0">
                        Após a SC aprovada: criar OC → aprovação Compras → Gestor → Diretoria.
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Nova OC
              </button>
            </div>
          </CardHeader>
          {!hideTabs && (
            <div className="border-b border-gray-200 dark:border-gray-700 px-4">
              <nav className="-mb-px flex flex-wrap gap-1 sm:gap-2 overflow-x-auto py-2">
                {(
                  [
                    { id: 'all' as const, label: 'Todas', count: tabCounts.all },
                    { id: 'compras' as const, label: 'OC - Aprovação Compras', count: tabCounts.compras },
                    { id: 'gestor' as const, label: 'OC - Aprovação Gestor', count: tabCounts.gestor },
                    { id: 'diretoria' as const, label: 'OC - Aprovação Diretoria', count: tabCounts.diretoria },
                    { id: 'IN_REVIEW' as const, label: 'Correção OC', count: tabCounts.IN_REVIEW },
                    { id: 'APPROVED' as const, label: 'Aprovadas', count: tabCounts.APPROVED },
                    { id: 'outras' as const, label: 'Demais status', count: tabCounts.outras }
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        activeTab === tab.id
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          )}
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
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Nº OC
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Fornecedor
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        SC
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Data
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Valor Total
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {orders.map((o: PurchaseOrder) => (
                      <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-3 sm:px-6 py-4 text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
                          {o.orderNumber}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {o.supplier?.name || '-'}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {o.materialRequest?.requestNumber || '-'}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {formatDate(o.orderDate)}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-right text-gray-900 dark:text-gray-100">
                          {formatCurrency(totalOrder(o.items))}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-center">
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                              STATUS_COLORS[o.status] ||
                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {STATUS_LABELS[o.status] || o.status}
                          </span>
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1 flex-wrap">
                            {['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'].includes(o.status) && (
                              <button
                                type="button"
                                onClick={() => approveMutation.mutate({ id: o.id, currentStatus: o.status })}
                                className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors inline-flex"
                                title={approvalLabel(o.status)}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'].includes(o.status) && (
                              <button
                                type="button"
                                onClick={() => setCorrectionTarget(o)}
                                className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors inline-flex"
                                title="Enviar para CORREÇÃO OC"
                              >
                                <Wrench className="w-4 h-4" />
                              </button>
                            )}
                            {['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'].includes(o.status) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectTarget(o);
                                  setRejectReason('');
                                }}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors inline-flex"
                                title="Reprovar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {o.status === 'IN_REVIEW' &&
                              o.creator?.id &&
                              currentUserId === o.creator.id && (
                                <button
                                  type="button"
                                  onClick={() => resubmitOcMutation.mutate(o.id)}
                                  disabled={resubmitOcMutation.isPending}
                                  className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                  title="Reenviar para aprovação"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              )}
                            <button
                              type="button"
                              onClick={() => handleExportPdf(o.id)}
                              disabled={pdfExportingId === o.id}
                              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors inline-flex disabled:opacity-50"
                              title="Baixar OC (PDF)"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openOrderDetail(o)}
                              disabled={orderDetailLoadingId === o.id}
                              className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors inline-flex disabled:opacity-50"
                              title="Ver detalhes"
                            >
                              {orderDetailLoadingId === o.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length === 0 && !isLoading && (
                  <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    Nenhuma ordem de compra encontrada. Crie uma OC a partir de uma SC aprovada (botão &quot;Criar OC&quot; na requisição aprovada acima).
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowNewModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Nova Ordem de Compra</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Aprove uma <strong>SC</strong> na seção de requisições acima e use o botão &quot;Criar OC&quot; na requisição aprovada.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Fechar
              </button>
              {embedded ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowNewModal(false);
                    document.getElementById('secao-sc-rm')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Ir para solicitações (SC)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    router.push('/ponto/gerenciar-materiais');
                    setShowNewModal(false);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Ir para Gerenciar Requisições
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setRejectTarget(null); setRejectReason(''); }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Reprovar OC</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{rejectTarget.orderNumber}</p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-4"
              placeholder="Informe o motivo da reprovação..."
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Reprovando...' : 'Confirmar reprovação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {correctionTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCorrectionTarget(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Enviar para CORREÇÃO OC</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Quem criou a OC poderá ajustar e reenviá-la para aprovação. {correctionTarget.orderNumber}
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCorrectionTarget(null)} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg">
                Cancelar
              </button>
              <button
                type="button"
                disabled={correctionOcMutation.isPending}
                onClick={() => correctionOcMutation.mutate(correctionTarget.id)}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {correctionOcMutation.isPending ? 'Enviando...' : 'Enviar para correção'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditOcModal && selectedOrder && editOcForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEditOcModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Editar OC (CORREÇÃO OC)</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {selectedOrder.orderNumber} — somente o criador pode editar antes de reenviar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditOcModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de entrega prevista</label>
                  <input
                    type="date"
                    value={editOcForm.expectedDelivery}
                    onChange={(e) =>
                      setEditOcForm((prev) => (prev ? { ...prev, expectedDelivery: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Endereço de entrega</label>
                  <input
                    type="text"
                    value={editOcForm.deliveryAddress}
                    onChange={(e) =>
                      setEditOcForm((prev) => (prev ? { ...prev, deliveryAddress: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="Ex: Rua..., Cidade/UF"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de pagamento</label>
                  <select
                    value={editOcForm.paymentType}
                    onChange={(e) => {
                      const nextPaymentType = e.target.value;
                      const defaultCond =
                        nextPaymentType === 'AVISTA' ? 'AVISTA' : 'BOLETO_30';
                      setEditOcForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              paymentType: nextPaymentType,
                              paymentCondition: defaultCond
                            }
                          : prev
                      );
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="AVISTA">{OC_PAYMENT_TYPE_LABELS.AVISTA}</option>
                    <option value="BOLETO">{OC_PAYMENT_TYPE_LABELS.BOLETO}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Condição</label>
                  <select
                    value={editOcForm.paymentCondition}
                    onChange={(e) =>
                      setEditOcForm((prev) => (prev ? { ...prev, paymentCondition: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    {editOcForm.paymentType === 'AVISTA' ? (
                      <option value="AVISTA">{OC_PAYMENT_CONDITION_LABELS.AVISTA}</option>
                    ) : (
                      <>
                        <option value="BOLETO_30">{OC_PAYMENT_CONDITION_LABELS.BOLETO_30}</option>
                        <option value="BOLETO_28">{OC_PAYMENT_CONDITION_LABELS.BOLETO_28}</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor a pagar</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editOcForm.amountToPay}
                    onChange={(e) =>
                      setEditOcForm((prev) => (prev ? { ...prev, amountToPay: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="Ex: 1500,00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dados do pagamento</label>
                <input
                  type="text"
                  value={editOcForm.paymentDetails}
                  onChange={(e) =>
                    setEditOcForm((prev) => (prev ? { ...prev, paymentDetails: e.target.value } : prev))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Dados bancários / referência"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
                <textarea
                  value={editOcForm.notes}
                  onChange={(e) =>
                    setEditOcForm((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Informações adicionais"
                />
              </div>

              <div className="pt-2">
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Materiais (OC)</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr className="text-left">
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300">Material</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Qtd</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-center whitespace-nowrap">Un.</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Unitário</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                      {editOcForm.items.map((it, idx) => {
                        const material = selectedOrder.items?.[idx]?.material;
                        const label = materialLineLabel(material);
                        const lineTotal = Number(it.quantity) * Number(it.unitPrice);
                        return (
                          <tr key={`${it.materialId}-${idx}`} className="text-gray-600 dark:text-gray-400">
                            <td className="p-2 align-top max-w-[240px] sm:max-w-none">{label}</td>
                            <td className="p-2 text-right whitespace-nowrap align-top">
                              <input
                                type="number"
                                step="0.01"
                                value={it.quantity}
                                onChange={(e) => {
                                  const nextQty = Number(e.target.value);
                                  setEditOcForm((prev) => {
                                    if (!prev) return prev;
                                    const nextItems = prev.items.map((x, i) =>
                                      i === idx ? { ...x, quantity: Number.isFinite(nextQty) ? nextQty : 0 } : x
                                    );
                                    return { ...prev, items: nextItems };
                                  });
                                }}
                                className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              />
                            </td>
                            <td className="p-2 text-center whitespace-nowrap align-top">{it.unit}</td>
                            <td className="p-2 text-right whitespace-nowrap align-top">
                              <input
                                type="number"
                                step="0.01"
                                value={it.unitPrice}
                                onChange={(e) => {
                                  const nextPrice = Number(e.target.value);
                                  setEditOcForm((prev) => {
                                    if (!prev) return prev;
                                    const nextItems = prev.items.map((x, i) =>
                                      i === idx ? { ...x, unitPrice: Number.isFinite(nextPrice) ? nextPrice : 0 } : x
                                    );
                                    return { ...prev, items: nextItems };
                                  });
                                }}
                                className="w-28 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              />
                            </td>
                            <td className="p-2 text-right whitespace-nowrap align-top font-medium text-gray-900 dark:text-gray-100">
                              {formatCurrency(Number.isFinite(lineTotal) ? lineTotal : 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowEditOcModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={updateOcDetailsMutation.isPending}
                onClick={handleSaveEditOc}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updateOcDetailsMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedOrder(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedOrder.orderNumber}</h2>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleExportPdf(selectedOrder.id)}
                  disabled={pdfExportingId === selectedOrder.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {pdfExportingId === selectedOrder.id ? 'Gerando…' : 'PDF'}
                </button>
                <button type="button" onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">Fornecedor:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">{selectedOrder.supplier?.name}</span>
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">SC:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">{selectedOrder.materialRequest?.requestNumber || '-'}</span>
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">Ordem de serviço:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">{selectedOrder.materialRequest?.serviceOrder?.trim() || '—'}</span>
              </p>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Descrição da solicitação:</span>
                <p className="mt-1 text-gray-600 dark:text-gray-400 whitespace-pre-wrap rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 min-h-[2.5rem]">
                  {selectedOrder.materialRequest?.description?.trim() || '—'}
                </p>
              </div>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">Data:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">{formatDate(selectedOrder.orderDate)}</span>
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">Valor Total:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">{formatCurrency(totalOrder(selectedOrder.items))}</span>
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>{' '}
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selectedOrder.status] || ''}`}>
                  {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                </span>
              </p>
              {selectedOrder.paymentType && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Tipo de pagamento:</span>{' '}
                  <span className="text-gray-600 dark:text-gray-400">
                    {OC_PAYMENT_TYPE_LABELS[selectedOrder.paymentType] || selectedOrder.paymentType}
                  </span>
                </p>
              )}
              {selectedOrder.paymentCondition && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Condição:</span>{' '}
                  <span className="text-gray-600 dark:text-gray-400">
                    {OC_PAYMENT_CONDITION_LABELS[selectedOrder.paymentCondition] || selectedOrder.paymentCondition}
                  </span>
                </p>
              )}
              {selectedOrder.amountToPay != null && selectedOrder.amountToPay !== '' && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Valor a pagar:</span>{' '}
                  <span className="text-gray-600 dark:text-gray-400">{formatCurrency(Number(selectedOrder.amountToPay))}</span>
                </p>
              )}
      {selectedOrder.amountToPay != null &&
        selectedOrder.amountToPay !== '' && (
          <p>
            <span className="font-medium text-gray-700 dark:text-gray-300">Valor do frete:</span>{' '}
            <span className="text-gray-600 dark:text-gray-400">
              {(() => {
                const paid = Number(selectedOrder.amountToPay);
                const itemsTotal = totalOrder(selectedOrder.items);
                const freight = paid - itemsTotal;
                const v = Number.isFinite(freight) ? freight : 0;
                // Mostra valor positivo; se não houver frete (ou for negativo por arredondamento), exibe 0.
                return formatCurrency(v > 0 ? v : 0);
              })()}
            </span>
          </p>
        )}
              {selectedOrder.paymentDetails && (
                <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Dados do pagamento:</span> {selectedOrder.paymentDetails}
                </p>
              )}
              {selectedOrder.boletoAttachmentUrl && (
                <p>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Boleto:</span>{' '}
                  <a
                    href={`${apiOriginForFiles()}${selectedOrder.boletoAttachmentUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 underline"
                  >
                    {selectedOrder.boletoAttachmentName || 'Abrir anexo'}
                  </a>
                </p>
              )}
              {selectedOrder.notes && (
                <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Observações:</span> {selectedOrder.notes}
                </p>
              )}

              <div className="pt-2">
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Materiais (OC)</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr className="text-left">
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300">Material</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Qtd</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-center whitespace-nowrap">Un.</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Unitário</th>
                        <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                      {selectedOrder.items?.map((line, idx) => (
                        <tr key={idx} className="text-gray-600 dark:text-gray-400">
                          <td className="p-2 align-top max-w-[200px] sm:max-w-none">{materialLineLabel(line.material)}</td>
                          <td className="p-2 text-right whitespace-nowrap align-top">{Number(line.quantity)}</td>
                          <td className="p-2 text-center whitespace-nowrap align-top">{line.unit || '—'}</td>
                          <td className="p-2 text-right whitespace-nowrap align-top">{formatCurrency(Number(line.unitPrice))}</td>
                          <td className="p-2 text-right whitespace-nowrap align-top font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(Number(line.totalPrice))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-600">
                      <tr>
                        <td colSpan={4} className="p-2 text-right font-medium text-gray-700 dark:text-gray-300">
                          Total dos itens
                        </td>
                        <td className="p-2 text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {formatCurrency(totalOrder(selectedOrder.items))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="pt-2">
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Mapa de cotação vinculado</p>
                {(() => {
                  const quoteMap = selectedOrder.quoteMap || null;
                  if (!quoteMap) {
                    return (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Esta OC não possui mapa de cotação associado à SC.
                      </p>
                    );
                  }
                  const itemIds = new Set(
                    (selectedOrder.items || [])
                      .map((i) => i.materialRequestItemId)
                      .filter((x): x is string => !!x)
                  );
                  const winners = (quoteMap.winners || []).filter((w) =>
                    itemIds.size > 0 ? itemIds.has(w.materialRequestItemId) : true
                  );
                  return (
                    <div id="oc-quote-map" className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden scroll-mt-4">
                      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/40 text-xs text-gray-600 dark:text-gray-300">
                        Mapa: {quoteMap.id.slice(0, 8)} | Criado em {formatDate(quoteMap.createdAt)}
                      </div>
                      {winners.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
                          Não há vencedores do mapa vinculados aos itens desta OC.
                        </p>
                      ) : (
                        <table className="w-full text-xs sm:text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-700/30">
                            <tr className="text-left">
                              <th className="p-2 font-medium text-gray-700 dark:text-gray-300">Material</th>
                              <th className="p-2 font-medium text-gray-700 dark:text-gray-300">Fornecedor vencedor</th>
                              <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right">Preço unit.</th>
                              <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right">Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                            {winners.map((w) => (
                              <tr key={w.id} className="text-gray-600 dark:text-gray-400">
                                <td className="p-2">
                                  {materialLineLabel(w.materialRequestItem?.material) ||
                                    w.materialRequestItemId.slice(0, 8)}
                                </td>
                                <td className="p-2">{w.winnerSupplier?.name || '—'}</td>
                                <td className="p-2 text-right">{formatCurrency(Number(w.winnerUnitPrice || 0))}</td>
                                <td className="p-2 text-right">{formatCurrency(Number(w.winnerScore || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedOrder.quoteMap && (
                <button
                  type="button"
                  onClick={async () => {
                    const mapId = selectedOrder.quoteMap?.id;
                    if (!mapId) return;
                    try {
                      const response = await api.get(`/quote-maps/${mapId}/snapshot-pdf`, {
                        responseType: 'blob'
                      });
                      const blobUrl = window.URL.createObjectURL(response.data);
                      window.open(blobUrl, '_blank', 'noopener,noreferrer');
                      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
                    } catch {
                      toast.error('Não foi possível abrir o snapshot do mapa de cotação.');
                    }
                  }}
                  className="flex-1 min-w-[160px] px-3 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700"
                >
                  Ver mapa de cotação
                </button>
              )}
              {['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'].includes(selectedOrder.status) && (
                <button
                  type="button"
                  onClick={() => approveMutation.mutate({ id: selectedOrder.id, currentStatus: selectedOrder.status })}
                  disabled={approveMutation.isPending}
                  className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  {approvalLabel(selectedOrder.status)}
                </button>
              )}
              {['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'].includes(selectedOrder.status) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectTarget(selectedOrder);
                      setRejectReason('');
                    }}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Reprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorrectionTarget(selectedOrder)}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                  >
                    Correção OC
                  </button>
                </>
              )}
              {selectedOrder.status === 'IN_REVIEW' && selectedOrder.creator?.id === currentUserId && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenEditOc}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700"
                  >
                    Editar OC
                  </button>
                  <button
                    type="button"
                    onClick={() => resubmitOcMutation.mutate(selectedOrder.id)}
                    disabled={resubmitOcMutation.isPending}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Reenviar para aprovação
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="mt-4 w-full px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

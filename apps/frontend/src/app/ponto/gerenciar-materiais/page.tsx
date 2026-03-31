'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Eye,
  Search,
  FileText,
  Wrench,
  Ban,
  Pencil
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  OcPurchaseOrdersPanel,
  type OcTab,
  type PurchaseOrder
} from '@/components/oc/OcPurchaseOrdersPanel';

/** Fases SC/RM e OC na mesma barra de navegação */
type FluxTab =
  | 'rm_all'
  | 'rm_PENDING'
  | 'rm_IN_REVIEW'
  | 'rm_APPROVED'
  | 'rm_CANCELLED'
  | 'oc_compras'
  | 'oc_gestor'
  | 'oc_diretoria'
  | 'oc_IN_REVIEW'
  | 'oc_APPROVED';

function fluxTabToOcTab(f: FluxTab): OcTab {
  switch (f) {
    case 'oc_compras':
      return 'compras';
    case 'oc_gestor':
      return 'gestor';
    case 'oc_diretoria':
      return 'diretoria';
    case 'oc_IN_REVIEW':
      return 'IN_REVIEW';
    case 'oc_APPROVED':
      return 'APPROVED';
    default:
      return 'gestor';
  }
}

interface MaterialRequest {
  id: string;
  requestNumber?: string;
  serviceOrder?: string | null;
  description: string;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  createdAt: string;
  /**
   * Em alguns endpoints vem como string (id do usuário) + `requester` populado.
   * Em outros pode vir como objeto.
   */
  requestedBy?:
    | string
    | {
        id: string;
        name: string;
        email: string;
      };
  /** Nome retornado pela API (Prisma) na listagem/detalhe */
  requester?: {
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
    observation?: string;
    notes?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    unitPrice?: number;
    material: {
      id: string;
      name?: string | null;
      code?: string;
      sinapiCode?: string;
      description?: string;
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
      return { label: 'Correção RM', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: Wrench };
    case 'APPROVED':
      return { label: 'Aprovada', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle };
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

const rmSolicitante = (r: MaterialRequest) => {
  const rb = r.requestedBy as unknown;
  if (rb && typeof rb === 'object' && 'name' in (rb as any)) {
    return rb as { id: string; name: string; email: string };
  }
  return r.requester;
};

const rmTitulo = (r: MaterialRequest) => {
  const os = (r.serviceOrder || '').trim();
  if (os) return `OS ${os}`;
  if (r.requestNumber) return `OS ${r.requestNumber}`;
  return `OS #${r.id.slice(0, 8)}`;
};

/** Rótulo do material na SC (API usa sinapiCode/description; name pode vir vazio) */
function materialItemLabel(item: MaterialRequest['items'][number]): string {
  const m = item.material;
  const name = m.name?.trim();
  if (name) return name;
  const desc = m.description?.trim();
  if (desc) return desc;
  if (m.sinapiCode) return m.sinapiCode;
  if (m.code) return m.code;
  return 'Material';
}

const API_UPLOAD_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

function absoluteUploadUrl(relative: string) {
  if (!relative) return '';
  if (relative.startsWith('http')) return relative;
  return `${API_UPLOAD_ORIGIN}${relative.startsWith('/') ? '' : '/'}${relative}`;
}

function parseCurrencyBR(input: string): number | null {
  const t = input.trim().replace(/\s/g, '');
  if (!t) return null;
  const normalized = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

const OC_TYPE_AVISTA = 'AVISTA';
const OC_TYPE_BOLETO = 'BOLETO';

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/** Lista em pt-BR: "A", "A e B", "A, B e C" */
function joinOrderNumbersPt(labels: string[]): string {
  const t = labels.filter(Boolean);
  if (t.length === 0) return '';
  if (t.length === 1) return t[0];
  if (t.length === 2) return `${t[0]} e ${t[1]}`;
  return `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}`;
}

export default function GerenciarMateriaisPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [selectedRequest, setSelectedRequest] = useState<MaterialRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCreateOCModal, setShowCreateOCModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [ocSupplierId, setOcSupplierId] = useState('');
  const [ocPaymentType, setOcPaymentType] = useState<string>(OC_TYPE_AVISTA);
  const [ocPaymentCondition, setOcPaymentCondition] = useState<string>('AVISTA');
  const [ocPaymentDetails, setOcPaymentDetails] = useState('');
  const [ocObservations, setOcObservations] = useState('');
  const [ocAmountStr, setOcAmountStr] = useState('');
  const [ocBoletoFile, setOcBoletoFile] = useState<File | null>(null);
  const [ocSelectedItemIds, setOcSelectedItemIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (ocPaymentType === OC_TYPE_AVISTA) {
      setOcPaymentCondition('AVISTA');
    } else {
      setOcPaymentCondition((prev) => (prev === 'AVISTA' ? 'BOLETO_30' : prev));
    }
  }, [ocPaymentType]);

  const resetOcForm = () => {
    setOcSupplierId('');
    setOcPaymentType(OC_TYPE_AVISTA);
    setOcPaymentCondition('AVISTA');
    setOcPaymentDetails('');
    setOcObservations('');
    setOcAmountStr('');
    setOcBoletoFile(null);
    setOcSelectedItemIds(new Set());
  };

  // Quando abrir o modal de OC, preenche com TODOS os itens da SC (o comprador pode desmarcar).
  useEffect(() => {
    if (showCreateOCModal && selectedRequest) {
      setOcSelectedItemIds(new Set(selectedRequest.items.map((i) => i.id)));
    }
  }, [showCreateOCModal, selectedRequest]);

  const ocSelectedItems =
    selectedRequest?.items.filter((i) => ocSelectedItemIds.has(i.id)) ?? [];

  const toggleOcItem = (itemId: string) => {
    setOcSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectAllOcItems = () => {
    if (!selectedRequest) return;
    setOcSelectedItemIds(new Set(selectedRequest.items.map((i) => i.id)));
  };

  const clearOcItems = () => {
    setOcSelectedItemIds(new Set());
  };
  const [fluxTab, setFluxTab] = useState<FluxTab>('rm_PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const prevFluxGroupRef = useRef<'rm' | 'oc' | null>(null);

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

  const { data: ordersData } = useQuery({
    queryKey: ['purchase-orders', 'list-full'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500 } });
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
      toast.success('Requisição aprovada.');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Erro ao aprovar');
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
    mutationFn: async ({
      request,
      supplierId,
      paymentType,
      paymentCondition,
      paymentDetails,
      observations,
      amountToPay,
      boletoFile,
      selectedItemIds
    }: {
      request: MaterialRequest;
      supplierId: string;
      paymentType: string;
      paymentCondition: string;
      paymentDetails: string;
      observations: string;
      amountToPay: number;
      boletoFile: File | null;
      selectedItemIds: string[];
    }) => {
      let boletoAttachmentUrl: string | undefined;
      let boletoAttachmentName: string | undefined;
      if (boletoFile) {
        const fd = new FormData();
        fd.append('boleto', boletoFile);
        const up = await api.post('/purchase-orders/upload-boleto', fd);
        boletoAttachmentUrl = up.data?.data?.url;
        boletoAttachmentName = up.data?.data?.originalName;
      }

      const selectedSet = new Set(selectedItemIds);
      const selectedItems = request.items.filter((it) => selectedSet.has(it.id));
      if (!selectedItems.length) {
        throw new Error('Selecione pelo menos 1 item para a OC');
      }

      const items = selectedItems.map((item) => ({
        materialRequestItemId: item.id,
        materialId: item.material.id,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: Number(item.material.medianPrice) || Number(item.unitPrice) || 0,
        notes: item.observation ?? item.notes
      }));
      const res = await api.post('/purchase-orders', {
        materialRequestId: request.id,
        supplierId,
        items,
        paymentType,
        paymentCondition,
        paymentDetails: paymentDetails.trim() || undefined,
        notes: observations.trim() || undefined,
        amountToPay,
        boletoAttachmentUrl,
        boletoAttachmentName
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setShowCreateOCModal(false);
      setSelectedRequest(null);
      resetOcForm();
      toast.success('Ordem de compra criada com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar OC');
    }
  });

  const correctionMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await api.patch(`/material-requests/${id}/status`, {
        status: 'IN_REVIEW'
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      setShowCorrectionModal(false);
      setSelectedRequest(null);
      toast.success('Requisição enviada para Correção RM.');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Erro ao enviar para correção');
    }
  });

  const cancelByApproverMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'CANCELLED' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      setShowCancelModal(false);
      setSelectedRequest(null);
      toast.success('Requisição cancelada.');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Erro ao cancelar');
    }
  });

  const allRequests = requestsData?.data?.requests || requestsData?.data || [];

  // Calcular estatísticas
  const normalizedRequests = allRequests.map((r: MaterialRequest) =>
    r.status === 'REJECTED' ? ({ ...r, status: 'CANCELLED' as const }) : r
  );

  const allOrders: PurchaseOrder[] = ordersData?.data || [];

  /** Requisições que já têm pelo menos uma OC — saem da fila "RMs aprovadas" e seguem só no fluxo OC */
  const materialRequestIdsWithOc = useMemo(() => {
    const s = new Set<string>();
    for (const o of allOrders) {
      const mid = o.materialRequestId ?? o.materialRequest?.id;
      if (mid) s.add(mid);
    }
    return s;
  }, [allOrders]);

  /** OCs vinculadas por requisição (mapa de cotação pode gerar várias por RM). */
  const ordersByMaterialRequestId = useMemo(() => {
    const map = new Map<string, PurchaseOrder[]>();
    for (const o of allOrders) {
      const mid = o.materialRequestId ?? o.materialRequest?.id;
      if (!mid) continue;
      if (!map.has(mid)) map.set(mid, []);
      map.get(mid)!.push(o);
    }
    map.forEach((list) => {
      list.sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || '', 'pt-BR', { numeric: true }));
    });
    return map;
  }, [allOrders]);

  const stats = {
    total: normalizedRequests.length,
    pending: normalizedRequests.filter((r: MaterialRequest) => r.status === 'PENDING').length,
    approved: normalizedRequests.filter(
      (r: MaterialRequest) => r.status === 'APPROVED' && !materialRequestIdsWithOc.has(r.id)
    ).length,
    cancelled: normalizedRequests.filter((r: MaterialRequest) => r.status === 'CANCELLED').length,
    inReview: normalizedRequests.filter((r: MaterialRequest) => r.status === 'IN_REVIEW').length
  };

  const ocTabCounts = useMemo(() => {
    const compras = allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT').length;
    const gestor = allOrders.filter((o) => o.status === 'PENDING').length;
    const diretoria = allOrders.filter((o) => o.status === 'PENDING_DIRETORIA').length;
    const emCorrecao = allOrders.filter((o) => o.status === 'IN_REVIEW').length;
    const aprovadas = allOrders.filter((o) => o.status === 'APPROVED').length;
    return {
      compras,
      gestor,
      diretoria,
      IN_REVIEW: emCorrecao,
      APPROVED: aprovadas
    };
  }, [allOrders]);

  // Filtrar requisições (somente quando uma fase SC/RM está ativa)
  const filteredRequests = useMemo(() => {
    if (!fluxTab.startsWith('rm_')) return [];
    const rmKey = fluxTab.replace(/^rm_/, '') as 'all' | MaterialRequest['status'];
    return normalizedRequests.filter((request: MaterialRequest) => {
      if (rmKey !== 'all' && request.status !== rmKey) return false;

      if (
        rmKey === 'APPROVED' &&
        request.status === 'APPROVED' &&
        materialRequestIdsWithOc.has(request.id)
      ) {
        return false;
      }

      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesName = rmSolicitante(request)?.name?.toLowerCase().includes(searchLower) ?? false;
        const matchesDescription = request.description?.toLowerCase().includes(searchLower) || false;
        const matchesCostCenter = request.costCenter?.name?.toLowerCase().includes(searchLower) ?? false;
        if (!matchesName && !matchesDescription && !matchesCostCenter) return false;
      }

      return true;
    });
  }, [normalizedRequests, fluxTab, searchTerm, materialRequestIdsWithOc]);

  useEffect(() => {
    const group = fluxTab.startsWith('oc_') ? 'oc' : 'rm';
    if (prevFluxGroupRef.current === null) {
      prevFluxGroupRef.current = group;
      return;
    }
    if (prevFluxGroupRef.current !== group) {
      prevFluxGroupRef.current = group;
      if (group === 'oc') {
        document.getElementById('fluxo-oc')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        document.getElementById('secao-fluxo-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [fluxTab]);

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
    return;
  };

  return (
    <ProtectedRoute route="/ponto/gerenciar-materiais">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-10">
          <div id="secao-sc-rm" className="space-y-6 scroll-mt-4">
          {/* Cabeçalho */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Solicitações de materiais e ordens de compra
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Fluxo completo na mesma tela: <strong>SC / RM</strong> (aprovação e correção) → <strong>OC</strong> (compras, gestor e diretoria).
            </p>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <p className="text-sm text-gray-600 dark:text-gray-400">RMs aprovadas</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.approved}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Correção RM</p>
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

          {/* Fases SC/RM + OC (barra única, centralizada) */}
          <div id="secao-fluxo-tabs" className="scroll-mt-4">
            <p className="text-center text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
              Requisições de materiais e fases de OC
            </p>
            <div className="border-b border-gray-200 dark:border-gray-700 rounded-t-lg bg-gray-50/80 dark:bg-gray-900/40 px-2">
              <nav className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 sm:gap-x-2 overflow-x-auto py-3">
                {(
                  [
                    { id: 'rm_all' as const, label: 'Todas', count: stats.total },
                    { id: 'rm_PENDING' as const, label: 'Pendentes', count: stats.pending },
                    { id: 'rm_IN_REVIEW' as const, label: 'Correção RM', count: stats.inReview },
                    { id: 'rm_APPROVED' as const, label: 'RMs aprovadas', count: stats.approved }
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFluxTab(tab.id)}
                    className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
                      fluxTab === tab.id
                        ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        fluxTab === tab.id
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
                <span
                  className="hidden sm:inline-flex w-px min-h-[2rem] bg-gray-300 dark:bg-gray-600 self-center mx-1 shrink-0"
                  aria-hidden
                />
                {(
                  [
                    { id: 'oc_compras' as const, label: 'OC - Aprovação Compras', count: ocTabCounts.compras },
                    { id: 'oc_gestor' as const, label: 'OC - Aprovação Gestor', count: ocTabCounts.gestor },
                    { id: 'oc_diretoria' as const, label: 'OC - Aprovação Diretoria', count: ocTabCounts.diretoria },
                    { id: 'oc_IN_REVIEW' as const, label: 'Correção OC', count: ocTabCounts.IN_REVIEW },
                    { id: 'oc_APPROVED' as const, label: 'OC aprovadas', count: ocTabCounts.APPROVED }
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFluxTab(tab.id)}
                    className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
                      fluxTab === tab.id
                        ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        fluxTab === tab.id
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
                <span
                  className="hidden sm:inline-flex w-px min-h-[2rem] bg-gray-300 dark:bg-gray-600 self-center mx-1 shrink-0"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => setFluxTab('rm_CANCELLED')}
                  className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
                    fluxTab === 'rm_CANCELLED'
                      ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Canceladas
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      fluxTab === 'rm_CANCELLED'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {stats.cancelled}
                  </span>
                </button>
              </nav>
            </div>
          </div>

          {/* Lista de Requisições */}
          {fluxTab.startsWith('rm_') && (
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
                              {rmTitulo(request)}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {request.description || 'Sem descrição'}
                            </p>
                            {(() => {
                              const ocs = ordersByMaterialRequestId.get(request.id) ?? [];
                              const nums = ocs.map((o) => o.orderNumber).filter(Boolean);
                              if (nums.length === 0) return null;
                              return (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                  <span className="font-medium text-gray-700 dark:text-gray-300">Gerou:</span>{' '}
                                  {joinOrderNumbersPt(nums)}
                                </p>
                              );
                            })()}
                            <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                              <span>Solicitante: {rmSolicitante(request)?.name || '—'}</span>
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
                                  resetOcForm();
                                  setShowCreateOCModal(true);
                                }}
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                title="Criar Ordem de Compra"
                              >
                                <FileText className="w-5 h-5" />
                              </button>
                            )}
                            {request.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setShowApprovalModal(true);
                                  }}
                                  className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                  title="Aprovar"
                                >
                                  <CheckCircle className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setShowCorrectionModal(true);
                                  }}
                                  className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                                  title="Enviar para Correção RM"
                                >
                                  <Wrench className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setShowCancelModal(true);
                                  }}
                                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                  title="Cancelar requisição"
                                >
                                  <Ban className="w-5 h-5" />
                                </button>
                              </>
                            )}
                            {request.status === 'IN_REVIEW' &&
                              userData?.data?.id === rmSolicitante(request)?.id && (
                                <Link
                                  href={`/ponto/solicitar-materiais?editRm=${request.id}`}
                                  className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors inline-flex"
                                  title="Editar RM"
                                >
                                  <Pencil className="w-5 h-5" />
                                </Link>
                              )}
                            {request.status === 'IN_REVIEW' && (
                              <button
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setShowCancelModal(true);
                                }}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Cancelar requisição"
                              >
                                <Ban className="w-5 h-5" />
                              </button>
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
          )}
          </div>

          {fluxTab.startsWith('oc_') && (
            <OcPurchaseOrdersPanel embedded hideTabs activeTab={fluxTabToOcTab(fluxTab)} />
          )}
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
                  <p className="text-gray-900 dark:text-gray-100">{rmSolicitante(selectedRequest)?.name || '—'}</p>
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
                          <th className="text-left p-2">Anexo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRequest.items?.map((item: any) => (
                          <tr key={item.id} className="border-t border-gray-200 dark:border-gray-600">
                            <td className="p-2 text-gray-900 dark:text-gray-100">{item.material?.description || item.material?.name || '-'}</td>
                            <td className="p-2 text-right">{item.quantity}</td>
                            <td className="p-2 text-right">{item.unit || '-'}</td>
                            <td className="p-2 text-left">
                              {item.attachmentUrl ? (
                                <a
                                  href={absoluteUploadUrl(item.attachmentUrl)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                                >
                                  {item.attachmentName || 'Ver anexo'}
                                </a>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 flex-wrap">
                  {selectedRequest.status === 'IN_REVIEW' &&
                    userData?.data?.id === rmSolicitante(selectedRequest)?.id && (
                      <Link
                        href={`/ponto/solicitar-materiais?editRm=${selectedRequest.id}`}
                        onClick={() => {
                          setShowDetailsModal(false);
                          setSelectedRequest(null);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors text-sm font-medium"
                      >
                        <Pencil className="w-4 h-4" />
                        Editar RM
                      </Link>
                    )}
                  <button
                    type="button"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                setShowCreateOCModal(false);
                resetOcForm();
              }}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Criar Ordem de Compra (OC)
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                SC: {selectedRequest.requestNumber || selectedRequest.id.slice(0, 8)}
              </p>

              {/* Lista de itens (primeiro na tela) */}
              <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Itens da SC:</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Selecione quais itens serão inseridos nesta OC.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllOcItems}
                      className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Selecionar todos
                    </button>
                    <button
                      type="button"
                      onClick={clearOcItems}
                      className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      disabled={ocSelectedItems.length === 0}
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                    {selectedRequest.items.map((item) => (
                      <li key={item.id} className="px-3 py-2 flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={ocSelectedItemIds.has(item.id)}
                          onChange={() => toggleOcItem(item.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                            {materialItemLabel(item)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Qtd: {item.quantity} {item.unit}
                          </p>
                          {item.attachmentUrl && (
                            <a
                              href={absoluteUploadUrl(item.attachmentUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5 inline-block"
                            >
                              Anexo: {item.attachmentName || 'abrir'}
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Selecionados: {ocSelectedItems.length} de {selectedRequest.items.length}
                </p>
              </div>

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
                  {(suppliersData?.data || []).filter((s: { isActive?: boolean }) => s.isActive).map((s: { id: string; code: string; name: string }) => (
                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                  ))}
                </select>
                {(suppliersData?.data || []).length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Cadastre fornecedores em Suprimentos → Fornecedores
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tipo de pagamento *
                  </span>
                  <div className="flex flex-wrap gap-4">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="ocPaymentType"
                        checked={ocPaymentType === OC_TYPE_AVISTA}
                        onChange={() => setOcPaymentType(OC_TYPE_AVISTA)}
                        className="rounded-full border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      À vista
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="ocPaymentType"
                        checked={ocPaymentType === OC_TYPE_BOLETO}
                        onChange={() => setOcPaymentType(OC_TYPE_BOLETO)}
                        className="rounded-full border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Boleto
                    </label>
                  </div>
                </div>
                <div>
                  <label htmlFor="ocPaymentCondition" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Condição de pagamento *
                  </label>
                  <select
                    id="ocPaymentCondition"
                    value={ocPaymentCondition}
                    onChange={(e) => setOcPaymentCondition(e.target.value)}
                    disabled={ocPaymentType === OC_TYPE_AVISTA}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  >
                    {ocPaymentType === OC_TYPE_AVISTA ? (
                      <option value="AVISTA">À vista</option>
                    ) : (
                      <>
                        <option value="BOLETO_30">Boleto 30 dias</option>
                        <option value="BOLETO_28">Boleto 28 dias</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="ocAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Valor a ser pago (R$) *
                </label>
                <input
                  id="ocAmount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={ocAmountStr}
                  onChange={(e) => setOcAmountStr(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mb-4">
                <label htmlFor="ocPaymentDetails" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Dados do pagamento
                </label>
                <textarea
                  id="ocPaymentDetails"
                  value={ocPaymentDetails}
                  onChange={(e) => setOcPaymentDetails(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Conta, PIX, agência, favorecido, etc."
                />
              </div>

              <div className="mb-4">
                <label htmlFor="ocBoleto" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Anexo do boleto
                </label>
                <input
                  id="ocBoleto"
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setOcBoletoFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-800 dark:file:bg-gray-700 dark:file:text-gray-200"
                />
                {ocBoletoFile && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{ocBoletoFile.name}</p>
                )}
              </div>

              <div className="mb-4">
                <label htmlFor="ocObservations" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Observações
                </label>
                <textarea
                  id="ocObservations"
                  value={ocObservations}
                  onChange={(e) => setOcObservations(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Observações gerais da OC"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateOCModal(false);
                    resetOcForm();
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const amountToPay = parseCurrencyBR(ocAmountStr);
                    if (!selectedRequest || !ocSupplierId || amountToPay === null || amountToPay < 0) {
                      toast.error('Preencha fornecedor e um valor válido (≥ 0).');
                      return;
                    }
                    createOCMutation.mutate({
                      request: selectedRequest,
                      supplierId: ocSupplierId,
                      paymentType: ocPaymentType,
                      paymentCondition: ocPaymentCondition,
                      paymentDetails: ocPaymentDetails,
                      observations: ocObservations,
                      amountToPay,
                      boletoFile: ocBoletoFile,
                      selectedItemIds: Array.from(ocSelectedItemIds)
                    });
                  }}
                  disabled={
                    !ocSupplierId ||
                    createOCMutation.isPending ||
                    ocSelectedItems.length === 0 ||
                    parseCurrencyBR(ocAmountStr) === null ||
                    (parseCurrencyBR(ocAmountStr) ?? -1) < 0
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {createOCMutation.isPending ? 'Criando...' : 'Criar OC'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Cancelar (compras) */}
        {showCancelModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowCancelModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Cancelar requisição
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                A RM ficará como <strong>Cancelada</strong> e sairá do fluxo de análise. Confirma?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => selectedRequest && cancelByApproverMutation.mutate(selectedRequest.id)}
                  disabled={cancelByApproverMutation.isPending}
                  className="px-4 py-2 bg-gray-700 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {cancelByApproverMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Enviar para Correção RM */}
        {showCorrectionModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowCorrectionModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Enviar para Correção RM
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                O solicitante poderá ajustar a requisição e reenviá-la para análise.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => selectedRequest && correctionMutation.mutate({ id: selectedRequest.id })}
                  disabled={correctionMutation.isPending}
                  className="px-4 py-2 bg-amber-600 dark:bg-amber-700 text-white rounded-lg hover:bg-amber-700 dark:hover:bg-amber-800 disabled:opacity-50"
                >
                  {correctionMutation.isPending ? 'Enviando...' : 'Enviar para correção'}
                </button>
              </div>
            </div>
          </div>
        )}

      </MainLayout>
    </ProtectedRoute>
  );
}

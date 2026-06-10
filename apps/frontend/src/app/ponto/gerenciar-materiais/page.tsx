'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, X } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import toast from 'react-hot-toast';
import { OcPurchaseOrdersPanel, OcStyledCheckbox, type PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import { PaymentConditionSelect } from '@/components/oc/PaymentConditionSelect';
import type { FluxTab, MaterialRequest } from './_lib/types';
import { fluxTabToOcTab, orderNeedsFinanceBoleto } from './_lib/flux';
import { getStatusInfo, materialItemLabel, rmSolicitante } from './_lib/display';
import {
  formatCurrencyBR,
  numericQuantityFromInput,
  numericUnitPriceFromInput,
  OC_TYPE_AVISTA,
  OC_TYPE_BOLETO,
  parseCurrencyBR
} from './_lib/ocAmounts';
import { FluxGlobalSearch } from './_components/FluxGlobalSearch';
import { FluxTabsNav } from './_components/FluxTabsNav';
import { MaterialRequestsRmList } from './_components/MaterialRequestsRmList';
import { SearchableEntityAutocomplete } from '@/components/ui/SearchableEntityAutocomplete';
import {
  getFluxTabForPurchaseOrder,
  getMaterialRequestCancellationReason,
  getMaterialRequestDisplayStatus,
  isMaterialRequestEffectivelyCancelled,
  matchesMaterialRequestSearch,
  matchesPurchaseOrderSearch,
  normalizeFluxSearch
} from './_lib/search';

const ocFieldCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50';

type OcSupplierOption = {
  id: string;
  code: string;
  name: string;
  tradeName?: string | null;
  isActive?: boolean;
};

const OC_PIX_KEY_TYPES = ['ALEATÓRIA', 'CELULAR', 'CNPJ', 'CPF', 'E-MAIL'] as const;

function isOcAvistaPaymentIncomplete(
  paymentType: string,
  paymentDetails: string,
  pixKeyType: string,
  pixKey: string
): boolean {
  return (
    paymentType === OC_TYPE_AVISTA &&
    (!paymentDetails.trim() || !pixKeyType.trim() || !pixKey.trim())
  );
}
function getOcSupplierLabel(supplier?: OcSupplierOption | null): string {
  if (!supplier) return '';
  const displayName = supplier.tradeName?.trim() || supplier.name?.trim() || '';
  return supplier.code ? `${supplier.code} - ${displayName}` : displayName;
}

const ocPaymentSegmentCls = (active: boolean) =>
  `w-full rounded-lg border px-3 py-2.5 text-center text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    active
      ? 'border-blue-600 bg-blue-600 text-white shadow-sm dark:border-blue-500 dark:bg-blue-500'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/80'
  }`;

const ocFieldCompactCls =
  'w-full min-w-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50';

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
  const [ocSupplierSearch, setOcSupplierSearch] = useState('');
  const [ocSupplierSearchDebounced, setOcSupplierSearchDebounced] = useState('');
  const [ocSupplierDropdownOpen, setOcSupplierDropdownOpen] = useState(false);
  const [ocPaymentType, setOcPaymentType] = useState<string>(OC_TYPE_AVISTA);
  const [ocPaymentCondition, setOcPaymentCondition] = useState<string>('AVISTA');
  const [ocPaymentDetails, setOcPaymentDetails] = useState('');
  const [ocPixKeyType, setOcPixKeyType] = useState('');
  const [ocPixKey, setOcPixKey] = useState('');
  const [ocObservations, setOcObservations] = useState('');
  const [ocFreteStr, setOcFreteStr] = useState('');
  const [ocSelectedItemIds, setOcSelectedItemIds] = useState<Set<string>>(new Set());
  /** Quantidade na OC por item (texto livre: pode ficar vazio enquanto digita). */
  const [ocQuantityStrByItemId, setOcQuantityStrByItemId] = useState<Record<string, string>>({});
  /** Valor unitário na OC por item (texto livre: pode ficar vazio enquanto digita). */
  const [ocUnitPriceStrByItemId, setOcUnitPriceStrByItemId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ocPaymentType === OC_TYPE_AVISTA) {
      setOcPaymentCondition('AVISTA');
    } else {
      setOcPaymentCondition((prev) => (prev === 'AVISTA' ? 'BOLETO_30' : prev));
      setOcPixKeyType('');
      setOcPixKey('');
    }
  }, [ocPaymentType]);

  const resetOcForm = () => {
    setOcSupplierId('');
    setOcSupplierSearch('');
    setOcSupplierSearchDebounced('');
    setOcSupplierDropdownOpen(false);
    setOcPaymentType(OC_TYPE_AVISTA);
    setOcPaymentCondition('AVISTA');
    setOcPaymentDetails('');
    setOcPixKeyType('');
    setOcPixKey('');
    setOcObservations('');
    setOcFreteStr('');
    setOcSelectedItemIds(new Set());
    setOcQuantityStrByItemId({});
    setOcUnitPriceStrByItemId({});
  };

  // Quando abrir o modal de OC, preenche com TODOS os itens da SC (o comprador pode desmarcar).
  useEffect(() => {
    if (showCreateOCModal && selectedRequest) {
      setOcSelectedItemIds(new Set(selectedRequest.items.map((i) => i.id)));
      setOcQuantityStrByItemId(
        Object.fromEntries(selectedRequest.items.map((i) => [i.id, String(i.quantity)]))
      );
      setOcUnitPriceStrByItemId(
        Object.fromEntries(selectedRequest.items.map((i) => [i.id, '0']))
      );
    }
  }, [showCreateOCModal, selectedRequest]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOcSupplierSearchDebounced(ocSupplierSearch);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [ocSupplierSearch]);

  const ocSelectedItems =
    selectedRequest?.items.filter((i) => ocSelectedItemIds.has(i.id)) ?? [];

  const ocAllItemsSelected = Boolean(
    selectedRequest?.items.length &&
      selectedRequest.items.every((i) => ocSelectedItemIds.has(i.id))
  );

  const ocSubtotalItens = useMemo(() => {
    if (!selectedRequest) return 0;
    let s = 0;
    for (const item of selectedRequest.items) {
      if (!ocSelectedItemIds.has(item.id)) continue;
      const q =
        numericQuantityFromInput(ocQuantityStrByItemId[item.id] ?? '') ??
        Number(item.quantity);
      const unit = numericUnitPriceFromInput(ocUnitPriceStrByItemId[item.id] ?? '');
      s += q * unit;
    }
    return Math.round(s * 100) / 100;
  }, [selectedRequest, ocSelectedItemIds, ocQuantityStrByItemId, ocUnitPriceStrByItemId]);

  const ocFreteParsed =
    ocFreteStr.trim() === '' ? 0 : parseCurrencyBR(ocFreteStr);
  const ocFreteInvalid = ocFreteStr.trim() !== '' && ocFreteParsed === null;
  const ocAmountToPayComputed =
    ocFreteInvalid || ocFreteParsed === null
      ? null
      : Math.round((ocSubtotalItens + ocFreteParsed) * 100) / 100;

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
    setOcQuantityStrByItemId((prev) => {
      const next = { ...prev };
      for (const it of selectedRequest.items) {
        if (next[it.id] === undefined) next[it.id] = String(it.quantity);
      }
      return next;
    });
    setOcUnitPriceStrByItemId((prev) => {
      const next = { ...prev };
      for (const it of selectedRequest.items) {
        if (next[it.id] === undefined) next[it.id] = '0';
      }
      return next;
    });
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
      const res = await api.get('/material-requests', { params: { limit: 500 } });
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

  const { data: suppliersData, isLoading: loadingSuppliers, isError: suppliersLoadError } = useQuery({
    queryKey: ['suppliers-oc-search', ocSupplierSearchDebounced],
    queryFn: async () => {
      const res = await api.get('/suppliers', {
        params: {
          search: ocSupplierSearchDebounced.trim() || undefined,
          isActive: true,
          limit: 50,
          page: 1
        }
      });
      return res.data;
    },
    enabled: showCreateOCModal
  });

  const ocSuppliers: OcSupplierOption[] = suppliersData?.data || [];

  const handleOcSupplierSearchChange = (value: string) => {
    setOcSupplierSearch(value);
    const normalized = value.trim().toLowerCase();
    const exactMatch = ocSuppliers.find(
      (supplier) => getOcSupplierLabel(supplier).trim().toLowerCase() === normalized
    );

    if (!normalized || !exactMatch) {
      setOcSupplierId('');
      return;
    }

    setOcSupplierId(exactMatch.id);
  };

  // Criar Ordem de Compra
  const createOCMutation = useMutation({
    mutationFn: async ({
      request,
      supplierId,
      paymentType,
      paymentCondition,
      paymentDetails,
      pixKeyType,
      pixKey,
      observations,
      freightAmount,
      selectedItemIds,
      quantityByItemId,
      unitPriceByItemId
    }: {
      request: MaterialRequest;
      supplierId: string;
      paymentType: string;
      paymentCondition: string;
      paymentDetails: string;
      pixKeyType: string;
      pixKey: string;
      observations: string;
      freightAmount: number;
      selectedItemIds: string[];
      quantityByItemId: Record<string, number>;
      unitPriceByItemId: Record<string, number>;
    }) => {
      const selectedSet = new Set(selectedItemIds);
      const selectedItems = request.items.filter((it) => selectedSet.has(it.id));
      if (!selectedItems.length) {
        throw new Error('Selecione pelo menos 1 item para a OC');
      }

      const items = selectedItems.map((item) => {
        const maxQ = Number(item.quantity);
        const q = quantityByItemId[item.id] ?? maxQ;
        if (!(q > 0) || q > maxQ) {
          throw new Error(
            `Quantidade inválida para "${materialItemLabel(item)}". Use entre 0 e ${maxQ}.`
          );
        }
        return {
          materialRequestItemId: item.id,
          materialId: item.material.id,
          quantity: q,
          unit: item.unit,
          unitPrice: unitPriceByItemId[item.id] ?? 0,
          notes: item.observation ?? item.notes
        };
      });
      const res = await api.post('/purchase-orders', {
        materialRequestId: request.id,
        supplierId,
        items,
        paymentType,
        paymentCondition,
        paymentDetails: paymentDetails.trim() || undefined,
        pixKeyType: paymentType === OC_TYPE_AVISTA ? pixKeyType.trim() || undefined : undefined,
        pixKey: paymentType === OC_TYPE_AVISTA ? pixKey.trim() || undefined : undefined,
        notes: observations.trim() || undefined,
        freightAmount
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
      toast.error(
        (typeof error?.message === 'string' && error.message) ||
          error.response?.data?.message ||
          'Erro ao criar OC'
      );
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
      (r: MaterialRequest) =>
        r.status === 'APPROVED' &&
        !materialRequestIdsWithOc.has(r.id) &&
        !isMaterialRequestEffectivelyCancelled(r, ordersByMaterialRequestId.get(r.id) ?? [])
    ).length,
    cancelled: normalizedRequests.filter((r: MaterialRequest) =>
      isMaterialRequestEffectivelyCancelled(r, ordersByMaterialRequestId.get(r.id) ?? [])
    ).length,
    inReview: normalizedRequests.filter((r: MaterialRequest) => r.status === 'IN_REVIEW').length
  };

  const ocTabCounts = useMemo(() => {
    const compras = allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT').length;
    const gestor = allOrders.filter((o) => o.status === 'PENDING').length;
    const diretoria = allOrders.filter((o) => o.status === 'PENDING_DIRETORIA').length;
    const emCorrecao = allOrders.filter((o) => o.status === 'IN_REVIEW').length;
    const attachBoleto = allOrders.filter((o) => orderNeedsFinanceBoleto(o)).length;
    const aprovadas = allOrders.filter(
      (o) => o.status === 'APPROVED' && !orderNeedsFinanceBoleto(o)
    ).length;
    const proofValidation = allOrders.filter((o) => o.status === 'PENDING_PROOF_VALIDATION').length;
    const proofCorrection = allOrders.filter((o) => o.status === 'PENDING_PROOF_CORRECTION').length;
    const attachNf = allOrders.filter((o) => o.status === 'PENDING_NF_ATTACHMENT').length;
    const finalizadas = allOrders.filter((o) => o.status === 'FINALIZED' || o.status === 'SENT').length;
    return {
      compras,
      gestor,
      diretoria,
      IN_REVIEW: emCorrecao,
      APPROVED: aprovadas,
      ATTACH_BOLETO: attachBoleto,
      PROOF_VALIDATION: proofValidation,
      PROOF_CORRECTION: proofCorrection,
      ATTACH_NF: attachNf,
      FINALIZADAS: finalizadas
    };
  }, [allOrders]);

  const normalizedSearchTerm = normalizeFluxSearch(searchTerm);
  const searchActive = normalizedSearchTerm.length > 0;

  // Filtrar requisições (somente quando uma fase SC/RM está ativa)
  const filteredRequests = useMemo(() => {
    if (!fluxTab.startsWith('rm_')) return [];

    return normalizedRequests.filter((request: MaterialRequest) => {
      const orders = ordersByMaterialRequestId.get(request.id) ?? [];

      if (fluxTab === 'rm_CANCELLED') {
        if (!isMaterialRequestEffectivelyCancelled(request, orders)) return false;
      } else if (fluxTab === 'rm_APPROVED') {
        if (request.status !== 'APPROVED') return false;
        if (materialRequestIdsWithOc.has(request.id)) return false;
        if (isMaterialRequestEffectivelyCancelled(request, orders)) return false;
      } else {
        const rmKey = fluxTab.replace(/^rm_/, '') as MaterialRequest['status'];
        if (request.status !== rmKey) return false;
      }

      return matchesMaterialRequestSearch(request, normalizedSearchTerm);
    });
  }, [normalizedRequests, fluxTab, normalizedSearchTerm, materialRequestIdsWithOc, ordersByMaterialRequestId]);

  const rmMatchCountsByFluxTab = useMemo(() => {
    const base = {
      pending: 0,
      inReview: 0,
      approved: 0,
      cancelled: 0
    };

    normalizedRequests.forEach((request: MaterialRequest) => {
      const orders = ordersByMaterialRequestId.get(request.id) ?? [];
      if (request.status === 'APPROVED' && materialRequestIdsWithOc.has(request.id)) {
        if (!isMaterialRequestEffectivelyCancelled(request, orders)) return;
      }
      if (!matchesMaterialRequestSearch(request, normalizedSearchTerm)) return;

      if (request.status === 'PENDING') base.pending += 1;
      if (request.status === 'IN_REVIEW') base.inReview += 1;
      if (
        request.status === 'APPROVED' &&
        !materialRequestIdsWithOc.has(request.id) &&
        !isMaterialRequestEffectivelyCancelled(request, orders)
      ) {
        base.approved += 1;
      }
      if (isMaterialRequestEffectivelyCancelled(request, orders)) base.cancelled += 1;
    });

    return base;
  }, [normalizedRequests, normalizedSearchTerm, materialRequestIdsWithOc, ordersByMaterialRequestId]);

  const ocMatchCountsByFluxTab = useMemo(() => {
    const base = {
      compras: 0,
      gestor: 0,
      diretoria: 0,
      IN_REVIEW: 0,
      APPROVED: 0,
      ATTACH_BOLETO: 0,
      PROOF_VALIDATION: 0,
      PROOF_CORRECTION: 0,
      ATTACH_NF: 0,
      FINALIZADAS: 0
    };

    allOrders.forEach((order) => {
      if (!matchesPurchaseOrderSearch(order, normalizedSearchTerm)) return;
      const tab = getFluxTabForPurchaseOrder(order);
      if (!tab) return;
      if (tab === 'oc_compras') base.compras += 1;
      if (tab === 'oc_gestor') base.gestor += 1;
      if (tab === 'oc_diretoria') base.diretoria += 1;
      if (tab === 'oc_IN_REVIEW') base.IN_REVIEW += 1;
      if (tab === 'oc_APPROVED') base.APPROVED += 1;
      if (tab === 'oc_ATTACH_BOLETO') base.ATTACH_BOLETO += 1;
      if (tab === 'oc_PROOF_VALIDATION') base.PROOF_VALIDATION += 1;
      if (tab === 'oc_PROOF_CORRECTION') base.PROOF_CORRECTION += 1;
      if (tab === 'oc_ATTACH_NF') base.ATTACH_NF += 1;
      if (tab === 'oc_FINALIZADAS') base.FINALIZADAS += 1;
    });

    return base;
  }, [allOrders, normalizedSearchTerm]);

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

  return (
    <ProtectedRoute route="/ponto/gerenciar-materiais">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Requisições de Materiais
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Acompanhe solicitações, aprovações e ordens de compra em um único fluxo.
            </p>
          </div>

          <div className="scroll-mt-4 space-y-4">
            <FluxGlobalSearch
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onNavigate={setFluxTab}
              requests={normalizedRequests}
              orders={allOrders}
              materialRequestIdsWithOc={materialRequestIdsWithOc}
            />

            <FluxTabsNav
              fluxTab={fluxTab}
              onFluxTab={setFluxTab}
              stats={stats}
              ocTabCounts={ocTabCounts}
              embeddedInCard
              searchActive={searchActive}
              rmSearchCounts={rmMatchCountsByFluxTab}
              ocSearchCounts={ocMatchCountsByFluxTab}
            />

            <div className="mt-4">
              {fluxTab.startsWith('rm_') && (
                <MaterialRequestsRmList
                  fluxTab={fluxTab}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  hideSearch
                  loadingRequests={loadingRequests}
                  filteredRequests={filteredRequests}
                  ordersByMaterialRequestId={ordersByMaterialRequestId}
                  currentUserId={userData?.data?.id}
                  onCreateOc={(request) => {
                    setSelectedRequest(request);
                    resetOcForm();
                    setShowCreateOCModal(true);
                  }}
                  onApprove={(request) => {
                    setSelectedRequest(request);
                    setShowApprovalModal(true);
                  }}
                  onCorrection={(request) => {
                    setSelectedRequest(request);
                    setShowCorrectionModal(true);
                  }}
                  onCancel={(request) => {
                    setSelectedRequest(request);
                    setShowCancelModal(true);
                  }}
                  onDetails={(request) => {
                    setSelectedRequest(request);
                    setShowDetailsModal(true);
                  }}
                />
              )}

              {fluxTab.startsWith('oc_') && (
                <OcPurchaseOrdersPanel
                  embedded
                  hideTabs
                  hideSearch
                  activeTab={fluxTabToOcTab(fluxTab)}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                />
              )}
            </div>
          </div>
        </div>

        {/* Modal Detalhes */}
        {showDetailsModal && selectedRequest && (() => {
          const detailOrders = ordersByMaterialRequestId.get(selectedRequest.id) ?? [];
          const displayStatus = getMaterialRequestDisplayStatus(selectedRequest, detailOrders);
          const statusInfo = getStatusInfo(displayStatus);
          const cancellationReason = getMaterialRequestCancellationReason(selectedRequest, detailOrders);

          return (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                setShowDetailsModal(false);
                setSelectedRequest(null);
              }}
              aria-hidden
            />
            <div
              className="relative flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
              role="dialog"
              aria-modal="true"
              aria-labelledby="rm-details-modal-title"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <h3
                  id="rm-details-modal-title"
                  className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                >
                  Detalhes da Requisição
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedRequest(null);
                  }}
                  className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Número</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{selectedRequest.requestNumber || `#${selectedRequest.id.slice(0, 8)}`}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                {displayStatus === 'CANCELLED' && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Motivo do cancelamento</p>
                    <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                      {cancellationReason || 'Motivo não informado.'}
                    </p>
                  </div>
                )}
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
                            <td className="p-2 text-gray-900 dark:text-gray-100">
                              {materialItemLabel(item)}
                            </td>
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
              </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                {selectedRequest.status === 'IN_REVIEW' &&
                  userData?.data?.id === rmSolicitante(selectedRequest)?.id && (
                    <Link
                      href={`/ponto/solicitar-materiais?editRm=${selectedRequest.id}`}
                      onClick={() => {
                        setShowDetailsModal(false);
                        setSelectedRequest(null);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                    >
                      <Pencil className="h-4 w-4" />
                      Editar RM
                    </Link>
                  )}
                <button
                  type="button"
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedRequest(null);
                  }}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Modal de Aprovação */}
        {showApprovalModal && selectedRequest && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center">
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
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                setShowCreateOCModal(false);
                resetOcForm();
              }}
              aria-hidden
            />
            <div
              className="relative flex max-h-[min(92vh,800px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-oc-modal-title"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <div className="min-w-0">
                  <h3
                    id="create-oc-modal-title"
                    className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Criar Ordem de Compra
                  </h3>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                    SC: {selectedRequest.requestNumber || selectedRequest.id.slice(0, 8)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateOCModal(false);
                    resetOcForm();
                  }}
                  className="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
              {/* Lista de itens */}
              <div>
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Itens da SC</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Selecione quais itens serão inseridos nesta OC.
                  </p>
                </div>

                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="max-h-[min(280px,40vh)] overflow-auto">
                    <table className="w-full min-w-[26rem] table-fixed border-collapse text-sm">
                      <colgroup>
                        <col className="w-10" />
                        <col />
                        <col className="w-[5.5rem]" />
                        <col className="w-[6rem]" />
                        <col className="w-[7.5rem]" />
                      </colgroup>
                      <thead className="sticky top-0 z-[1] border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-900/80">
                        <tr className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          <th scope="col" className="px-2 py-2">
                            <div className="flex justify-center">
                              <OcStyledCheckbox
                                checked={ocAllItemsSelected}
                                onChange={(checked) => {
                                  if (checked) selectAllOcItems();
                                  else clearOcItems();
                                }}
                                ariaLabel="Selecionar todos os itens"
                                title="Selecionar todos"
                              />
                            </div>
                          </th>
                          <th scope="col" className="px-2 py-2 text-left font-medium">
                            Material
                          </th>
                          <th scope="col" className="px-2 py-2 text-center font-medium">
                            Qtd. SC
                          </th>
                          <th scope="col" className="px-2 py-2 text-left font-medium">
                            Qtd. na OC
                          </th>
                          <th scope="col" className="px-2 py-2 text-left font-medium">
                            Valor unit. (R$)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {selectedRequest.items.map((item) => {
                          const isSelected = ocSelectedItemIds.has(item.id);
                          return (
                            <tr key={item.id} className="bg-white dark:bg-gray-800">
                              <td className="px-2 py-2 align-middle">
                                <div className="flex justify-center">
                                  <OcStyledCheckbox
                                    checked={isSelected}
                                    onChange={() => toggleOcItem(item.id)}
                                    ariaLabel={`Incluir ${materialItemLabel(item)} na OC`}
                                  />
                                </div>
                              </td>
                              <td className="px-2 py-2 align-middle">
                                <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                                  {materialItemLabel(item)}
                                </p>
                                {item.attachmentUrl ? (
                                  <a
                                    href={absoluteUploadUrl(item.attachmentUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Anexo
                                  </a>
                                ) : null}
                              </td>
                              <td className="px-2 py-2 text-center align-middle tabular-nums font-medium text-gray-900 dark:text-gray-100">
                                {item.quantity} {item.unit}
                              </td>
                              <td className="px-2 py-2 align-middle">
                                <label htmlFor={`oc-qty-${item.id}`} className="sr-only">
                                  Quantidade na OC
                                </label>
                                <input
                                  id={`oc-qty-${item.id}`}
                                  type="text"
                                  inputMode="decimal"
                                  disabled={!isSelected}
                                  value={ocQuantityStrByItemId[item.id] ?? String(item.quantity)}
                                  onChange={(e) => {
                                    setOcQuantityStrByItemId((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value
                                    }));
                                  }}
                                  className={`${ocFieldCompactCls} w-full`}
                                />
                              </td>
                              <td className="px-2 py-2 align-middle">
                                <label htmlFor={`oc-price-${item.id}`} className="sr-only">
                                  Valor unitário em reais
                                </label>
                                <input
                                  id={`oc-price-${item.id}`}
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0,00"
                                  disabled={!isSelected}
                                  value={ocUnitPriceStrByItemId[item.id] ?? ''}
                                  onChange={(e) => {
                                    setOcUnitPriceStrByItemId((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value
                                    }));
                                  }}
                                  className={`${ocFieldCompactCls} w-full`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Selecionados: {ocSelectedItems.length} de {selectedRequest.items.length}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Fornecedor *
                </label>
                <SearchableEntityAutocomplete
                  searchValue={ocSupplierSearch}
                  isOpen={ocSupplierDropdownOpen}
                  onOpen={() => setOcSupplierDropdownOpen(true)}
                  onClose={() => setOcSupplierDropdownOpen(false)}
                  onSearchChange={handleOcSupplierSearchChange}
                  onSelect={(supplier) => {
                    setOcSupplierId(supplier.id);
                    setOcSupplierSearch(getOcSupplierLabel(supplier));
                    setOcSupplierDropdownOpen(false);
                  }}
                  items={ocSuppliers}
                  getItemKey={(supplier) => supplier.id}
                  getItemLabel={getOcSupplierLabel}
                  loading={loadingSuppliers}
                  loadError={suppliersLoadError}
                  inputClassName={ocFieldCls}
                  placeholder="Digite para buscar fornecedor..."
                  emptyListMessage="Nenhum fornecedor ativo cadastrado."
                  notFoundMessage="Nenhum fornecedor encontrado para esta busca."
                  loadingMessage="Carregando fornecedores…"
                  errorMessage="Erro ao carregar fornecedores."
                />
                <input type="hidden" value={ocSupplierId} readOnly />
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tipo de pagamento *
                </span>
                <div
                  role="radiogroup"
                  aria-label="Tipo de pagamento"
                  className="grid w-full grid-cols-2 gap-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={ocPaymentType === OC_TYPE_AVISTA}
                    onClick={() => setOcPaymentType(OC_TYPE_AVISTA)}
                    className={ocPaymentSegmentCls(ocPaymentType === OC_TYPE_AVISTA)}
                  >
                    À vista
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={ocPaymentType === OC_TYPE_BOLETO}
                    onClick={() => setOcPaymentType(OC_TYPE_BOLETO)}
                    className={ocPaymentSegmentCls(ocPaymentType === OC_TYPE_BOLETO)}
                  >
                    Boleto
                  </button>
                </div>
              </div>

              {ocPaymentType !== OC_TYPE_AVISTA ? (
                <div>
                  <label htmlFor="ocPaymentCondition" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Condição de pagamento *
                  </label>
                  <PaymentConditionSelect
                    id="ocPaymentCondition"
                    paymentType="BOLETO"
                    value={ocPaymentCondition}
                    onChange={setOcPaymentCondition}
                    className={ocFieldCls}
                  />
                </div>
              ) : null}

              {ocPaymentType === OC_TYPE_AVISTA ? (
                <>
                  <div>
                    <label htmlFor="ocPaymentDetails" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Dados do pagamento *
                    </label>
                    <textarea
                      id="ocPaymentDetails"
                      value={ocPaymentDetails}
                      onChange={(e) => setOcPaymentDetails(e.target.value)}
                      rows={3}
                      className={`${ocFieldCls} resize-y`}
                      placeholder="Conta, agência, favorecido, etc."
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2.2fr)]">
                    <div>
                      <label htmlFor="ocPixKeyType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tipo de Chave Pix *
                      </label>
                      <select
                        id="ocPixKeyType"
                        value={ocPixKeyType}
                        onChange={(e) => setOcPixKeyType(e.target.value)}
                        className={ocFieldCls}
                      >
                        <option value="">Selecione...</option>
                        {OC_PIX_KEY_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="ocPixKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Chave Pix *
                      </label>
                      <input
                        id="ocPixKey"
                        type="text"
                        value={ocPixKey}
                        onChange={(e) => setOcPixKey(e.target.value)}
                        className={ocFieldCls}
                        placeholder="Informe a chave PIX"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="ocPaymentDetails" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Dados do pagamento
                  </label>
                  <textarea
                    id="ocPaymentDetails"
                    value={ocPaymentDetails}
                    onChange={(e) => setOcPaymentDetails(e.target.value)}
                    rows={3}
                    className={`${ocFieldCls} resize-y`}
                    placeholder="Conta, agência, favorecido, etc."
                  />
                </div>
              )}

              <div>
                <label htmlFor="ocFrete" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Frete (R$)
                </label>
                <input
                  id="ocFrete"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={ocFreteStr}
                  onChange={(e) => setOcFreteStr(e.target.value)}
                  className={ocFieldCls}
                />
                {ocFreteInvalid && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">Informe um valor de frete válido ou deixe em branco.</p>
                )}
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Valor a ser pago (R$) *
                </span>
                <div
                  className={`${ocFieldCls} bg-gray-50 font-semibold dark:bg-gray-900/50`}
                  aria-live="polite"
                >
                  {ocAmountToPayComputed !== null
                    ? `R$ ${formatCurrencyBR(ocAmountToPayComputed)}`
                    : '—'}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Soma dos itens (quantidade × valor unitário) + frete.
                </p>
              </div>

              <div>
                <label htmlFor="ocObservations" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Observações
                </label>
                <textarea
                  id="ocObservations"
                  value={ocObservations}
                  onChange={(e) => setOcObservations(e.target.value)}
                  rows={3}
                  className={`${ocFieldCls} resize-y`}
                  placeholder="Observações gerais da OC"
                />
              </div>
              </div>
              </div>

              <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateOCModal(false);
                    resetOcForm();
                  }}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedRequest || !ocSupplierId) {
                      toast.error('Selecione o fornecedor.');
                      return;
                    }
                    if (ocAmountToPayComputed === null || ocAmountToPayComputed < 0) {
                      toast.error('Corrija o frete ou os valores unitários para obter um total válido.');
                      return;
                    }
                    if (ocPaymentType === OC_TYPE_AVISTA && !ocPaymentDetails.trim()) {
                      toast.error('Informe os dados do pagamento para pagamento à vista.');
                      return;
                    }
                    if (ocPaymentType === OC_TYPE_AVISTA && !ocPixKeyType.trim()) {
                      toast.error('Selecione o tipo de chave PIX.');
                      return;
                    }
                    if (ocPaymentType === OC_TYPE_AVISTA && !ocPixKey.trim()) {
                      toast.error('Informe a chave PIX.');
                      return;
                    }
                    const unitPriceByItemId = Object.fromEntries(
                      Array.from(ocSelectedItemIds).map((id) => [
                        id,
                        numericUnitPriceFromInput(ocUnitPriceStrByItemId[id] ?? '')
                      ])
                    );
                    const quantityByItemId: Record<string, number> = {};
                    for (const id of Array.from(ocSelectedItemIds)) {
                      const item = selectedRequest.items.find((i) => i.id === id);
                      if (!item) continue;
                      const maxQ = Number(item.quantity);
                      const q = numericQuantityFromInput(ocQuantityStrByItemId[id] ?? '');
                      if (q === null || !(q > 0) || q > maxQ) {
                        toast.error(
                          `Quantidade inválida para "${materialItemLabel(item)}". Informe um valor entre 0 e ${maxQ}.`
                        );
                        return;
                      }
                      quantityByItemId[id] = q;
                    }
                    createOCMutation.mutate({
                      request: selectedRequest,
                      supplierId: ocSupplierId,
                      paymentType: ocPaymentType,
                      paymentCondition: ocPaymentCondition,
                      paymentDetails: ocPaymentDetails,
                      pixKeyType: ocPixKeyType,
                      pixKey: ocPixKey,
                      observations: ocObservations,
                      freightAmount: ocFreteParsed ?? 0,
                      selectedItemIds: Array.from(ocSelectedItemIds),
                      quantityByItemId,
                      unitPriceByItemId
                    });
                  }}
                  disabled={
                    !ocSupplierId ||
                    createOCMutation.isPending ||
                    ocSelectedItems.length === 0 ||
                    ocAmountToPayComputed === null ||
                    ocAmountToPayComputed < 0 ||
                    (ocPaymentType === OC_TYPE_AVISTA &&
                      isOcAvistaPaymentIncomplete(
                        ocPaymentType,
                        ocPaymentDetails,
                        ocPixKeyType,
                        ocPixKey
                      ))
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {createOCMutation.isPending ? 'Criando...' : 'Criar OC'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Cancelar (compras) */}
        {showCancelModal && selectedRequest && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center">
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
          <div className="fixed inset-0 z-[1000] flex items-center justify-center">
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

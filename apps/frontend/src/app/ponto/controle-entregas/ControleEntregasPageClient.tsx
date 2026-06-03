'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  Edit,
  Filter,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { RowActionMenuCell } from '@/components/ui/RowActionMenu';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import {
  CURRENT_STATUS_OPTIONS,
  DELIVERY_TYPE_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  POLO_OPTIONS,
  STOCK_SHORTFALL_TYPE_OPTIONS,
  FINAL_STATUS_OPTIONS,
  formatCurrency,
  formatDate,
  normalizeDeliveryType,
  statusBadge,
  type CurrentStatusValue,
  type DeliveryTypeValue,
  type FinalStatusValue,
  type PaymentStatusValue,
  type PoloValue,
  type StockShortfallTypeValue,
} from '@/components/suprimentos/materialDeliveryLabels';

type MaterialDeliveryRow = {
  id: string;
  deliveryNumber: string;
  polo: PoloValue;
  movementId: string | null;
  movementNumber: string | null;
  contractId: string | null;
  currentStatus: CurrentStatusValue;
  paymentStatus: PaymentStatusValue;
  supplierId: string | null;
  supplierName: string | null;
  purchaseOrderId: string | null;
  orderValue: string | number | null;
  expectedDelivery: string | null;
  actualDelivery: string | null;
  totalPaid: string | number | null;
  stockShortfallType: StockShortfallTypeValue | null;
  rmNumber: string | null;
  deliveryType: string | null;
  observations: string | null;
  finalStatus: FinalStatusValue;
  receivedByEngineering: boolean;
  receivedAt: string | null;
  createdAt: string;
  supplier: { id: string; code: string; name: string } | null;
  purchaseOrder: { id: string; orderNumber: string; status: string } | null;
  creator: { id: string; name: string };
  receivedByUser: { id: string; name: string } | null;
  contractRecord: { id: string; name: string; number: string } | null;
};

type FormState = {
  polo: PoloValue;
  movementId: string;
  movementNumber: string;
  contractId: string;
  currentStatus: CurrentStatusValue;
  paymentStatus: PaymentStatusValue;
  supplierId: string;
  purchaseOrderId: string;
  orderValue: string;
  expectedDelivery: string;
  totalPaid: string;
  rmNumber: string;
  deliveryType: string;
  observations: string;
};

const EMPTY_FORM: FormState = {
  polo: 'DF',
  movementId: '',
  movementNumber: '',
  contractId: '',
  currentStatus: 'APROVADO_SUPRIMENTOS',
  paymentStatus: 'AGUARDANDO_PAGAMENTO',
  supplierId: '',
  purchaseOrderId: '',
  orderValue: '',
  expectedDelivery: '',
  totalPaid: '',
  rmNumber: '',
  deliveryType: '',
  observations: '',
};

const NO_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

const fieldClassName = `w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm ${NO_FOCUS}`;

const currencyFieldClassName = `${fieldClassName} text-right tabular-nums`;

const searchInputClassName = `h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${NO_FOCUS}`;

function toInputDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function rowToForm(row: MaterialDeliveryRow): FormState {
  return {
    polo: row.polo,
    movementId: row.movementId ?? '',
    movementNumber: row.movementNumber ?? '',
    contractId: row.contractId ?? '',
    currentStatus: row.currentStatus,
    paymentStatus: row.paymentStatus,
    supplierId: row.supplierId ?? '',
    purchaseOrderId: row.purchaseOrderId ?? '',
    orderValue: formatCurrencyInputBrFromNumber(row.orderValue),
    expectedDelivery: toInputDate(row.expectedDelivery),
    totalPaid: formatCurrencyInputBrFromNumber(row.totalPaid),
    rmNumber: row.rmNumber ?? '',
    deliveryType: normalizeDeliveryType(row.deliveryType),
    observations: row.observations ?? '',
  };
}

function contractLabel(row: MaterialDeliveryRow): string {
  return row.contractRecord?.name ?? '—';
}

function deliveryTypeLabel(value: string | null | undefined): string {
  const normalized = normalizeDeliveryType(value);
  if (!normalized) return '—';
  return DELIVERY_TYPE_OPTIONS.find((o) => o.value === normalized)?.label ?? '—';
}

const thBase =
  'px-3 sm:px-6 py-3 align-middle text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap';
const thLeftClass = `${thBase} text-left`;
const thCenterClass = `${thBase} text-center`;
const tdBase = 'px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300';
const tdLeftClass = `${tdBase} text-left`;
const tdCenterClass = `${tdBase} text-center`;
const tdTruncateCenterClass = `${tdCenterClass} truncate`;
const tdPillClass = `${tdCenterClass}`;

function StatusPill({
  value,
  options,
}: {
  value: string;
  options: readonly { value: string; label: string; className: string }[];
}) {
  const badge = statusBadge(value, options);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${badge.className}`}>
      {badge.label}
    </span>
  );
}

export default function ControleEntregasPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [poloFilter, setPoloFilter] = useState('');
  const [currentStatusFilter, setCurrentStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [viewFilter, setViewFilter] = useState<'all' | 'awaiting' | 'overdue'>('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaterialDeliveryRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const hasActiveFilters =
    Boolean(poloFilter || currentStatusFilter || paymentStatusFilter || search.trim()) ||
    viewFilter !== 'all';

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: summaryRes } = useQuery({
    queryKey: ['material-deliveries-summary'],
    queryFn: async () => {
      const res = await api.get('/material-deliveries/summary');
      return res.data;
    },
  });

  const { data: listRes, isLoading: loadingList } = useQuery({
    queryKey: [
      'material-deliveries',
      search,
      poloFilter,
      currentStatusFilter,
      paymentStatusFilter,
      viewFilter,
    ],
    queryFn: async () => {
      const res = await api.get('/material-deliveries', {
        params: {
          search: search.trim() || undefined,
          polo: poloFilter || undefined,
          currentStatus: currentStatusFilter || undefined,
          paymentStatus: paymentStatusFilter || undefined,
          awaitingEngineering: viewFilter === 'awaiting' ? 'true' : undefined,
          limit: 300,
        },
      });
      return res.data;
    },
  });

  const { data: suppliersRes } = useQuery({
    queryKey: ['suppliers-for-deliveries'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { isActive: true, limit: 500 } });
      return res.data;
    },
    enabled: showForm,
  });

  const { data: purchaseOrdersRes } = useQuery({
    queryKey: ['purchase-orders-for-deliveries'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 200 } });
      return res.data;
    },
    enabled: showForm,
  });

  const { data: contractsRes } = useQuery({
    queryKey: ['contracts-for-deliveries'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
    enabled: showForm,
  });

  const items: MaterialDeliveryRow[] = listRes?.data ?? [];
  const summary = summaryRes?.data ?? { total: 0, awaitingEngineering: 0, delivered: 0, overdue: 0 };
  const suppliers = suppliersRes?.data ?? [];
  const purchaseOrders = purchaseOrdersRes?.data ?? [];
  const contracts = contractsRes?.data ?? [];

  const contractOptions = useMemo(
    () => contracts.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })),
    [contracts]
  );

  const supplierOptions = useMemo(
    () => suppliers.map((s: { id: string; name: string }) => ({ value: s.id, label: s.name })),
    [suppliers]
  );

  const purchaseOrderOptions = useMemo(
    () =>
      purchaseOrders.map((po: { id: string; orderNumber: string }) => ({
        value: po.id,
        label: po.orderNumber,
      })),
    [purchaseOrders]
  );

  const currentStatusOptions = useMemo(
    () => CURRENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const paymentStatusOptions = useMemo(
    () => PAYMENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const deliveryTypeOptions = useMemo(
    () => DELIVERY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const poloSelectOptions = useMemo(
    () => POLO_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const filteredItems = useMemo(() => {
    if (viewFilter !== 'overdue') return items;
    const now = new Date();
    return items.filter((row) => {
      if (row.receivedByEngineering) return false;
      if (row.currentStatus === 'CANCELADO' || row.finalStatus === 'CANCELADO') return false;
      if (!row.expectedDelivery) return false;
      return new Date(row.expectedDelivery) < now && row.currentStatus !== 'ENTREGUE';
    });
  }, [items, viewFilter]);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu<MaterialDeliveryRow>(filteredItems);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedSupplier = suppliers.find(
        (s: { id: string; name: string }) => s.id === form.supplierId
      );
      const payload = {
        ...form,
        contractId: form.contractId || null,
        supplierId: form.supplierId || null,
        supplierName: selectedSupplier?.name ?? null,
        purchaseOrderId: form.purchaseOrderId || null,
        orderValue: parseCurrencyInputBr(form.orderValue),
        totalPaid: parseCurrencyInputBr(form.totalPaid),
        expectedDelivery: form.expectedDelivery || null,
        deliveryType: form.deliveryType || null,
      };
      if (editing) {
        const res = await api.patch(`/material-deliveries/${editing.id}`, payload);
        return res.data;
      }
      const res = await api.post('/material-deliveries', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento-pending-count'] });
      toast.success(editing ? 'Entrega atualizada' : 'Entrega registrada');
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao salvar entrega');
    },
  });

  const receiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-deliveries/${id}/receive`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento-pending-count'] });
      toast.success('Recebimento confirmado pela engenharia');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao confirmar recebimento');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/material-deliveries/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-summary-recebimento'] });
      queryClient.invalidateQueries({ queryKey: ['material-deliveries-recebimento-pending-count'] });
      toast.success('Entrega excluída');
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao excluir');
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (row: MaterialDeliveryRow) => {
    setEditing(row);
    setForm(rowToForm(row));
    setShowForm(true);
  };

  const handleSupplierChange = (supplierId: string) => {
    setForm((prev) => ({ ...prev, supplierId }));
  };

  const handlePurchaseOrderChange = (purchaseOrderId: string) => {
    const po = purchaseOrders.find(
      (p: { id: string; orderNumber: string; amountToPay?: unknown; supplier?: { id: string; name: string } }) =>
        p.id === purchaseOrderId
    );
    setForm((prev) => ({
      ...prev,
      purchaseOrderId,
      orderValue:
        po?.amountToPay != null
          ? formatCurrencyInputBrFromNumber(po.amountToPay)
          : prev.orderValue,
      supplierId: po?.supplier?.id ?? prev.supplierId,
    }));
  };

  useEffect(() => {
    if (!showForm && !deleteId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showForm) {
          setShowForm(false);
          setEditing(null);
        }
        if (deleteId) setDeleteId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showForm, deleteId]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/controle-entregas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-8">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Controle de Entregas
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Acompanhe entregas de material e confirme o recebimento pela engenharia.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4 sm:gap-6">
            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent
                className="p-4 sm:p-6"
                role="button"
                tabIndex={0}
                onClick={() => setViewFilter('all')}
                onKeyDown={(e) => e.key === 'Enter' && setViewFilter('all')}
              >
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                      Em andamento
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {summary.total}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent
                className="p-4 sm:p-6"
                role="button"
                tabIndex={0}
                onClick={() => setViewFilter('awaiting')}
                onKeyDown={(e) => e.key === 'Enter' && setViewFilter('awaiting')}
              >
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex-shrink-0">
                    <PackageCheck className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                      Aguardando engenharia
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {summary.awaitingEngineering}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent
                className="p-4 sm:p-6"
                role="button"
                tabIndex={0}
                onClick={() => setViewFilter('all')}
                onKeyDown={(e) => e.key === 'Enter' && setViewFilter('all')}
              >
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                      Recebidas
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {summary.delivered}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-shadow hover:shadow-md">
              <CardContent
                className="p-4 sm:p-6"
                role="button"
                tabIndex={0}
                onClick={() => setViewFilter('overdue')}
                onKeyDown={(e) => e.key === 'Enter' && setViewFilter('overdue')}
              >
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                      Atrasadas
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {summary.overdue}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Entregas Registradas
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {viewFilter === 'awaiting'
                        ? 'Exibindo entregas aguardando confirmação da engenharia'
                        : viewFilter === 'overdue'
                          ? 'Exibindo entregas com previsão vencida'
                          : 'Listagem completa de entregas de material'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setPoloFilter('');
                        setCurrentStatusFilter('');
                        setPaymentStatusFilter('');
                        setSearch('');
                        setViewFilter('all');
                      }}
                      className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Limpar filtros"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  )}
                  {viewFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setViewFilter('all')}
                      className="inline-flex h-10 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <X className="h-3.5 w-3.5" />
                      Limpar visão
                    </button>
                  )}
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar ID, contrato, fornecedor, OC..."
                      className={searchInputClassName}
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(true)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Abrir filtro"
                    title="Filtro"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Nova entrega
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 dark:text-gray-400">Carregando entregas...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma entrega encontrada</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                    Ajuste os filtros ou registre a primeira entrega
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {filteredItems.length} entrega{filteredItems.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={thLeftClass}>ID</th>
                          <th className={thCenterClass}>Ordem de compra</th>
                          <th className={thCenterClass}>N° RM</th>
                          <th className={thCenterClass}>ID Mov</th>
                          <th className={thCenterClass}>Nº Mov</th>
                          <th className={thCenterClass}>Contrato</th>
                          <th className={thCenterClass}>Fornecedor</th>
                          <th className={thCenterClass}>Valor OC</th>
                          <th className={thCenterClass}>Status atual</th>
                          <th className={thCenterClass}>Pagamento</th>
                          <th className={thCenterClass}>Status final</th>
                          <th className={thCenterClass}>Previsão entrega</th>
                          <th className={thCenterClass}>Tipo entrega</th>
                          <th className={thCenterClass}>Valor total pago</th>
                          <th className={thCenterClass}>Furo estoque</th>
                          <th className={thCenterClass}>Recebido eng.</th>
                          <th className={thCenterClass}>Observações</th>
                          <th className={thCenterClass}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredItems.map((row) => {
                          const isOverdue =
                            !row.receivedByEngineering &&
                            row.expectedDelivery &&
                            new Date(row.expectedDelivery) < new Date() &&
                            row.currentStatus !== 'ENTREGUE' &&
                            row.currentStatus !== 'CANCELADO';

                          return (
                            <tr
                              key={row.id}
                              className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                isOverdue ? 'bg-red-50/60 dark:bg-red-950/20' : ''
                              }`}
                            >
                              <td className={`${tdLeftClass} font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap`}>
                                {row.deliveryNumber}
                              </td>
                              <td className={`${tdCenterClass} whitespace-nowrap`}>
                                {row.purchaseOrder?.orderNumber || '—'}
                              </td>
                              <td className={`${tdCenterClass} whitespace-nowrap`}>{row.rmNumber || '—'}</td>
                              <td className={`${tdCenterClass} whitespace-nowrap`}>{row.movementId || '—'}</td>
                              <td className={`${tdCenterClass} whitespace-nowrap`}>{row.movementNumber || '—'}</td>
                              <td className={tdCenterClass} title={`${contractLabel(row)} · ${row.polo}`}>
                                <span className="inline-flex flex-col items-center gap-0.5">
                                  <span className="max-w-[140px] truncate">{contractLabel(row)}</span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{row.polo}</span>
                                </span>
                              </td>
                              <td className={tdTruncateCenterClass} title={row.supplier?.name ?? row.supplierName ?? ''}>
                                {row.supplier?.name || row.supplierName || '—'}
                              </td>
                              <td className={`${tdCenterClass} whitespace-nowrap tabular-nums`}>
                                {formatCurrency(row.orderValue)}
                              </td>
                              <td className={tdPillClass}>
                                <div className="flex justify-center">
                                  <StatusPill value={row.currentStatus} options={CURRENT_STATUS_OPTIONS} />
                                </div>
                              </td>
                              <td className={tdPillClass}>
                                <div className="flex justify-center">
                                  <StatusPill value={row.paymentStatus} options={PAYMENT_STATUS_OPTIONS} />
                                </div>
                              </td>
                              <td className={tdPillClass}>
                                <div className="flex justify-center">
                                  <StatusPill value={row.finalStatus} options={FINAL_STATUS_OPTIONS} />
                                </div>
                              </td>
                              <td className={`${tdCenterClass} whitespace-nowrap`}>
                                {formatDate(row.expectedDelivery)}
                                {isOverdue && (
                                  <span className="ml-1 text-xs font-medium text-red-600 dark:text-red-400">
                                    atrasada
                                  </span>
                                )}
                              </td>
                              <td className={tdTruncateCenterClass} title={deliveryTypeLabel(row.deliveryType)}>
                                {deliveryTypeLabel(row.deliveryType)}
                              </td>
                              <td className={`${tdCenterClass} whitespace-nowrap tabular-nums`}>
                                {formatCurrency(row.totalPaid)}
                              </td>
                              <td className={tdPillClass}>
                                {row.stockShortfallType ? (
                                  <div className="flex justify-center">
                                    <StatusPill
                                      value={row.stockShortfallType}
                                      options={STOCK_SHORTFALL_TYPE_OPTIONS}
                                    />
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-500">—</span>
                                )}
                              </td>
                              <td className={tdCenterClass}>
                                {row.receivedByEngineering ? (
                                  <span className="inline-flex flex-col items-center gap-0.5">
                                    <span>{row.receivedByUser?.name ?? '—'}</span>
                                    {row.receivedAt ? (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {formatDate(row.receivedAt)}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                    Pendente
                                  </span>
                                )}
                              </td>
                              <td className={tdTruncateCenterClass} title={row.observations ?? ''}>
                                {row.observations || '—'}
                              </td>
                              <RowActionMenuCell
                                align="center"
                                isOpen={isRowMenuOpen(row.id)}
                                onToggle={(e) =>
                                  toggleRowActionMenu(row.id, e.currentTarget as HTMLButtonElement)
                                }
                              />
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {rowActionMenu &&
                    rowForActionMenu &&
                    typeof document !== 'undefined' &&
                    createPortal(
                      <>
                        <div
                          className="fixed inset-0 z-[1050]"
                          aria-hidden
                          onClick={closeRowActionMenu}
                        />
                        <div
                          role="menu"
                          className="fixed z-[1051] w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                          style={{ top: rowActionMenu.top, left: rowActionMenu.left }}
                        >
                          {[
                            !rowForActionMenu.receivedByEngineering &&
                            rowForActionMenu.currentStatus !== 'CANCELADO'
                              ? {
                                  key: 'receive',
                                  label: 'Receber',
                                  icon: (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                                  ),
                                  disabled: receiveMutation.isPending,
                                  onClick: () => receiveMutation.mutate(rowForActionMenu.id),
                                }
                              : null,
                            {
                              key: 'edit',
                              label: 'Editar',
                              icon: (
                                <Edit className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                              ),
                              onClick: () => openEdit(rowForActionMenu),
                            },
                            {
                              key: 'delete',
                              label: 'Excluir',
                              icon: (
                                <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                              ),
                              onClick: () => setDeleteId(rowForActionMenu.id),
                            },
                          ]
                            .filter(Boolean)
                            .map((item, index) => (
                              <button
                                key={item!.key}
                                type="button"
                                role="menuitem"
                                disabled={'disabled' in item! ? item!.disabled : false}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  closeRowActionMenu();
                                  item!.onClick();
                                }}
                                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700 ${
                                  index > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''
                                }`}
                              >
                                {item!.icon}
                                <span>{item!.label}</span>
                              </button>
                            ))}
                        </div>
                      </>,
                      document.body
                    )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Polo</label>
              <SingleSelectSearchDropdown
                value={poloFilter}
                onChange={setPoloFilter}
                options={poloSelectOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                noFocusRing
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status atual</label>
              <SingleSelectSearchDropdown
                value={currentStatusFilter}
                onChange={setCurrentStatusFilter}
                options={currentStatusOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                noFocusRing
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pagamento</label>
              <SingleSelectSearchDropdown
                value={paymentStatusFilter}
                onChange={setPaymentStatusFilter}
                options={paymentStatusOptions}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                noFocusRing
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPoloFilter('');
                  setCurrentStatusFilter('');
                  setPaymentStatusFilter('');
                  setSearch('');
                  setViewFilter('all');
                }}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showForm}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          title={editing ? `Editar ${editing.deliveryNumber}` : 'Nova entrega'}
          size="lg"
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Polo *</label>
                <div className="flex gap-2">
                  {POLO_OPTIONS.map((o) => (
                    <ButtonSeg
                      key={o.value}
                      active={form.polo === o.value}
                      onClick={() => setForm((f) => ({ ...f, polo: o.value }))}
                      label={o.label}
                    />
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Contrato</label>
                <SingleSelectSearchDropdown
                  value={form.contractId}
                  onChange={(contractId) => setForm((f) => ({ ...f, contractId }))}
                  options={contractOptions}
                  allowEmpty={false}
                  placeholder="Selecionar contrato..."
                  noFocusRing
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ID Mov</label>
                <input
                  value={form.movementId}
                  onChange={(e) => setForm((f) => ({ ...f, movementId: e.target.value }))}
                  className={fieldClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nº Mov.</label>
                <input
                  value={form.movementNumber}
                  onChange={(e) => setForm((f) => ({ ...f, movementNumber: e.target.value }))}
                  className={fieldClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status atual</label>
                <SingleSelectSearchDropdown
                  value={form.currentStatus}
                  onChange={(currentStatus) =>
                    setForm((f) => ({ ...f, currentStatus: currentStatus as CurrentStatusValue }))
                  }
                  options={currentStatusOptions}
                  allowEmpty={false}
                  placeholder="Selecionar status..."
                  noFocusRing
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Pagamento</label>
                <SingleSelectSearchDropdown
                  value={form.paymentStatus}
                  onChange={(paymentStatus) =>
                    setForm((f) => ({ ...f, paymentStatus: paymentStatus as PaymentStatusValue }))
                  }
                  options={paymentStatusOptions}
                  allowEmpty={false}
                  placeholder="Selecionar pagamento..."
                  noFocusRing
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ordem de Compra</label>
                <SingleSelectSearchDropdown
                  value={form.purchaseOrderId}
                  onChange={handlePurchaseOrderChange}
                  options={purchaseOrderOptions}
                  placeholder="Nenhuma"
                  emptyOptionLabel="Nenhuma"
                  noFocusRing
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fornecedor</label>
                <SingleSelectSearchDropdown
                  value={form.supplierId}
                  onChange={handleSupplierChange}
                  options={supplierOptions}
                  allowEmpty={false}
                  placeholder="Selecionar fornecedor..."
                  noFocusRing
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor OC</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.orderValue}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, orderValue: maskCurrencyInputBrOrEmpty(e.target.value) }))
                  }
                  placeholder="R$ 0,00"
                  className={currencyFieldClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor total pago</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.totalPaid}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, totalPaid: maskCurrencyInputBrOrEmpty(e.target.value) }))
                  }
                  placeholder="R$ 0,00"
                  className={currencyFieldClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Previsão de entrega</label>
                <input
                  type="date"
                  value={form.expectedDelivery}
                  onChange={(e) => setForm((f) => ({ ...f, expectedDelivery: e.target.value }))}
                  className={fieldClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">N° da RM</label>
                <input
                  value={form.rmNumber}
                  onChange={(e) => setForm((f) => ({ ...f, rmNumber: e.target.value }))}
                  className={fieldClassName}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tipo entrega</label>
                <SingleSelectSearchDropdown
                  value={form.deliveryType}
                  onChange={(deliveryType) =>
                    setForm((f) => ({ ...f, deliveryType: deliveryType as DeliveryTypeValue | '' }))
                  }
                  options={deliveryTypeOptions}
                  allowEmpty={false}
                  placeholder="Selecionar tipo..."
                  noFocusRing
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={form.observations}
                  onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
                  className={fieldClassName}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Registrar entrega'}
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={Boolean(deleteId)}
          onClose={() => setDeleteId(null)}
          title="Excluir entrega"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteId(null)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Excluir
            </button>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}

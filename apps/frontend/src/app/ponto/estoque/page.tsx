'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeftRight,
  History,
  Box,
  Filter,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Download,
  Eye,
  MoreVertical,
  Search,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { ButtonSeg } from '../solicitacoes-dp/DpSolicitacaoTypeFields';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import toast from 'react-hot-toast';

interface Material {
  id: string;
  name: string;
  description?: string;
  unit: string;
  category?: string;
}

interface StockMovement {
  id: string;
  material: Material;
  costCenter?: { id?: string; code: string; name: string };
  type: 'IN' | 'OUT';
  quantity: number;
  notes?: string;
  user: { name: string };
  createdAt: string;
}

interface StockBalance {
  material: Material;
  costCenter?: { id: string; code: string; name: string } | null;
  balance: number;
}

interface MaterialBalanceGroup {
  material: Material;
  lines: Array<{ costCenter: StockBalance['costCenter']; balance: number }>;
  totalBalance: number;
}

interface MovementFormData {
  costCenterId: string;
  type: 'IN' | 'OUT';
  ocNumber: string;
  movementSplit: '' | 'TOTAL' | 'PARCIAL';
  notes: string;
}

interface MovementPayload {
  materialId: string;
  costCenterId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  notes: string;
}

interface UploadedInvoice {
  url: string;
  originalName: string;
}

interface PaymentSlipAttachment {
  id: string;
  url: string;
  originalName: string;
  amount: string;
  dueDate: string;
}

const parseCurrencyBrlToNumber = (value: string) => {
  const normalized = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const formatCurrencyInputBrl = (value: string) => {
  const digits = value.replace(/\D/g, '');
  const amount = Number(digits || '0') / 100;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

interface PurchaseOrderOption {
  id: string;
  orderNumber: string;
  amountToPay?: number | string | null;
  freightAmount?: number | string | null;
  supplier?: {
    name?: string | null;
  } | null;
  materialRequest?: {
    costCenter?: {
      code?: string | null;
      name?: string | null;
    } | null;
  } | null;
  items?: Array<{
    totalPrice?: number | string | null;
  }>;
}

interface PurchaseOrderDetailItem {
  materialId: string;
  quantity: number;
  unit?: string;
  material?: {
    name?: string | null;
  };
}

interface PurchaseOrderDetail {
  id: string;
  items: PurchaseOrderDetailItem[];
  materialRequest?: {
    costCenter?: {
      id: string;
    } | null;
  } | null;
}

interface OcMovementItemState {
  key: string;
  materialId: string;
  unresolvedMaterialId: boolean;
  materialName: string;
  unit: string;
  originalQuantity: number;
  quantity: string;
  checked: boolean;
}

const normalizeMaterialName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const orderTotalValue = (order: PurchaseOrderOption) => {
  if (order.amountToPay != null && order.amountToPay !== '') {
    const amount = Number(order.amountToPay);
    if (Number.isFinite(amount)) return amount;
  }

  const itemsTotal = (order.items || []).reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
  const freight = Number(order.freightAmount || 0);
  return Math.round((itemsTotal + freight) * 100) / 100;
};

const extractFirstUrl = (text: string) => {
  const match = text.match(/https?:\/\/[^\s]+|\/uploads\/[^\s]+/i);
  return match?.[0] || '';
};

const extractOcNumberFromNotes = (notes?: string | null) => {
  if (!notes) return '';
  const ocMatch = notes.match(/Nº OC:\s*([^\n|]+)/i);
  return ocMatch?.[1]?.trim() || '';
};

function MovementSegButton({
  active,
  onClick,
  label,
  icon: Icon,
  variant
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'in' | 'out';
}) {
  const activeCls =
    variant === 'in'
      ? 'border-green-600 bg-green-50 text-green-800 dark:border-green-500 dark:bg-green-950/40 dark:text-green-200'
      : 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200';
  const inactiveCls =
    'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
        active ? activeCls : inactiveCls
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

export default function EstoquePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'balance' | 'movements'>('balance');
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [filtersCostCenterId, setFiltersCostCenterId] = useState('');
  const [filtersCategory, setFiltersCategory] = useState('');
  const [filtersMonth, setFiltersMonth] = useState('');
  const [filtersYear, setFiltersYear] = useState(new Date().getFullYear().toString());
  const [filtersSearch, setFiltersSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [isBalanceFiltersModalOpen, setIsBalanceFiltersModalOpen] = useState(false);
  const [isHistoryFiltersModalOpen, setIsHistoryFiltersModalOpen] = useState(false);
  const [balanceCurrentPage, setBalanceCurrentPage] = useState(1);
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyDetail, setHistoryDetail] = useState<StockMovement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const BALANCE_ITEMS_PER_PAGE = 12;
  const HISTORY_ITEMS_PER_PAGE = 12;
  const [ocMovementItems, setOcMovementItems] = useState<OcMovementItemState[]>([]);
  const [isOcDropdownOpen, setIsOcDropdownOpen] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<UploadedInvoice | null>(null);
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [withdrawalSheetFile, setWithdrawalSheetFile] = useState<UploadedInvoice | null>(null);
  const [isUploadingWithdrawalSheet, setIsUploadingWithdrawalSheet] = useState(false);
  const [paymentSlips, setPaymentSlips] = useState<PaymentSlipAttachment[]>([]);
  const [uploadingPaymentSlipId, setUploadingPaymentSlipId] = useState<string | null>(null);
  const [materialBalanceDetail, setMaterialBalanceDetail] = useState<MaterialBalanceGroup | null>(null);

  const [formData, setFormData] = useState<MovementFormData>({
    costCenterId: '',
    type: 'IN' as 'IN' | 'OUT',
    ocNumber: '',
    movementSplit: '',
    notes: ''
  });

  const categories = [
    'ACABAMENTO',
    'ADMINISTRATIVO',
    'ALVENARIA',
    'COBERTURA',
    'COMUNICAÇÃO VISUAL',
    'ELÉTRICA',
    'EPI',
    'FERRAMENTAS',
    'GASES MEDICINAIS',
    'HIDRÁULICA',
    'IMPERMEABILIZAÇÃO',
    'INCÊNDIO',
    'MARCENARIA',
    'MARMORARIA',
    'MATERIAL DE EXPEDIENTE',
    'PAISAGISMO',
    'PINTURA',
    'REFRIGERAÇÃO',
    'SERRALHERIA',
    'TELECOMUNICAÇÕES',
    'VIDRAÇARIA'
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: costCentersData, isLoading: loadingCostCenters } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => {
      const res = await api.get('/cost-centers');
      return res.data;
    }
  });

  const { data: materialsData } = useQuery({
    queryKey: ['construction-materials-for-stock-movement'],
    queryFn: async () => {
      const res = await api.get('/construction-materials', { params: { limit: 1000 } });
      return res.data;
    },
    enabled: isMovementModalOpen
  });

  const { data: balanceData, isLoading: loadingBalance } = useQuery({
    queryKey: ['stock-balance', filtersCostCenterId, filtersCategory, filtersSearch],
    queryFn: async () => {
      const res = await api.get('/stock/balance', {
        params: {
          costCenterId: filtersCostCenterId || undefined,
          category: filtersCategory || undefined,
          search: filtersSearch || undefined
        }
      });
      return res.data;
    },
    enabled: activeTab === 'balance' || activeTab === 'movements'
  });

  const { data: movementsData, isLoading: loadingMovements } = useQuery({
    queryKey: ['stock-movements', filtersCostCenterId, filtersMonth, filtersYear, filtersCategory],
    queryFn: async () => {
      const res = await api.get('/stock/movements', {
        params: {
          costCenterId: filtersCostCenterId || undefined,
          month: filtersMonth || undefined,
          year: filtersYear || undefined,
          category: filtersCategory || undefined,
          limit: 500
        }
      });
      return res.data;
    },
    enabled: activeTab === 'movements'
  });

  const { data: movementOcData } = useQuery({
    queryKey: ['stock-movements-oc-options'],
    queryFn: async () => {
      const res = await api.get('/stock/movements', { params: { limit: 1000 } });
      return res.data;
    },
    enabled: isMovementModalOpen
  });

  const { data: purchaseOrdersData, isLoading: loadingPurchaseOrders } = useQuery({
    queryKey: ['purchase-orders-oc-options'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500 } });
      return res.data;
    },
    enabled: isMovementModalOpen
  });

  const selectedPurchaseOrder = useMemo(
    () =>
      ((purchaseOrdersData?.data || []) as PurchaseOrderOption[]).find(
        (order) => order.orderNumber === formData.ocNumber
      ) || null,
    [purchaseOrdersData, formData.ocNumber]
  );

  const { data: selectedPurchaseOrderData, isLoading: loadingSelectedPurchaseOrder } = useQuery({
    queryKey: ['purchase-order-detail-for-stock', selectedPurchaseOrder?.id],
    queryFn: async () => {
      const res = await api.get(`/purchase-orders/${selectedPurchaseOrder?.id}`);
      return res.data;
    },
    enabled: isMovementModalOpen && !!selectedPurchaseOrder?.id
  });

  const resetMovementForm = () => {
    setFormData({
      costCenterId: '',
      type: 'IN',
      ocNumber: '',
      movementSplit: '',
      notes: ''
    });
    setInvoiceFile(null);
    setWithdrawalSheetFile(null);
    setPaymentSlips([]);
    setOcMovementItems([]);
    setIsOcDropdownOpen(false);
  };

  const closeMovementModal = () => {
    setIsMovementModalOpen(false);
    resetMovementForm();
  };

  const createMovementMutation = useMutation({
    mutationFn: async (data: MovementPayload[]) => {
      const responses = await Promise.all(data.map((payload) => api.post('/stock/movements', payload)));
      return responses.map((res) => res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stock-shortfalls-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setFormData({
        costCenterId: '',
        type: 'IN',
        ocNumber: '',
        movementSplit: '',
        notes: ''
      });
      setInvoiceFile(null);
      setWithdrawalSheetFile(null);
      setPaymentSlips([]);
      setOcMovementItems([]);
      setActiveTab('balance');
      closeMovementModal();
      toast.success('Movimentação registrada com sucesso!');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.message || 'Erro ao registrar movimentação';
      toast.error(msg);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedOcNumber = formData.ocNumber.trim();
    const trimmedNotes = formData.notes.trim();
    const selectedItems = ocMovementItems.filter((item) => item.checked);
    const totalMovementAlreadyDoneForSameType = movementsForOc.some((movement) => {
      if (!movement.notes) return false;
      const ocMatch = movement.notes.match(/Nº OC:\s*([^\n|]+)/i);
      const splitMatch = movement.notes.match(/Tipo:\s*(TOTAL|PARCIAL)/i);
      if (!ocMatch?.[1] || !splitMatch?.[1]) return false;
      return (
        ocMatch[1].trim().toLowerCase() === trimmedOcNumber.toLowerCase() &&
        movement.type === formData.type &&
        splitMatch[1].toUpperCase() === 'TOTAL'
      );
    });

    if (
      !trimmedOcNumber ||
      !formData.type ||
      !formData.costCenterId ||
      !formData.movementSplit ||
      selectedItems.length === 0
    ) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (totalMovementAlreadyDoneForSameType) {
      toast.error('Movimento já realizado');
      return;
    }

    if (formData.type === 'OUT' && !withdrawalSheetFile) {
      toast.error('Anexe a ficha de retirada para movimentos de saída');
      return;
    }
    if (formData.type === 'IN' && !invoiceFile) {
      toast.error('Anexe a nota fiscal para movimentos de entrada');
      return;
    }
    if (formData.type === 'IN') {
      for (let i = 0; i < paymentSlips.length; i += 1) {
        const slip = paymentSlips[i];
        if (!slip.url) {
          toast.error(`Anexe o arquivo do boleto ${i + 1}`);
          return;
        }
        const amount = parseCurrencyBrlToNumber(slip.amount);
        if (Number.isNaN(amount) || amount <= 0) {
          toast.error(`Informe um valor válido para o boleto ${i + 1}`);
          return;
        }
        if (!slip.dueDate) {
          toast.error(`Informe a data de vencimento do boleto ${i + 1}`);
          return;
        }
      }
    }

    const paymentSlipNotes =
      formData.type === 'IN' && paymentSlips.length > 0
        ? `Boletos:\n${paymentSlips
            .map((slip, index) => {
              const amount = parseCurrencyBrlToNumber(slip.amount);
              const amountLabel = Number.isFinite(amount)
                ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                : slip.amount;
              const dueDateLabel = new Date(`${slip.dueDate}T00:00:00`).toLocaleDateString('pt-BR');
              return `${index + 1}) ${slip.originalName} | Valor: ${amountLabel} | Vencimento: ${dueDateLabel} | URL: ${slip.url}`;
            })
            .join('\n')}`
        : '';

    const metadataNotes = [
      `Nº OC: ${trimmedOcNumber}`,
      formData.movementSplit ? `Tipo: ${formData.movementSplit}` : '',
      withdrawalSheetFile
        ? `Ficha de Retirada: ${withdrawalSheetFile.originalName} | URL: ${withdrawalSheetFile.url}`
        : '',
      invoiceFile ? `NF: ${invoiceFile.originalName} | URL: ${invoiceFile.url}` : '',
      paymentSlipNotes
    ]
      .filter(Boolean)
      .join(' | ');

    const combinedNotes = [metadataNotes, trimmedNotes].filter(Boolean).join('\n');
    const payloads: MovementPayload[] = [];

    for (const item of selectedItems) {
      const parsedQuantity = parseFloat(item.quantity.replace(',', '.'));
      if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
        toast.error(`Quantidade inválida para ${item.materialName}`);
        return;
      }
      if (!item.materialId) {
        toast.error(`Material "${item.materialName}" não encontrado no estoque`);
        return;
      }

      payloads.push({
        materialId: item.materialId,
        costCenterId: formData.costCenterId,
        type: formData.type,
        quantity: parsedQuantity,
        notes: combinedNotes
      });
    }

    createMovementMutation.mutate(payloads);
  };

  const costCenters = Array.isArray(costCentersData?.data) 
    ? costCentersData.data 
    : Array.isArray(costCentersData) 
    ? costCentersData 
    : [];
  const balances: StockBalance[] = balanceData?.data || [];
  const balancesByMaterial = useMemo(() => {
    const map = new Map<string, MaterialBalanceGroup>();
    balances.forEach((balance) => {
      const id = balance.material.id;
      let group = map.get(id);
      if (!group) {
        group = { material: balance.material, lines: [], totalBalance: 0 };
        map.set(id, group);
      }
      group.lines.push({ costCenter: balance.costCenter, balance: balance.balance });
      group.totalBalance += balance.balance;
    });
    return Array.from(map.values()).sort((a, b) =>
      a.material.name.localeCompare(b.material.name, 'pt-BR', { sensitivity: 'base' })
    );
  }, [balances]);
  const movements: StockMovement[] = movementsData?.data || [];

  const clearBalanceFilters = () => {
    setFiltersCostCenterId('');
    setFiltersCategory('');
    setFiltersSearch('');
    setBalanceCurrentPage(1);
  };

  const clearHistoryFilters = () => {
    setFiltersCostCenterId('');
    setFiltersCategory('');
    setFiltersMonth('');
    setFiltersYear(String(new Date().getFullYear()));
    setHistorySearch('');
    setHistoryCurrentPage(1);
  };

  const movementsForOc: StockMovement[] = movementOcData?.data || [];
  const purchaseOrders: PurchaseOrderOption[] = purchaseOrdersData?.data || [];
  const balanceByMaterialAndCostCenter = useMemo(() => {
    const map = new Map<string, number>();
    balances.forEach((balance) => {
      const key = `${balance.material.id}:${balance.costCenter?.id || 'no-cost-center'}`;
      map.set(key, balance.balance);
    });
    return map;
  }, [balances]);
  const filteredMovements = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    const list = [...movements].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (!term) return list;
    return list.filter((mov) => {
      const oc = extractOcNumberFromNotes(mov.notes).toLowerCase();
      const material = mov.material.name.toLowerCase();
      const user = mov.user.name.toLowerCase();
      const cc = (mov.costCenter?.name || mov.costCenter?.code || '').toLowerCase();
      return oc.includes(term) || material.includes(term) || user.includes(term) || cc.includes(term);
    });
  }, [movements, historySearch]);

  const historyTotal = filteredMovements.length;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_ITEMS_PER_PAGE));
  const historyStartIndex = (historyCurrentPage - 1) * HISTORY_ITEMS_PER_PAGE;
  const historyEndIndex = historyStartIndex + HISTORY_ITEMS_PER_PAGE;
  const paginatedMovements = filteredMovements.slice(historyStartIndex, historyEndIndex);
  const historyStartItem = historyTotal === 0 ? 0 : historyStartIndex + 1;
  const historyEndItem = Math.min(historyEndIndex, historyTotal);

  const balanceTotal = balances.length;
  const balanceTotalPages = Math.max(1, Math.ceil(balanceTotal / BALANCE_ITEMS_PER_PAGE));
  const balanceStartIndex = (balanceCurrentPage - 1) * BALANCE_ITEMS_PER_PAGE;
  const balanceEndIndex = balanceStartIndex + BALANCE_ITEMS_PER_PAGE;
  const paginatedBalances = balances.slice(balanceStartIndex, balanceEndIndex);
  const balanceStartItem = balanceTotal === 0 ? 0 : balanceStartIndex + 1;
  const balanceEndItem = Math.min(balanceEndIndex, balanceTotal);

  useEffect(() => {
    setBalanceCurrentPage(1);
  }, [filtersCostCenterId, filtersCategory, filtersSearch]);

  useEffect(() => {
    setHistoryCurrentPage(1);
  }, [filtersCostCenterId, filtersCategory, filtersMonth, filtersYear, historySearch]);

  useEffect(() => {
    if (balanceCurrentPage > balanceTotalPages) {
      setBalanceCurrentPage(balanceTotalPages);
    }
  }, [balanceCurrentPage, balanceTotalPages]);

  useEffect(() => {
    if (historyCurrentPage > historyTotalPages) {
      setHistoryCurrentPage(historyTotalPages);
    }
  }, [historyCurrentPage, historyTotalPages]);

  useEffect(() => {
    if (!historyDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistoryDetail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyDetail]);

  useEffect(() => {
    if (!isMovementModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMovementModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMovementModalOpen]);

  const selectedOrderDetail: PurchaseOrderDetail | null = selectedPurchaseOrderData?.data || null;
  const constructionMaterialIdByName = useMemo(() => {
    const map = new Map<string, string>();
    const list = materialsData?.data;
    if (!Array.isArray(list)) return map;
    list.forEach((material) => {
      map.set(normalizeMaterialName(material.name), material.id);
    });
    return map;
  }, [materialsData?.data]);
  const availableOcOptions = useMemo(() => {
    const ocWithTotalOut = new Set<string>();

    movementsForOc.forEach((movement) => {
      if (movement.type !== 'OUT' || !movement.notes) return;
      const ocMatch = movement.notes.match(/Nº OC:\s*([^\n|]+)/i);
      const splitMatch = movement.notes.match(/Tipo:\s*(TOTAL|PARCIAL)/i);
      if (!ocMatch?.[1]) return;

      const ocNumber = ocMatch[1].trim();
      const split = splitMatch?.[1]?.toUpperCase();
      if (split === 'TOTAL') {
        ocWithTotalOut.add(ocNumber);
      }
    });

    return purchaseOrders
      .filter((order) => Boolean(order.orderNumber))
      .filter((order, index, arr) => arr.findIndex((x) => x.orderNumber === order.orderNumber) === index)
      .filter((order) => !ocWithTotalOut.has(order.orderNumber))
      .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber, 'pt-BR'));
  }, [movementsForOc, purchaseOrders]);
  const filteredOcOptions = useMemo(() => {
    const term = formData.ocNumber.trim().toLowerCase();
    if (!term) return availableOcOptions;
    return availableOcOptions.filter((order) => {
      const costCenterLabel = order.materialRequest?.costCenter
        ? `${order.materialRequest.costCenter.code || ''} ${order.materialRequest.costCenter.name || ''}`.trim()
        : '';
      const supplierLabel = order.supplier?.name || '';
      const haystack = `${order.orderNumber} ${costCenterLabel} ${supplierLabel}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [availableOcOptions, formData.ocNumber]);

  const selectedOrderDetailId = selectedOrderDetail?.id ?? null;
  const movementSplit = formData.movementSplit;
  const ocCostCenterIdFromOrder =
    selectedOrderDetail?.materialRequest?.costCenter?.id ?? null;

  useEffect(() => {
    if (!selectedOrderDetailId || !movementSplit) {
      setOcMovementItems((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const detail = selectedPurchaseOrderData?.data as PurchaseOrderDetail | null | undefined;
    if (!detail?.items?.length) {
      setOcMovementItems((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const nextItems = detail.items.map((item, index) => {
      const originalQuantity = Number(item.quantity || 0);
      const materialName = item.material?.name || `Material ${index + 1}`;
      const resolvedMaterialId =
        constructionMaterialIdByName.get(normalizeMaterialName(materialName)) || '';
      return {
        key: `${item.materialId}-${index}`,
        materialId: resolvedMaterialId,
        unresolvedMaterialId: !resolvedMaterialId,
        materialName,
        unit: item.unit || '-',
        originalQuantity,
        quantity: String(originalQuantity),
        checked: movementSplit === 'TOTAL',
      };
    });

    setOcMovementItems(nextItems);
  }, [
    selectedOrderDetailId,
    movementSplit,
    materialsData?.data,
    selectedPurchaseOrderData?.data,
    constructionMaterialIdByName,
  ]);

  useEffect(() => {
    if (!ocCostCenterIdFromOrder) return;
    setFormData((prev) => {
      if (prev.costCenterId) return prev;
      return { ...prev, costCenterId: ocCostCenterIdFromOrder };
    });
  }, [ocCostCenterIdFromOrder]);
  const exportRows = balances.map((b) => ({
    material: b.material.name,
    categoria: b.material.category || '-',
    centroDeCusto: b.costCenter?.name || 'Nao informado',
    quantidade: b.balance,
    unidadeDeMedida: b.material.unit
  }));

  const buildExportFilename = (ext: 'xlsx' | 'pdf') => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `saldo-atual-estoque-${yyyy}-${mm}-${dd}-${hh}${min}.${ext}`;
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(
        exportRows.map((row) => ({
          Material: row.material,
          Categoria: row.categoria,
          'Centro de Custo': row.centroDeCusto,
          Quantidade: row.quantidade,
          'Unidade de Medida': row.unidadeDeMedida
        }))
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Saldo Atual');
      XLSX.writeFile(workbook, buildExportFilename('xlsx'));
      toast.success('Saldo atual exportado para Excel');
    } catch (error) {
      toast.error('Erro ao exportar para Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      doc.setFontSize(14);
      doc.text('Saldo Atual de Estoque', 40, 40);
      doc.setFontSize(9);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 40, 58);

      const headers = ['Material', 'Categoria', 'Centro de Custo', 'Quantidade', 'Unidade de Medida'];
      const xPositions = [40, 230, 360, 620, 700];
      let y = 90;

      doc.setFontSize(10);
      headers.forEach((header, index) => {
        doc.text(header, xPositions[index], y);
      });
      y += 16;
      doc.line(40, y, 800, y);
      y += 14;

      exportRows.forEach((row) => {
        if (y > 560) {
          doc.addPage();
          y = 50;
        }
        doc.text(String(row.material), xPositions[0], y);
        doc.text(String(row.categoria), xPositions[1], y);
        doc.text(String(row.centroDeCusto), xPositions[2], y);
        doc.text(String(row.quantidade), xPositions[3], y, { align: 'right' });
        doc.text(String(row.unidadeDeMedida), xPositions[4], y);
        y += 14;
      });

      doc.save(buildExportFilename('pdf'));
      toast.success('Saldo atual exportado para PDF');
    } catch (error) {
      toast.error('Erro ao exportar para PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleInvoiceUpload = async (file: File | null) => {
    if (!file) return;
    setIsUploadingInvoice(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/stock/upload-invoice', fd);
      const data = res.data?.data as UploadedInvoice | undefined;
      if (!data?.url) {
        throw new Error('Resposta inválida do servidor');
      }
      setInvoiceFile({
        url: data.url,
        originalName: data.originalName || file.name
      });
      toast.success('Nota fiscal anexada');
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Não foi possível anexar a nota fiscal';
      toast.error(message);
    } finally {
      setIsUploadingInvoice(false);
    }
  };

  const handleWithdrawalSheetUpload = async (file: File | null) => {
    if (!file) return;
    setIsUploadingWithdrawalSheet(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/stock/upload-withdrawal-sheet', fd);
      const data = res.data?.data as UploadedInvoice | undefined;
      if (!data?.url) {
        throw new Error('Resposta inválida do servidor');
      }
      setWithdrawalSheetFile({
        url: data.url,
        originalName: data.originalName || file.name
      });
      toast.success('Ficha de retirada anexada');
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Não foi possível anexar a ficha de retirada';
      toast.error(message);
    } finally {
      setIsUploadingWithdrawalSheet(false);
    }
  };

  const handleAddPaymentSlip = () => {
    const nextId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPaymentSlips((prev) => [...prev, { id: nextId, url: '', originalName: '', amount: '', dueDate: '' }]);
  };

  const handleRemovePaymentSlip = (id: string) => {
    setPaymentSlips((prev) => prev.filter((item) => item.id !== id));
  };

  const handlePaymentSlipFieldChange = (id: string, field: 'amount' | 'dueDate', value: string) => {
    setPaymentSlips((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === 'amount' ? formatCurrencyInputBrl(value) : value
            }
          : item
      )
    );
  };

  const handlePaymentSlipUpload = async (id: string, file: File | null) => {
    if (!file) return;
    setUploadingPaymentSlipId(id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/stock/upload-payment-slip', fd);
      const data = res.data?.data as UploadedInvoice | undefined;
      if (!data?.url) {
        throw new Error('Resposta inválida do servidor');
      }
      setPaymentSlips((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                url: data.url,
                originalName: data.originalName || file.name
              }
            : item
        )
      );
      toast.success('Boleto anexado');
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Não foi possível anexar o boleto';
      toast.error(message);
    } finally {
      setUploadingPaymentSlipId(null);
    }
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/estoque">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Estoque</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Gerencie entradas, saídas e consulte saldos
            </p>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('balance')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'balance'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
                }`}
              >
                <Box className="w-4 h-4" />
                Saldo Atual
              </button>
              <button
                onClick={() => setActiveTab('movements')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'movements'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
                }`}
              >
                <History className="w-4 h-4" />
                Histórico
              </button>
            </nav>
          </div>

          {activeTab === 'balance' && (
            <Card className="w-full">
              <CardHeader className="border-b-0 pb-1">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <Box className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Saldo Atual</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Consulte materiais e quantidades em estoque por centro de custo
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        value={filtersSearch}
                        onChange={(e) => setFiltersSearch(e.target.value)}
                        placeholder="Pesquisar material..."
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      {filtersSearch && (
                        <button
                          type="button"
                          onClick={() => setFiltersSearch('')}
                          aria-label="Limpar busca"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsBalanceFiltersModalOpen(true)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      aria-label="Abrir filtro"
                      title="Filtro"
                    >
                      <Filter className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      disabled={isExporting || balances.length === 0}
                      className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      <span>Exportar Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPdf}
                      disabled={isExporting || balances.length === 0}
                      className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      <span>Exportar PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMovementModalOpen(true)}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <ArrowLeftRight className="h-4 w-4 shrink-0" />
                      <span>Nova Movimentação</span>
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingBalance ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 dark:text-gray-400">Carregando saldo...</p>
                  </div>
                ) : balances.length === 0 ? (
                  <div className="text-center py-8">
                    <Box className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Nenhum material em estoque</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                      Ajuste os filtros ou cadastre materiais para exibir o saldo
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                      <span>
                        Mostrando {balanceStartItem} a {balanceEndItem} de {balanceTotal} materiais
                      </span>
                      <span>
                        Página {balanceCurrentPage} de {balanceTotalPages}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Material
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Categoria
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Centro de Custo
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Quantidade
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Unidade
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {paginatedBalances.map((b) => (
                            <tr
                              key={`${b.material.id}-${b.costCenter?.id || 'sem-cc'}`}
                              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                              <td className="px-3 sm:px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                {b.material.name}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                {b.material.category || '—'}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                {b.costCenter?.name || 'Não informado'}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                                {b.balance.toLocaleString('pt-BR')}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                                {b.material.unit}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {balanceTotalPages > 1 && (
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setBalanceCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={balanceCurrentPage === 1}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() => setBalanceCurrentPage((prev) => Math.min(prev + 1, balanceTotalPages))}
                          disabled={balanceCurrentPage === balanceTotalPages}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Próxima
                        </button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>

              {isBalanceFiltersModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => setIsBalanceFiltersModalOpen(false)}
                  />
                  <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
                    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                      <button
                        type="button"
                        onClick={() => setIsBalanceFiltersModalOpen(false)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                        aria-label="Fechar filtros"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="px-5 py-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Centro de Custo
                          </label>
                          <select
                            value={filtersCostCenterId}
                            onChange={(e) => setFiltersCostCenterId(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          >
                            <option value="">Todos</option>
                            {costCenters.map((cc: { id: string; code: string; name: string }) => (
                              <option key={cc.id} value={cc.id}>
                                {cc.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Categoria
                          </label>
                          <select
                            value={filtersCategory}
                            onChange={(e) => setFiltersCategory(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          >
                            <option value="">Todas</option>
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={clearBalanceFilters}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Limpar filtros
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsBalanceFiltersModalOpen(false)}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {activeTab === 'movements' && (
            <Card className="w-full">
              <CardHeader className="border-b-0 pb-1">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <History className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Histórico de Movimentações
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Consulte entradas e saídas registradas no estoque
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Pesquisar OC, material..."
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      {historySearch && (
                        <button
                          type="button"
                          onClick={() => setHistorySearch('')}
                          aria-label="Limpar busca"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsHistoryFiltersModalOpen(true)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      aria-label="Abrir filtro"
                      title="Filtro"
                    >
                      <Filter className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingMovements ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 dark:text-gray-400">Carregando histórico...</p>
                  </div>
                ) : filteredMovements.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Nenhuma movimentação encontrada</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                      Ajuste os filtros ou registre uma nova movimentação
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                      <span>
                        Mostrando {historyStartItem} a {historyEndItem} de {historyTotal} movimentações
                      </span>
                      <span>
                        Página {historyCurrentPage} de {historyTotalPages}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Data
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              OC
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Material
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Movimento
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Quantidade
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Centro de Custo
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Registrado por
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Ação
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {paginatedMovements.map((mov) => {
                            const ocNumber = extractOcNumberFromNotes(mov.notes) || '—';
                            return (
                              <tr
                                key={mov.id}
                                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                              >
                                <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                  {new Date(mov.createdAt).toLocaleString('pt-BR')}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {ocNumber}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                  {mov.material.name}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-center">
                                  <span
                                    className={`inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                                      mov.type === 'IN'
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                    }`}
                                  >
                                    {mov.type === 'IN' ? (
                                      <ArrowDownCircle className="h-3.5 w-3.5 shrink-0" />
                                    ) : (
                                      <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
                                    )}
                                    {mov.type === 'IN' ? 'Entrada' : 'Saída'}
                                  </span>
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                  {mov.quantity.toLocaleString('pt-BR')} {mov.material.unit}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                  {mov.costCenter?.name || '—'}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                  {mov.user.name}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => setHistoryDetail(mov)}
                                    className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    aria-label="Ver detalhes"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {historyTotalPages > 1 && (
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setHistoryCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={historyCurrentPage === 1}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryCurrentPage((prev) => Math.min(prev + 1, historyTotalPages))}
                          disabled={historyCurrentPage === historyTotalPages}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Próxima
                        </button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>

              {isHistoryFiltersModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => setIsHistoryFiltersModalOpen(false)}
                  />
                  <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
                    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                      <button
                        type="button"
                        onClick={() => setIsHistoryFiltersModalOpen(false)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                        aria-label="Fechar filtros"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="px-5 py-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Centro de Custo
                          </label>
                          <select
                            value={filtersCostCenterId}
                            onChange={(e) => setFiltersCostCenterId(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          >
                            <option value="">Todos</option>
                            {costCenters.map((cc: { id: string; code: string; name: string }) => (
                              <option key={cc.id} value={cc.id}>
                                {cc.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Categoria
                          </label>
                          <select
                            value={filtersCategory}
                            onChange={(e) => setFiltersCategory(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          >
                            <option value="">Todas</option>
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Mês
                          </label>
                          <select
                            value={filtersMonth}
                            onChange={(e) => setFiltersMonth(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          >
                            <option value="">Todos</option>
                            {Array.from({ length: 12 }, (_, i) => (
                              <option key={i + 1} value={i + 1}>
                                {new Date(0, i).toLocaleString('pt-BR', { month: 'long' })}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Ano
                          </label>
                          <select
                            value={filtersYear}
                            onChange={(e) => setFiltersYear(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          >
                            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={clearHistoryFilters}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Limpar filtros
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsHistoryFiltersModalOpen(false)}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {historyDetail && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setHistoryDetail(null)}
                aria-hidden
              />
              <div className="relative z-10 w-full max-w-lg max-h-[min(90vh,32rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 pr-2">
                    Detalhe da movimentação
                  </h2>
                  <button
                    type="button"
                    onClick={() => setHistoryDetail(null)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3 text-sm text-gray-800 dark:text-gray-200">
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Material</span>
                    <span className="font-medium">{historyDetail.material.name}</span>
                  </p>
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">OC</span>
                    <span>{extractOcNumberFromNotes(historyDetail.notes) || '—'}</span>
                  </p>
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Movimento</span>
                    <span>{historyDetail.type === 'IN' ? 'Entrada' : 'Saída'} — {historyDetail.quantity}{' '}
                      {historyDetail.material.unit}</span>
                  </p>
                  {historyDetail.costCenter && (
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Centro de custo</span>
                      <span>{historyDetail.costCenter.name || historyDetail.costCenter.code}</span>
                    </p>
                  )}
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Saldo atual (CC)</span>
                    <span>
                      {(() => {
                        const key = `${historyDetail.material.id}:${historyDetail.costCenter?.id || 'no-cost-center'}`;
                        const currentBalance = balanceByMaterialAndCostCenter.get(key);
                        if (currentBalance === undefined) return `0 ${historyDetail.material.unit}`;
                        return `${currentBalance.toLocaleString('pt-BR')} ${historyDetail.material.unit}`;
                      })()}
                    </span>
                  </p>
                  {historyDetail.notes && (
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Observações</span>
                      <span className="whitespace-pre-line">{historyDetail.notes}</span>
                    </p>
                  )}
                  {historyDetail.notes && extractFirstUrl(historyDetail.notes) && (
                    <a
                      href={absoluteUploadUrl(extractFirstUrl(historyDetail.notes))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline inline-block"
                    >
                      Abrir anexo
                    </a>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(historyDetail.createdAt).toLocaleString('pt-BR')} — {historyDetail.user.name}
                  </p>
                </div>
              </div>
            </div>
          )}

          {isMovementModalOpen && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={closeMovementModal} aria-hidden />
              <div
                className="relative flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
                role="dialog"
                aria-modal="true"
                aria-labelledby="movement-modal-title"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                  <h3 id="movement-modal-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Nova Movimentação
                  </h3>
                  <button
                    type="button"
                    onClick={closeMovementModal}
                    className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-0 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    aria-label="Fechar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="overflow-y-auto px-5 py-4 [&_*:focus]:outline-none [&_*:focus]:ring-0 [&_*:focus-visible]:outline-none [&_*:focus-visible]:ring-0">
                  <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Número da OC
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={formData.ocNumber}
                      onFocus={() => setIsOcDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsOcDropdownOpen(false), 150)}
                      onChange={(e) => {
                        setFormData({ ...formData, ocNumber: e.target.value });
                        setIsOcDropdownOpen(true);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      disabled={loadingPurchaseOrders}
                      placeholder={loadingPurchaseOrders ? 'Carregando OCs...' : 'Digite para pesquisar OC'}
                    />
                    {isOcDropdownOpen && !loadingPurchaseOrders && filteredOcOptions.length > 0 && (
                      <div className="absolute z-[1100] mt-1 max-h-64 w-full min-w-[280px] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                        {filteredOcOptions.map((order) => {
                          const costCenterLabel = order.materialRequest?.costCenter
                            ? `${order.materialRequest.costCenter.code || ''} ${order.materialRequest.costCenter.name || ''}`.trim()
                            : 'Sem CC';
                          const supplierLabel = order.supplier?.name || 'Sem fornecedor';
                          const totalLabel = orderTotalValue(order).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                          });
                          const detailsLabel = `${order.orderNumber} | ${costCenterLabel} | ${supplierLabel} | ${totalLabel}`;

                          return (
                            <button
                              key={order.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setFormData((prev) => ({ ...prev, ocNumber: order.orderNumber }));
                                setIsOcDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-100 hover:bg-gray-800 border-b border-gray-800 last:border-b-0"
                              title={detailsLabel}
                            >
                              {detailsLabel}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {!loadingPurchaseOrders && availableOcOptions.length === 0 && (
                    <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
                      Nenhuma OC disponível. Todas já tiveram saída total ou não há OCs cadastradas.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Centro de Custo
                  </label>
                  <select
                    value={formData.costCenterId}
                    onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                    disabled={loadingCostCenters}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                  >
                    <option value="">Selecione um centro de custo</option>
                    {loadingCostCenters && <option disabled>Carregando centros de custo...</option>}
                    {!loadingCostCenters && costCenters.length === 0 && (
                      <option disabled>Nenhum centro de custo cadastrado</option>
                    )}
                    {costCenters.map((cc: { id: string; code: string; name: string }) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.name}
                      </option>
                    ))}
                  </select>
                  {!loadingCostCenters && costCenters.length === 0 && (
                    <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
                      ⚠️ Não há centros de custo cadastrados.{' '}
                      <Link href="/ponto/centros-de-custo" className="underline hover:text-yellow-700">
                        Cadastre aqui
                      </Link>
                      .
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Movimento *
                </label>
                <div className="flex gap-2">
                  <MovementSegButton
                    active={formData.type === 'IN'}
                    variant="in"
                    icon={ArrowDownCircle}
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, type: 'IN' }));
                      setWithdrawalSheetFile(null);
                    }}
                    label="Entrada"
                  />
                  <MovementSegButton
                    active={formData.type === 'OUT'}
                    variant="out"
                    icon={ArrowUpCircle}
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, type: 'OUT' }));
                      setInvoiceFile(null);
                      setPaymentSlips([]);
                    }}
                    label="Saída"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tipo da Movimentação *
                </label>
                <div className="flex gap-2">
                  <ButtonSeg
                    active={formData.movementSplit === 'TOTAL'}
                    onClick={() => setFormData((prev) => ({ ...prev, movementSplit: 'TOTAL' }))}
                    label="Total"
                  />
                  <ButtonSeg
                    active={formData.movementSplit === 'PARCIAL'}
                    onClick={() => setFormData((prev) => ({ ...prev, movementSplit: 'PARCIAL' }))}
                    label="Parcial"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Itens da OC *
                </label>
                {loadingSelectedPurchaseOrder ? (
                  <p className="text-sm text-gray-500">Carregando itens da OC...</p>
                ) : !formData.ocNumber ? (
                  <p className="text-sm text-gray-500">Selecione uma OC para exibir os itens.</p>
                ) : ocMovementItems.length === 0 ? (
                  <p className="text-sm text-gray-500">Selecione o tipo da movimentação (Total ou Parcial).</p>
                ) : (
                  <div className="border border-gray-300 dark:border-gray-600 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                    {ocMovementItems.map((item) => (
                      <div key={item.key} className="p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        <label className="md:col-span-6 flex items-center gap-3 text-sm text-gray-800 dark:text-gray-200">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            disabled={formData.movementSplit === 'TOTAL'}
                            onChange={(e) =>
                              setOcMovementItems((prev) =>
                                prev.map((row) =>
                                  row.key === item.key ? { ...row, checked: e.target.checked } : row
                                )
                              )
                            }
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          <span>{item.materialName}</span>
                          {item.unresolvedMaterialId && (
                            <span className="text-xs text-red-500 dark:text-red-400">(não encontrado no estoque)</span>
                          )}
                        </label>
                        <div className="md:col-span-4">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.quantity}
                            disabled={formData.movementSplit === 'TOTAL' || !item.checked}
                            onChange={(e) =>
                              setOcMovementItems((prev) =>
                                prev.map((row) =>
                                  row.key === item.key ? { ...row, quantity: e.target.value } : row
                                )
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-60"
                          />
                        </div>
                        <div className="md:col-span-2 text-sm text-gray-600 dark:text-gray-400">{item.unit}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Observações
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Observações sobre a movimentação..."
                />
              </div>
              {formData.type === 'OUT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ficha de Retirada *
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-sm">
                      {isUploadingWithdrawalSheet ? 'Enviando...' : 'Escolher arquivo'}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,image/*"
                        disabled={isUploadingWithdrawalSheet}
                        onChange={(e) => {
                          const selectedFile = e.target.files?.[0] || null;
                          void handleWithdrawalSheetUpload(selectedFile);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {withdrawalSheetFile && (
                      <>
                        <a
                          href={absoluteUploadUrl(withdrawalSheetFile.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {withdrawalSheetFile.originalName}
                        </a>
                        <button
                          type="button"
                          onClick={() => setWithdrawalSheetFile(null)}
                          className="text-sm text-red-600 dark:text-red-400 hover:underline"
                        >
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Obrigatório para saída. Formatos aceitos: PDF, PNG, JPG e WEBP (até 15MB).
                  </p>
                </div>
              )}
              {formData.type === 'IN' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Nota Fiscal *
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-sm">
                      {isUploadingInvoice ? 'Enviando...' : 'Escolher arquivo'}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.xml,image/*"
                        disabled={isUploadingInvoice}
                        onChange={(e) => {
                          const selectedFile = e.target.files?.[0] || null;
                          void handleInvoiceUpload(selectedFile);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {invoiceFile && (
                      <>
                        <a
                          href={absoluteUploadUrl(invoiceFile.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {invoiceFile.originalName}
                        </a>
                        <button
                          type="button"
                          onClick={() => setInvoiceFile(null)}
                          className="text-sm text-red-600 dark:text-red-400 hover:underline"
                        >
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Obrigatório para entrada. Formatos aceitos: PDF, XML, PNG, JPG e WEBP (até 15MB).
                  </p>
                </div>
              )}
              {formData.type === 'IN' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Boletos para Pagamento
                    </label>
                    <button
                      type="button"
                      onClick={handleAddPaymentSlip}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      + Adicionar boleto
                    </button>
                  </div>
                  {paymentSlips.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Adicione quantos boletos forem necessários.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {paymentSlips.map((slip, index) => (
                        <div
                          key={slip.id}
                          className="p-3 border border-gray-300 dark:border-gray-600 rounded-lg space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-700 dark:text-gray-300">Boleto {index + 1}</p>
                            <button
                              type="button"
                              onClick={() => handleRemovePaymentSlip(slip.id)}
                              className="text-xs text-red-600 dark:text-red-400 hover:underline"
                            >
                              Remover
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-sm">
                              {uploadingPaymentSlipId === slip.id ? 'Enviando...' : 'Escolher arquivo'}
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,image/*"
                                disabled={uploadingPaymentSlipId === slip.id}
                                onChange={(e) => {
                                  const selectedFile = e.target.files?.[0] || null;
                                  void handlePaymentSlipUpload(slip.id, selectedFile);
                                  e.currentTarget.value = '';
                                }}
                              />
                            </label>
                            {slip.url && (
                              <a
                                href={absoluteUploadUrl(slip.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {slip.originalName}
                              </a>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Valor do boleto"
                              value={slip.amount}
                              onChange={(e) =>
                                handlePaymentSlipFieldChange(slip.id, 'amount', e.target.value)
                              }
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                            <input
                              type="date"
                              value={slip.dueDate}
                              onChange={(e) =>
                                handlePaymentSlipFieldChange(slip.id, 'dueDate', e.target.value)
                              }
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeMovementModal}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMovementMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {createMovementMutation.isPending ? 'Registrando...' : 'Registrar Movimentação'}
                </button>
              </div>
            </form>
                </div>
              </div>
            </div>
          )}

        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}

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
import {
  constructionMaterialIdFromSinapiCode,
  resolveConstructionMaterialsByNames,
} from '@/lib/fetchAllConstructionMaterials';
import { normalizeCostCentersResponse } from '@/lib/costCenters';
import { getListTableRowClassName, listTableRowClasses, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import toast from 'react-hot-toast';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { CheckboxIndicator } from '@/components/ui/Checkbox';

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

interface GroupedStockBalance {
  material: Material;
  lines: Array<{
    costCenter?: { id: string; code: string; name: string } | null;
    balance: number;
  }>;
}

interface MaterialBalanceGroup {
  material: Material;
  lines: Array<{ costCenter: StockBalance['costCenter']; balance: number }>;
  totalBalance: number;
}

interface MovementFormData {
  costCenterId: string;
  type: '' | 'IN' | 'OUT';
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
      id?: string | null;
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
    sinapiCode?: string | null;
  };
}

interface PurchaseOrderDetail {
  id: string;
  items: PurchaseOrderDetailItem[];
  materialRequest?: {
    costCenter?: {
      id: string;
      code?: string | null;
      name?: string | null;
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

const EMPTY_STOCK_MOVEMENTS: StockMovement[] = [];

function getAlreadyMovedQuantityForOcMaterial(
  movements: StockMovement[],
  ocNumber: string,
  type: 'IN' | 'OUT',
  materialId: string
): number {
  if (!materialId || !ocNumber.trim()) return 0;
  const ocLower = ocNumber.trim().toLowerCase();
  return movements.reduce((sum, mov) => {
    if (mov.type !== type || mov.material?.id !== materialId) return sum;
    const notes = mov.notes || '';
    const ocMatch = notes.match(/Nº OC:\s*([^\n|]+)/i);
    if (!ocMatch?.[1] || ocMatch[1].trim().toLowerCase() !== ocLower) return sum;
    return sum + (Number(mov.quantity) || 0);
  }, 0);
}

function ocMovementItemsEqual(a: OcMovementItemState[], b: OcMovementItemState[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => {
    const next = b[i];
    return (
      item.key === next.key &&
      item.materialId === next.materialId &&
      item.unresolvedMaterialId === next.unresolvedMaterialId &&
      item.materialName === next.materialName &&
      item.unit === next.unit &&
      item.originalQuantity === next.originalQuantity &&
      item.quantity === next.quantity &&
      item.checked === next.checked
    );
  });
}

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
  const [balanceDetail, setBalanceDetail] = useState<GroupedStockBalance | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const BALANCE_ITEMS_PER_PAGE = 12;
  const HISTORY_ITEMS_PER_PAGE = 12;
  const [ocMovementItems, setOcMovementItems] = useState<OcMovementItemState[]>([]);
  const [invoiceFile, setInvoiceFile] = useState<UploadedInvoice | null>(null);
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [withdrawalSheetFile, setWithdrawalSheetFile] = useState<UploadedInvoice | null>(null);
  const [isUploadingWithdrawalSheet, setIsUploadingWithdrawalSheet] = useState(false);
  const [paymentSlips, setPaymentSlips] = useState<PaymentSlipAttachment[]>([]);
  const [uploadingPaymentSlipId, setUploadingPaymentSlipId] = useState<string | null>(null);
  const [materialBalanceDetail, setMaterialBalanceDetail] = useState<MaterialBalanceGroup | null>(null);

  const [formData, setFormData] = useState<MovementFormData>({
    costCenterId: '',
    type: '',
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
    queryKey: ['cost-centers', 'stock-page'],
    queryFn: async () => {
      const res = await api.get('/cost-centers', {
        params: { page: 1, limit: 2000, isActive: 'true' }
      });
      return res.data;
    }
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
      type: '',
      ocNumber: '',
      movementSplit: '',
      notes: ''
    });
    setInvoiceFile(null);
    setWithdrawalSheetFile(null);
    setPaymentSlips([]);
    setOcMovementItems([]);
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
      queryClient.invalidateQueries({ queryKey: ['stock-movements-oc-options'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements-oc-tags'] });
      queryClient.invalidateQueries({ queryKey: ['stock-shortfalls-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setFormData({
        costCenterId: '',
        type: '',
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

    if (!trimmedOcNumber || !formData.type || !formData.movementSplit || selectedItems.length === 0) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (!formData.costCenterId) {
      toast.error('Selecione o contrato');
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

      if (formData.movementSplit === 'PARCIAL' && formData.type) {
        const alreadyMoved = getAlreadyMovedQuantityForOcMaterial(
          movementsForOc,
          trimmedOcNumber,
          formData.type,
          item.materialId
        );
        const remaining = Math.max(0, item.originalQuantity - alreadyMoved);
        if (parsedQuantity > remaining) {
          toast.error(
            `Quantidade maior que o restante da OC (${remaining} ${item.unit}) para ${item.materialName}`
          );
          return;
        }
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

  const costCenters = normalizeCostCentersResponse(costCentersData) as Array<{
    id: string;
    code: string;
    name: string;
  }>;

  const costCenterFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...costCenters.map((cc) => ({
        value: cc.id,
        label: cc.name,
        searchText: cc.name,
      })),
    ],
    [costCenters]
  );

  const categoryFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todas', searchText: 'Todas' },
      ...categories.map((cat) => ({ value: cat, label: cat, searchText: cat })),
    ],
    [categories]
  );

  const stockMonthFilterOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '', label: 'Todos' },
        ...Array.from({ length: 12 }, (_, i) => {
          const month = i + 1;
          return {
            value: String(month),
            label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }),
          };
        }),
      ]),
    []
  );

  const stockYearFilterOptions = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => ({
        value: String(year),
        label: String(year),
      })),
    []
  );

  const balances: StockBalance[] = balanceData?.data || [];
  const groupedBalances = useMemo(() => {
    const byMaterial = new Map<string, GroupedStockBalance>();
    for (const row of balances) {
      const existing = byMaterial.get(row.material.id);
      if (existing) {
        existing.lines.push({ costCenter: row.costCenter, balance: row.balance });
      } else {
        byMaterial.set(row.material.id, {
          material: row.material,
          lines: [{ costCenter: row.costCenter, balance: row.balance }]
        });
      }
    }
    return Array.from(byMaterial.values())
      .map((group) => ({
        ...group,
        lines: [...group.lines].sort((a, b) =>
          (a.costCenter?.name || 'Não informado').localeCompare(
            b.costCenter?.name || 'Não informado',
            'pt-BR'
          )
        )
      }))
      .sort((a, b) => a.material.name.localeCompare(b.material.name, 'pt-BR'));
  }, [balances]);
  const balanceTotal = groupedBalances.length;
  const balanceTotalPages = Math.max(1, Math.ceil(balanceTotal / BALANCE_ITEMS_PER_PAGE));
  const balanceStartIndex = (balanceCurrentPage - 1) * BALANCE_ITEMS_PER_PAGE;
  const balanceEndIndex = balanceStartIndex + BALANCE_ITEMS_PER_PAGE;
  const paginatedGroupedBalances = groupedBalances.slice(balanceStartIndex, balanceEndIndex);
  const balanceStartItem = balanceTotal === 0 ? 0 : balanceStartIndex + 1;
  const balanceEndItem = Math.min(balanceEndIndex, balanceTotal);
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
  const movements: StockMovement[] = movementsData?.data ?? EMPTY_STOCK_MOVEMENTS;

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

  const movementsForOc: StockMovement[] = movementOcData?.data ?? EMPTY_STOCK_MOVEMENTS;
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
    if (!balanceDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBalanceDetail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [balanceDetail]);

  useEffect(() => {
    if (!isMovementModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMovementModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMovementModalOpen]);

  const selectedOrderDetail: PurchaseOrderDetail | null = selectedPurchaseOrderData?.data || null;

  const unresolvedOcMaterialNames = useMemo(() => {
    if (!selectedOrderDetail?.items?.length) return [];
    const names: string[] = [];
    for (const item of selectedOrderDetail.items) {
      if (constructionMaterialIdFromSinapiCode(item.material?.sinapiCode)) continue;
      const name = item.material?.name?.trim();
      if (name) names.push(name);
    }
    return Array.from(new Set(names));
  }, [selectedOrderDetail]);

  const unresolvedOcMaterialNamesKey = unresolvedOcMaterialNames.slice().sort().join('\0');

  const { data: resolvedMaterialsByName = [] } = useQuery({
    queryKey: ['construction-materials-resolve-by-names', unresolvedOcMaterialNamesKey],
    queryFn: () => resolveConstructionMaterialsByNames(unresolvedOcMaterialNames),
    enabled: isMovementModalOpen && unresolvedOcMaterialNames.length > 0,
    staleTime: 60_000,
  });

  const constructionMaterialIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const material of resolvedMaterialsByName) {
      map.set(normalizeMaterialName(material.name), material.id);
    }
    return map;
  }, [resolvedMaterialsByName]);

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
  const contractDropdownOptions = useMemo(() => {
    const byId = new Map<string, { value: string; label: string }>();
    for (const order of availableOcOptions) {
      const cc = order.materialRequest?.costCenter;
      if (!cc?.id) continue;
      if (!byId.has(cc.id)) {
        const fromCatalog = costCenters.find((item) => item.id === cc.id);
        byId.set(cc.id, {
          value: cc.id,
          label: fromCatalog?.name || cc.name || cc.code || cc.id,
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [availableOcOptions, costCenters]);

  const ocOptionsForSelectedContract = useMemo(() => {
    if (!formData.costCenterId) return [];
    return availableOcOptions.filter(
      (order) => order.materialRequest?.costCenter?.id === formData.costCenterId
    );
  }, [availableOcOptions, formData.costCenterId]);

  const ocDropdownOptions = useMemo(
    () =>
      ocOptionsForSelectedContract.map((order) => ({
        value: order.orderNumber,
        label: order.orderNumber,
      })),
    [ocOptionsForSelectedContract]
  );

  const handleContractChange = (costCenterId: string) => {
    setFormData((prev) => {
      const ocStillValid = availableOcOptions.some(
        (order) =>
          order.orderNumber === prev.ocNumber &&
          order.materialRequest?.costCenter?.id === costCenterId
      );
      return {
        ...prev,
        costCenterId,
        ocNumber: ocStillValid ? prev.ocNumber : '',
      };
    });
    if (
      formData.ocNumber &&
      !availableOcOptions.some(
        (order) =>
          order.orderNumber === formData.ocNumber &&
          order.materialRequest?.costCenter?.id === costCenterId
      )
    ) {
      setOcMovementItems([]);
    }
  };

  const handleOcNumberChange = (ocNumber: string) => {
    setFormData((prev) => ({
      ...prev,
      ocNumber,
    }));
  };

  const selectedOrderDetailId = selectedOrderDetail?.id ?? null;
  const movementSplit = formData.movementSplit;

  useEffect(() => {
    if (!selectedOrderDetailId || !movementSplit || !formData.type || !formData.ocNumber.trim()) {
      setOcMovementItems((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const detail = selectedPurchaseOrderData?.data as PurchaseOrderDetail | null | undefined;
    if (!detail?.items?.length) {
      setOcMovementItems((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const ocNumber = formData.ocNumber.trim();
    const movementType = formData.type;

    setOcMovementItems((prev) => {
      const nextItems = detail.items.map((item, index) => {
        const key = `${item.materialId}-${index}`;
        const prevRow = prev.find((row) => row.key === key);
        const originalQuantity = Number(item.quantity || 0);
        const materialName = item.material?.name || `Material ${index + 1}`;
        const resolvedMaterialId =
          constructionMaterialIdFromSinapiCode(item.material?.sinapiCode) ||
          constructionMaterialIdByName.get(normalizeMaterialName(materialName)) ||
          '';
        const alreadyMoved = resolvedMaterialId
          ? getAlreadyMovedQuantityForOcMaterial(
              movementsForOc,
              ocNumber,
              movementType,
              resolvedMaterialId
            )
          : 0;
        const remaining = Math.max(0, originalQuantity - alreadyMoved);
        const defaultQuantity = String(remaining > 0 ? remaining : originalQuantity);
        const preservePartialEdits =
          movementSplit === 'PARCIAL' &&
          prevRow &&
          prev.length === detail.items.length;

        return {
          key,
          materialId: resolvedMaterialId,
          unresolvedMaterialId: !resolvedMaterialId,
          materialName,
          unit: item.unit || '-',
          originalQuantity,
          quantity: preservePartialEdits && prevRow.checked ? prevRow.quantity : defaultQuantity,
          checked:
            movementSplit === 'TOTAL'
              ? remaining > 0
              : preservePartialEdits
                ? prevRow.checked
                : false,
        };
      });

      return ocMovementItemsEqual(prev, nextItems) ? prev : nextItems;
    });
  }, [
    selectedOrderDetailId,
    movementSplit,
    formData.type,
    formData.ocNumber,
    constructionMaterialIdByName,
    selectedPurchaseOrderData?.data,
    movementsForOc,
  ]);

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
          Contrato: row.centroDeCusto,
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

      const headers = ['Material', 'Categoria', 'Contrato', 'Quantidade', 'Unidade de Medida'];
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
                        Consulte materiais e quantidades em estoque por contrato
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
                ) : groupedBalances.length === 0 ? (
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
                            <th className="w-36 px-3 sm:px-4 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Detalhes
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Material
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Categoria
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Quantidade total
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Unidade
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {paginatedGroupedBalances.map((group) => {
                            const totalBalance = group.lines.reduce((sum, line) => sum + line.balance, 0);
                            const costCenterCount = group.lines.length;
                            return (
                            <tr
                              key={group.material.id}
                              className={listTableRowClasses.tr}
                            >
                              <td className="px-3 sm:px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => setBalanceDetail(group)}
                                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-200"
                                  title="Ver saldo por contrato"
                                >
                                  <Eye className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                  <span className="whitespace-nowrap">
                                    {costCenterCount === 1 ? '1 contrato' : `${costCenterCount} contratos`}
                                  </span>
                                </button>
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                <span className="text-sm text-gray-900 dark:text-gray-100">{group.material.name}</span>
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                {group.material.category || '—'}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                                {totalBalance.toLocaleString('pt-BR')}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                                {group.material.unit}
                              </td>
                            </tr>
                            );
                          })}
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
                            Contrato
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersCostCenterId}
                            onChange={setFiltersCostCenterId}
                            options={costCenterFilterOptions}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Categoria
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersCategory}
                            onChange={setFiltersCategory}
                            options={categoryFilterOptions}
                            allowEmpty={false}
                          />
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
                              Contrato
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
                                onClick={() => setHistoryDetail(mov)}
                                className={getListTableRowClassName(true)}
                              >
                                <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                  {new Date(mov.createdAt).toLocaleString('pt-BR')}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm">
                                  <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">{ocNumber}</span>
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                  <ListRowNavigableLabel className="font-medium">{mov.material.name}</ListRowNavigableLabel>
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
                                <td className="px-3 sm:px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => setHistoryDetail(mov)}
                                    className={rowActionMenuButtonClass(false)}
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
                            Contrato
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersCostCenterId}
                            onChange={setFiltersCostCenterId}
                            options={costCenterFilterOptions}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Categoria
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersCategory}
                            onChange={setFiltersCategory}
                            options={categoryFilterOptions}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Mês
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersMonth}
                            onChange={setFiltersMonth}
                            options={stockMonthFilterOptions}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Ano
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersYear}
                            onChange={setFiltersYear}
                            options={stockYearFilterOptions}
                            allowEmpty={false}
                          />
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

          {balanceDetail && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setBalanceDetail(null)}
                aria-hidden
              />
              <div
                className="relative z-10 w-full max-w-lg max-h-[min(90vh,32rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
                role="dialog"
                aria-modal="true"
                aria-labelledby="balance-detail-modal-title"
              >
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                  <h2
                    id="balance-detail-modal-title"
                    className="text-base font-semibold text-gray-900 dark:text-gray-100 pr-2"
                  >
                    Saldo por contrato
                  </h2>
                  <button
                    type="button"
                    onClick={() => setBalanceDetail(null)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    aria-label="Fechar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Material</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {balanceDetail.material.name}
                      </span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Categoria</span>
                      <span className="text-gray-800 dark:text-gray-200">
                        {balanceDetail.material.category || '—'}
                      </span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Quantidade total</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {balanceDetail.lines
                          .reduce((sum, line) => sum + line.balance, 0)
                          .toLocaleString('pt-BR')}
                      </span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Unidade de medida</span>
                      <span className="text-gray-800 dark:text-gray-200">{balanceDetail.material.unit}</span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Contratos</span>
                      <span className="text-gray-800 dark:text-gray-200">{balanceDetail.lines.length}</span>
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Contrato
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Quantidade
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Unidade de medida
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {balanceDetail.lines.map((line, index) => (
                          <tr key={line.costCenter?.id || `sem-cc-${index}`}>
                            <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">
                              {line.costCenter?.name || 'Não informado'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100">
                              {line.balance.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                              {balanceDetail.material.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
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
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Contrato</span>
                      <span>{historyDetail.costCenter.name || historyDetail.costCenter.code}</span>
                    </p>
                  )}
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Saldo atual (contrato)</span>
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
                    Contrato
                  </label>
                  <SingleSelectSearchDropdown
                    value={formData.costCenterId}
                    onChange={handleContractChange}
                    options={contractDropdownOptions}
                    disabled={loadingPurchaseOrders || loadingCostCenters}
                    allowEmpty={false}
                    placeholder={
                      loadingPurchaseOrders || loadingCostCenters
                        ? 'Carregando contratos...'
                        : 'Selecionar contrato...'
                    }
                    emptyOptionsMessage="Nenhum contrato com OC disponível para movimentação."
                    noFocusRing
                  />
                  {!loadingPurchaseOrders && contractDropdownOptions.length === 0 && (
                    <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
                      Nenhum contrato com OC disponível. Todas já tiveram saída total ou não há OCs
                      cadastradas.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Número da OC
                  </label>
                  <SingleSelectSearchDropdown
                    value={formData.ocNumber}
                    onChange={handleOcNumberChange}
                    options={ocDropdownOptions}
                    disabled={loadingPurchaseOrders || !formData.costCenterId}
                    allowEmpty={false}
                    placeholder={
                      !formData.costCenterId
                        ? 'Selecione um contrato'
                        : loadingPurchaseOrders
                          ? 'Carregando OCs...'
                          : 'Selecionar OC...'
                    }
                    emptyOptionsMessage="Nenhuma OC disponível para este contrato."
                    noFocusRing
                  />
                  {formData.costCenterId &&
                    !loadingPurchaseOrders &&
                    ocOptionsForSelectedContract.length === 0 && (
                      <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
                        Nenhuma OC disponível para este contrato.
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
                  <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-600 divide-y divide-gray-200 dark:divide-gray-700">
                    {ocMovementItems.map((item) => {
                      const itemDisabled = formData.movementSplit === 'TOTAL';
                      const alreadyMoved =
                        item.materialId && formData.type
                          ? getAlreadyMovedQuantityForOcMaterial(
                              movementsForOc,
                              formData.ocNumber.trim(),
                              formData.type,
                              item.materialId
                            )
                          : 0;
                      const remaining = Math.max(0, item.originalQuantity - alreadyMoved);
                      const itemFullyMoved = remaining <= 0;
                      const checkboxDisabled = itemDisabled || itemFullyMoved || item.unresolvedMaterialId;
                      return (
                        <div
                          key={item.key}
                          className="grid grid-cols-1 items-center gap-3 bg-white p-3.5 transition-colors hover:bg-gray-50 dark:bg-gray-800/40 dark:hover:bg-gray-900/50 md:grid-cols-12"
                        >
                          <label
                            className={`group flex items-start gap-3 md:col-span-6 ${
                              checkboxDisabled ? 'cursor-default opacity-70' : 'cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={item.checked}
                              disabled={checkboxDisabled}
                              onChange={(e) =>
                                setOcMovementItems((prev) =>
                                  prev.map((row) =>
                                    row.key === item.key ? { ...row, checked: e.target.checked } : row
                                  )
                                )
                              }
                              className="sr-only"
                            />
                            <CheckboxIndicator checked={item.checked} className="mt-0.5" />
                            <span className="min-w-0 flex flex-col gap-1 pt-0.5">
                              <span className="text-sm font-medium leading-snug text-gray-800 transition-colors group-hover:text-gray-900 dark:text-gray-100 dark:group-hover:text-white">
                                {item.materialName}
                              </span>
                              {item.unresolvedMaterialId && (
                                <span className="text-xs text-red-500 dark:text-red-400">
                                  Não encontrado no estoque
                                </span>
                              )}
                              {!item.unresolvedMaterialId && formData.movementSplit === 'PARCIAL' && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {itemFullyMoved
                                    ? 'Quantidade desta OC já movimentada'
                                    : `Restante na OC: ${remaining} ${item.unit} (de ${item.originalQuantity})`}
                                </span>
                              )}
                            </span>
                          </label>
                          <div className="md:col-span-4">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.quantity}
                              disabled={checkboxDisabled || !item.checked}
                              onChange={(e) =>
                                setOcMovementItems((prev) =>
                                  prev.map((row) =>
                                    row.key === item.key ? { ...row, quantity: e.target.value } : row
                                  )
                                )
                              }
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 transition-colors focus:border-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-red-400"
                            />
                          </div>
                          <div className="md:col-span-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                            {item.unit}
                          </div>
                        </div>
                      );
                    })}
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

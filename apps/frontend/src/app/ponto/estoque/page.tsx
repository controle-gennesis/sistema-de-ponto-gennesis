'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Package, Plus, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, History, Box, Filter, ChevronDown, ChevronUp, RotateCcw, Download } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
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

export default function EstoquePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'balance' | 'movements' | 'new'>('balance');
  const [filtersCostCenterId, setFiltersCostCenterId] = useState('');
  const [filtersCategory, setFiltersCategory] = useState('');
  const [filtersMonth, setFiltersMonth] = useState('');
  const [filtersYear, setFiltersYear] = useState(new Date().getFullYear().toString());
  const [filtersSearch, setFiltersSearch] = useState('');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [ocMovementItems, setOcMovementItems] = useState<OcMovementItemState[]>([]);
  const [isOcDropdownOpen, setIsOcDropdownOpen] = useState(false);
  const [expandedOcHistoryKey, setExpandedOcHistoryKey] = useState<string | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<UploadedInvoice | null>(null);
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [withdrawalSheetFile, setWithdrawalSheetFile] = useState<UploadedInvoice | null>(null);
  const [isUploadingWithdrawalSheet, setIsUploadingWithdrawalSheet] = useState(false);
  const [paymentSlips, setPaymentSlips] = useState<PaymentSlipAttachment[]>([]);
  const [uploadingPaymentSlipId, setUploadingPaymentSlipId] = useState<string | null>(null);

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
    enabled: activeTab === 'new'
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
    enabled: activeTab === 'new'
  });

  const { data: purchaseOrdersData, isLoading: loadingPurchaseOrders } = useQuery({
    queryKey: ['purchase-orders-oc-options'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500 } });
      return res.data;
    },
    enabled: activeTab === 'new'
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
    enabled: activeTab === 'new' && !!selectedPurchaseOrder?.id
  });

  const createMovementMutation = useMutation({
    mutationFn: async (data: MovementPayload[]) => {
      const responses = await Promise.all(data.map((payload) => api.post('/stock/movements', payload)));
      return responses.map((res) => res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
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
  const movements: StockMovement[] = movementsData?.data || [];
  const movementsForOc: StockMovement[] = movementOcData?.data || [];
  const purchaseOrders: PurchaseOrderOption[] = purchaseOrdersData?.data || [];
  const constructionMaterials: Material[] = materialsData?.data || [];
  const balanceByMaterialAndCostCenter = useMemo(() => {
    const map = new Map<string, number>();
    balances.forEach((balance) => {
      const key = `${balance.material.id}:${balance.costCenter?.id || 'no-cost-center'}`;
      map.set(key, balance.balance);
    });
    return map;
  }, [balances]);
  const movementHistoryByOc = useMemo(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        ocNumber: string;
        movements: StockMovement[];
        latestCreatedAtMs: number;
      }
    >();

    movements.forEach((movement) => {
      const ocNumber = extractOcNumberFromNotes(movement.notes);
      const key = ocNumber || 'SEM_OC';
      const existing = grouped.get(key);
      const createdAtMs = new Date(movement.createdAt).getTime();
      if (!existing) {
        grouped.set(key, {
          key,
          ocNumber,
          movements: [movement],
          latestCreatedAtMs: createdAtMs
        });
        return;
      }
      existing.movements.push(movement);
      if (createdAtMs > existing.latestCreatedAtMs) {
        existing.latestCreatedAtMs = createdAtMs;
      }
    });

    return Array.from(grouped.values()).sort((a, b) => b.latestCreatedAtMs - a.latestCreatedAtMs);
  }, [movements]);
  const selectedOrderDetail: PurchaseOrderDetail | null = selectedPurchaseOrderData?.data || null;
  const constructionMaterialIdByName = useMemo(() => {
    const map = new Map<string, string>();
    constructionMaterials.forEach((material) => {
      map.set(normalizeMaterialName(material.name), material.id);
    });
    return map;
  }, [constructionMaterials]);
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

  useEffect(() => {
    if (!selectedOrderDetail || !formData.movementSplit) {
      setOcMovementItems([]);
      return;
    }

    const nextItems = selectedOrderDetail.items.map((item, index) => {
      const originalQuantity = Number(item.quantity || 0);
      const materialName = item.material?.name || `Material ${index + 1}`;
      const resolvedMaterialId = constructionMaterialIdByName.get(normalizeMaterialName(materialName)) || '';
      return {
        key: `${item.materialId}-${index}`,
        materialId: resolvedMaterialId,
        unresolvedMaterialId: !resolvedMaterialId,
        materialName,
        unit: item.unit || '-',
        originalQuantity,
        quantity: String(originalQuantity),
        checked: formData.movementSplit === 'TOTAL'
      };
    });

    setOcMovementItems(nextItems);
  }, [selectedOrderDetail, formData.movementSplit, constructionMaterialIdByName]);

  useEffect(() => {
    const ocCostCenterId = selectedOrderDetail?.materialRequest?.costCenter?.id;
    if (ocCostCenterId && !formData.costCenterId) {
      setFormData((prev) => ({ ...prev, costCenterId: ocCostCenterId }));
    }
  }, [selectedOrderDetail, formData.costCenterId]);
  const exportRows = balances.map((b) => ({
    material: b.material.name,
    categoria: b.material.category || '-',
    centroDeCusto: b.costCenter ? `${b.costCenter.code} - ${b.costCenter.name}` : 'Nao informado',
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
              <button
                onClick={() => setActiveTab('new')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'new'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
                }`}
              >
                <Plus className="w-4 h-4" />
                Movimentação
              </button>
            </nav>
          </div>

          {activeTab !== 'new' && (
            <Card>
              <CardHeader className="border-b-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Filter className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
                  </div>
                  <div className="flex items-center space-x-4">
                    {isFiltersExpanded && (
                      <button
                        onClick={() => {
                          setFiltersCostCenterId('');
                          setFiltersCategory('');
                          setFiltersMonth('');
                          setFiltersYear(new Date().getFullYear().toString());
                          setFiltersSearch('');
                        }}
                        className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Limpar filtros"
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                      className="flex items-center justify-center w-8 h-8 text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      {isFiltersExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </CardHeader>
              {isFiltersExpanded && (
                <CardContent className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Centro de Custo
                      </label>
                      <select
                        value={filtersCostCenterId}
                        onChange={(e) => setFiltersCostCenterId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Todos</option>
                        {costCenters.map((cc: any) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.code} - {cc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Categoria</label>
                      <select
                        value={filtersCategory}
                        onChange={(e) => setFiltersCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Todas</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    {activeTab === 'balance' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Buscar Material
                        </label>
                        <input
                          type="text"
                          value={filtersSearch}
                          onChange={(e) => setFiltersSearch(e.target.value)}
                          placeholder="Digite o nome..."
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    )}
                    {activeTab === 'movements' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mês</label>
                          <select
                            value={filtersMonth}
                            onChange={(e) => setFiltersMonth(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
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
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ano</label>
                          <select
                            value={filtersYear}
                            onChange={(e) => setFiltersYear(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          >
                            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              {activeTab === 'balance' && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Saldo Atual</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={isExporting || balances.length === 0}
                        className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 text-sm disabled:opacity-50"
                      >
                        <Download className="w-4 h-4" />
                        Exportar Excel
                      </button>
                      <button
                        type="button"
                        onClick={handleExportPdf}
                        disabled={isExporting || balances.length === 0}
                        className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm disabled:opacity-50"
                      >
                        <Download className="w-4 h-4" />
                        Exportar PDF
                      </button>
                      <Link
                        href="/ponto/materiais-construcao"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Cadastrar Material
                      </Link>
                    </div>
                  </div>
                  {loadingBalance ? (
                    <p className="text-center py-8 text-gray-500">Carregando...</p>
                  ) : balances.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">Nenhum material em estoque</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Material
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Categoria
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Centro de Custo
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Quantidade
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Unidade de Medida
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {balances.map((b) => (
                            <tr key={`${b.material.id}-${b.costCenter?.id || 'sem-cc'}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                {b.material.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {b.material.category || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {b.costCenter ? `${b.costCenter.code} - ${b.costCenter.name}` : 'Não informado'}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                                {b.balance}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                                {b.material.unit}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'movements' && (
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Histórico de Movimentações
                  </h3>
                  {loadingMovements ? (
                    <p className="text-center py-8 text-gray-500">Carregando...</p>
                  ) : movementHistoryByOc.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">Nenhuma movimentação encontrada</p>
                  ) : (
                    <div className="space-y-3">
                      {movementHistoryByOc.map((historyGroup) => {
                        const latestMovement = historyGroup.movements[0];
                        const totalEntries = historyGroup.movements
                          .filter((mov) => mov.type === 'IN')
                          .reduce((sum, mov) => sum + mov.quantity, 0);
                        const totalOutputs = historyGroup.movements
                          .filter((mov) => mov.type === 'OUT')
                          .reduce((sum, mov) => sum + mov.quantity, 0);
                        return (
                        <div
                          key={historyGroup.key}
                          className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <div className="flex items-start">
                            <div className="flex items-start gap-3 flex-1">
                              <div
                                className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700/40"
                              >
                                <ArrowLeftRight className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-gray-900 dark:text-gray-100">
                                      {historyGroup.ocNumber ? `OC: ${historyGroup.ocNumber}` : 'Sem OC informada'}
                                    </p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                      Entradas: {totalEntries} | Saídas: {totalOutputs} | Itens: {historyGroup.movements.length}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedOcHistoryKey((prev) => (prev === historyGroup.key ? null : historyGroup.key))
                                    }
                                    className="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  >
                                    {expandedOcHistoryKey === historyGroup.key ? 'Ocultar detalhes' : 'Ver detalhes'}
                                  </button>
                                </div>
                                {expandedOcHistoryKey === historyGroup.key && (
                                  <div className="mt-2 space-y-1">
                                    {historyGroup.movements.map((mov) => (
                                      <div key={mov.id} className="text-xs border border-gray-200 dark:border-gray-700 rounded-md p-2">
                                        <p className="text-gray-700 dark:text-gray-300">
                                          <span className="font-medium">{mov.material.name}</span> —{' '}
                                          {mov.type === 'IN' ? 'Entrada' : 'Saída'}: {mov.quantity} {mov.material.unit}
                                        </p>
                                        <p className="text-gray-500 dark:text-gray-500">
                                          <span className="font-medium">Saldo atual no estoque (CC):</span>{' '}
                                          {(() => {
                                            const key = `${mov.material.id}:${mov.costCenter?.id || 'no-cost-center'}`;
                                            const currentBalance = balanceByMaterialAndCostCenter.get(key);
                                            if (currentBalance === undefined) return '0';
                                            return `${currentBalance} ${mov.material.unit}`;
                                          })()}
                                        </p>
                                        {mov.costCenter && (
                                          <p className="text-gray-500 dark:text-gray-500">
                                            <span className="font-medium">Centro de custo:</span> {mov.costCenter.code}
                                          </p>
                                        )}
                                        {mov.notes && (
                                          <p className="text-gray-500 dark:text-gray-500 whitespace-pre-line">
                                            <span className="font-medium">Observações:</span> {mov.notes}
                                          </p>
                                        )}
                                        {mov.notes && extractFirstUrl(mov.notes) && (
                                          <a
                                            href={absoluteUploadUrl(extractFirstUrl(mov.notes))}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 dark:text-blue-400 hover:underline inline-block"
                                          >
                                            Abrir anexo
                                          </a>
                                        )}
                                        <p className="text-gray-400 dark:text-gray-600">
                                          {new Date(mov.createdAt).toLocaleString('pt-BR')} - {mov.user.name}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )})}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'new' && (
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Nova Movimentação
                  </h3>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Nº OC
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
                          <div className="absolute z-50 mt-1 max-h-64 overflow-y-auto w-[min(1100px,95vw)] bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
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
                        Movimento *
                      </label>
                      <select
                        required
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as 'IN' | 'OUT' })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="IN">Entrada</option>
                        <option value="OUT">Saída</option>
                      </select>
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
                        {costCenters.map((cc: any) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.code} - {cc.name}
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Tipo da Movimentação
                      </label>
                      <div className="flex items-center gap-6 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={formData.movementSplit === 'TOTAL'}
                            onChange={() =>
                              setFormData((prev) => ({
                                ...prev,
                                movementSplit: prev.movementSplit === 'TOTAL' ? '' : 'TOTAL'
                              }))
                            }
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          Total
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={formData.movementSplit === 'PARCIAL'}
                            onChange={() =>
                              setFormData((prev) => ({
                                ...prev,
                                movementSplit: prev.movementSplit === 'PARCIAL' ? '' : 'PARCIAL'
                              }))
                            }
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          Parcial
                        </label>
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
                        onClick={() => setActiveTab('balance')}
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
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, FileText, Plus, Truck, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PaymentConditionSelect, resolvePaymentConditionMeta, type PaymentConditionRow } from '@/components/oc/PaymentConditionSelect';
import {
  OcBoletoCreationFields,
  resizeOcBoletoCreationSlots,
  type OcBoletoCreationSlot
} from '@/components/oc/OcBoletoCreationFields';
import { OC_PIX_KEY_TYPE_OPTIONS } from '@/components/oc/OcPurchaseOrderFormFields';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { maskCurrencyInputBrOrEmpty, parseCurrencyInputBr } from '@/lib/maskCurrencyBr';
import { materialItemLabel, materialItemSubtitle } from '../gerenciar-materiais/_lib/display';
import { formatRmListDisplayId } from '../gerenciar-materiais/_lib/rmListDisplay';

type MaterialRequestItem = {
  id: string;
  quantity: number;
  unit: string;
  observation?: string;
  notes?: string;
  material: {
    id: string;
    name?: string | null;
    code?: string;
    sinapiCode?: string | null;
    description?: string;
  };
};

type MaterialRequest = {
  id: string;
  requestNumber?: string;
  createdAt: string;
  status: 'APPROVED' | string;
  items: MaterialRequestItem[];
};

type PurchaseOrderLite = {
  materialRequestId?: string;
  materialRequest?: { id?: string };
};

type Supplier = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type PurchaseOrderCreateInput = {
  materialRequestId: string;
  supplierId: string;
  items: Array<{
    materialRequestItemId?: string | null;
    materialId: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    notes?: string | null;
  }>;
  paymentType: string;
  paymentCondition: string;
  paymentDetails: string | undefined;
  notes: string | undefined;
  amountToPay: number;
  boletoAttachmentUrl?: string;
  boletoAttachmentName?: string;
};

function parseCurrencyBR(input: string): number | null {
  const t = input.trim().replace(/\s/g, '');
  if (!t) return null;

  // Aceita formatos:
  // - BR: 1.234,56 (ponto milhar + vírgula decimal)
  // - ou número puro: 1234,56
  // - ou padrão americano: 1234.56 (ponto decimal)
  const hasComma = t.includes(',');
  const hasDot = t.includes('.');

  let normalized = t;
  if (hasComma && hasDot) {
    // Ex: 1.234,56
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // Ex: 1234,56
    normalized = t.replace(',', '.');
  } else if (hasDot) {
    const parts = t.split('.');
    // Ex: 1234.56 (1 ponto e até 2 casas decimais) => ponto é decimal
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = t;
    } else {
      // Ex: 1.234.567 (pontos como milhar)
      normalized = t.replace(/\./g, '');
    }
  }

  // remove qualquer caractere estranho e garante formato numérico
  normalized = normalized.replace(/[^0-9.-]/g, '');

  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseMapUnitPrice(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const fromMask = parseCurrencyInputBr(t);
  if (fromMask !== null) return fromMask;
  return parseCurrencyBR(t);
}

function formatCurrencyBR(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDateTimeBR(dateString: string) {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

const mapFieldCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums text-gray-900 placeholder:text-gray-400 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const mapThCls =
  'px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4';

const mapTdCls = 'px-3 py-3 text-sm sm:px-4 align-middle';

const mapPaymentSegmentCls = (active: boolean) =>
  `w-full rounded-lg border px-3 py-2.5 text-center text-sm font-medium transition-colors focus:outline-none ${
    active
      ? 'border-red-600 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/80'
  }`;

const mapLabelCls = 'mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300';

function MapStyledCheckbox({
  checked,
  onChange,
  ariaLabel
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
        className="sr-only"
      />
      <span
        className={`box-border flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors duration-200 ${
          checked
            ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
            : 'border-gray-300 bg-white group-hover:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
        }`}
      >
        <svg
          className={`h-3 w-3 shrink-0 text-white transition-opacity duration-200 ${
            checked ? 'opacity-100' : 'opacity-0'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    </span>
  );
}

const OC_TYPE_AVISTA = 'AVISTA';
const OC_TYPE_BOLETO = 'BOLETO';

function paymentConditionDefault(paymentType: string): string {
  if (paymentType === OC_TYPE_AVISTA) return 'AVISTA';
  return 'BOLETO_30';
}

function emptyPaymentDraft() {
  return {
    paymentType: OC_TYPE_AVISTA,
    paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
    paymentDetails: '',
    pixKeyType: '',
    pixKey: '',
    observations: '',
    amountToPayStr: '',
    boletoSlots: [{ url: '', name: '' }] as OcBoletoCreationSlot[]
  };
}

function scoreItem(params: {
  unitPrice: number;
  quantity: number;
  freight: number;
}): number {
  const { unitPrice, quantity, freight } = params;
  return unitPrice * quantity + freight;
}

export default function MapaCotacaoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());
  const [freightBySupplier, setFreightBySupplier] = useState<Record<string, string>>({});
  const [unitPriceBySupplierItem, setUnitPriceBySupplierItem] = useState<Record<string, string>>({});

  const [quoteMapId, setQuoteMapId] = useState<string>('');

  const [generateSupplierIds, setGenerateSupplierIds] = useState<Set<string>>(new Set());

  /** Quantidade a comprar na OC por item da SC (≤ solicitado na SC). Afeta totais e vencedor. */
  const [ocItemQtyByItemId, setOcItemQtyByItemId] = useState<Record<string, number>>({});

  const [paymentDraftBySupplier, setPaymentDraftBySupplier] = useState<
    Record<
      string,
      {
        paymentType: string;
        paymentCondition: string;
        paymentDetails: string;
        pixKeyType: string;
        pixKey: string;
        observations: string;
        amountToPayStr: string;
        boletoSlots: OcBoletoCreationSlot[];
      }
    >
  >({});

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: requestsData, isLoading: loadingRequests } = useQuery({
    queryKey: ['material-requests-approved-map'],
    queryFn: async () => {
      const res = await api.get('/material-requests', { params: { status: 'APPROVED', limit: 500 } });
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: ordersData } = useQuery({
    queryKey: ['purchase-orders', 'list-summary'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500, summary: '1' } });
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: boletoPaymentConditions } = useQuery({
    queryKey: ['payment-conditions', 'BOLETO'],
    queryFn: async () => {
      const res = await api.get('/payment-conditions', {
        params: { paymentType: 'BOLETO', activeOnly: 'true' }
      });
      return (res.data?.data || []) as PaymentConditionRow[];
    }
  });

  const allOrders: PurchaseOrderLite[] = ordersData?.data || [];

  /** Mesma regra da aba "RMs Aprovadas" em Gerenciar materiais: aprovadas e ainda sem OC */
  const materialRequestIdsWithOc = useMemo(() => {
    const s = new Set<string>();
    for (const o of allOrders) {
      const mid = o.materialRequestId ?? o.materialRequest?.id;
      if (mid) s.add(mid);
    }
    return s;
  }, [allOrders]);

  const rawApprovedRequests: MaterialRequest[] = requestsData?.data?.requests || requestsData?.data || [];

  const approvedRequests = useMemo(
    () =>
      rawApprovedRequests.filter(
        (r) => r.status === 'APPROVED' && !materialRequestIdsWithOc.has(r.id)
      ),
    [rawApprovedRequests, materialRequestIdsWithOc]
  );

  const materialRequestOptions = useMemo(
    () =>
      approvedRequests.map((r) => {
        const num = formatRmListDisplayId(r.requestNumber) || r.id.slice(0, 8);
        const date = formatDateTimeBR(r.createdAt);
        return {
          value: r.id,
          label: num,
          searchText: `${num} ${date} ${r.id}`
        };
      }),
    [approvedRequests]
  );

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-map'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { limit: 500 } });
      return res.data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const suppliers: Supplier[] = useMemo(
    () => (suppliersData?.data || []).filter((s: Supplier) => s.isActive),
    [suppliersData?.data]
  );

  const supplierOptions = useMemo(
    () =>
      suppliers.map((s) => ({
        value: s.id,
        label: s.code ? `${s.name} · Cód. ${s.code}` : s.name,
        searchText: `${s.name} ${s.code ?? ''}`
      })),
    [suppliers]
  );

  const selectedRequest = approvedRequests.find((r) => r.id === selectedRequestId) || null;

  useEffect(() => {
    if (!selectedRequestId) return;
    if (!approvedRequests.some((r) => r.id === selectedRequestId)) {
      setSelectedRequestId('');
    }
  }, [approvedRequests, selectedRequestId]);

  useEffect(() => {
    // Trocar a requisição cria um mapa diferente
    setQuoteMapId('');
  }, [selectedRequestId]);

  useEffect(() => {
    if (!selectedRequest) {
      setOcItemQtyByItemId({});
      return;
    }
    setOcItemQtyByItemId(
      Object.fromEntries(selectedRequest.items.map((i) => [i.id, Number(i.quantity)]))
    );
  }, [selectedRequest?.id]);

  // Só ao trocar a requisição (não incluir `suppliers` aqui: o array era recriado a cada render e limpava a seleção a cada clique).
  useEffect(() => {
    if (!selectedRequestId) return;
    setSelectedSupplierIds(new Set());
    setGenerateSupplierIds(new Set());
    setFreightBySupplier({});
    setUnitPriceBySupplierItem({});
    setPaymentDraftBySupplier({});
  }, [selectedRequestId]);

  useEffect(() => {
    if (!selectedRequest) return;
    if (selectedSupplierIds.size === 0) return;

    // inicializa fretes e preços unitários como vazio (não sobrescreve se já existir)
    setFreightBySupplier((prev) => {
      const next = { ...prev };
      for (const supId of Array.from(selectedSupplierIds)) {
        if (next[supId] === undefined) next[supId] = '';
      }
      return next;
    });

    setUnitPriceBySupplierItem((prev) => {
      const next = { ...prev };
      for (const item of selectedRequest.items) {
        for (const supId of Array.from(selectedSupplierIds)) {
          const key = `${supId}:${item.id}`;
          if (next[key] === undefined) next[key] = '';
        }
      }
      return next;
    });
  }, [selectedRequest, selectedSupplierIds]);

  const formatCurrencyInputValue = (raw: string): string => {
    const n = parseCurrencyBR(raw);
    if (n == null) return raw;
    return formatCurrencyBR(n);
  };

  const ocItems = selectedRequest?.items ?? [];

  const winnersByItem = useMemo(() => {
    if (!selectedRequest) return [];
    const list: Array<{
      itemId: string;
      winnerSupplierId: string;
      winnerScore: number;
      winnerUnitPrice: number;
      /** Dois ou mais fornecedores com o mesmo preço unitário (centavos) neste item. */
      technicalTie: boolean;
      itemUnit: string;
      itemQuantity: number;
      perSupplier: Array<{
        supplierId: string;
        unitPrice: number | null;
        itemTotal: number | null;
        freight: number;
        score: number | null;
      }>;
    }> = [];

    for (const item of selectedRequest.items) {
      const perSupplier = [];
      let best: {
        supplierId: string;
        score: number;
        unitPrice: number;
      } | null = null;

      const quantity = ocItemQtyByItemId[item.id] ?? Number(item.quantity);

      for (const supplierId of Array.from(selectedSupplierIds)) {
        const key = `${supplierId}:${item.id}`;
        const unitPrice = parseMapUnitPrice(unitPriceBySupplierItem[key] ?? '');
        const freight = parseMapUnitPrice(freightBySupplier[supplierId] ?? '') ?? 0;

        const itemTotal = unitPrice == null ? null : unitPrice * quantity;
        const score = unitPrice == null ? null : scoreItem({ unitPrice, quantity, freight });
        perSupplier.push({
          supplierId,
          unitPrice,
          itemTotal,
          freight,
          score
        });

        if (score != null) {
          if (!best || score < best.score) {
            best = { supplierId, score, unitPrice: unitPrice! };
          } else if (score === best.score) {
            // tie-break: menor unitPrice
            if (unitPrice! < best.unitPrice) {
              best = { supplierId, score, unitPrice: unitPrice! };
            }
          }
        }
      }

      if (!best) continue;

      const unitPriceCounts = new Map<number, number>();
      for (const p of perSupplier) {
        if (p.unitPrice == null) continue;
        const cents = Math.round(p.unitPrice * 100);
        unitPriceCounts.set(cents, (unitPriceCounts.get(cents) ?? 0) + 1);
      }
      let technicalTie = false;
      unitPriceCounts.forEach((count) => {
        if (count >= 2) technicalTie = true;
      });

      list.push({
        itemId: item.id,
        winnerSupplierId: best.supplierId,
        winnerScore: best.score,
        winnerUnitPrice: best.unitPrice,
        technicalTie,
        itemUnit: item.unit,
        itemQuantity: quantity,
        perSupplier
      });
    }

    return list;
  }, [selectedRequest, selectedSupplierIds, freightBySupplier, unitPriceBySupplierItem, ocItemQtyByItemId]);

  const wonItemsBySupplier = useMemo(() => {
    const map: Record<string, typeof ocItems> = {};
    for (const s of Array.from(selectedSupplierIds)) map[s] = [];

    for (const w of winnersByItem) {
      const item = ocItems.find((i) => i.id === w.itemId);
      if (!item) continue;
      map[w.winnerSupplierId] = map[w.winnerSupplierId] || [];
      map[w.winnerSupplierId].push(item);
    }

    return map;
  }, [winnersByItem, ocItems, selectedSupplierIds]);

  /** Remove fornecedores que não venceram mais (ex.: após alterar preços) — nunca marca automaticamente. */
  useEffect(() => {
    if (!selectedRequest) return;
    setGenerateSupplierIds((prev) => {
      const next = new Set<string>();
      for (const sid of Array.from(prev)) {
        if ((wonItemsBySupplier[sid] ?? []).length > 0) next.add(sid);
      }
      if (next.size === prev.size && Array.from(next).every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [selectedRequest, wonItemsBySupplier]);

  const computedSupplierTotals = useMemo(() => {
    const out: Record<string, { itemsTotal: number; freight: number; amountToPay: number }> = {};
    for (const supplierId of Array.from(selectedSupplierIds)) {
      const freight = parseMapUnitPrice(freightBySupplier[supplierId] ?? '') ?? 0;
      const items = wonItemsBySupplier[supplierId] ?? [];
      let itemsTotal = 0;
      for (const item of items) {
        const key = `${supplierId}:${item.id}`;
        const unitPrice = parseMapUnitPrice(unitPriceBySupplierItem[key] ?? '');
        if (unitPrice == null) continue;
        const q = ocItemQtyByItemId[item.id] ?? Number(item.quantity);
        itemsTotal += unitPrice * q;
      }
      out[supplierId] = { itemsTotal, freight, amountToPay: itemsTotal + freight };
    }
    return out;
  }, [selectedSupplierIds, wonItemsBySupplier, freightBySupplier, unitPriceBySupplierItem, ocItemQtyByItemId]);

  const [isGenerating, setIsGenerating] = useState(false);

  const generateOrdersMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest) throw new Error('Selecione uma requisição na fase RMs Aprovadas.');
      const suppliersToGenerate = Array.from(generateSupplierIds).filter(
        (sid) => (wonItemsBySupplier[sid] ?? []).length > 0
      );
      if (suppliersToGenerate.length === 0) {
        throw new Error('Marque ao menos um fornecedor em "Gerar OC" para continuar.');
      }
      setIsGenerating(true);

      try {
        // 1) Garantir que existe um mapa no banco
        let mapId = quoteMapId;
        if (!mapId) {
          const created = await api.post('/quote-maps', { materialRequestId: selectedRequest.id });
          mapId = created.data?.data?.id;
          if (!mapId) throw new Error('Falha ao criar mapa de cotação');
          setQuoteMapId(mapId);
        }

        // 2) Salvar cotações + frete no banco (isso recalcula vencedor por item no backend)
        const selectedSupplierIdsArr = Array.from(selectedSupplierIds);
        const freightBySupplierPayload: Record<string, number> = {};
        for (const supplierId of selectedSupplierIdsArr) {
          const rawFrete = freightBySupplier[supplierId] ?? '';
          const parsed = parseMapUnitPrice(rawFrete);
          // Campo vazio = sem frete (0), igual ao resumo exibido na tela
          const f = rawFrete.trim() === '' ? 0 : parsed;
          if (f == null || f < 0) {
            const nome =
              suppliers.find((s) => s.id === supplierId)?.name ?? 'fornecedor selecionado';
            throw new Error(
              `Frete inválido para "${nome}". Use um valor numérico válido (ex.: 0,00 ou 8,00).`
            );
          }
          freightBySupplierPayload[supplierId] = f;
        }

        const unitPricesPayload: Array<{
          supplierId: string;
          materialRequestItemId: string;
          unitPrice: number;
        }> = [];

        for (const supplierId of selectedSupplierIdsArr) {
          for (const item of selectedRequest.items) {
            const key = `${supplierId}:${item.id}`;
            const u = parseMapUnitPrice(unitPriceBySupplierItem[key] ?? '');
            if (u == null || u < 0) continue; // se vazio, não conta para vitória
            unitPricesPayload.push({
              supplierId,
              materialRequestItemId: item.id,
              unitPrice: u
            });
          }
        }

        const itemQuantitiesForSave: Record<string, number> = {};
        for (const it of selectedRequest.items) {
          const maxQ = Number(it.quantity);
          const q = ocItemQtyByItemId[it.id] ?? maxQ;
          itemQuantitiesForSave[it.id] = Math.min(Math.max(q, 0.0001), maxQ);
        }

        await api.put(`/quote-maps/${mapId}/quotes`, {
          supplierIds: selectedSupplierIdsArr,
          freightBySupplier: freightBySupplierPayload,
          unitPrices: unitPricesPayload,
          itemQuantities: itemQuantitiesForSave
        });

        // 3) Preparar pagamento somente para fornecedores marcados para gerar OC
        const paymentBySupplierPayload: Array<{
          supplierId: string;
          paymentType: string;
          paymentCondition: string;
          paymentDetails?: string;
          pixKeyType?: string;
          pixKey?: string;
          observations?: string;
          amountToPay?: number;
          boletoAttachmentUrl?: string;
          boletoAttachmentName?: string;
          creationBoletoInstallments?: Array<{ boletoUrl: string; boletoName?: string }>;
        }> = [];

        for (const supplierId of suppliersToGenerate) {
          const totals = computedSupplierTotals[supplierId];
          const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? 'fornecedor';
          const fallbackDraft = {
            paymentType: OC_TYPE_AVISTA,
            paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
            paymentDetails: '',
            pixKeyType: '',
            pixKey: '',
            observations: '',
            amountToPayStr: totals ? String(totals.amountToPay) : '',
            boletoSlots: [{ url: '', name: '' }]
          };

          const draft = paymentDraftBySupplier[supplierId] ?? fallbackDraft;
          const paymentType = draft.paymentType ?? OC_TYPE_AVISTA;
          const paymentCondition = draft.paymentCondition ?? paymentConditionDefault(paymentType);
          const boletoMeta = resolvePaymentConditionMeta(paymentCondition, boletoPaymentConditions);
          const boletoSlots = draft.boletoSlots ?? [{ url: '', name: '' }];

          if (paymentType === OC_TYPE_AVISTA) {
            if (!draft.paymentDetails?.trim()) {
              throw new Error(`Informe os dados do pagamento para "${supplierName}".`);
            }
            if (!draft.pixKeyType?.trim()) {
              throw new Error(`Informe o tipo de chave PIX para "${supplierName}".`);
            }
            if (!draft.pixKey?.trim()) {
              throw new Error(`Informe a chave PIX para "${supplierName}".`);
            }
          } else if (boletoMeta.parcelCount > 1) {
            if (
              boletoSlots.length !== boletoMeta.parcelCount ||
              !boletoSlots.every((s) => s.url.trim())
            ) {
              throw new Error(
                `Anexe os ${boletoMeta.parcelCount} boletos para "${supplierName}" (um por parcela).`
              );
            }
          } else if (!boletoSlots[0]?.url.trim()) {
            throw new Error(`Anexe o boleto para "${supplierName}".`);
          }

          paymentBySupplierPayload.push({
            supplierId,
            paymentType,
            paymentCondition,
            paymentDetails: draft.paymentDetails?.trim() || undefined,
            pixKeyType: paymentType === OC_TYPE_AVISTA ? draft.pixKeyType?.trim() || undefined : undefined,
            pixKey: paymentType === OC_TYPE_AVISTA ? draft.pixKey?.trim() || undefined : undefined,
            observations: draft.observations?.trim() || undefined,
            amountToPay: totals?.amountToPay,
            ...(paymentType === OC_TYPE_BOLETO && boletoMeta.parcelCount > 1
              ? {
                  creationBoletoInstallments: boletoSlots.map((s) => ({
                    boletoUrl: s.url.trim(),
                    boletoName: s.name.trim() || undefined
                  }))
                }
              : paymentType === OC_TYPE_BOLETO
                ? {
                    boletoAttachmentUrl: boletoSlots[0]?.url.trim() || undefined,
                    boletoAttachmentName: boletoSlots[0]?.name.trim() || undefined
                  }
                : {})
          });
        }

        // 4) Gerar as OCs no backend
        const result = await api.post(`/quote-maps/${mapId}/generate`, {
          generateSupplierIds: suppliersToGenerate,
          paymentBySupplier: paymentBySupplierPayload,
          itemQuantities: itemQuantitiesForSave
        });

        return result.data;
      } finally {
        setIsGenerating(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('Mapa gerado e OCs criadas com sucesso!');
      router.push('/ponto/ordem-de-compra');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error?.message || 'Erro ao gerar OCs');
    }
  });

  if (loadingUser || loadingRequests) {
    return (
      <Loading
        message="Carregando mapa de cotação..."
        fullScreen
        size="lg"
      />
    );
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  return (
    <ProtectedRoute route="/ponto/mapa-cotacao">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Mapa de Cotação
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Compare preços entre fornecedores e gere ordens de compra por vencedor.
            </p>
          </div>

          <Card>
            <CardHeader className="border-b-0 pb-1">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-950/40">
                  <Truck className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    RM's Aprovadas
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Escolha a requisição e os fornecedores para montar o mapa
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {approvedRequests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/80 px-6 py-12 text-center dark:border-gray-600 dark:bg-gray-900/30">
                  <Truck className="mx-auto mb-3 h-10 w-10 text-gray-400 dark:text-gray-500" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nenhuma requisição em RMs Aprovadas aguardando cotação
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Requisição de material *
                    </label>
                    <SingleSelectSearchDropdown
                      value={selectedRequestId}
                      onChange={setSelectedRequestId}
                      options={materialRequestOptions}
                      allowEmpty={false}
                      placeholder="Selecione uma requisição (RMs Aprovadas)"
                      searchPlaceholder="Pesquisar..."
                      emptyOptionsMessage="Nenhuma requisição disponível."
                      emptySearchMessage="Nenhuma requisição encontrada."
                      noFocusRing
                      hideFocus
                    />
                  </div>

                  {!selectedRequest ? (
                    <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/80 px-6 py-12 text-center dark:border-gray-600 dark:bg-gray-900/30">
                      <FileText className="mx-auto mb-3 h-10 w-10 text-gray-400 dark:text-gray-500" />
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Selecione uma requisição acima
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Depois você poderá escolher os fornecedores para comparar preços
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 min-w-0">
                      <MultiSelectSearchDropdown
                        label="Fornecedores"
                        options={supplierOptions}
                        selected={Array.from(selectedSupplierIds)}
                        onChange={(ids) => setSelectedSupplierIds(new Set(ids))}
                        placeholder="Selecione fornecedores para comparar..."
                        searchPlaceholder="Pesquisar..."
                        emptyOptionsMessage="Nenhum fornecedor cadastrado."
                        emptySearchMessage="Nenhum fornecedor encontrado."
                        listMaxHeight={280}
                        menuInline
                        noFocusRing
                        hideFocus
                      />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {selectedRequest && (
            <>
              <Card>
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 rounded-lg bg-green-100 p-2 sm:p-3 dark:bg-green-900/30">
                        <FileSpreadsheet className="h-5 w-5 text-green-700 sm:h-6 sm:w-6 dark:text-green-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Cotações
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Preços, quantidades e vencedor por item da SC
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRequestId('');
                          setQuoteMapId('');
                          setSelectedSupplierIds(new Set());
                          setGenerateSupplierIds(new Set());
                          setFreightBySupplier({});
                          setUnitPriceBySupplierItem({});
                          setPaymentDraftBySupplier({});
                        }}
                        className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                      >
                        Limpar
                      </button>
                      <button
                        type="button"
                        disabled={generateSupplierIds.size === 0 || isGenerating}
                        onClick={() => generateOrdersMutation.mutate()}
                        className="flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span>{isGenerating ? 'Gerando…' : 'Gerar OCs selecionadas'}</span>
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedSupplierIds.size === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/80 px-6 py-12 text-center dark:border-gray-600 dark:bg-gray-900/30">
                      <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-gray-400 dark:text-gray-500" />
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Selecione pelo menos um fornecedor acima
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        A tabela de cotações será exibida aqui
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-600 dark:bg-gray-900/40">
                        <p className="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                          Frete por fornecedor
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {Array.from(selectedSupplierIds).map((supplierId) => {
                            const sup = suppliers.find((x) => x.id === supplierId);
                            return (
                              <div key={supplierId} className="min-w-0">
                                <label
                                  htmlFor={`frete-${supplierId}`}
                                  className="mb-1 block truncate text-xs font-medium text-gray-600 dark:text-gray-400"
                                  title={sup?.name ?? supplierId}
                                >
                                  {sup ? sup.name : supplierId}
                                </label>
                                <input
                                  id={`frete-${supplierId}`}
                                  type="text"
                                  inputMode="numeric"
                                  value={freightBySupplier[supplierId] ?? ''}
                                  onChange={(e) => {
                                    setFreightBySupplier((prev) => ({
                                      ...prev,
                                      [supplierId]: maskCurrencyInputBrOrEmpty(e.target.value)
                                    }));
                                  }}
                                  placeholder="R$ 0,00"
                                  className={`${mapFieldCls} tabular-nums`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="overflow-x-auto [scrollbar-gutter:stable]">
                          <table className="w-full min-w-[40rem] text-sm">
                            <thead className="border-b border-gray-200 dark:border-gray-700">
                              <tr>
                                <th className={`${mapThCls} min-w-[11rem]`}>Material</th>
                                <th className={`${mapThCls} whitespace-nowrap text-center`}>Qtd. SC</th>
                                <th className={`${mapThCls} whitespace-nowrap text-center`}>Qtd. na OC</th>
                                {Array.from(selectedSupplierIds).map((supplierId) => {
                                  const sup = suppliers.find((x) => x.id === supplierId);
                                  return (
                                    <th
                                      key={supplierId}
                                      className={`${mapThCls} min-w-[8.5rem] whitespace-nowrap text-center`}
                                      title={sup?.name ?? supplierId}
                                    >
                                      <span className="block truncate normal-case tracking-normal text-gray-800 dark:text-gray-200">
                                        {sup ? sup.name : supplierId}
                                      </span>
                                      <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400">
                                        Valor unit.
                                      </span>
                                    </th>
                                  );
                                })}
                                <th className={`${mapThCls} whitespace-nowrap text-center`}>Vencedor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                              {ocItems.map((item) => {
                                const winner = winnersByItem.find((w) => w.itemId === item.id) || null;
                                const winnerSupplier = suppliers.find((s) => s.id === winner?.winnerSupplierId);
                                const unitLabel = item.unit || '-';
                                const maxQty = Number(item.quantity);
                                const qty = ocItemQtyByItemId[item.id] ?? maxQty;
                                const matSub = materialItemSubtitle(item);

                                return (
                                  <tr
                                    key={item.id}
                                    className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                  >
                                    <td className={mapTdCls}>
                                      <p className="font-medium text-gray-900 dark:text-gray-100">
                                        {materialItemLabel(item)}
                                      </p>
                                      {matSub ? (
                                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                                          {matSub}
                                        </p>
                                      ) : null}
                                    </td>
                                    <td className={`${mapTdCls} text-center tabular-nums font-medium text-gray-900 dark:text-gray-100`}>
                                      {maxQty} {unitLabel}
                                    </td>
                                    <td className={`${mapTdCls} text-center`}>
                                      <label htmlFor={`oc-qty-map-${item.id}`} className="sr-only">
                                        Quantidade na OC
                                      </label>
                                      <input
                                        id={`oc-qty-map-${item.id}`}
                                        type="number"
                                        min={0.0001}
                                        step="any"
                                        max={maxQty}
                                        value={qty}
                                        onChange={(e) => {
                                          const n = parseFloat(e.target.value);
                                          if (Number.isNaN(n)) return;
                                          const q = Math.min(Math.max(n, 0.0001), maxQty);
                                          setOcItemQtyByItemId((prev) => ({ ...prev, [item.id]: q }));
                                        }}
                                        className={`${mapFieldCls} mx-auto block max-w-[6.5rem] text-center [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                                      />
                                    </td>

                                    {Array.from(selectedSupplierIds).map((supplierId) => {
                                      const key = `${supplierId}:${item.id}`;
                                      const unitPriceStr = unitPriceBySupplierItem[key] ?? '';
                                      const unitPrice = parseMapUnitPrice(unitPriceStr);
                                      const freightParsed = parseMapUnitPrice(freightBySupplier[supplierId] ?? '');
                                      const freight = freightParsed ?? 0;
                                      const itemTotal = unitPrice == null ? null : unitPrice * qty;
                                      const score = unitPrice == null ? null : itemTotal! + freight;
                                      const isWinner = winner?.winnerSupplierId === supplierId;

                                      return (
                                        <td
                                          key={supplierId}
                                          className={`${mapTdCls} text-center ${
                                            isWinner
                                              ? 'bg-green-50/30 dark:bg-green-950/10'
                                              : ''
                                          }`}
                                        >
                                          <input
                                            id={`unit-${key}`}
                                            type="text"
                                            inputMode="numeric"
                                            aria-label={`Valor unitário ${suppliers.find((x) => x.id === supplierId)?.name ?? supplierId}`}
                                            value={unitPriceStr}
                                            onChange={(e) => {
                                              setUnitPriceBySupplierItem((prev) => ({
                                                ...prev,
                                                [key]: maskCurrencyInputBrOrEmpty(e.target.value)
                                              }));
                                            }}
                                            placeholder="R$ 0,00"
                                            className={`${mapFieldCls} mx-auto block max-w-[8rem] tabular-nums text-center ${
                                              isWinner
                                                ? 'border-green-500 dark:border-green-500'
                                                : ''
                                            }`}
                                          />
                                          <p className="mt-1.5 text-center text-xs text-gray-500 dark:text-gray-400">
                                            Custo p/ vencer:{' '}
                                            <span className="font-medium tabular-nums text-gray-800 dark:text-gray-200">
                                              {score == null ? '—' : formatCurrencyBR(score)}
                                            </span>
                                          </p>
                                        </td>
                                      );
                                    })}

                                    <td className={`${mapTdCls} text-center`}>
                                      {winnerSupplier && winner ? (
                                        <div className="flex flex-col items-center gap-1">
                                          <span className="inline-flex max-w-full rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/35 dark:text-green-300">
                                            <span className="truncate">{winnerSupplier.name}</span>
                                          </span>
                                          {winner.technicalTie ? (
                                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                              Empate técnico
                                            </span>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 dark:text-gray-500">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="mt-6 border-t border-gray-200 pt-6 dark:border-gray-700">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          Fornecedores vencedores
                        </h3>
                        <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
                          Marque os fornecedores para gerar a OC. Quantidades e preços seguem a tabela de cotações acima.
                        </p>

                        {Array.from(selectedSupplierIds).filter(
                          (sid) => (wonItemsBySupplier[sid] ?? []).length > 0
                        ).length === 0 ? (
                          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/80 px-6 py-10 text-center dark:border-gray-600 dark:bg-gray-900/30">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Informe os preços na tabela para definir o vencedor de cada item.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {Array.from(selectedSupplierIds)
                              .filter((sid) => (wonItemsBySupplier[sid] ?? []).length > 0)
                              .map((sid) => {
                                const sup = suppliers.find((s) => s.id === sid);
                                const itemsWon = wonItemsBySupplier[sid] ?? [];
                                const totals = computedSupplierTotals[sid];
                                const generateOc = generateSupplierIds.has(sid);
                                const payType =
                                  paymentDraftBySupplier[sid]?.paymentType ?? OC_TYPE_AVISTA;
                                const paymentConditionValue =
                                  paymentDraftBySupplier[sid]?.paymentCondition ??
                                  paymentConditionDefault(payType);
                                const boletoMeta = resolvePaymentConditionMeta(
                                  paymentConditionValue,
                                  boletoPaymentConditions
                                );
                                const boletoSlots =
                                  paymentDraftBySupplier[sid]?.boletoSlots ?? [{ url: '', name: '' }];

                                return (
                                  <div
                                    key={sid}
                                    className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600"
                                  >
                                    <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/60 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
                                      <div className="min-w-0">
                                        <p
                                          className="truncate font-semibold text-gray-900 dark:text-gray-100"
                                          title={sup?.name ?? sid}
                                        >
                                          {sup ? sup.name : sid}
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                                          <span>
                                            Frete:{' '}
                                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                              {totals ? formatCurrencyBR(totals.freight) : '—'}
                                            </span>
                                          </span>
                                          <span>
                                            Itens:{' '}
                                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                              {totals ? formatCurrencyBR(totals.itemsTotal) : '—'}
                                            </span>
                                          </span>
                                          {totals ? (
                                            <span>
                                              Total OC:{' '}
                                              <span className="font-medium text-gray-800 dark:text-gray-200">
                                                {formatCurrencyBR(totals.amountToPay)}
                                              </span>
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                      <label className="flex shrink-0 cursor-pointer items-center gap-2.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                                        <MapStyledCheckbox
                                          checked={generateOc}
                                          onChange={(checked) => {
                                            setGenerateSupplierIds((prev) => {
                                              const next = new Set(prev);
                                              if (checked) next.add(sid);
                                              else next.delete(sid);
                                              return next;
                                            });
                                          }}
                                          ariaLabel={`Gerar OC para ${sup?.name ?? sid}`}
                                        />
                                        Gerar OC
                                      </label>
                                    </div>

                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead className="border-b border-gray-200 dark:border-gray-700">
                                          <tr>
                                            <th className={`${mapThCls} min-w-[9rem]`}>Material</th>
                                            <th className={`${mapThCls} text-center`}>Qtd. SC</th>
                                            <th className={`${mapThCls} text-center`}>Qtd. OC</th>
                                            <th className={`${mapThCls} text-right`}>Valor unit.</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                          {itemsWon.map((item) => {
                                            const unitLabel = item.unit || '-';
                                            const maxQty = Number(item.quantity);
                                            const qty = ocItemQtyByItemId[item.id] ?? maxQty;
                                            const priceKey = `${sid}:${item.id}`;
                                            const unitParsed = parseMapUnitPrice(
                                              unitPriceBySupplierItem[priceKey] ?? ''
                                            );
                                            const sub = materialItemSubtitle(item);
                                            return (
                                              <tr key={item.id}>
                                                <td className={mapTdCls}>
                                                  <p className="font-medium text-gray-900 dark:text-gray-100">
                                                    {materialItemLabel(item)}
                                                  </p>
                                                  {sub ? (
                                                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                                                      {sub}
                                                    </p>
                                                  ) : null}
                                                </td>
                                                <td
                                                  className={`${mapTdCls} text-center tabular-nums text-gray-700 dark:text-gray-300`}
                                                >
                                                  {maxQty} {unitLabel}
                                                </td>
                                                <td
                                                  className={`${mapTdCls} text-center tabular-nums font-medium text-gray-900 dark:text-gray-100`}
                                                >
                                                  {qty} {unitLabel}
                                                </td>
                                                <td
                                                  className={`${mapTdCls} text-right tabular-nums font-medium text-gray-900 dark:text-gray-100`}
                                                >
                                                  {unitParsed == null
                                                    ? '—'
                                                    : formatCurrencyBR(unitParsed)}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>

                                    {generateOc && (
                                      <div className="space-y-4 border-t border-gray-200 p-4 dark:border-gray-700">
                                        <div>
                                          <span className={mapLabelCls}>Tipo de pagamento *</span>
                                          <div
                                            role="radiogroup"
                                            aria-label="Tipo de pagamento"
                                            className="grid max-w-md grid-cols-2 gap-2"
                                          >
                                            <button
                                              type="button"
                                              role="radio"
                                              aria-checked={payType === OC_TYPE_AVISTA}
                                              onClick={() => {
                                                setPaymentDraftBySupplier((prev) => ({
                                                  ...prev,
                                                  [sid]: {
                                                    ...(prev[sid] ?? emptyPaymentDraft()),
                                                    paymentType: OC_TYPE_AVISTA,
                                                    paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
                                                    boletoSlots: [{ url: '', name: '' }]
                                                  }
                                                }));
                                              }}
                                              className={mapPaymentSegmentCls(payType === OC_TYPE_AVISTA)}
                                            >
                                              À vista
                                            </button>
                                            <button
                                              type="button"
                                              role="radio"
                                              aria-checked={payType === OC_TYPE_BOLETO}
                                              onClick={() => {
                                                setPaymentDraftBySupplier((prev) => ({
                                                  ...prev,
                                                  [sid]: {
                                                    ...(prev[sid] ?? emptyPaymentDraft()),
                                                    paymentType: OC_TYPE_BOLETO,
                                                    paymentCondition: paymentConditionDefault(OC_TYPE_BOLETO),
                                                    pixKeyType: '',
                                                    pixKey: '',
                                                    boletoSlots: [{ url: '', name: '' }]
                                                  }
                                                }));
                                              }}
                                              className={mapPaymentSegmentCls(payType === OC_TYPE_BOLETO)}
                                            >
                                              Boleto
                                            </button>
                                          </div>
                                        </div>

                                        <div>
                                          <label
                                            htmlFor={`pc-${sid}`}
                                            className={mapLabelCls}
                                          >
                                            Condição de pagamento *
                                          </label>
                                          <PaymentConditionSelect
                                            id={`pc-${sid}`}
                                            key={`pc-${sid}-${payType}`}
                                            paymentType={payType === OC_TYPE_AVISTA ? 'AVISTA' : 'BOLETO'}
                                            value={paymentConditionValue}
                                            onChange={(v) => {
                                              const meta = resolvePaymentConditionMeta(v, boletoPaymentConditions);
                                              setPaymentDraftBySupplier((prev) => ({
                                                ...prev,
                                                [sid]: {
                                                  ...(prev[sid] ?? emptyPaymentDraft()),
                                                  paymentCondition: v,
                                                  boletoSlots: resizeOcBoletoCreationSlots(
                                                    meta.parcelCount,
                                                    prev[sid]?.boletoSlots
                                                  )
                                                }
                                              }));
                                            }}
                                            disabled={payType === OC_TYPE_AVISTA}
                                            hideFocus
                                          />
                                        </div>

                                        <div>
                                          <label htmlFor={`amount-${sid}`} className={mapLabelCls}>
                                            Valor total (R$) *
                                          </label>
                                          <input
                                            id={`amount-${sid}`}
                                            type="text"
                                            inputMode="decimal"
                                            value={(() => {
                                              const s = paymentDraftBySupplier[sid]?.amountToPayStr;
                                              if (s !== undefined && s !== '') return s;
                                              return totals ? formatCurrencyBR(totals.amountToPay) : '';
                                            })()}
                                            onChange={(e) => {
                                              setPaymentDraftBySupplier((prev) => ({
                                                ...prev,
                                                [sid]: {
                                                  ...(prev[sid] ?? emptyPaymentDraft()),
                                                  amountToPayStr: e.target.value
                                                }
                                              }));
                                            }}
                                            onBlur={() => {
                                              const raw =
                                                paymentDraftBySupplier[sid]?.amountToPayStr ??
                                                (totals ? String(totals.amountToPay) : '');
                                              const formatted = formatCurrencyInputValue(raw);
                                              setPaymentDraftBySupplier((prev) => ({
                                                ...prev,
                                                [sid]: {
                                                  ...(prev[sid] ?? emptyPaymentDraft()),
                                                  amountToPayStr: formatted
                                                }
                                              }));
                                            }}
                                            placeholder="0,00"
                                            className={mapFieldCls}
                                          />
                                        </div>

                                        <div>
                                          <label htmlFor={`pay-details-${sid}`} className={mapLabelCls}>
                                            Dados do pagamento{payType === OC_TYPE_AVISTA ? ' *' : ''}
                                          </label>
                                          <textarea
                                            id={`pay-details-${sid}`}
                                            value={paymentDraftBySupplier[sid]?.paymentDetails ?? ''}
                                            onChange={(e) => {
                                              setPaymentDraftBySupplier((prev) => ({
                                                ...prev,
                                                [sid]: {
                                                  ...(prev[sid] ?? emptyPaymentDraft()),
                                                  paymentDetails: e.target.value
                                                }
                                              }));
                                            }}
                                            rows={3}
                                            placeholder={
                                              payType === OC_TYPE_AVISTA
                                                ? 'Conta, agência, favorecido, etc.'
                                                : 'Conta, PIX, agência, favorecido, etc.'
                                            }
                                            className={`${mapFieldCls} min-h-[5rem] resize-y`}
                                          />
                                        </div>

                                        {payType === OC_TYPE_AVISTA ? (
                                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2.2fr)]">
                                            <div>
                                              <label htmlFor={`pix-type-${sid}`} className={mapLabelCls}>
                                                Tipo de Chave Pix *
                                              </label>
                                              <SingleSelectSearchDropdown
                                                value={paymentDraftBySupplier[sid]?.pixKeyType ?? ''}
                                                onChange={(v) => {
                                                  setPaymentDraftBySupplier((prev) => ({
                                                    ...prev,
                                                    [sid]: {
                                                      ...(prev[sid] ?? emptyPaymentDraft()),
                                                      pixKeyType: v
                                                    }
                                                  }));
                                                }}
                                                options={OC_PIX_KEY_TYPE_OPTIONS}
                                                allowEmpty
                                                placeholder="Selecione..."
                                                searchPlaceholder="Pesquisar..."
                                                noFocusRing
                      hideFocus
                                              />
                                            </div>
                                            <div>
                                              <label htmlFor={`pix-key-${sid}`} className={mapLabelCls}>
                                                Chave Pix *
                                              </label>
                                              <input
                                                id={`pix-key-${sid}`}
                                                type="text"
                                                value={paymentDraftBySupplier[sid]?.pixKey ?? ''}
                                                onChange={(e) => {
                                                  setPaymentDraftBySupplier((prev) => ({
                                                    ...prev,
                                                    [sid]: {
                                                      ...(prev[sid] ?? emptyPaymentDraft()),
                                                      pixKey: e.target.value
                                                    }
                                                  }));
                                                }}
                                                placeholder="Informe a chave PIX"
                                                className={mapFieldCls}
                                              />
                                            </div>
                                          </div>
                                        ) : (
                                          <OcBoletoCreationFields
                                            idPrefix={`boleto-${sid}`}
                                            labelClassName={mapLabelCls}
                                            parcelCount={boletoMeta.parcelCount}
                                            parcelDueDays={boletoMeta.parcelDueDays}
                                            slots={boletoSlots}
                                            onChange={(next) => {
                                              setPaymentDraftBySupplier((prev) => ({
                                                ...prev,
                                                [sid]: {
                                                  ...(prev[sid] ?? emptyPaymentDraft()),
                                                  boletoSlots: next
                                                }
                                              }));
                                            }}
                                            disabled={isGenerating}
                                          />
                                        )}

                                        <div>
                                          <label htmlFor={`obs-${sid}`} className={mapLabelCls}>
                                            Observações
                                          </label>
                                          <textarea
                                            id={`obs-${sid}`}
                                            value={paymentDraftBySupplier[sid]?.observations ?? ''}
                                            onChange={(e) => {
                                              setPaymentDraftBySupplier((prev) => ({
                                                ...prev,
                                                [sid]: {
                                                  ...(prev[sid] ?? emptyPaymentDraft()),
                                                  observations: e.target.value
                                                }
                                              }));
                                            }}
                                            rows={2}
                                            placeholder="Observações gerais da OC"
                                            className={`${mapFieldCls} min-h-[4rem] resize-y`}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>

                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}


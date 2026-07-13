'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  FileText,
  Eye,
  Check,
  X,
  Wrench,
  Send,
  Download,
  Loader2,
  Banknote,
  Receipt,
  Undo2,
  Wallet,
  Pencil,
  ExternalLink,
  Search,
  Filter,
  RotateCcw,
  MoreVertical,
  CircleDollarSign
} from 'lucide-react';
import { FinancialControlEntryModal } from '@/components/financeiro/FinancialControlEntryModal';
import { buildFormFromPurchaseOrder } from '@/components/financeiro/financialControlEntry';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import {
  getListTableRowClassName,
  listTableRowClasses,
  ListRowNavigableLabel,
  rowActionMenuButtonClass
} from '@/components/ui/listTableUi';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import { formatRmListDisplayId } from '@/app/ponto/gerenciar-materiais/_lib/rmListDisplay';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { normalizeCostCentersResponse } from '@/lib/costCenters';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { parseLastOcCorrectionInfo } from '@/lib/ocCorrectionNotes';
import { exportPurchaseOrderPdf } from '@/lib/exportPurchaseOrderPdf';
import {
  Z_ACTION_MENU,
} from '@/lib/zIndex';
import { PaymentConditionSelect, buildPaymentConditionLabelMap } from '@/components/oc/PaymentConditionSelect';
import {
  OcPurchaseOrderFormFields,
  buildOcFormValuesFromOrder,
  getOcSupplierLabel,
  type OcFormOrderSource,
  type OcPurchaseOrderFormValues,
  type OcSupplierOption
} from '@/components/oc/OcPurchaseOrderFormFields';
import { BoletoParcelasModal } from '@/components/oc/BoletoParcelasModal';
import { BoletoParcelasList } from '@/components/oc/BoletoParcelasList';
import { canActOnOcApprovalStatus } from '@/lib/ocApprovalPermissions';
import { usePermissions } from '@/hooks/usePermissions';
import {
  orderNeedsPaymentBoleto,
  showInAttachBoletoTab,
  canSendCurrentBoletoToPayment,
  canAttachComprovanteForBoletoOrder,
  canSubmitBoletoToProofValidation,
  canSubmitProofValidationWithFinancialEntry,
  getProofValidationSubmitBlockers,
  lastPaidInstallmentProofUrl,
  hasAwaitingInstallmentPayment,
  awaitingBoletoInstallmentHasProof,
  showSequentialInstallmentProofSection,
  currentSequentialInstallmentHasProof,
  parsePaymentBoletoInstallments,
  hasAnyPaymentBoletoAttachment,
  romanParcelLabel,
  rowStatus,
  installmentStatusLabel,
  useParallelBoletoPaymentFlow,
  allInstallmentsHavePaymentProof,
  financeProofTargetInstallmentIndices,
  shouldShowOrderLevelPaymentProofInDocuments,
  isOcInFinancialLaunchPhase,
  effectivePaymentBoletoUrl,
  effectivePaymentBoletoName,
  visiblePaymentBoletoInstallmentIndex,
  listInstallmentIndex,
  listInstallmentRow,
  proofValidationInstallmentIndex,
  type OcListInstallmentMode,
  returnAfterBoletoInstallmentPaidButtonLabel,
  returnAfterBoletoInstallmentPaidConfirmMessage,
} from '@/components/oc/ocPaymentBoleto';
import {
  ocDeliveryStatusBadgeClass,
  type OcDeliveryStatusBadgeKey,
  purchaseOrderPhaseLabel,
} from '@/components/oc/ocStatusLabels';
import { OcAttachmentActions } from '@/components/oc/OcAttachmentActions';
import { FinancialControlEntryFormModal } from '@/components/financeiro/FinancialControlEntryFormModal';
import {
  MONTHS_PT,
  formatCurrency as formatFinancialCurrency,
  type FinancialControlEntry,
} from '@/lib/financialControlEntry';
import { OcFluxTabsNav } from '@/components/oc/OcFluxTabsNav';
import { computeOcTabCounts } from '@/components/oc/ocTabCounts';
import { sortPurchaseOrdersByMostRecent } from '@/components/oc/ocPurchaseOrderListSort';
import { parseCurrencyInputBr } from '@/lib/maskCurrencyBr';
import { isOcBoletoPaymentType } from '@/components/oc/ocUploadBoleto';
import {
  getOcPaymentListStatus,
  ocPaymentListStatusClass,
  ocPaymentListStatusLabel,
} from '@/components/oc/ocPaymentListStatus';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const OC_APPROVAL_LIST_PHASE_OPTIONS = labeledToSelectOptions([
  { value: 'pending', label: 'Pendentes de aprovação' },
  { value: 'approved_by_me', label: 'Aprovadas por mim' },
]);

export {
  orderNeedsPaymentBoleto,
  canSendCurrentBoletoToPayment,
  canAttachComprovanteForBoletoOrder,
  canSubmitBoletoToProofValidation,
  canSubmitProofValidationWithFinancialEntry,
  getProofValidationSubmitBlockers,
  lastPaidInstallmentProofUrl,
  hasAwaitingInstallmentPayment,
  awaitingBoletoInstallmentHasProof,
  parsePaymentBoletoInstallments,
  hasAnyPaymentBoletoAttachment,
  rowStatus,
  installmentStatusLabel,
  useParallelBoletoPaymentFlow,
  allInstallmentsHavePaymentProof,
  financeProofTargetInstallmentIndices,
  shouldShowOrderLevelPaymentProofInDocuments
} from '@/components/oc/ocPaymentBoleto';

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
  pixKeyType?: string | null;
  pixKey?: string | null;
  boletoAttachmentUrl?: string | null;
  boletoAttachmentName?: string | null;
  paymentBoletoUrl?: string | null;
  paymentBoletoName?: string | null;
  /** JSON no backend: parcelas com amount, dueDate, boletoUrl, boletoName */
  paymentBoletoInstallments?: unknown;
  /** Preenchido pela API a partir da condição de pagamento */
  paymentParcelCount?: number;
  paymentParcelDueDays?: number[];
  /** true após "Enviar para fase Pagamento" */
  paymentBoletoPhaseReleased?: boolean | null;
  paymentProofUrl?: string | null;
  paymentProofName?: string | null;
  /** JSON: [{ url, name, uploadedAt }] — NFs após validação do comprovante */
  nfAttachments?: unknown;
  /** Frete (R$). Total a pagar = soma dos itens + frete. */
  freightAmount?: number | string | null;
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
    bank?: string | null;
    agency?: string | null;
    account?: string | null;
    accountDigit?: string | null;
  };
  materialRequest?: {
    id?: string;
    requestNumber: string;
    serviceOrder?: string | null;
    description?: string | null;
    costCenter?: { id: string; code?: string | null; name?: string | null };
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
  comprasApprovedBy?: string | null;
  gestorApprovedBy?: string | null;
  approvedBy?: string | null;
  /** Ausente na listagem `summary=1`; preenchido no GET por id. */
  items?: Array<{
    materialId?: string;
    materialRequestItemId?: string | null;
    materialRequestItem?: { quantity?: number | string | null } | null;
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
  stockReceipt?: {
    hasReceipts: boolean;
    hasExits?: boolean;
    lines: Array<{
      materialLabel: string;
      ordered: number;
      received: number;
      gap: number;
      unit: string;
    }>;
    batches: Array<{
      createdAt: string;
      split: 'TOTAL' | 'PARCIAL' | '';
      userName: string;
      items: Array<{ materialName: string; quantity: number; unit: string }>;
    }>;
    exitBatches?: Array<{
      createdAt: string;
      split: 'TOTAL' | 'PARCIAL' | '';
      userName: string;
      items: Array<{ materialName: string; quantity: number; unit: string }>;
    }>;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface StockMovementForOcTag {
  id: string;
  type: 'IN' | 'OUT';
  notes?: string | null;
  createdAt: string;
}

type OcMovementTag = {
  label: string;
  badgeKey: OcDeliveryStatusBadgeKey;
  title?: string;
};

type OcMovementAttachmentTag = {
  key: string;
  label: string;
  colorClass: string;
  url?: string;
  /** Tooltip: na listagem o rótulo é curto; detalhes da OC trazem arquivo, valores e vencimentos. */
  titleHint?: string;
};

type StockMovementAttachmentItem = {
  name: string;
  url: string;
  amount?: string;
  dueDate?: string;
};

type StockMovementAttachmentBundle = {
  nf: StockMovementAttachmentItem | null;
  withdrawalSheet: StockMovementAttachmentItem | null;
  paymentSlips: StockMovementAttachmentItem[];
};

const OC_PAYMENT_TYPE_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO: 'Boleto'
};

function extractOcCorrectionBlocks(notes?: string | null): string {
  if (!notes?.trim()) return '';
  return notes
    .split(/\n\n+/)
    .filter((block) => /^\[Correção OC[^\]]*\]/.test(block.trim()))
    .join('\n\n')
    .trim();
}

function stripOcCorrectionBlocksFromNotes(notes?: string | null): string {
  if (!notes?.trim()) return '';
  return notes
    .split(/\n\n+/)
    .filter((block) => !/^\[Correção OC[^\]]*\]/.test(block.trim()))
    .join('\n\n')
    .trim();
}

function isEditOcAvistaPaymentIncomplete(
  paymentType: string,
  paymentDetails: string,
  pixKeyType: string,
  pixKey: string
): boolean {
  return (
    paymentType === 'AVISTA' &&
    (!paymentDetails.trim() || !pixKeyType.trim() || !pixKey.trim())
  );
}

const OC_PAYMENT_CONDITION_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO_30: 'Boleto 30 dias',
  BOLETO_28: 'Boleto 28 dias'
};

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

type PurchaseOrdersListSummaryCache = {
  data?: PurchaseOrder[];
  pagination?: unknown;
  success?: boolean;
};

function patchOcInListSummaryCache(
  queryClient: QueryClient,
  id: string,
  patch: Partial<PurchaseOrder> | ((order: PurchaseOrder) => PurchaseOrder)
) {
  queryClient.setQueryData(
    ['purchase-orders', 'list-summary'],
    (old: PurchaseOrdersListSummaryCache | undefined) => {
      if (!old?.data || !Array.isArray(old.data)) return old;
      return {
        ...old,
        data: old.data.map((order) => {
          if (order.id !== id) return order;
          const next =
            typeof patch === 'function' ? patch(order) : { ...order, ...patch };
          // Sort da lista usa updatedAt; sem bump a OC entra na fase no meio e
          // só sobe depois do refetch (parece "pular" de posição).
          if (next.status !== order.status) {
            return { ...next, updatedAt: new Date().toISOString() };
          }
          return next;
        })
      };
    }
  );
}

function approvalOptimisticPatch(
  currentStatus: string,
  userId: string | undefined
): Partial<PurchaseOrder> {
  const nextStatus = nextApprovalStatus(currentStatus);
  const patch: Partial<PurchaseOrder> = { status: nextStatus };
  if (!userId) return patch;
  if (currentStatus === 'PENDING_COMPRAS' || currentStatus === 'DRAFT') {
    patch.comprasApprovedBy = userId;
  } else if (currentStatus === 'PENDING') {
    patch.gestorApprovedBy = userId;
  } else if (currentStatus === 'PENDING_DIRETORIA') {
    patch.approvedBy = userId;
  }
  return patch;
}

function isStockSyncedDocumentUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes('/uploads/stock-invoices/') ||
    u.includes('/uploads/stock-payment-slips/')
  );
}

function parseOcNfAttachments(raw: unknown): Array<{ url: string; name: string | null; uploadedAt: string }> {
  if (!raw || !Array.isArray(raw)) return [];
  const out: Array<{ url: string; name: string | null; uploadedAt: string }> = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const rec = x as Record<string, unknown>;
    const u = typeof rec.url === 'string' ? rec.url.trim() : '';
    if (!u) continue;
    const name =
      typeof rec.name === 'string' && rec.name.trim() ? String(rec.name).trim() : null;
    const uploadedAt =
      typeof rec.uploadedAt === 'string' && rec.uploadedAt.trim()
        ? String(rec.uploadedAt).trim()
        : '';
    out.push({ url: u, name, uploadedAt });
  }
  return out;
}

/** Total da OC na listagem: itens + frete (fallback em registros antigos só com amountToPay). */
function orderGrandTotal(o: Pick<PurchaseOrder, 'items' | 'freightAmount' | 'amountToPay'>): number {
  const hasLineItems = (o.items?.length ?? 0) > 0;
  // Listagem summary não traz items — preferir amountToPay
  if (
    !hasLineItems &&
    o.amountToPay != null &&
    o.amountToPay !== '' &&
    Number.isFinite(Number(o.amountToPay))
  ) {
    return Number(o.amountToPay);
  }
  const items = o.items?.reduce((s, i) => s + Number(i.totalPrice), 0) ?? 0;
  const fRaw = o.freightAmount;
  if (fRaw != null && fRaw !== '' && Number.isFinite(Number(fRaw))) {
    return Math.round((items + Number(fRaw)) * 100) / 100;
  }
  if (o.amountToPay != null && o.amountToPay !== '' && Number.isFinite(Number(o.amountToPay))) {
    return Number(o.amountToPay);
  }
  return Math.round(items * 100) / 100;
}

function orderFreightValue(o: Pick<PurchaseOrder, 'freightAmount' | 'amountToPay' | 'items'>): number {
  const items = o.items?.reduce((s, i) => s + Number(i.totalPrice), 0) ?? 0;
  const fRaw = o.freightAmount;
  if (fRaw != null && fRaw !== '' && Number.isFinite(Number(fRaw))) {
    return Math.max(0, Number(fRaw));
  }
  const paid = o.amountToPay != null && o.amountToPay !== '' ? Number(o.amountToPay) : NaN;
  if (Number.isFinite(paid)) return Math.max(0, paid - items);
  return 0;
}

function movementNotesText(notes: unknown): string | null {
  if (notes == null) return null;
  if (typeof notes === 'string') return notes;
  return String(notes);
}

function parseOcMovementInfoFromNotes(notes?: string | null): { ocNumber: string; split: 'TOTAL' | 'PARCIAL' | '' } | null {
  const text = movementNotesText(notes);
  if (!text) return null;
  const ocMatch = text.match(/Nº OC:\s*([^\n|]+)/i);
  if (!ocMatch?.[1]) return null;

  const rawSplit = text.match(/Tipo:\s*(TOTAL|PARCIAL)/i)?.[1]?.toUpperCase() ?? '';
  const split = rawSplit === 'TOTAL' || rawSplit === 'PARCIAL' ? rawSplit : '';

  return {
    ocNumber: ocMatch[1].trim(),
    split
  };
}

function normalizeOcNumberKey(orderNumber: string): string {
  return orderNumber.trim().toLowerCase();
}

/** Prefer TOTAL sobre PARCIAL (mesmo tipo IN/OUT); desempate pela data mais recente. */
function pickRepresentativeOcMovement(movs: StockMovementForOcTag[]): StockMovementForOcTag | null {
  if (!movs.length) return null;

  const sorted = [...movs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const latest = sorted[0];

  const pickBestForType = (type: 'IN' | 'OUT') => {
    const typed = sorted.filter((m) => m.type === type);
    if (!typed.length) return null;
    const totalMov = typed.find((m) => parseOcMovementInfoFromNotes(m.notes)?.split === 'TOTAL');
    return totalMov ?? typed[0];
  };

  return pickBestForType(latest.type) ?? latest;
}

function buildOcListDeliveryStatusFromMovement(mov: StockMovementForOcTag): OcMovementTag {
  const split = parseOcMovementInfoFromNotes(mov.notes)?.split || 'TOTAL';
  const isPartial = split === 'PARCIAL';

  if (mov.type === 'IN') {
    return {
      label: isPartial ? 'Recebido parcial' : 'Recebido',
      title: isPartial ? 'Recebida parcialmente no estoque' : 'Recebida totalmente no estoque',
      badgeKey: isPartial ? 'received_partial' : 'received',
    };
  }

  return {
    label: isPartial ? 'Obra parcial' : 'Na obra',
    title: isPartial ? 'Enviado parcialmente para a obra' : 'Enviado totalmente para a obra',
    badgeKey: isPartial ? 'site_partial' : 'site',
  };
}

function parseAttachmentTagFromLine(
  line: string,
  keyPrefix: string,
  labelPrefix: string,
  colorClass: string
): OcMovementAttachmentTag | null {
  const match = line.match(/^(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i);
  if (!match?.[1] || !match?.[2]) return null;
  const name = match[1].trim();
  const url = match[2].trim();
  if (!name || !url) return null;
  return {
    key: `${keyPrefix}-${name}-${url}`,
    label: `${labelPrefix}: ${name}`,
    colorClass,
    url
  };
}

function parseOcAttachmentTagsFromNotes(notes?: string | null): OcMovementAttachmentTag[] {
  const text = movementNotesText(notes);
  if (!text) return [];
  const tags: OcMovementAttachmentTag[] = [];
  const detailHint = 'Dados completos nos detalhes da OC';

  const nfMatch = text.match(/NF:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)/i);
  if (nfMatch?.[1] && nfMatch?.[2]) {
    const url = nfMatch[2].trim();
    tags.push({
      key: `nf-${url}`,
      label: 'NF 1',
      colorClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      url,
      titleHint: detailHint
    });
  }

  const withdrawalMatch = text.match(/Ficha de Retirada:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)/i);
  if (withdrawalMatch?.[1] && withdrawalMatch?.[2]) {
    const url = withdrawalMatch[2].trim();
    tags.push({
      key: `withdrawal-${url}`,
      label: 'Ficha 1',
      colorClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      url,
      titleHint: detailHint
    });
  }

  const boletoSection = text.match(/Boletos:\s*([\s\S]*)/i)?.[1] || '';
  if (boletoSection) {
    const lines = boletoSection
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    lines.forEach((line, idx) => {
      const n = idx + 1;
      const normalized = line.replace(/^\d+\)\s*/, '');
      const full = normalized.match(
        /^(.*?)\s*\|\s*Valor:\s*(.*?)\s*\|\s*Vencimento:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i
      );
      if (full?.[4]) {
        const url = full[4].trim();
        tags.push({
          key: `boleto-${url}-${n}`,
          label: `boleto ${n}`,
          colorClass: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
          url,
          titleHint: detailHint
        });
        return;
      }
      const simple = normalized.match(/^(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i);
      if (simple?.[2]) {
        const url = simple[2].trim();
        tags.push({
          key: `boleto-${url}-${n}`,
          label: `boleto ${n}`,
          colorClass: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
          url,
          titleHint: detailHint
        });
      }
    });
  }

  return tags;
}

function parseStockMovementAttachmentsFromNotes(notes?: string | null): StockMovementAttachmentBundle {
  const bundle: StockMovementAttachmentBundle = {
    nf: null,
    withdrawalSheet: null,
    paymentSlips: []
  };
  const text = movementNotesText(notes);
  if (!text) return bundle;

  const nfMatch = text.match(/NF:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)/i);
  if (nfMatch?.[1] && nfMatch?.[2]) {
    bundle.nf = { name: nfMatch[1].trim(), url: nfMatch[2].trim() };
  }

  const withdrawalMatch = text.match(/Ficha de Retirada:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)/i);
  if (withdrawalMatch?.[1] && withdrawalMatch?.[2]) {
    bundle.withdrawalSheet = { name: withdrawalMatch[1].trim(), url: withdrawalMatch[2].trim() };
  }

  const boletoSection = text.match(/Boletos:\s*([\s\S]*)/i)?.[1] || '';
  if (boletoSection) {
    boletoSection
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const normalized = line.replace(/^\d+\)\s*/, '');
        const full = normalized.match(
          /^(.*?)\s*\|\s*Valor:\s*(.*?)\s*\|\s*Vencimento:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i
        );
        if (full?.[1] && full?.[4]) {
          bundle.paymentSlips.push({
            name: full[1].trim(),
            amount: full[2]?.trim() || '',
            dueDate: full[3]?.trim() || '',
            url: full[4].trim()
          });
          return;
        }
        const fallback = parseAttachmentTagFromLine(normalized, 'boleto', 'Boleto', '');
        if (fallback?.url) {
          bundle.paymentSlips.push({
            name: fallback.label.replace(/^Boleto:\s*/i, '').trim(),
            url: fallback.url
          });
        }
      });
  }

  return bundle;
}

function OcDetailField({
  label,
  children,
  className = ''
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100 break-words">{children}</dd>
    </div>
  );
}

function OcDetailSection({
  title,
  description,
  children,
  className = ''
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/25 p-4 space-y-3 ${className}`}
    >
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function OcDetailDocRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-2.5 border-b border-gray-200/80 dark:border-gray-700/80 last:border-0 last:pb-0 first:pt-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 sm:w-48">{label}</span>
      <div className="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-200">{children}</div>
    </div>
  );
}

type OcStockMovementBatch = NonNullable<PurchaseOrder['stockReceipt']>['batches'][number];

function OcStockMovementHistoryList({
  title,
  movementLabel,
  batches
}: {
  title: string;
  movementLabel: string;
  batches: OcStockMovementBatch[];
}) {
  if (batches.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{title}</p>
      {batches.map((batch, batchIdx) => (
        <div
          key={`${batch.createdAt}-${batchIdx}`}
          className="rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 px-3 py-2 text-xs sm:text-sm"
        >
          <p className="text-gray-700 dark:text-gray-300">
            <span className="font-medium">{movementLabel}</span> em{' '}
            {new Date(batch.createdAt).toLocaleString('pt-BR')}
            {batch.split ? (
              <span className="ml-1 text-gray-500 dark:text-gray-400">({batch.split})</span>
            ) : null}
            <span className="text-gray-500 dark:text-gray-400"> — {batch.userName}</span>
          </p>
          <ul className="mt-1.5 space-y-0.5 text-gray-600 dark:text-gray-400">
            {batch.items.map((item, itemIdx) => (
              <li key={`${item.materialName}-${itemIdx}`}>
                {item.materialName}:{' '}
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {item.quantity.toLocaleString('pt-BR')}
                </span>{' '}
                {item.unit}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function materialLineLabel(
  m?:
    | NonNullable<PurchaseOrder['items']>[number]['material']
    | {
        name?: string | null;
        description?: string | null;
        sinapiCode?: string | null;
      }
) {
  if (!m) return '—';
  const d = m.description?.trim();
  const n = m.name?.trim();
  if (d) return d;
  if (n) return n;
  if (m.sinapiCode) return m.sinapiCode;
  return '—';
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function totalOrder(items?: { totalPrice: number }[] | null) {
  return (items ?? []).reduce((s, i) => s + Number(i.totalPrice), 0);
}

function OcOrderMaterialsTable({ order }: { order: PurchaseOrder }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-gray-50 dark:bg-gray-700/50">
          <tr className="text-left">
            <th className="p-2.5 font-medium text-gray-700 dark:text-gray-300">Material</th>
            <th className="p-2.5 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Qtd</th>
            <th className="p-2.5 font-medium text-gray-700 dark:text-gray-300 text-center whitespace-nowrap">Un.</th>
            <th className="p-2.5 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Unitário</th>
            <th className="p-2.5 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
          {order.items?.map((line, idx) => (
            <tr key={idx} className="text-gray-600 dark:text-gray-400">
              <td className="p-2.5 align-top max-w-[220px] sm:max-w-none">{materialLineLabel(line.material)}</td>
              <td className="p-2.5 text-right whitespace-nowrap align-top">{Number(line.quantity)}</td>
              <td className="p-2.5 text-center whitespace-nowrap align-top">{line.unit || '—'}</td>
              <td className="p-2.5 text-right whitespace-nowrap align-top">{formatCurrency(Number(line.unitPrice))}</td>
              <td className="p-2.5 text-right whitespace-nowrap align-top font-medium text-gray-900 dark:text-gray-100">
                {formatCurrency(Number(line.totalPrice))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-600">
          <tr>
            <td colSpan={4} className="p-2.5 text-right font-medium text-gray-700 dark:text-gray-300">
              Total dos itens
            </td>
            <td className="p-2.5 text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
              {formatCurrency(totalOrder(order.items))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  PENDING_COMPRAS: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PENDING_DIRETORIA: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300',
  IN_REVIEW: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  PENDING_PROOF_VALIDATION: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  PENDING_PROOF_CORRECTION: 'bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-200',
  PENDING_NF_ATTACHMENT: 'bg-teal-100 text-teal-900 dark:bg-teal-900/30 dark:text-teal-300',
  SENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  FINALIZED: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/35 dark:text-indigo-200',
  PARTIALLY_RECEIVED: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  RECEIVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
};

export type OcTab =
  | 'compras'
  | 'gestor'
  | 'diretoria'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'ATTACH_BOLETO'
  | 'PROOF_VALIDATION'
  | 'PROOF_CORRECTION'
  | 'ATTACH_NF'
  | 'FINALIZADAS'
  | 'outras';

const ocListDocThCls =
  'px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[5.5rem]';
const ocListDocTdCls = 'px-3 sm:px-6 py-4 align-middle text-xs min-w-[5.5rem]';
const ocListDocCellInnerCls = 'flex w-full items-center justify-center text-center';

function ocListShowsDocumentColumns(tab: OcTab): boolean {
  return (
    tab === 'APPROVED' ||
    tab === 'PROOF_VALIDATION' ||
    tab === 'PROOF_CORRECTION' ||
    tab === 'FINALIZADAS'
  );
}

function ocListShowsComprovanteColumn(tab: OcTab): boolean {
  return tab === 'PROOF_VALIDATION' || tab === 'PROOF_CORRECTION';
}

function ocListShowsPaymentConditionColumn(tab: OcTab): boolean {
  return tab === 'PROOF_CORRECTION';
}

function ocListShowsInstallmentParcelColumn(tab: OcTab): boolean {
  return tab === 'APPROVED' || tab === 'PROOF_VALIDATION' || tab === 'ATTACH_BOLETO';
}

function ocListShowsInstallmentDueDateColumn(tab: OcTab): boolean {
  return tab === 'APPROVED';
}

function ocListShowsInstallmentAmountColumn(tab: OcTab): boolean {
  return tab === 'APPROVED';
}

function formatOcListPaymentCondition(
  order: Pick<PurchaseOrder, 'paymentType' | 'paymentCondition'>,
  labelMap: Record<string, string>
): string {
  if (order.paymentType === 'AVISTA') {
    return labelMap.AVISTA ?? 'À vista';
  }
  const code = (order.paymentCondition || '').trim();
  if (!code) return '—';
  return labelMap[code] ?? code;
}

function formatOcListCostCenter(
  costCenter?: { code?: string | null; name?: string | null } | null
): { display: string; title?: string } {
  if (!costCenter) return { display: '—' };
  const code = costCenter.code?.trim() ?? '';
  const name = costCenter.name?.trim() ?? '';
  if (code && name) return { display: name, title: `${code} — ${name}` };
  if (name) return { display: name };
  if (code) return { display: code };
  return { display: '—' };
}

function ocListInstallmentMode(tab: OcTab): OcListInstallmentMode | undefined {
  if (tab === 'ATTACH_BOLETO') return 'attach-boleto';
  if (tab === 'APPROVED') return 'payment';
  if (tab === 'PROOF_VALIDATION' || tab === 'PROOF_CORRECTION') return 'proof-validation';
  return undefined;
}

function ocListShowsAttachBoletoStatusColumn(tab: OcTab): boolean {
  return tab === 'ATTACH_BOLETO';
}

function ocListShowsBoletoColumn(tab: OcTab): boolean {
  return tab === 'APPROVED' || tab === 'PROOF_VALIDATION' || tab === 'PROOF_CORRECTION';
}

function ocListShowsParcelasColumn(tab: OcTab): boolean {
  return tab === 'FINALIZADAS';
}

function ocListShowsNfColumn(tab: OcTab): boolean {
  return tab === 'FINALIZADAS' || tab === 'ATTACH_NF';
}

function ocListShowsPaymentStatusColumn(tab: OcTab): boolean {
  return tab === 'APPROVED';
}

function ocListShowsOrderGrandTotalColumn(tab: OcTab): boolean {
  return tab !== 'APPROVED';
}

function ocListShowsOrderDateColumn(tab: OcTab): boolean {
  return (
    tab !== 'APPROVED' &&
    tab !== 'PROOF_VALIDATION' &&
    tab !== 'PROOF_CORRECTION'
  );
}

function canUserAttachNfOnOrder(order: PurchaseOrder, _currentUserId?: string | null): boolean {
  return (
    order.status === 'PENDING_NF_ATTACHMENT' &&
    parseOcNfAttachments(order.nfAttachments).length === 0
  );
}

function canUserFinalizeOcWithNf(order: PurchaseOrder, _currentUserId?: string | null): boolean {
  return (
    order.status === 'PENDING_NF_ATTACHMENT' &&
    parseOcNfAttachments(order.nfAttachments).length > 0
  );
}

function canUserManageNfOnOrder(order: PurchaseOrder): boolean {
  return order.status === 'PENDING_NF_ATTACHMENT';
}

function OcListDownloadIconLink({
  url,
  fileName,
  label = 'Baixar arquivo'
}: {
  url: string;
  fileName: string;
  label?: string;
}) {
  const name = fileName.trim() || 'arquivo';
  return (
    <a
      href={absoluteUploadUrl(url)}
      target="_blank"
      rel="noopener noreferrer"
      title={name}
      aria-label={`${label}: ${name}`}
      className="inline-flex rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
      onClick={(e) => e.stopPropagation()}
    >
      <Download className="h-5 w-5 shrink-0" />
    </a>
  );
}

function OcListDeliveryStatusCellContent({
  movement,
  orderStatus,
}: {
  movement: StockMovementForOcTag | null | undefined;
  orderStatus?: string;
}) {
  if (orderStatus === 'REJECTED' || orderStatus === 'CANCELLED') {
    return (
      <span className={ocDeliveryStatusBadgeClass('cancelled')}>Cancelado</span>
    );
  }

  if (!movement) {
    return <span className={ocDeliveryStatusBadgeClass('pending')}>Pendente</span>;
  }

  const tag = buildOcListDeliveryStatusFromMovement(movement);
  return (
    <span className={ocDeliveryStatusBadgeClass(tag.badgeKey)} title={tag.title}>
      {tag.label}
    </span>
  );
}

function OcListAttachBoletoStatusCellContent({ order }: { order: PurchaseOrder }) {
  const pillBase =
    'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap';

  if (canSendCurrentBoletoToPayment(order) && order.paymentBoletoPhaseReleased !== true) {
    return (
      <span
        className={`${pillBase} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200`}
      >
        Pronto p/ envio
      </span>
    );
  }
  return (
    <span
      className={`${pillBase} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`}
    >
      Aguardando boleto
    </span>
  );
}

function OcListInstallmentParcelCellContent({
  order,
  installmentMode,
}: {
  order: PurchaseOrder;
  installmentMode?: OcListInstallmentMode;
}) {
  if (!isOcBoletoPaymentType(order.paymentType)) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }

  const parcelCount = order.paymentParcelCount ?? 1;
  const idx = installmentMode
    ? listInstallmentIndex(order, installmentMode)
    : visiblePaymentBoletoInstallmentIndex(order);

  if (idx == null) {
    if (parcelCount <= 1 && effectivePaymentBoletoUrl(order)) {
      return <span className="font-medium text-gray-800 dark:text-gray-200 tabular-nums">1/1</span>;
    }
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }

  return (
    <span className="font-medium text-gray-800 dark:text-gray-200 tabular-nums">
      {idx + 1}/{parcelCount}
    </span>
  );
}

function resolvePaymentListInstallmentValues(
  order: PurchaseOrder,
  installmentMode?: OcListInstallmentMode,
  financialEntries?: FinancialControlEntry[],
): { amount: number | null; dueDate: string | null } {
  if (isOcBoletoPaymentType(order.paymentType)) {
    const mode = installmentMode ?? 'payment';
    const parcelCount = order.paymentParcelCount ?? 1;
    let row = listInstallmentRow(order, mode);
    if (!row && parcelCount <= 1 && effectivePaymentBoletoUrl(order)) {
      const rows = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
      row = rows[0] ?? null;
    }
    const amount =
      row && Number.isFinite(row.amount) && row.amount > 0 ? row.amount : null;
    const dueRaw = (row?.dueDate || '').trim();
    let dueDate = dueRaw ? dueRaw.slice(0, 10) : null;

    if ((amount == null || !dueDate) && financialEntries?.length) {
      const idx = listInstallmentIndex(order, mode);
      const parcelLabel =
        idx != null && parcelCount > 1 ? `${idx + 1}/${parcelCount}` : '1/1';
      const entry =
        financialEntries.find((e) => (e.parcelNumber || '').trim() === parcelLabel) ??
        financialEntries.find(
          (e) => e.status !== 'PAGO' && e.status !== 'PROCESSO_COMPLETO',
        ) ??
        financialEntries[0];
      if (entry) {
        if (amount == null) {
          const value = entry.finalValue ?? entry.originalValue;
          const num = value != null && value !== '' ? Number(value) : NaN;
          if (Number.isFinite(num) && num > 0) return { amount: num, dueDate: dueDate || entry.dueDate?.slice(0, 10) || null };
        }
        if (!dueDate && entry.dueDate) dueDate = entry.dueDate.slice(0, 10);
      }
    }

    if (amount != null || dueDate) return { amount, dueDate };
  }

  if (financialEntries?.length) {
    const entry =
      financialEntries.find(
        (e) => e.status !== 'PAGO' && e.status !== 'PROCESSO_COMPLETO',
      ) ?? financialEntries[0];
    const value = entry.finalValue ?? entry.originalValue;
    const num = value != null && value !== '' ? Number(value) : NaN;
    const amount = Number.isFinite(num) && num > 0 ? num : orderGrandTotal(order);
    const dueDate = entry.dueDate?.slice(0, 10) || null;
    return { amount: amount > 0 ? amount : null, dueDate };
  }

  const ocTotal = orderGrandTotal(order);
  return { amount: ocTotal > 0 ? ocTotal : null, dueDate: null };
}

function formatInstallmentDueDateLabel(dueDate: string | null): string {
  if (!dueDate) return '—';
  const date = new Date(`${dueDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function isOcDueDateInPaymentFilterRange(
  dueDate: string | null,
  filters: { dueDateFrom: string; dueDateTo: string },
): boolean {
  if (!dueDate) return false;
  const normalized = dueDate.slice(0, 10);
  if (filters.dueDateFrom && normalized < filters.dueDateFrom) return false;
  if (filters.dueDateTo && normalized > filters.dueDateTo) return false;
  return true;
}

function OcListInstallmentDueDateCellContent({
  order,
  installmentMode,
  financialEntries,
}: {
  order: PurchaseOrder;
  installmentMode?: OcListInstallmentMode;
  financialEntries?: FinancialControlEntry[];
}) {
  const { dueDate } = resolvePaymentListInstallmentValues(
    order,
    installmentMode,
    financialEntries,
  );
  return (
    <span className="font-medium text-gray-800 dark:text-gray-200 tabular-nums whitespace-nowrap">
      {formatInstallmentDueDateLabel(dueDate)}
    </span>
  );
}

function OcListInstallmentAmountCellContent({
  order,
  installmentMode,
  financialEntries,
}: {
  order: PurchaseOrder;
  installmentMode?: OcListInstallmentMode;
  financialEntries?: FinancialControlEntry[];
}) {
  const { amount } = resolvePaymentListInstallmentValues(
    order,
    installmentMode,
    financialEntries,
  );
  if (amount == null) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }
  return (
    <span className="font-medium text-gray-800 dark:text-gray-200 tabular-nums whitespace-nowrap">
      {amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
    </span>
  );
}

function OcListBoletoCellContent({
  order,
  singleInstallmentMode,
}: {
  order: PurchaseOrder;
  singleInstallmentMode?: OcListInstallmentMode;
}) {
  if (!isOcBoletoPaymentType(order.paymentType)) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }

  const parcelCount = order.paymentParcelCount ?? 1;
  if (parcelCount > 1) {
    const inst = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
    const visibleIdx = singleInstallmentMode ? listInstallmentIndex(order, singleInstallmentMode) : null;
    const indices =
      visibleIdx != null
        ? [visibleIdx]
        : Array.from({ length: parcelCount }, (_, idx) => idx);
    return (
      <div className="mx-auto flex max-w-[11rem] flex-col items-center gap-1 text-center">
        {indices.map((idx) => {
          const row = inst[idx];
          const st = rowStatus(row);
          if (singleInstallmentMode && visibleIdx == null) {
            return (
              <span key={idx} className="text-[11px] text-gray-400 dark:text-gray-500">
                —
              </span>
            );
          }
          return (
            <div key={idx} className="text-[11px] leading-tight text-gray-700 dark:text-gray-300 space-y-0.5">
              <div>
                {!singleInstallmentMode ? (
                  <>
                    <span className="text-gray-500 dark:text-gray-400 font-medium">{romanParcelLabel(idx)}:</span>{' '}
                  </>
                ) : null}
                {st === 'PAID' ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {installmentStatusLabel(st)}
                  </span>
                ) : (row?.boletoUrl || '').trim() ? (
                  <OcListDownloadIconLink
                    url={row.boletoUrl || ''}
                    fileName={row.boletoName?.trim() || `Boleto ${romanParcelLabel(idx)}`}
                    label="Baixar boleto"
                  />
                ) : st === 'AWAITING_PAYMENT' ? (
                  <span className="text-amber-700 dark:text-amber-300 font-medium">
                    {installmentStatusLabel(st)}
                  </span>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">—</span>
                )}
              </div>
              {!singleInstallmentMode && (Number.isFinite(row?.amount) || row?.dueDate) ? (
                <div className="text-[10px] text-gray-500 dark:text-gray-400">
                  {Number.isFinite(row?.amount)
                    ? row.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : null}
                  {Number.isFinite(row?.amount) && row?.dueDate ? ' · ' : null}
                  {row?.dueDate
                    ? new Date(`${row.dueDate}T12:00:00`).toLocaleDateString('pt-BR')
                    : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  const boletoUrl = effectivePaymentBoletoUrl(order);
  if (boletoUrl) {
    return (
      <OcListDownloadIconLink
        url={boletoUrl}
        fileName={effectivePaymentBoletoName(order)}
        label="Baixar boleto"
      />
    );
  }

  return <span className="text-gray-400 dark:text-gray-500">Não anexado</span>;
}

function OcListParcelasCellContent({ order }: { order: PurchaseOrder }) {
  if (!isOcBoletoPaymentType(order.paymentType)) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }

  const parcelCount = order.paymentParcelCount ?? 1;
  const inst = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
  const summary = Array.from({ length: parcelCount }, (_, idx) => {
    const row = inst[idx];
    const st = rowStatus(row);
    const amount = Number.isFinite(row?.amount)
      ? row.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : null;
    const due = row?.dueDate
      ? new Date(`${row.dueDate}T12:00:00`).toLocaleDateString('pt-BR')
      : null;
    const details = [amount, due].filter(Boolean).join(' · ');
    return details
      ? `${romanParcelLabel(idx)}: ${installmentStatusLabel(st)} · ${details}`
      : `${romanParcelLabel(idx)}: ${installmentStatusLabel(st)}`;
  }).join('\n');

  return (
    <span
      className="text-sm font-medium text-gray-800 dark:text-gray-200 tabular-nums"
      title={summary || undefined}
    >
      {parcelCount}
    </span>
  );
}

function OcListComprovanteCellContent({
  order,
  proofValidationOnly = false,
}: {
  order: PurchaseOrder;
  proofValidationOnly?: boolean;
}) {
  const proofUrl = (order.paymentProofUrl || '').trim();
  if (proofUrl && !proofValidationOnly) {
    return (
      <OcListDownloadIconLink
        url={proofUrl}
        fileName={order.paymentProofName?.trim() || 'Comprovante pagamento'}
        label="Baixar comprovante"
      />
    );
  }

  const parcelCount = order.paymentParcelCount ?? 1;
  if (parcelCount > 1 && order.paymentType === 'BOLETO') {
    const inst = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
    if (proofValidationOnly) {
      const idx = proofValidationInstallmentIndex(order);
      if (idx != null) {
        const row = inst[idx];
        const url = (row?.installmentProofUrl || '').trim();
        if (url) {
          return (
            <OcListDownloadIconLink
              url={url}
              fileName={row.installmentProofName?.trim() || `Comprovante ${romanParcelLabel(idx)}`}
              label="Baixar comprovante"
            />
          );
        }
      }
    } else {
      const withProof = inst
        .map((row, idx) => ({ row, idx }))
        .filter(({ row }) => (row.installmentProofUrl || '').trim());
      if (withProof.length > 0) {
        return (
          <div className="mx-auto flex max-w-[11rem] flex-col items-center gap-1 text-center">
            {withProof.map(({ row, idx }) => (
              <div key={idx} className="text-[11px] leading-tight">
                <span className="text-gray-500 dark:text-gray-400 font-medium">{romanParcelLabel(idx)}:</span>{' '}
                <OcListDownloadIconLink
                  url={row.installmentProofUrl || ''}
                  fileName={row.installmentProofName?.trim() || `Comprovante ${romanParcelLabel(idx)}`}
                  label="Baixar comprovante"
                />
              </div>
            ))}
          </div>
        );
      }
    }
  }

  if (proofUrl) {
    return (
      <OcListDownloadIconLink
        url={proofUrl}
        fileName={order.paymentProofName?.trim() || 'Comprovante pagamento'}
        label="Baixar comprovante"
      />
    );
  }

  const fromLast = lastPaidInstallmentProofUrl(order);
  if (fromLast) {
    return (
      <OcListDownloadIconLink
        url={fromLast.url}
        fileName={fromLast.name || 'Comprovante pagamento'}
        label="Baixar comprovante"
      />
    );
  }

  return <span className="text-gray-400 dark:text-gray-500">Não anexado</span>;
}

function OcListNfCellContent({ order }: { order: PurchaseOrder }) {
  const nfs = parseOcNfAttachments(order.nfAttachments);
  if (nfs.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }
  if (nfs.length === 1) {
    return (
      <OcListDownloadIconLink
        url={nfs[0].url}
        fileName={nfs[0].name?.trim() || 'Nota fiscal'}
        label="Baixar NF"
      />
    );
  }
  return (
    <div className="mx-auto flex max-w-[11rem] flex-col items-center gap-1 text-center">
      {nfs.map((nf, idx) => (
        <div key={`${nf.url}-${idx}`} className="inline-flex items-center justify-center gap-1">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{idx + 1}:</span>
          <OcListDownloadIconLink
            url={nf.url}
            fileName={nf.name?.trim() || `NF ${idx + 1}`}
            label="Baixar NF"
          />
        </div>
      ))}
    </div>
  );
}

export type OcPurchaseOrdersPanelProps = {
  /** Quando true, painel integrado ao fluxo SC/RM (mesma página). */
  embedded?: boolean;
  /** Esconde a barra de abas interna (abas unificadas na página pai). */
  hideTabs?: boolean;
  /** Aba OC ativa quando `hideTabs` (controlado pelo pai). */
  activeTab?: OcTab;
  /** Busca textual aplicada na listagem de OCs. */
  searchTerm?: string;
  /** Quando informado, exibe o campo de busca no cabeçalho do card (modo integrado). */
  onSearchChange?: (value: string) => void;
  /** Busca global no pai — oculta o campo duplicado no card. */
  hideSearch?: boolean;
  /** Card colado às abas do fluxo (sem borda/sombra superior). */
  flushInCard?: boolean;
  /**
   * Fase gestor na tela de Aprovações: limita OCs ao centro de custo dos contratos do gestor.
   * `undefined` = sem filtro (admin). `[]` = nenhum contrato vinculado.
   */
  gestorCostCenterIds?: string[];
  /** Habilita aprovar/reprovar/correção nas fases Compras, Gestor e Diretoria (tela de Aprovações). */
  allowApprovalActions?: boolean;
};

const normalizeOcSearch = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const EMBEDDED_OC_TAB_META: Record<OcTab, { title: string; subtitle: string }> = {
  compras: {
    title: 'Aprovação Compras',
    subtitle: 'Ordens aguardando aprovação do setor de compras'
  },
  gestor: {
    title: 'Aprovação Gestor',
    subtitle: 'Ordens aguardando aprovação do gestor'
  },
  diretoria: {
    title: 'Aprovação Diretoria',
    subtitle: 'Ordens aguardando aprovação da diretoria'
  },
  IN_REVIEW: {
    title: 'Correção',
    subtitle: 'Ordens devolvidas para correção antes de seguir no fluxo'
  },
  APPROVED: {
    title: 'Pagamento',
    subtitle: 'Anexe comprovante, gere CNAB se necessário e envie para validação'
  },
  ATTACH_BOLETO: {
    title: 'Anexar Boleto',
    subtitle: 'OCs aprovadas em boleto aguardando anexo para pagamento'
  },
  PROOF_VALIDATION: {
    title: 'Validação Comprovante',
    subtitle: 'Comprovantes enviados aguardando validação do financeiro'
  },
  PROOF_CORRECTION: {
    title: 'Correção Comprovante',
    subtitle: 'Substitua o comprovante e reenvie para validação'
  },
  ATTACH_NF: {
    title: 'Anexar NF',
    subtitle: 'Após comprovante validado, anexe a nota fiscal e finalize'
  },
  FINALIZADAS: {
    title: 'Finalizadas',
    subtitle: 'Histórico de ordens que concluíram o fluxo'
  },
  outras: {
    title: 'Canceladas',
    subtitle: 'Ordens canceladas ou reprovadas'
  }
};

const OC_ACTION_MENU_WIDTH_PX = 224;
const OC_ACTION_MENU_MAX_HEIGHT_PX = 360;
const OC_ACTION_MENU_GAP_PX = 4;
const OC_ACTION_MENU_VIEWPORT_PAD_PX = 8;
const OC_ACTION_MENU_MIN_HEIGHT_PX = 96;

type OcActionMenuCoords = {
  top: number;
  left: number;
  maxHeight: number;
  placement: 'below' | 'above';
};

function computeOcActionMenuPosition(rect: DOMRect): OcActionMenuCoords {
  let left = rect.right - OC_ACTION_MENU_WIDTH_PX;
  left = Math.max(
    OC_ACTION_MENU_VIEWPORT_PAD_PX,
    Math.min(left, window.innerWidth - OC_ACTION_MENU_WIDTH_PX - OC_ACTION_MENU_VIEWPORT_PAD_PX)
  );

  const spaceBelow =
    window.innerHeight - rect.bottom - OC_ACTION_MENU_GAP_PX - OC_ACTION_MENU_VIEWPORT_PAD_PX;
  const spaceAbove = rect.top - OC_ACTION_MENU_GAP_PX - OC_ACTION_MENU_VIEWPORT_PAD_PX;

  if (spaceBelow >= OC_ACTION_MENU_MIN_HEIGHT_PX || spaceBelow >= spaceAbove) {
    return {
      top: rect.bottom + OC_ACTION_MENU_GAP_PX,
      left,
      maxHeight: Math.min(OC_ACTION_MENU_MAX_HEIGHT_PX, Math.max(spaceBelow, OC_ACTION_MENU_MIN_HEIGHT_PX)),
      placement: 'below'
    };
  }

  return {
    top: rect.top - OC_ACTION_MENU_GAP_PX,
    left,
    maxHeight: Math.min(OC_ACTION_MENU_MAX_HEIGHT_PX, Math.max(spaceAbove, OC_ACTION_MENU_MIN_HEIGHT_PX)),
    placement: 'above'
  };
}

const OC_MENU_ITEM_CLASS =
  'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700';

const OC_APPROVAL_FLOW_STATUSES = ['DRAFT', 'PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA'] as const;

export type OcApprovalListPhase = 'pending' | 'approved_by_me';

const OC_APPROVAL_TABS: OcTab[] = ['compras', 'gestor', 'diretoria'];

function isOcApprovalTab(tab: OcTab): boolean {
  return OC_APPROVAL_TABS.includes(tab);
}

function orderApprovedByUserAtTab(order: PurchaseOrder, tab: OcTab, userId: string): boolean {
  if (tab === 'compras') return order.comprasApprovedBy === userId;
  if (tab === 'gestor') return order.gestorApprovedBy === userId;
  if (tab === 'diretoria') return order.approvedBy === userId;
  return false;
}

export function OcStyledCheckbox({
  checked,
  onChange,
  ariaLabel,
  title
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <label
      className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center group"
      title={title}
    >
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
    </label>
  );
}

function embeddedOcEmptyMessage(
  tab: OcTab,
  hasSearch: boolean,
  approvalListPhase: OcApprovalListPhase,
  hasPaymentDueDateFilter = false,
): string {
  if (hasSearch) return 'Nenhuma ordem corresponde à busca nesta fase';
  if (hasPaymentDueDateFilter && tab === 'APPROVED') {
    return 'Nenhuma OC com vencimento no período selecionado';
  }
  if (approvalListPhase === 'approved_by_me') {
    return 'Nenhuma ordem que você tenha aprovado nesta fase.';
  }
  if (tab === 'FINALIZADAS') return 'Nenhuma OC finalizada com os filtros atuais';
  if (tab === 'ATTACH_BOLETO') return 'Nenhuma OC aguardando anexo de boleto';
  if (tab === 'PROOF_VALIDATION') return 'Nenhuma OC aguardando validação do comprovante';
  if (tab === 'PROOF_CORRECTION') return 'Nenhuma OC em correção do comprovante';
  if (tab === 'ATTACH_NF') return 'Nenhuma OC na fase de anexar NF';
  if (tab === 'compras') return 'Nenhuma ordem aguardando aprovação de compras';
  return 'Nenhuma ordem de compra nesta fase';
}

function approvalTabSubtitle(tab: OcTab, phase: OcApprovalListPhase): string {
  if (phase === 'approved_by_me') {
    return 'Ordens que você já aprovou nesta fase';
  }
  return EMBEDDED_OC_TAB_META[tab].subtitle;
}

export function OcPurchaseOrdersPanel({
  embedded = false,
  hideTabs = false,
  activeTab: activeTabProp,
  searchTerm = '',
  onSearchChange,
  hideSearch = false,
  flushInCard = false,
  gestorCostCenterIds,
  allowApprovalActions = false
}: OcPurchaseOrdersPanelProps) {
  const queryClient = useQueryClient();
  const {
    isAdministrator,
    canApproveOcCompras,
    canApproveOcGestor,
    canApproveOcDiretoria
  } = usePermissions();
  const canActOnOcApproval = (status: string) =>
    canActOnOcApprovalStatus(status, {
      isAdministrator,
      canApproveOcCompras,
      canApproveOcGestor,
      canApproveOcDiretoria
    });
  const showOcApprovalActions = (status: string) =>
    OC_APPROVAL_FLOW_STATUSES.includes(status as (typeof OC_APPROVAL_FLOW_STATUSES)[number]) &&
    canActOnOcApproval(status);
  const [approvalListPhase, setApprovalListPhase] = useState<OcApprovalListPhase>('pending');
  const [isApprovalFiltersModalOpen, setIsApprovalFiltersModalOpen] = useState(false);
  const [internalActiveTab, setInternalActiveTab] = useState<OcTab>('compras');
  const activeTab = hideTabs ? (activeTabProp ?? 'compras') : internalActiveTab;
  const setActiveTab = (t: OcTab) => {
    if (!hideTabs) setInternalActiveTab(t);
  };
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PurchaseOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [correctionTarget, setCorrectionTarget] = useState<PurchaseOrder | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [pdfExportingId, setPdfExportingId] = useState<string | null>(null);
  const [showEditOcModal, setShowEditOcModal] = useState(false);
  const [orderDetailLoadingId, setOrderDetailLoadingId] = useState<string | null>(null);
  const [cnabSelectedIds, setCnabSelectedIds] = useState<Set<string>>(() => new Set());
  const [cnabGenerating, setCnabGenerating] = useState(false);
  const [financialEntryOrder, setFinancialEntryOrder] = useState<PurchaseOrder | null>(null);
  const [ocActionMenu, setOcActionMenu] = useState<
    ({ orderId: string } & OcActionMenuCoords) | null
  >(null);
  const [proofFileDraft, setProofFileDraft] = useState<File | null>(null);
  const [financialEntryModalOpen, setFinancialEntryModalOpen] = useState(false);
  const [editingFinancialEntry, setEditingFinancialEntry] = useState<FinancialControlEntry | null>(null);
  const [nfFileDraft, setNfFileDraft] = useState<File | null>(null);
  const [installmentProofFileDraft, setInstallmentProofFileDraft] = useState<File | null>(null);
  const [installmentProofDraftByIdx, setInstallmentProofDraftByIdx] = useState<Record<number, File | null>>(
    {}
  );
  const [boletoParcelModalOrder, setBoletoParcelModalOrder] = useState<PurchaseOrder | null>(null);
  const [finalizedPage, setFinalizedPage] = useState(1);
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const [isFinalizedFiltersModalOpen, setIsFinalizedFiltersModalOpen] = useState(false);
  const [isPaymentDueFiltersModalOpen, setIsPaymentDueFiltersModalOpen] = useState(false);
  const [exportingFinalizedCsv, setExportingFinalizedCsv] = useState(false);
  const emptyFinalizedFilters = {
    orderDateFrom: '',
    orderDateTo: '',
    supplierId: '',
    costCenterId: ''
  };
  const emptyPaymentDueFilters = {
    dueDateFrom: '',
    dueDateTo: ''
  };
  const [finalizedFilters, setFinalizedFilters] = useState(emptyFinalizedFilters);
  const [paymentDueFilters, setPaymentDueFilters] = useState(emptyPaymentDueFilters);

  const effectiveSearchTerm = onSearchChange ? searchTerm : internalSearchTerm;
  const setEffectiveSearchTerm = (value: string) => {
    if (onSearchChange) onSearchChange(value);
    else setInternalSearchTerm(value);
  };

  const hasActiveFinalizedFilters = Boolean(
    finalizedFilters.orderDateFrom ||
      finalizedFilters.orderDateTo ||
      finalizedFilters.supplierId ||
      finalizedFilters.costCenterId
  );

  const hasActivePaymentDueFilters = Boolean(
    paymentDueFilters.dueDateFrom || paymentDueFilters.dueDateTo
  );

  const clearFinalizedFilters = () => {
    setFinalizedFilters(emptyFinalizedFilters);
    setFinalizedPage(1);
  };

  const clearPaymentDueFilters = () => {
    setPaymentDueFilters(emptyPaymentDueFilters);
  };

  useEffect(() => {
    if (activeTab !== 'APPROVED') {
      setCnabSelectedIds(new Set());
      clearPaymentDueFilters();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'FINALIZADAS') {
      setFinalizedPage(1);
    }
  }, [activeTab, effectiveSearchTerm, finalizedFilters]);

  useEffect(() => {
    setProofFileDraft(null);
    setNfFileDraft(null);
    setInstallmentProofFileDraft(null);
    setInstallmentProofDraftByIdx({});
  }, [selectedOrder?.id]);

  const [editOcForm, setEditOcForm] = useState<OcPurchaseOrderFormValues | null>(null);
  const [editSupplierSearch, setEditSupplierSearch] = useState('');

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
    const t = value.trim();
    if (!t) return null;
    const fromMask = parseCurrencyInputBr(t);
    if (fromMask !== null) return fromMask;
    const cleaned = t.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
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
  const currentUserId = userData?.data?.id as string | undefined;

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['purchase-orders', 'list-summary'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500, summary: '1' } });
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  const { data: selectedOrderFresh, isFetching: isFetchingOrderDetail } = useQuery({
    queryKey: ['purchase-order-detail', selectedOrder?.id],
    queryFn: async () => {
      const res = await api.get(`/purchase-orders/${selectedOrder!.id}`);
      return res.data?.data as PurchaseOrder | undefined;
    },
    enabled: !!selectedOrder?.id,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    if (!selectedOrderFresh || selectedOrderFresh.id !== selectedOrder?.id) return;
    setSelectedOrder((prev) => {
      if (!prev || prev.id !== selectedOrderFresh.id) return selectedOrderFresh;
      return {
        ...selectedOrderFresh,
        stockReceipt: prev.stockReceipt ?? selectedOrderFresh.stockReceipt
      };
    });
  }, [selectedOrderFresh, selectedOrder?.id]);

  const { data: selectedOrderStockReceipt, isFetching: isFetchingStockReceipt } = useQuery({
    queryKey: ['purchase-order-stock-receipt', selectedOrder?.id],
    queryFn: async () => {
      const res = await api.get(`/purchase-orders/${selectedOrder!.id}/stock-receipt`);
      return res.data?.data as PurchaseOrder['stockReceipt'];
    },
    enabled: !!selectedOrder?.id,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    if (!selectedOrder?.id || selectedOrderStockReceipt === undefined) return;
    setSelectedOrder((prev) => {
      if (!prev || prev.id !== selectedOrder.id) return prev;
      return { ...prev, stockReceipt: selectedOrderStockReceipt };
    });
  }, [selectedOrder?.id, selectedOrderStockReceipt]);

  const { data: stockMovementsData } = useQuery({
    queryKey: ['stock-movements-oc-tags', selectedOrder?.id],
    queryFn: async () => {
      const res = await api.get('/stock/movements', { params: { limit: 1000 } });
      return res.data;
    },
    // Só ao abrir detalhe — evita puxar 1000 movimentos em toda listagem
    enabled: !!selectedOrder?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false
  });

  const shouldTrackFinancialEntryForOc =
    !!selectedOrder?.orderNumber?.trim() &&
    (selectedOrder.status === 'APPROVED' || selectedOrder.status === 'PENDING_PROOF_CORRECTION');

  const { data: financialEntriesByOc = [], isFetching: financialEntriesLoading } = useQuery({
    queryKey: ['financial-control-by-oc', selectedOrder?.orderNumber],
    queryFn: async () => {
      const res = await api.get(
        `/financial-control/by-oc/${encodeURIComponent(selectedOrder!.orderNumber)}`
      );
      return (res.data?.data || []) as FinancialControlEntry[];
    },
    enabled: shouldTrackFinancialEntryForOc,
  });

  const hasFinancialEntryForOc = financialEntriesByOc.length > 0;

  const proofValidationBlockers = selectedOrder
    ? getProofValidationSubmitBlockers(selectedOrder, hasFinancialEntryForOc)
    : [];
  const canSubmitProofValidation =
    !!selectedOrder &&
    !financialEntriesLoading &&
    canSubmitProofValidationWithFinancialEntry(selectedOrder, hasFinancialEntryForOc);

  const approveMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const nextStatus = nextApprovalStatus(currentStatus);
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: nextStatus });
      return res.data;
    },
    onMutate: async ({ id, currentStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(queryClient, id, approvalOptimisticPatch(currentStatus, currentUserId));
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-approve-${id}`;
      if (currentStatus === 'PENDING_DIRETORIA') {
        toast.success('OC aprovada pela diretoria.', { id: toastId });
      } else if (currentStatus === 'PENDING') {
        toast.success('OC enviada para aprovação da diretoria.', { id: toastId });
      } else {
        toast.success('OC aprovada pelo compras e enviada para aprovação do gestor.', { id: toastId });
      }
      return { previous, toastId };
    },
    onSuccess: (data) => {
      const updated = data?.data as PurchaseOrder | undefined;
      if (updated?.id) {
        patchOcInListSummaryCache(queryClient, updated.id, (order) => ({
          ...order,
          status: updated.status ?? order.status,
          comprasApprovedBy: updated.comprasApprovedBy ?? order.comprasApprovedBy,
          gestorApprovedBy: updated.gestorApprovedBy ?? order.gestorApprovedBy,
          approvedBy: updated.approvedBy ?? order.approvedBy
        }));
      }
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (error: { response?: { data?: { message?: string } } }, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || 'Erro ao aprovar', {
        id: context?.toastId
      });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'REJECTED',
        rejectionReason: reason
      });
      return res.data;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(queryClient, id, { status: 'REJECTED' });
      setRejectTarget(null);
      setRejectReason('');
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-reject-${id}`;
      toast.success('Ordem de compra cancelada.', { id: toastId });
      return { previous, toastId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (error: { response?: { data?: { message?: string } } }, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || 'Erro ao cancelar', {
        id: context?.toastId
      });
    }
  });

  const openOcCorrectionModal = (order: PurchaseOrder) => {
    setCorrectionReason('');
    setCorrectionTarget(order);
  };

  const correctionOcMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'IN_REVIEW',
        rejectionReason: reason
      });
      return res.data;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(queryClient, id, { status: 'IN_REVIEW' });
      setCorrectionTarget(null);
      setCorrectionReason('');
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-correction-${id}`;
      toast.success('OC enviada para CORREÇÃO OC.', { id: toastId });
      return { previous, toastId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (error: { response?: { data?: { message?: string } } }, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || 'Erro ao enviar para correção', {
        id: context?.toastId
      });
    }
  });

  const resubmitOcMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'PENDING_COMPRAS' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      setSelectedOrder(null);
      toast.success('OC enviada para aprovação.');
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
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      const updatedOrder = resp?.data;
      if (updatedOrder) setSelectedOrder(updatedOrder);
      setShowEditOcModal(false);
      toast.success('OC atualizada com sucesso.');
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao atualizar OC')
  });

  const attachPaymentBoletoMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('boleto', file);
      const up = await api.post('/purchase-orders/upload-boleto', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      const res = await api.patch(`/purchase-orders/${id}/payment-boleto`, {
        paymentBoletoUrl: url,
        paymentBoletoName: originalName
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      toast.success('Boleto de pagamento anexado.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao anexar boleto')
  });

  const attachPaymentProofMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('proof', file);
      const up = await api.post('/purchase-orders/upload-payment-proof', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      const res = await api.patch(`/purchase-orders/${id}/payment-proof`, {
        paymentProofUrl: url,
        paymentProofName: originalName
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      const updated = resp?.data;
      if (updated) {
        setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      }
      setProofFileDraft(null);
      toast.success('Comprovante de pagamento anexado.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao anexar comprovante')
  });

  const reopenPaymentBoletoMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/reopen-payment-boleto`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      setSelectedOrder(null);
      toast.success('A OC voltou para a fase Anexar Boleto.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao reabrir fase de boleto')
  });

  const releasePaymentBoletoPhaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/release-payment-boleto-phase`);
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      const updated = resp?.data;
      if (updated) {
        setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
        setBoletoParcelModalOrder((prev) => (prev?.id === updated.id ? null : prev));
      }
      toast.success('OC enviada para a fase Pagamento.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao confirmar fase Pagamento')
  });

  const attachBoletoInstallmentProofMutation = useMutation({
    mutationFn: async ({
      id,
      file,
      installmentIndex
    }: {
      id: string;
      file: File;
      installmentIndex: number;
    }) => {
      const fd = new FormData();
      fd.append('proof', file);
      const up = await api.post('/purchase-orders/upload-payment-proof', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      const res = await api.patch(`/purchase-orders/${id}/payment-boleto-installment-proof`, {
        paymentProofUrl: url,
        paymentProofName: originalName,
        installmentIndex
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }, vars) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      if (vars?.installmentIndex != null) {
        setInstallmentProofDraftByIdx((prev) => {
          const next = { ...prev };
          delete next[vars.installmentIndex];
          return next;
        });
      }
      setInstallmentProofFileDraft(null);
      toast.success('Comprovante desta parcela anexado.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao anexar comprovante da parcela')
  });

  const returnAfterBoletoInstallmentPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/return-after-boleto-installment-paid`);
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      const updated = resp?.data;
      if (updated) setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
      toast.success('Próxima parcela liberada para o comprador anexar o boleto.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao registrar pagamento da parcela')
  });

  const submitProofValidationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'PENDING_PROOF_VALIDATION'
      });
      return res.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(queryClient, id, { status: 'PENDING_PROOF_VALIDATION' });
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-proof-submit-${id}`;
      toast.success('OC enviada para Validação Comprovante.', { id: toastId });
      return { previous, toastId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }, _v, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || error.message || 'Erro ao enviar para validação', {
        id: context?.toastId
      });
    }
  });

  const requestProofCorrectionMutation = useMutation({
    mutationFn: async ({ id, rejectionReason }: { id: string; rejectionReason?: string }) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, {
        status: 'PENDING_PROOF_CORRECTION',
        rejectionReason: rejectionReason?.trim() || undefined
      });
      return res.data;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(queryClient, id, { status: 'PENDING_PROOF_CORRECTION' });
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-proof-correction-${id}`;
      toast.success('OC enviada para correção do comprovante.', { id: toastId });
      return { previous, toastId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }, _v, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || error.message || 'Erro ao solicitar correção', {
        id: context?.toastId
      });
    }
  });

  const validateProofMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'PENDING_NF_ATTACHMENT' });
      return res.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(queryClient, id, { status: 'PENDING_NF_ATTACHMENT' });
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-proof-validate-${id}`;
      toast.success('Comprovante validado. A OC foi para a fase Anexar NF.', { id: toastId });
      return { previous, toastId };
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      const updated = resp?.data;
      if (updated?.id) {
        patchOcInListSummaryCache(queryClient, updated.id, (order) => ({
          ...order,
          status: updated.status ?? order.status
        }));
        if (updated.status === 'APPROVED') {
          toast.success('Comprovante validado. Prosiga com a próxima parcela na fase Pagamento.', {
            id: `oc-proof-validate-${updated.id}`
          });
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }, _v, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || error.message || 'Erro ao validar comprovante', {
        id: context?.toastId
      });
    }
  });

  const appendNfMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      const up = await api.post('/purchase-orders/upload-nf', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      const res = await api.patch(`/purchase-orders/${id}/nf-attachments`, {
        nfUrl: url,
        nfName: originalName
      });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      const updated = resp?.data;
      if (updated) {
        setSelectedOrder((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
        patchOcInListSummaryCache(queryClient, updated.id, (order) => ({
          ...order,
          nfAttachments: updated.nfAttachments ?? order.nfAttachments
        }));
      }
      setNfFileDraft(null);
      toast.success('Nota fiscal anexada.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao anexar NF')
  });

  const removeNfMutation = useMutation({
    mutationFn: async ({ id, index }: { id: string; index: number }) => {
      const res = await api.patch(`/purchase-orders/${id}/nf-attachments/remove`, { index });
      return res.data;
    },
    onSuccess: (resp: { data?: PurchaseOrder }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
      const updated = resp?.data;
      if (updated) {
        setSelectedOrder((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
        patchOcInListSummaryCache(queryClient, updated.id, (order) => ({
          ...order,
          nfAttachments: updated.nfAttachments ?? order.nfAttachments
        }));
      }
      toast.success('Nota fiscal removida.');
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(error.response?.data?.message || error.message || 'Erro ao remover NF')
  });

  const completeOcToFinalizedMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/purchase-orders/${id}/status`, { status: 'FINALIZED' });
      return res.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['purchase-orders', 'list-summary'] });
      const previous = queryClient.getQueryData<PurchaseOrdersListSummaryCache>([
        'purchase-orders',
        'list-summary'
      ]);
      patchOcInListSummaryCache(queryClient, id, { status: 'FINALIZED' });
      setSelectedOrder(null);
      setOcActionMenu(null);
      const toastId = `oc-finalize-${id}`;
      toast.success('OC finalizada. Ela aparece na aba Finalizadas.', { id: toastId });
      return { previous, toastId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }, _v, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['purchase-orders', 'list-summary'], context.previous);
      }
      toast.error(error.response?.data?.message || error.message || 'Erro ao finalizar OC', {
        id: context?.toastId
      });
    }
  });

  const allOrders: PurchaseOrder[] = ordersData?.data || [];
  const stockMovementsForOcTag: StockMovementForOcTag[] = stockMovementsData?.data || [];

  const latestOcMovementByOrderNumber = useMemo(() => {
    const grouped = new Map<string, StockMovementForOcTag[]>();

    stockMovementsForOcTag.forEach((mov) => {
      const parsed = parseOcMovementInfoFromNotes(mov.notes);
      if (!parsed?.ocNumber) return;

      const key = normalizeOcNumberKey(parsed.ocNumber);
      const list = grouped.get(key) || [];
      list.push(mov);
      grouped.set(key, list);
    });

    const latestByOc = new Map<string, StockMovementForOcTag>();
    grouped.forEach((movs, key) => {
      const picked = pickRepresentativeOcMovement(movs);
      if (picked) latestByOc.set(key, picked);
    });

    return latestByOc;
  }, [stockMovementsForOcTag]);

  const selectedOrderLatestStockMovement = useMemo(
    () =>
      selectedOrder
        ? latestOcMovementByOrderNumber.get(normalizeOcNumberKey(selectedOrder.orderNumber)) || null
        : null,
    [selectedOrder, latestOcMovementByOrderNumber]
  );

  const selectedOrderStockAttachments = useMemo(
    () => parseStockMovementAttachmentsFromNotes(selectedOrderLatestStockMovement?.notes),
    [selectedOrderLatestStockMovement]
  );

  const selectedOrderInFinancialLaunchPhase = selectedOrder
    ? isOcInFinancialLaunchPhase(selectedOrder)
    : false;

  const tabCounts = useMemo(() => computeOcTabCounts(allOrders), [allOrders]);

  const { data: paymentConditionRows } = useQuery({
    queryKey: ['payment-conditions', 'all-labels'],
    queryFn: async () => {
      const res = await api.get('/payment-conditions', { params: { activeOnly: 'false' } });
      return res.data?.data || [];
    }
  });

  const paymentConditionLabelMap = useMemo(
    () => buildPaymentConditionLabelMap(paymentConditionRows, OC_PAYMENT_CONDITION_LABELS),
    [paymentConditionRows]
  );

  const showApprovalPhaseFilter = isOcApprovalTab(activeTab);

  useEffect(() => {
    setApprovalListPhase('pending');
  }, [activeTab]);

  const showListApprovalActions = (status: string) =>
    allowApprovalActions &&
    isOcApprovalTab(activeTab) &&
    approvalListPhase === 'pending' &&
    showOcApprovalActions(status);

  const orders = useMemo(() => {
    if (activeTab === 'compras') {
      if (approvalListPhase === 'approved_by_me' && currentUserId) {
        return allOrders.filter((o) => orderApprovedByUserAtTab(o, 'compras', currentUserId));
      }
      return allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT');
    }
    if (activeTab === 'gestor') {
      let list: PurchaseOrder[];
      if (approvalListPhase === 'approved_by_me' && currentUserId) {
        list = allOrders.filter((o) => orderApprovedByUserAtTab(o, 'gestor', currentUserId));
      } else {
        list = allOrders.filter((o) => o.status === 'PENDING');
      }
      if (gestorCostCenterIds !== undefined) {
        const allowed = new Set(gestorCostCenterIds);
        list = list.filter((o) => {
          const ccId = o.materialRequest?.costCenter?.id;
          return ccId ? allowed.has(ccId) : false;
        });
      }
      return list;
    }
    if (activeTab === 'diretoria') {
      if (approvalListPhase === 'approved_by_me' && currentUserId) {
        return allOrders.filter((o) => orderApprovedByUserAtTab(o, 'diretoria', currentUserId));
      }
      return allOrders.filter((o) => o.status === 'PENDING_DIRETORIA');
    }
    if (activeTab === 'IN_REVIEW') {
      return allOrders.filter((o) => o.status === 'IN_REVIEW');
    }
    if (activeTab === 'APPROVED') {
      return allOrders.filter((o) => o.status === 'APPROVED' && !showInAttachBoletoTab(o));
    }
    if (activeTab === 'ATTACH_BOLETO') {
      return allOrders.filter((o) => showInAttachBoletoTab(o));
    }
    if (activeTab === 'PROOF_VALIDATION') {
      return allOrders.filter((o) => o.status === 'PENDING_PROOF_VALIDATION');
    }
    if (activeTab === 'PROOF_CORRECTION') {
      return allOrders.filter((o) => o.status === 'PENDING_PROOF_CORRECTION');
    }
    if (activeTab === 'ATTACH_NF') {
      return allOrders.filter((o) => o.status === 'PENDING_NF_ATTACHMENT');
    }
    if (activeTab === 'outras') {
      return allOrders.filter((o) => o.status === 'REJECTED' || o.status === 'CANCELLED');
    }
    return allOrders;
  }, [allOrders, activeTab, gestorCostCenterIds, approvalListPhase, currentUserId]);

  const filteredOrdersBySearch = useMemo(() => {
    const normalizedSearchTerm = normalizeOcSearch(searchTerm);
    const base =
      !normalizedSearchTerm
        ? orders
        : orders.filter((order) => {
            const searchableParts = [
              order.orderNumber,
              order.status,
              order.materialRequest?.requestNumber,
              order.materialRequest?.serviceOrder,
              order.materialRequest?.description,
              order.materialRequest?.costCenter?.code,
              order.materialRequest?.costCenter?.name,
              order.supplier?.name,
              order.supplier?.code,
              order.creator?.name
            ];

            return searchableParts.some((part) =>
              normalizeOcSearch(part).includes(normalizedSearchTerm)
            );
          });

    return sortPurchaseOrdersByMostRecent(base);
  }, [orders, searchTerm]);

  const { data: finalizedTotal = 0 } = useQuery({
    queryKey: ['purchase-orders', 'finalized-total'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', {
        params: { status: 'FINALIZED,SENT', page: 1, limit: 1 }
      });
      return Number(res.data?.pagination?.total ?? 0);
    },
    staleTime: 30_000
  });

  const { data: finalizedListResponse, isFetching: finalizedListFetching } = useQuery({
    queryKey: ['purchase-orders', 'finalized-list', finalizedPage, finalizedFilters, effectiveSearchTerm],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', {
        params: {
          status: 'FINALIZED,SENT',
          page: finalizedPage,
          limit: 25,
          q: effectiveSearchTerm.trim() || undefined,
          orderDateFrom: finalizedFilters.orderDateFrom || undefined,
          orderDateTo: finalizedFilters.orderDateTo || undefined,
          supplierId: finalizedFilters.supplierId || undefined,
          costCenterId: finalizedFilters.costCenterId || undefined
        }
      });
      return res.data;
    },
    enabled: activeTab === 'FINALIZADAS',
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  const { data: suppliersForFilter = [] } = useQuery({
    queryKey: ['suppliers', 'oc-finalizadas-filter'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { limit: 500 } });
      return res.data?.data || [];
    },
    enabled: activeTab === 'FINALIZADAS'
  });

  const { data: costCentersResponse } = useQuery({
    queryKey: ['cost-centers', 'oc-finalizadas-filter'],
    queryFn: async () => {
      const res = await api.get('/cost-centers', { params: { page: 1, limit: 2000 } });
      return res.data;
    },
    enabled: activeTab === 'FINALIZADAS'
  });

  const costCentersForFilter = useMemo(() => {
    const list = normalizeCostCentersResponse(costCentersResponse);
    return [...list].sort((a, b) => {
      const ca = (a.code || a.name || '').toString();
      const cb = (b.code || b.name || '').toString();
      return ca.localeCompare(cb, 'pt-BR', { numeric: true });
    });
  }, [costCentersResponse]);

  const supplierFilterSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...(suppliersForFilter as Array<{ id: string; name: string }>).map((s) => ({
        value: s.id,
        label: s.name,
        searchText: s.name,
      })),
    ],
    [suppliersForFilter]
  );

  const costCenterFilterSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...costCentersForFilter
        .filter((cc): cc is typeof cc & { id: string } => Boolean(cc.id))
        .map((cc) => {
          const label = [cc.code, cc.name].filter(Boolean).join(' — ') || cc.id;
          return { value: cc.id, label, searchText: label };
        }),
    ],
    [costCentersForFilter]
  );

  const finalizedOrders: PurchaseOrder[] = finalizedListResponse?.data ?? [];
  const finalizedPagination = finalizedListResponse?.pagination as
    | { page: number; limit: number; total: number; totalPages: number }
    | undefined;

  const paymentTabOrderNumbers = useMemo(
    () =>
      activeTab === 'APPROVED'
        ? Array.from(new Set(orders.map((o) => o.orderNumber.trim()).filter(Boolean))).sort()
        : [],
    [activeTab, orders]
  );

  const { data: financialEntriesForPaymentTab = [] } = useQuery({
    queryKey: ['financial-control-batch-by-oc', paymentTabOrderNumbers.join('|')],
    queryFn: async () => {
      const res = await api.get('/financial-control/by-oc-batch', {
        params: { numbers: paymentTabOrderNumbers.join(',') },
      });
      return (res.data?.data || []) as FinancialControlEntry[];
    },
    enabled: activeTab === 'APPROVED' && paymentTabOrderNumbers.length > 0,
  });

  const financialEntriesByOcNumber = useMemo(() => {
    const map = new Map<string, FinancialControlEntry[]>();
    for (const entry of financialEntriesForPaymentTab) {
      const key = (entry.ocNumber || '').trim().toLowerCase();
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [financialEntriesForPaymentTab]);

  const displayedOrders = useMemo(() => {
    if (activeTab === 'FINALIZADAS') {
      return sortPurchaseOrdersByMostRecent(finalizedOrders);
    }
    if (activeTab === 'APPROVED' && hasActivePaymentDueFilters) {
      return filteredOrdersBySearch.filter((order) => {
        const entries =
          financialEntriesByOcNumber.get(order.orderNumber.trim().toLowerCase()) ?? [];
        const { dueDate } = resolvePaymentListInstallmentValues(order, 'payment', entries);
        return isOcDueDateInPaymentFilterRange(dueDate, paymentDueFilters);
      });
    }
    return filteredOrdersBySearch;
  }, [
    activeTab,
    finalizedOrders,
    filteredOrdersBySearch,
    hasActivePaymentDueFilters,
    paymentDueFilters,
    financialEntriesByOcNumber,
  ]);

  const userEmployee = userData?.data?.employee as
    | { department?: string | null; position?: string | null }
    | undefined;
  const isFinanceOrAdminUser =
    userEmployee?.position?.trim() === 'Administrador' ||
    (userEmployee?.department?.toLowerCase().includes('financeiro') ?? false);

  const canEditBoletoParcels =
    !!selectedOrder &&
    selectedOrder.status === 'APPROVED' &&
    selectedOrder.paymentType === 'BOLETO' &&
    selectedOrder.creator?.id === currentUserId;

  /** Editor de parcelas na caixa violeta (evita duplicar com Documentos). */
  const boletoParcelsEditorInAttachBox =
    !!selectedOrder &&
    selectedOrder.status === 'APPROVED' &&
    selectedOrder.paymentType === 'BOLETO' &&
    orderNeedsPaymentBoleto(selectedOrder) &&
    !canSendCurrentBoletoToPayment(selectedOrder);

  const handleBoletoParcelsSaved = (payload: { data: unknown }) => {
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    const updated = (payload as { data?: PurchaseOrder })?.data;
    if (updated) {
      setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
    }
  };

  const formatDate = (d?: string) => (d ? new Date(d).toLocaleDateString('pt-BR') : '-');
  /** Ex.: R$100,00 (sem espaço após R$), conforme detalhes da OC */
  const formatBrlCompact = (v: number) =>
    `R$${new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(v)}`;

  const handleExportFinalizedCsv = async () => {
    setExportingFinalizedCsv(true);
    try {
      const res = await api.get('/purchase-orders/export-finalized-csv', {
        params: {
          q: effectiveSearchTerm.trim() || undefined,
          orderDateFrom: finalizedFilters.orderDateFrom || undefined,
          orderDateTo: finalizedFilters.orderDateTo || undefined,
          supplierId: finalizedFilters.supplierId || undefined,
          costCenterId: finalizedFilters.costCenterId || undefined
        },
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ocs-finalizadas-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Relatório exportado (CSV).');
    } catch {
      toast.error('Não foi possível exportar o relatório.');
    } finally {
      setExportingFinalizedCsv(false);
    }
  };

  const openOrderDetail = (o: PurchaseOrder) => {
    /** Abre na hora com o que já está na lista; o detalhe completo e o estoque entram em background. */
    setSelectedOrder(o);
    void queryClient.prefetchQuery({
      queryKey: ['purchase-order-detail', o.id],
      queryFn: async () => {
        const res = await api.get(`/purchase-orders/${o.id}`);
        return res.data?.data as PurchaseOrder | undefined;
      },
      staleTime: 60_000
    });
  };

  const toggleCnabSelection = (id: string) => {
    setCnabSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerateCnabOc = async () => {
    const ids = Array.from(cnabSelectedIds);
    if (ids.length === 0) {
      toast.error('Selecione ao menos uma OC.');
      return;
    }
    setCnabGenerating(true);
    try {
      const res = await api.post('/purchase-orders/cnab400', { orderIds: ids }, { responseType: 'blob' });
      const rawSkipped = res.headers['x-skipped-order-numbers'];
      if (rawSkipped) {
        try {
          const arr = JSON.parse(decodeURIComponent(rawSkipped)) as string[];
          if (Array.isArray(arr) && arr.length > 0) {
            toast.error(
              `Fora da remessa (cadastre banco, agência e conta no fornecedor): ${arr.join(', ')}`
            );
          }
        } catch {
          /* ignore */
        }
      }
      const blob = new Blob([res.data], { type: 'text/plain; charset=ISO-8859-1' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CNAB400-OC-${new Date().toISOString().slice(0, 10)}.REM`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Arquivo CNAB400 gerado (padrão Financeiro / Itaú).');
    } catch (e: unknown) {
      const err = e as { response?: { data?: Blob } };
      const data = err.response?.data;
      if (data instanceof Blob) {
        const text = await data.text();
        try {
          const j = JSON.parse(text) as { message?: string };
          toast.error(j.message || 'Erro ao gerar CNAB400');
        } catch {
          toast.error(text.slice(0, 200) || 'Erro ao gerar CNAB400');
        }
      } else {
        toast.error('Erro ao gerar CNAB400');
      }
    } finally {
      setCnabGenerating(false);
    }
  };

  const resolveOcFreightAmountStr = (order: OcFormOrderSource) => {
    const itemsSub = (order.items || []).reduce((sum, item) => {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const lineTotal = Number.isFinite(qty) && Number.isFinite(unitPrice) ? qty * unitPrice : 0;
      return sum + lineTotal;
    }, 0);
    const freightStored =
      order.freightAmount != null && order.freightAmount !== ''
        ? Number(order.freightAmount)
        : Math.max(0, Number(order.amountToPay ?? 0) - itemsSub);
    return Number.isFinite(freightStored) ? String(freightStored) : '0';
  };

  const openEditOcWithOrder = (order: PurchaseOrder) => {
    if (order.status !== 'IN_REVIEW') return;
    if (!order.creator?.id || order.creator.id !== currentUserId) return;

    const formValues = buildOcFormValuesFromOrder(order, {
      stripCorrectionNotes: stripOcCorrectionBlocksFromNotes,
      materialLineLabel,
      parseFreight: resolveOcFreightAmountStr
    });

    const invalid = formValues.items.some((it) => !it.materialId || !it.unit);
    if (invalid) {
      toast.error('Não foi possível carregar os itens da OC para edição.');
      return;
    }

    setSelectedOrder(order);
    setEditOcForm(formValues);
    setEditSupplierSearch(
      getOcSupplierLabel(order.supplier as OcSupplierOption) || order.supplier?.name || ''
    );
    setShowEditOcModal(true);
  };

  const handleOpenEditOc = () => {
    if (!selectedOrder) return;
    openEditOcWithOrder(selectedOrder);
  };

  const handleOpenEditOcForOrder = async (o: PurchaseOrder) => {
    setOrderDetailLoadingId(o.id);
    try {
      const res = await api.get(`/purchase-orders/${o.id}`);
      const order = res.data?.data as PurchaseOrder | undefined;
      if (!order) {
        toast.error('Não foi possível carregar a OC.');
        return;
      }
      openEditOcWithOrder(order);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Erro ao carregar a OC.');
    } finally {
      setOrderDetailLoadingId(null);
    }
  };

  const handleSaveEditOc = () => {
    if (!selectedOrder || !editOcForm) return;
    if (!editOcForm.supplierId) {
      toast.error('Selecione o fornecedor.');
      return;
    }
    if (
      isEditOcAvistaPaymentIncomplete(
        editOcForm.paymentType,
        editOcForm.paymentDetails,
        editOcForm.pixKeyType,
        editOcForm.pixKey
      )
    ) {
      toast.error('Preencha dados do pagamento, tipo e chave Pix para pagamento à vista.');
      return;
    }
    const freightParsed = parseMoneyInput(editOcForm.freightAmount);
    const freightAmount = freightParsed != null && freightParsed >= 0 ? freightParsed : 0;
    const correctionBlocks = extractOcCorrectionBlocks(selectedOrder.notes);
    const userNotes = editOcForm.notes.trim();
    const mergedNotes = [userNotes, correctionBlocks].filter(Boolean).join('\n\n') || null;

    const payload = {
      supplierId: editOcForm.supplierId,
      paymentType: editOcForm.paymentType,
      paymentCondition: editOcForm.paymentType === 'AVISTA' ? 'AVISTA' : editOcForm.paymentCondition,
      paymentDetails: editOcForm.paymentDetails.trim() || null,
      pixKeyType: editOcForm.paymentType === 'AVISTA' ? editOcForm.pixKeyType.trim() : null,
      pixKey: editOcForm.paymentType === 'AVISTA' ? editOcForm.pixKey.trim() : null,
      freightAmount,
      notes: mergedNotes,
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

  const listLoading =
    activeTab === 'FINALIZADAS'
      ? finalizedListFetching && !finalizedListResponse
      : isLoading;

  const isIntegratedFlux = embedded && hideTabs;
  const flushInTabsCard = isIntegratedFlux && flushInCard;
  const integratedMeta = isIntegratedFlux ? EMBEDDED_OC_TAB_META[activeTab] : null;
  const integratedListCount = displayedOrders.length;
  const showToolbarSearch =
    !hideSearch && (Boolean(onSearchChange) || activeTab === 'FINALIZADAS');
  const showToolbarCnab = activeTab === 'APPROVED';
  const showToolbarPaymentDueFilter = activeTab === 'APPROVED';
  const showToolbarFinalizedExtras = activeTab === 'FINALIZADAS';
  const showHeaderToolbar =
    showToolbarSearch ||
    showToolbarCnab ||
    showToolbarPaymentDueFilter ||
    showToolbarFinalizedExtras ||
    showApprovalPhaseFilter;
  const hasActiveApprovalPhaseFilter = approvalListPhase !== 'pending';
  const orderForActionMenu = ocActionMenu
    ? displayedOrders.find((o) => o.id === ocActionMenu.orderId)
    : undefined;

  const financialEntryInitialValues = useMemo(
    () => (financialEntryOrder ? buildFormFromPurchaseOrder(financialEntryOrder) : undefined),
    [financialEntryOrder]
  );

  const financialEntryInitialFormFromSelectedOrder = useMemo(
    () => (selectedOrder ? buildFormFromPurchaseOrder(selectedOrder) : undefined),
    [selectedOrder]
  );

  const listHeaderToolbar = showHeaderToolbar ? (
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {showToolbarSearch && (
          <div className="relative min-w-[240px] flex-1 sm:w-[300px] sm:flex-none sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              inputMode="search"
              autoComplete="off"
              value={effectiveSearchTerm}
              onChange={(e) => setEffectiveSearchTerm(e.target.value)}
              placeholder="Buscar OC, RM, fornecedor, centro de custo..."
              className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            {effectiveSearchTerm ? (
              <button
                type="button"
                onClick={() => setEffectiveSearchTerm('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        )}
        {showApprovalPhaseFilter && (
          <button
            type="button"
            onClick={() => setIsApprovalFiltersModalOpen(true)}
            className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              hasActiveApprovalPhaseFilter
                ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
            aria-label="Abrir filtro"
            title={hasActiveApprovalPhaseFilter ? 'Filtro (status ativo)' : 'Filtro'}
          >
            <Filter className="h-4 w-4" />
            {hasActiveApprovalPhaseFilter ? (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
            ) : null}
          </button>
        )}
        {showToolbarPaymentDueFilter && (
          <button
            type="button"
            onClick={() => setIsPaymentDueFiltersModalOpen(true)}
            className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
              hasActivePaymentDueFilters
                ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
            aria-label="Filtrar por vencimento"
            title={
              hasActivePaymentDueFilters
                ? 'Filtro de vencimento ativo'
                : 'Filtrar por período de vencimento'
            }
          >
            <Filter className="h-4 w-4" />
            {hasActivePaymentDueFilters ? (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
            ) : null}
          </button>
        )}
        {showToolbarCnab && (
          <button
            type="button"
            onClick={() => {
              if (cnabGenerating || cnabSelectedIds.size === 0) return;
              handleGenerateCnabOc();
            }}
            aria-disabled={cnabGenerating || cnabSelectedIds.size === 0}
            title={
              cnabSelectedIds.size === 0
                ? 'Selecione ao menos uma OC na tabela'
                : 'Gerar remessa CNAB400 (Itaú) para as OCs selecionadas'
            }
            className={`flex h-10 min-w-[8.75rem] shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${
              cnabGenerating || cnabSelectedIds.size === 0
                ? 'cursor-not-allowed opacity-50'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {cnabGenerating ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 shrink-0" />
            )}
            <span className="whitespace-nowrap">CNAB400</span>
          </button>
        )}
        {showToolbarFinalizedExtras && (
          <>
            <button
              type="button"
              onClick={() => setIsFinalizedFiltersModalOpen(true)}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white transition-colors hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 ${
                hasActiveFinalizedFilters
                  ? 'border-blue-400 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                  : 'border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'
              }`}
              aria-label="Abrir filtro"
              title={hasActiveFinalizedFilters ? 'Filtro (ativos)' : 'Filtro'}
            >
              <Filter className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleExportFinalizedCsv()}
              disabled={exportingFinalizedCsv}
              className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              {exportingFinalizedCsv ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Download className="h-4 w-4 shrink-0" />
              )}
              <span>Exportar CSV</span>
            </button>
          </>
        )}
      </div>
    ) : null;

  return (
    <>
      <section id="fluxo-oc" className={flushInTabsCard ? '' : 'scroll-mt-4'}>
        <Card
          className={
            isIntegratedFlux
              ? `w-full ${flushInTabsCard ? 'rounded-none border-0 border-t-0 shadow-none' : ''}`
              : undefined
          }
        >
          {isIntegratedFlux && integratedMeta ? (
            <CardHeader className={`border-b-0 pb-1 ${flushInTabsCard ? 'pt-4' : ''}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {integratedMeta.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {approvalTabSubtitle(activeTab, approvalListPhase)}
                    </p>
                  </div>
                </div>
                {listHeaderToolbar}
              </div>
            </CardHeader>
          ) : null}
          {!hideTabs && (
            <OcFluxTabsNav
              activeTab={activeTab}
              onActiveTab={setActiveTab}
              tabCounts={tabCounts}
              finalizedTotal={finalizedTotal}
            />
          )}
          <CardContent className={isIntegratedFlux ? undefined : 'p-0'}>
            {listLoading ? (
              <div className={isIntegratedFlux ? 'text-center py-8' : 'px-6 py-12 text-center'}>
                <Loading message="Carregando ordens..." />
              </div>
            ) : (
              <div className={isIntegratedFlux ? undefined : 'overflow-x-auto'}>
                {isIntegratedFlux && integratedListCount > 0 && (
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      {activeTab === 'FINALIZADAS' && finalizedPagination
                        ? (() => {
                            const total = finalizedPagination.total;
                            const page = finalizedPagination.page;
                            const limit = finalizedPagination.limit ?? integratedListCount;
                            const start = total === 0 ? 0 : (page - 1) * limit + 1;
                            const end = Math.min((page - 1) * limit + integratedListCount, total);
                            return `Mostrando ${start} a ${end} de ${total} ordens de compra`;
                          })()
                        : `Mostrando 1 a ${integratedListCount} de ${integratedListCount} ${
                            integratedListCount === 1 ? 'ordem de compra' : 'ordens de compra'
                          }`}
                    </span>
                    {activeTab === 'FINALIZADAS' &&
                    finalizedPagination &&
                    finalizedPagination.totalPages > 1 ? (
                      <span>{`Página ${finalizedPagination.page} de ${finalizedPagination.totalPages}`}</span>
                    ) : null}
                  </div>
                )}
                {isIntegratedFlux && integratedListCount === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">
                      {embeddedOcEmptyMessage(
                        activeTab,
                        !!searchTerm.trim(),
                        approvalListPhase,
                        hasActivePaymentDueFilters,
                      )}
                    </p>
                    {(effectiveSearchTerm.trim() || hasActiveFinalizedFilters) &&
                    activeTab === 'FINALIZADAS' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEffectiveSearchTerm('');
                          clearFinalizedFilters();
                        }}
                        className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Limpar filtros
                      </button>
                    ) : (effectiveSearchTerm.trim() || hasActivePaymentDueFilters) &&
                      activeTab === 'APPROVED' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEffectiveSearchTerm('');
                          clearPaymentDueFilters();
                        }}
                        className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Limpar filtros
                      </button>
                    ) : searchTerm.trim() && onSearchChange ? (
                      <button
                        type="button"
                        onClick={() => onSearchChange('')}
                        className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Limpar busca
                      </button>
                    ) : null}
                  </div>
                ) : (
                <div className={isIntegratedFlux ? 'overflow-x-auto' : undefined}>
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {activeTab === 'APPROVED' && (
                        <th className="w-12 min-w-[3rem] max-w-[3rem] px-2 sm:px-3 py-4">
                          <div className="flex items-center justify-center">
                          <OcStyledCheckbox
                            title="Selecionar todas"
                            ariaLabel="Selecionar todas as OCs"
                            checked={orders.length > 0 && orders.every((x) => cnabSelectedIds.has(x.id))}
                            onChange={(checked) => {
                              if (checked) {
                                setCnabSelectedIds(new Set(orders.map((x) => x.id)));
                              } else {
                                setCnabSelectedIds(new Set());
                              }
                            }}
                          />
                          </div>
                        </th>
                      )}
                      <th
                        scope="col"
                        className={`${cadastroListClasses.th} w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] text-center`}
                      >
                        OC
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Fornecedor
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Centro de Custo
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        RM
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        Status de entrega
                      </th>
                      {ocListShowsOrderDateColumn(activeTab) && (
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Data
                        </th>
                      )}
                      {ocListShowsOrderGrandTotalColumn(activeTab) && (
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Valor Total
                        </th>
                      )}
                      {ocListShowsPaymentStatusColumn(activeTab) && (
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          Status
                        </th>
                      )}
                      {ocListShowsAttachBoletoStatusColumn(activeTab) && (
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          Situação
                        </th>
                      )}
                      {ocListShowsPaymentConditionColumn(activeTab) && (
                        <th className={ocListDocThCls}>Condição de pagamento</th>
                      )}
                      {ocListShowsInstallmentParcelColumn(activeTab) && (
                        <th className={ocListDocThCls}>Parcela</th>
                      )}
                      {ocListShowsInstallmentDueDateColumn(activeTab) && (
                        <th className={ocListDocThCls}>Vencimento</th>
                      )}
                      {ocListShowsInstallmentAmountColumn(activeTab) && (
                        <th className={ocListDocThCls}>Valor parcela</th>
                      )}
                      {ocListShowsDocumentColumns(activeTab) && (
                        <>
                          {ocListShowsBoletoColumn(activeTab) && (
                            <th className={ocListDocThCls}>Boleto</th>
                          )}
                          {ocListShowsParcelasColumn(activeTab) && (
                            <th className={ocListDocThCls}>Parcelas</th>
                          )}
                          {ocListShowsComprovanteColumn(activeTab) && (
                            <th className={ocListDocThCls}>Comprovante</th>
                          )}
                          {ocListShowsNfColumn(activeTab) && activeTab !== 'ATTACH_NF' && (
                            <th className={ocListDocThCls}>NF</th>
                          )}
                        </>
                      )}
                      {activeTab === 'ATTACH_NF' && (
                        <th className={ocListDocThCls}>NF</th>
                      )}
                      <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {isIntegratedFlux ? 'Ação' : 'Ações'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {displayedOrders.map((o: PurchaseOrder) => {
                      const listInstallmentModeForTab = ocListInstallmentMode(activeTab);
                      const paymentFinancialEntries =
                        financialEntriesByOcNumber.get(o.orderNumber.trim().toLowerCase()) ?? [];
                      return (
                      <tr
                        key={o.id}
                        className={getListTableRowClassName(true)}
                        onClick={() => openOrderDetail(o)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openOrderDetail(o);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Ver detalhes da ${o.orderNumber}`}
                      >
                        {activeTab === 'APPROVED' && (
                          <td
                            className="w-12 min-w-[3rem] max-w-[3rem] px-2 sm:px-3 py-4 align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-center">
                              <OcStyledCheckbox
                                checked={cnabSelectedIds.has(o.id)}
                                onChange={(checked) => {
                                  setCnabSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(o.id);
                                    else next.delete(o.id);
                                    return next;
                                  });
                                }}
                                ariaLabel={`Selecionar ${o.orderNumber}`}
                              />
                            </div>
                          </td>
                        )}
                        <td
                          className={`${cadastroListClasses.tdMono} w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] text-center`}
                          title={o.orderNumber}
                        >
                          <ListRowNavigableLabel className="font-medium">
                            {formatOcListDisplayId(o.orderNumber)}
                          </ListRowNavigableLabel>
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {o.supplier?.name || '-'}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-center text-sm text-gray-900 dark:text-gray-100">
                          {(() => {
                            const cc = formatOcListCostCenter(o.materialRequest?.costCenter);
                            return (
                              <span className="line-clamp-2" title={cc.title}>
                                {cc.display}
                              </span>
                            );
                          })()}
                        </td>
                        <td
                          className="px-3 sm:px-6 py-4 text-sm text-center text-gray-600 dark:text-gray-400"
                          title={o.materialRequest?.requestNumber || undefined}
                        >
                          {formatRmListDisplayId(o.materialRequest?.requestNumber)}
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-center whitespace-nowrap">
                          <OcListDeliveryStatusCellContent
                            movement={latestOcMovementByOrderNumber.get(
                              normalizeOcNumberKey(o.orderNumber)
                            )}
                            orderStatus={o.status}
                          />
                        </td>
                        {ocListShowsOrderDateColumn(activeTab) && (
                          <td className="px-3 sm:px-6 py-4 text-sm text-center text-gray-900 dark:text-gray-100">
                            {formatDate(o.orderDate)}
                          </td>
                        )}
                        {ocListShowsOrderGrandTotalColumn(activeTab) && (
                          <td className="px-3 sm:px-6 py-4 text-sm text-center tabular-nums text-gray-900 dark:text-gray-100">
                            {formatCurrency(orderGrandTotal(o))}
                          </td>
                        )}
                        {ocListShowsPaymentStatusColumn(activeTab) && (
                          <td className="px-3 sm:px-6 py-4 text-center whitespace-nowrap">
                            {(() => {
                              const entries =
                                financialEntriesByOcNumber.get(o.orderNumber.trim().toLowerCase()) ??
                                [];
                              const paymentStatus = getOcPaymentListStatus(o, entries);
                              return (
                                <span className={ocPaymentListStatusClass(paymentStatus)}>
                                  {ocPaymentListStatusLabel(paymentStatus)}
                                </span>
                              );
                            })()}
                          </td>
                        )}
                        {ocListShowsAttachBoletoStatusColumn(activeTab) && (
                          <td className="px-3 sm:px-6 py-4 text-center">
                            <OcListAttachBoletoStatusCellContent order={o} />
                          </td>
                        )}
                        {ocListShowsPaymentConditionColumn(activeTab) && (
                          <td className={ocListDocTdCls}>
                            <div className={ocListDocCellInnerCls}>
                              <span
                                className="text-gray-800 dark:text-gray-200 whitespace-nowrap"
                                title={formatOcListPaymentCondition(o, paymentConditionLabelMap)}
                              >
                                {formatOcListPaymentCondition(o, paymentConditionLabelMap)}
                              </span>
                            </div>
                          </td>
                        )}
                        {ocListShowsInstallmentParcelColumn(activeTab) && (
                          <td className={ocListDocTdCls}>
                            <div className={ocListDocCellInnerCls}>
                              <OcListInstallmentParcelCellContent
                                order={o}
                                installmentMode={listInstallmentModeForTab}
                              />
                            </div>
                          </td>
                        )}
                        {ocListShowsInstallmentDueDateColumn(activeTab) && (
                          <td className={ocListDocTdCls}>
                            <div className={ocListDocCellInnerCls}>
                              <OcListInstallmentDueDateCellContent
                                order={o}
                                installmentMode={listInstallmentModeForTab}
                                financialEntries={paymentFinancialEntries}
                              />
                            </div>
                          </td>
                        )}
                        {ocListShowsInstallmentAmountColumn(activeTab) && (
                          <td className={ocListDocTdCls}>
                            <div className={ocListDocCellInnerCls}>
                              <OcListInstallmentAmountCellContent
                                order={o}
                                installmentMode={listInstallmentModeForTab}
                                financialEntries={paymentFinancialEntries}
                              />
                            </div>
                          </td>
                        )}
                        {ocListShowsDocumentColumns(activeTab) && (
                          <>
                            {ocListShowsBoletoColumn(activeTab) && (
                              <td className={ocListDocTdCls}>
                                <div className={ocListDocCellInnerCls}>
                                  <OcListBoletoCellContent
                                    order={o}
                                    singleInstallmentMode={listInstallmentModeForTab}
                                  />
                                </div>
                              </td>
                            )}
                            {ocListShowsParcelasColumn(activeTab) && (
                              <td className={ocListDocTdCls}>
                                <div className={ocListDocCellInnerCls}>
                                  <OcListParcelasCellContent order={o} />
                                </div>
                              </td>
                            )}
                            {ocListShowsComprovanteColumn(activeTab) && (
                              <td className={ocListDocTdCls}>
                                <div className={ocListDocCellInnerCls}>
                                  <OcListComprovanteCellContent
                                    order={o}
                                    proofValidationOnly={activeTab === 'PROOF_VALIDATION' || activeTab === 'PROOF_CORRECTION'}
                                  />
                                </div>
                              </td>
                            )}
                            {ocListShowsNfColumn(activeTab) && activeTab !== 'ATTACH_NF' && (
                              <td className={ocListDocTdCls}>
                                <div className={ocListDocCellInnerCls}>
                                  <OcListNfCellContent order={o} />
                                </div>
                              </td>
                            )}
                          </>
                        )}
                        {activeTab === 'ATTACH_NF' && (
                          <td className={ocListDocTdCls}>
                            <div className={ocListDocCellInnerCls}>
                              <OcListNfCellContent order={o} />
                            </div>
                          </td>
                        )}
                        <td
                          className="px-3 sm:px-6 py-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1 flex-wrap">
                            {!isIntegratedFlux && (
                              <>
                                {o.status === 'PENDING_PROOF_VALIDATION' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          'Confirmar validação do comprovante e liberar a fase Anexar NF para o comprador?'
                                        )
                                      ) {
                                        return;
                                      }
                                      validateProofMutation.mutate(o.id);
                                    }}
                                    disabled={validateProofMutation.isPending}
                                    className="p-2 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                    title="Validar comprovante — liberar anexo de NF"
                                  >
                                    {validateProofMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Check className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                                {showListApprovalActions(o.status) && (
                                  <button
                                    type="button"
                                    onClick={() => approveMutation.mutate({ id: o.id, currentStatus: o.status })}
                                    className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors inline-flex"
                                    title={approvalLabel(o.status)}
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}
                                {showListApprovalActions(o.status) && (
                                  <button
                                    type="button"
                                    onClick={() => openOcCorrectionModal(o)}
                                    className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors inline-flex"
                                    title="Enviar para CORREÇÃO OC"
                                  >
                                    <Wrench className="w-4 h-4" />
                                  </button>
                                )}
                                {showListApprovalActions(o.status) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectTarget(o);
                                      setRejectReason('');
                                    }}
                                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors inline-flex"
                                    title="Cancelar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                                {o.status === 'IN_REVIEW' &&
                                  o.creator?.id &&
                                  currentUserId === o.creator.id && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditOcForOrder(o)}
                                        disabled={orderDetailLoadingId === o.id}
                                        className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                        title="Editar"
                                      >
                                        {orderDetailLoadingId === o.id ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <Pencil className="w-4 h-4" />
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => resubmitOcMutation.mutate(o.id)}
                                        disabled={resubmitOcMutation.isPending}
                                        className="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors inline-flex disabled:opacity-50"
                                        title="Enviar para Aprovação"
                                      >
                                        <Send className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                <button
                                  type="button"
                                  onClick={() => handleExportPdf(o.id)}
                                  disabled={pdfExportingId === o.id}
                                  className="inline-flex rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
                                  title="Baixar OC"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openOrderDetail(o)}
                                  className="inline-flex rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                                  title="Ver detalhes"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            {isIntegratedFlux && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  setOcActionMenu((prev) => {
                                    if (prev?.orderId === o.id) return null;
                                    const pos = computeOcActionMenuPosition(r);
                                    return { orderId: o.id, ...pos };
                                  });
                                }}
                                className={rowActionMenuButtonClass(ocActionMenu?.orderId === o.id)}
                                aria-label="Menu de ações"
                                aria-expanded={ocActionMenu?.orderId === o.id}
                                aria-haspopup="menu"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
                </div>
                )}
                {activeTab === 'FINALIZADAS' &&
                  finalizedPagination &&
                  finalizedPagination.totalPages > 1 &&
                  displayedOrders.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Página {finalizedPagination.page} de {finalizedPagination.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={finalizedPage <= 1 || finalizedListFetching}
                          onClick={() => setFinalizedPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          disabled={
                            finalizedPage >= finalizedPagination.totalPages || finalizedListFetching
                          }
                          onClick={() => setFinalizedPage((p) => p + 1)}
                          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Próxima
                        </button>
                      </div>
                    </div>
                  )}
                {!isIntegratedFlux &&
                  ((activeTab === 'FINALIZADAS' && displayedOrders.length === 0 && !listLoading) ||
                    (activeTab !== 'FINALIZADAS' && orders.length === 0 && !isLoading)) && (
                  <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
                    {activeTab === 'FINALIZADAS' ? (
                      <>
                        Nenhuma OC finalizada com os filtros atuais. Ajuste a busca, as datas, o fornecedor ou o
                        centro de custo, ou limpe os filtros.
                      </>
                    ) : activeTab === 'ATTACH_BOLETO' ? (
                      <>
                        Nenhuma OC em boleto aguardando anexo neste momento. A lista inclui apenas OCs{' '}
                        <strong>aprovadas</strong>, com pagamento <strong>boleto</strong>, sem todos os boletos de
                        pagamento registrados (uma ou mais parcelas, conforme a condição de pagamento).
                      </>
                    ) : activeTab === 'PROOF_VALIDATION' ? (
                      <>Nenhuma OC aguardando validação do comprovante.</>
                    ) : activeTab === 'PROOF_CORRECTION' ? (
                      <>Nenhuma OC em correção do comprovante.</>
                    ) : activeTab === 'ATTACH_NF' ? (
                      <>Nenhuma OC na fase Anexar NF. Valide o comprovante na aba anterior para liberar esta etapa.</>
                    ) : (
                      <>
                        Nenhuma ordem de compra encontrada. Crie uma OC a partir de uma SC aprovada (botão
                        &quot;Criar OC&quot; na requisição aprovada acima).
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {rejectTarget && (
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setRejectTarget(null); setRejectReason(''); }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Cancelar OC</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{rejectTarget.orderNumber}</p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-4"
              placeholder="Informe o motivo do cancelamento..."
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {correctionTarget && (
        <div className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setCorrectionTarget(null);
              setCorrectionReason('');
            }}
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Enviar para CORREÇÃO OC</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Quem criou a OC poderá ajustar e reenviá-la para aprovação. {correctionTarget.orderNumber}
            </p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo da correção *</label>
            <textarea
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-4"
              placeholder="Descreva o que precisa ser ajustado na OC..."
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setCorrectionTarget(null);
                  setCorrectionReason('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!correctionReason.trim() || correctionOcMutation.isPending}
                onClick={() =>
                  correctionOcMutation.mutate({
                    id: correctionTarget.id,
                    reason: correctionReason.trim()
                  })
                }
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {correctionOcMutation.isPending ? 'Enviando...' : 'Enviar para correção'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditOcModal && selectedOrder && editOcForm && (
        <div className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEditOcModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Editar Ordem de Compra</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {selectedOrder.orderNumber}
                  {selectedOrder.materialRequest?.requestNumber
                    ? ` · RM: ${formatRmListDisplayId(selectedOrder.materialRequest.requestNumber)}`
                    : ''}
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

            <OcPurchaseOrderFormFields
              mode="edit"
              values={editOcForm}
              correctionInfo={parseLastOcCorrectionInfo(selectedOrder.notes)}
              parseMoneyInput={parseMoneyInput}
              onChange={(patch) => setEditOcForm((prev) => (prev ? { ...prev, ...patch } : prev))}
              onItemChange={(index, patch) =>
                setEditOcForm((prev) => {
                  if (!prev) return prev;
                  const nextItems = prev.items.map((item, i) =>
                    i === index ? { ...item, ...patch } : item
                  );
                  return { ...prev, items: nextItems };
                })
              }
              supplierField={{
                supplierId: editOcForm.supplierId,
                supplierLabel: editSupplierSearch,
                onSupplierChange: (supplier) => {
                  setEditOcForm((prev) => (prev ? { ...prev, supplierId: supplier.id } : prev));
                  setEditSupplierSearch(getOcSupplierLabel(supplier));
                },
              }}
            />

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
                disabled={
                  updateOcDetailsMutation.isPending ||
                  !editOcForm.supplierId ||
                  isEditOcAvistaPaymentIncomplete(
                    editOcForm.paymentType,
                    editOcForm.paymentDetails,
                    editOcForm.pixKeyType,
                    editOcForm.pixKey
                  )
                }
                onClick={handleSaveEditOc}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updateOcDetailsMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && !showEditOcModal && !correctionTarget && (
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedOrder(null)} />
          <div
            className={`relative flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full mx-4 max-h-[min(92vh,880px)] ${
              selectedOrder.status === 'IN_REVIEW' ? 'max-w-2xl' : 'max-w-4xl'
            }`}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {selectedOrder.status === 'IN_REVIEW' ? 'Ordem de Compra' : selectedOrder.orderNumber}
                </h2>
                {selectedOrder.status === 'IN_REVIEW' ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{selectedOrder.orderNumber}</p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selectedOrder.status] || ''}`}
                    >
                      {purchaseOrderPhaseLabel(selectedOrder.status)}
                    </span>
                    {isFetchingOrderDetail ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Atualizando…
                      </span>
                    ) : null}
                    {selectedOrderLatestStockMovement ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Estoque:{' '}
                        {selectedOrderLatestStockMovement.type === 'IN' ? 'Entrada' : 'Saída'}{' '}
                        {new Date(selectedOrderLatestStockMovement.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleExportPdf(selectedOrder.id)}
                  disabled={pdfExportingId === selectedOrder.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {pdfExportingId === selectedOrder.id ? 'Gerando…' : 'Baixar'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
            {selectedOrder.status === 'IN_REVIEW' ? (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  RM: {formatRmListDisplayId(selectedOrder.materialRequest?.requestNumber)}
                  <span className="mx-2">·</span>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[selectedOrder.status] || ''}`}
                  >
                    {purchaseOrderPhaseLabel(selectedOrder.status)}
                  </span>
                </p>
                <OcPurchaseOrderFormFields
                  mode="view"
                  values={buildOcFormValuesFromOrder(selectedOrder, {
                    stripCorrectionNotes: stripOcCorrectionBlocksFromNotes,
                    materialLineLabel,
                    parseFreight: resolveOcFreightAmountStr
                  })}
                  paymentConditionLabel={
                    selectedOrder.paymentCondition
                      ? paymentConditionLabelMap[selectedOrder.paymentCondition] ||
                        selectedOrder.paymentCondition
                      : undefined
                  }
                  correctionInfo={parseLastOcCorrectionInfo(selectedOrder.notes)}
                  supplierField={{
                    supplierId: selectedOrder.supplier?.id ?? '',
                    supplierLabel:
                      getOcSupplierLabel(selectedOrder.supplier as OcSupplierOption) ||
                      selectedOrder.supplier?.name ||
                      '—',
                  }}
                />
              </>
            ) : (
            <div className="space-y-5 text-sm">
              <OcDetailSection title="Resumo">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <OcDetailField label="Fornecedor">{selectedOrder.supplier?.name || '—'}</OcDetailField>
                  <OcDetailField label="RM">
                    {formatRmListDisplayId(selectedOrder.materialRequest?.requestNumber)}
                  </OcDetailField>
                  <OcDetailField label="Centro de custo">
                    {(() => {
                      const cc = selectedOrder.materialRequest?.costCenter;
                      if (!cc) return '—';
                      const parts = [cc.code, cc.name]
                        .map((x) => (x != null ? String(x).trim() : ''))
                        .filter((s) => s.length > 0);
                      return parts.length ? parts.join(' — ') : '—';
                    })()}
                  </OcDetailField>
                  <OcDetailField label="Ordem de serviço">
                    {selectedOrder.materialRequest?.serviceOrder?.trim() || '—'}
                  </OcDetailField>
                  <OcDetailField label="Data">{formatDate(selectedOrder.orderDate)}</OcDetailField>
                  {selectedOrder.paymentType ? (
                    <OcDetailField label="Tipo de pagamento">
                      {OC_PAYMENT_TYPE_LABELS[selectedOrder.paymentType] || selectedOrder.paymentType}
                    </OcDetailField>
                  ) : null}
                  {selectedOrder.paymentCondition ? (
                    <OcDetailField label="Condição">
                      {paymentConditionLabelMap[selectedOrder.paymentCondition] ||
                        selectedOrder.paymentCondition}
                    </OcDetailField>
                  ) : null}
                </dl>
                {selectedOrder.materialRequest?.description?.trim() ? (
                  <div className="pt-1">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Descrição da solicitação
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap rounded-lg border border-gray-200/80 dark:border-gray-600/80 bg-white/60 dark:bg-gray-950/30 px-3 py-2">
                      {selectedOrder.materialRequest.description.trim()}
                    </p>
                  </div>
                ) : null}
              </OcDetailSection>

              {[
                'APPROVED',
                'PENDING_PROOF_VALIDATION',
                'PENDING_PROOF_CORRECTION',
                'PENDING_NF_ATTACHMENT',
                'SENT',
                'FINALIZED',
                'PARTIALLY_RECEIVED',
                'RECEIVED'
              ].includes(selectedOrder.status) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-950/30 px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Valor itens</p>
                    <p className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {formatBrlCompact(totalOrder(selectedOrder.items))}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-950/30 px-4 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Frete</p>
                    <p className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {formatBrlCompact(orderFreightValue(selectedOrder))}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3">
                    <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">Total a pagar</p>
                    <p className="mt-1 text-base font-semibold text-emerald-900 dark:text-emerald-100 tabular-nums">
                      {formatBrlCompact(orderGrandTotal(selectedOrder))}
                    </p>
                  </div>
                </div>
              )}

              <OcDetailSection title="Materiais">
                <OcOrderMaterialsTable order={selectedOrder} />
              </OcDetailSection>

              {[
                'APPROVED',
                'PENDING_PROOF_VALIDATION',
                'PENDING_PROOF_CORRECTION',
                'PENDING_NF_ATTACHMENT',
                'SENT',
                'FINALIZED',
                'PARTIALLY_RECEIVED',
                'RECEIVED'
              ].includes(selectedOrder.status) && selectedOrder.paymentDetails?.trim() ? (
                <OcDetailSection title="Dados de pagamento">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {selectedOrder.paymentDetails.trim()}
                  </p>
                </OcDetailSection>
              ) : (
                <>
                  {selectedOrder.paymentDetails?.trim() && (
                    <OcDetailSection title="Dados de pagamento">
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {selectedOrder.paymentDetails}
                      </p>
                    </OcDetailSection>
                  )}
                  {selectedOrder.paymentType === 'AVISTA' &&
                    (selectedOrder.pixKeyType || selectedOrder.pixKey) && (
                      <OcDetailSection title="PIX">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedOrder.pixKeyType ? (
                            <OcDetailField label="Tipo de chave">{selectedOrder.pixKeyType}</OcDetailField>
                          ) : null}
                          {selectedOrder.pixKey ? (
                            <OcDetailField label="Chave" className="sm:col-span-2">
                              <span className="break-all font-mono text-xs">{selectedOrder.pixKey}</span>
                            </OcDetailField>
                          ) : null}
                        </dl>
                      </OcDetailSection>
                    )}
                </>
              )}
              {selectedOrder.status === 'PENDING_PROOF_VALIDATION' && (
                <div className="rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/25 px-3 py-3 space-y-2">
                  <p className="text-xs font-semibold text-violet-900 dark:text-violet-200 uppercase tracking-wide">
                    Validação do comprovante
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Confirme que o comprovante de pagamento está correto para liberar o comprador a anexar uma ou mais
                    notas fiscais. Se estiver incorreto, solicite correção: o financeiro substitui o arquivo e reenvia
                    para validação.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={validateProofMutation.isPending || requestProofCorrectionMutation.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Confirmar validação do comprovante e liberar a fase Anexar NF para o comprador?'
                          )
                        ) {
                          return;
                        }
                        validateProofMutation.mutate(selectedOrder.id);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {validateProofMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          Salvando…
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 shrink-0" />
                          Validar comprovante — liberar Anexar NF
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={validateProofMutation.isPending || requestProofCorrectionMutation.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Enviar esta OC para correção do comprovante? O financeiro poderá anexar um novo arquivo e reenviar para validação.'
                          )
                        ) {
                          return;
                        }
                        const rejectionReason = window.prompt('Motivo (opcional):') ?? '';
                        requestProofCorrectionMutation.mutate({
                          id: selectedOrder.id,
                          rejectionReason: rejectionReason.trim() || undefined
                        });
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-amber-500/80 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
                    >
                      {requestProofCorrectionMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          Salvando…
                        </>
                      ) : (
                        <>
                          <Wrench className="w-4 h-4 shrink-0" />
                          Solicitar correção do comprovante
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
              {selectedOrder.status === 'PENDING_NF_ATTACHMENT' && (
                <div className="rounded-lg border border-teal-200 dark:border-teal-900/50 bg-teal-50/50 dark:bg-teal-950/25 px-3 py-3 space-y-3">
                  <p className="text-xs font-semibold text-teal-900 dark:text-teal-200 uppercase tracking-wide">
                    Anexar nota(s) fiscal(is)
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Anexe quantas NFs forem necessárias (PDF ou imagem). Depois finalize para marcar a OC como enviada
                    ao fornecedor. NFs anexadas no estoque são sincronizadas automaticamente — não é preciso repetir o
                    anexo aqui.
                  </p>
                  {parseOcNfAttachments(selectedOrder.nfAttachments).length > 0 ? (
                    <ul className="space-y-1.5 text-sm">
                      {parseOcNfAttachments(selectedOrder.nfAttachments).map((nf, idx) => (
                        <li
                          key={`${nf.url}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-teal-100 dark:border-teal-900/40 bg-white/60 dark:bg-gray-900/30 px-2 py-1.5"
                        >
                          <a
                            href={absoluteUploadUrl(nf.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            {nf.name || `NF ${idx + 1}`}
                          </a>
                          {isStockSyncedDocumentUrl(nf.url) && (
                            <span className="text-[11px] text-teal-700 dark:text-teal-300">Estoque</span>
                          )}
                          {canUserManageNfOnOrder(selectedOrder) && (
                            <button
                              type="button"
                              disabled={removeNfMutation.isPending}
                              onClick={() => removeNfMutation.mutate({ id: selectedOrder.id, index: idx })}
                              className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                            >
                              Remover
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Nenhuma NF anexada ainda.</p>
                  )}
                  {canUserManageNfOnOrder(selectedOrder) &&
                    parseOcNfAttachments(selectedOrder.nfAttachments).length === 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => setNfFileDraft(e.target.files?.[0] ?? null)}
                        className="block w-full text-xs text-gray-600 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-teal-100 file:text-teal-900 dark:file:bg-teal-900/40 dark:file:text-teal-100"
                      />
                      <button
                        type="button"
                        disabled={!nfFileDraft || appendNfMutation.isPending}
                        onClick={() => {
                          if (!nfFileDraft) return;
                          appendNfMutation.mutate({ id: selectedOrder.id, file: nfFileDraft });
                        }}
                        className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        {appendNfMutation.isPending ? 'Enviando…' : 'Anexar NF'}
                      </button>
                    </div>
                  )}
                  {canUserManageNfOnOrder(selectedOrder) && (
                    <button
                      type="button"
                      disabled={
                        completeOcToFinalizedMutation.isPending ||
                        parseOcNfAttachments(selectedOrder.nfAttachments).length === 0
                      }
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Finalizar esta OC? Ela irá para a fase Finalizadas. Confirme se todas as NFs necessárias foram anexadas.'
                          )
                        ) {
                          return;
                        }
                        completeOcToFinalizedMutation.mutate(selectedOrder.id);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {completeOcToFinalizedMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          Finalizando…
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 shrink-0" />
                          Finalizar OC
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
              {selectedOrder.status === 'APPROVED' &&
                selectedOrder.paymentType === 'BOLETO' &&
                orderNeedsPaymentBoleto(selectedOrder) && (
                  <div className="rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/25 px-3 py-3 space-y-2">
                    <p className="text-xs font-semibold text-violet-900 dark:text-violet-200 uppercase tracking-wide">
                      Anexar boleto (pagamento)
                    </p>
                    {!canSendCurrentBoletoToPayment(selectedOrder) ? (
                      <>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {(selectedOrder.paymentParcelCount ?? 1) > 1
                            ? `A parcela atual é obrigatória. As demais podem ser anexadas agora, se quiser. Boletos anexados no estoque são sincronizados automaticamente.`
                            : 'Informe vencimento e anexe o arquivo do boleto. Boletos anexados no estoque são sincronizados automaticamente.'}
                        </p>
                        <BoletoParcelasList
                          order={selectedOrder}
                          editable={canEditBoletoParcels && boletoParcelsEditorInAttachBox}
                          onSaved={handleBoletoParcelsSaved}
                          onReleaseToPayment={(id) => releasePaymentBoletoPhaseMutation.mutate(id)}
                          releasePending={
                            releasePaymentBoletoPhaseMutation.isPending &&
                            releasePaymentBoletoPhaseMutation.variables === selectedOrder.id
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setBoletoParcelModalOrder(selectedOrder)}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-violet-500 text-violet-800 dark:text-violet-200 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                        >
                          <Banknote className="w-4 h-4 shrink-0" />
                          {(selectedOrder.paymentParcelCount ?? 1) > 1
                            ? `Abrir em tela cheia (${selectedOrder.paymentParcelCount})`
                            : 'Abrir em tela cheia'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Boletos anexados. Para liberar a fase Pagamento (comprovante, CNAB etc.), confirme o envio
                          abaixo.
                        </p>
                        <button
                          type="button"
                          disabled={
                            releasePaymentBoletoPhaseMutation.isPending ||
                            !selectedOrder
                          }
                          onClick={() => {
                            if (!selectedOrder) return;
                            releasePaymentBoletoPhaseMutation.mutate(selectedOrder.id);
                          }}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Send className="w-4 h-4 shrink-0" />
                          Enviar para fase Pagamento
                        </button>
                      </>
                    )}
                  </div>
                )}
              {selectedOrder.status === 'APPROVED' &&
                selectedOrder.paymentType === 'BOLETO' &&
                !orderNeedsPaymentBoleto(selectedOrder) &&
                canSendCurrentBoletoToPayment(selectedOrder) &&
                selectedOrder.paymentBoletoPhaseReleased !== true && (
                  <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/25 px-3 py-3 space-y-2">
                    <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 uppercase tracking-wide">
                      Próxima parcela — Pagamento
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      O boleto da próxima parcela já está anexado. Envie para o financeiro pagar (uma parcela por
                      vez).
                    </p>
                    <button
                      type="button"
                      disabled={
                        releasePaymentBoletoPhaseMutation.isPending ||
                        !selectedOrder
                      }
                      onClick={() => {
                        if (!selectedOrder) return;
                        releasePaymentBoletoPhaseMutation.mutate(selectedOrder.id);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4 shrink-0" />
                      Enviar para fase Pagamento
                    </button>
                  </div>
                )}
              <OcDetailSection
                title="Documentos"
                description="Anexos das fases anteriores e da movimentação de estoque vinculada a esta OC."
              >
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Fases anteriores</p>
                  {isOcBoletoPaymentType(selectedOrder.paymentType) ? (
                    <>
                      <OcDetailDocRow label="Boleto (Anexar Boleto)">
                        {(selectedOrder.paymentParcelCount ?? 1) > 1 ? (
                          <BoletoParcelasList
                            order={selectedOrder}
                            showComprovante
                            editable={canEditBoletoParcels && !boletoParcelsEditorInAttachBox}
                            hint="Histórico por parcela: valor, vencimento, boleto e comprovante (quando houver)."
                            onSaved={handleBoletoParcelsSaved}
                          />
                        ) : effectivePaymentBoletoUrl(selectedOrder) ? (
                          <OcAttachmentActions
                            url={effectivePaymentBoletoUrl(selectedOrder)}
                            fileName={effectivePaymentBoletoName(selectedOrder)}
                            icon={Banknote}
                          />
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">Não anexado</span>
                        )}
                      </OcDetailDocRow>
                    </>
                  ) : null}
                  {shouldShowOrderLevelPaymentProofInDocuments(selectedOrder) ? (
                    <OcDetailDocRow label="Comprovante (Pagamento)">
                      <OcAttachmentActions
                        url={selectedOrder.paymentProofUrl || ''}
                        fileName={selectedOrder.paymentProofName || 'Comprovante pagamento'}
                        icon={Receipt}
                      />
                    </OcDetailDocRow>
                  ) : null}
                  {parseOcNfAttachments(selectedOrder.nfAttachments).length > 0 ? (
                    <OcDetailDocRow label="Notas fiscais (pós-validação)">
                      <ul className="space-y-1">
                        {parseOcNfAttachments(selectedOrder.nfAttachments).map((nf, idx) => (
                          <li key={`${nf.url}-${idx}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <OcAttachmentActions url={nf.url} fileName={nf.name || `NF ${idx + 1}`} />
                            {nf.uploadedAt ? (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({new Date(nf.uploadedAt).toLocaleString('pt-BR')})
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </OcDetailDocRow>
                  ) : null}
                </div>
                <div className="pt-2 border-t border-gray-200/80 dark:border-gray-700/80">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Movimentação de estoque</p>
                  {selectedOrderLatestStockMovement ? (
                    <>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Última movimentação:{' '}
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {selectedOrderLatestStockMovement.type === 'IN' ? 'Entrada' : 'Saída'}
                        </span>{' '}
                        em {new Date(selectedOrderLatestStockMovement.createdAt).toLocaleString('pt-BR')}
                      </p>
                      <OcDetailDocRow label="Nota fiscal">
                        {selectedOrderStockAttachments.nf ? (
                          <OcAttachmentActions
                            url={selectedOrderStockAttachments.nf.url}
                            fileName={selectedOrderStockAttachments.nf.name || 'NF estoque'}
                          />
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">Não anexada</span>
                        )}
                      </OcDetailDocRow>
                      <OcDetailDocRow label="Ficha de retirada">
                        {selectedOrderStockAttachments.withdrawalSheet ? (
                          <OcAttachmentActions
                            url={selectedOrderStockAttachments.withdrawalSheet.url}
                            fileName={
                              selectedOrderStockAttachments.withdrawalSheet.name || 'Ficha de retirada'
                            }
                          />
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">Não anexada</span>
                        )}
                      </OcDetailDocRow>
                      <OcDetailDocRow label="Boletos">
                        {selectedOrderStockAttachments.paymentSlips.length === 0 ? (
                          <span className="text-gray-500 dark:text-gray-400">Não anexados</span>
                        ) : (
                          <div className="space-y-1">
                            {selectedOrderStockAttachments.paymentSlips.map((slip, idx) => (
                              <div key={`${slip.url}-${idx}`}>
                                <OcAttachmentActions
                                  url={slip.url}
                                  fileName={slip.name || `Boleto estoque ${idx + 1}`}
                                  icon={Banknote}
                                />
                                {(slip.amount || slip.dueDate) && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {' '}
                                    — {slip.amount || 'Valor não informado'}
                                    {slip.dueDate ? ` | Vencimento: ${slip.dueDate}` : ''}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </OcDetailDocRow>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhuma movimentação de estoque vinculada a esta OC.
                    </p>
                  )}
                </div>
                {selectedOrder.status === 'APPROVED' &&
                  selectedOrder.paymentType === 'BOLETO' &&
                  selectedOrder.paymentBoletoPhaseReleased &&
                  hasAnyPaymentBoletoAttachment(selectedOrder) && (
                    <div className="pt-2 flex justify-end border-t border-gray-200/80 dark:border-gray-700/80">
                      <button
                        type="button"
                        disabled={reopenPaymentBoletoMutation.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Remover todos os boletos de pagamento e voltar a OC para a fase Anexar Boleto?'
                            )
                          ) {
                            return;
                          }
                          reopenPaymentBoletoMutation.mutate(selectedOrder.id);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-normal rounded border border-gray-300/80 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-amber-800 dark:hover:text-amber-200 hover:border-amber-400/60 dark:hover:border-amber-700/60 bg-transparent hover:bg-amber-50/30 dark:hover:bg-amber-950/20 disabled:opacity-50"
                        title="Volta a OC para anexar boletos novamente (ação administrativa)"
                      >
                        <Undo2 className="w-3 h-3 shrink-0 opacity-70" />
                        Reabrir fase Anexar boleto
                      </button>
                    </div>
                  )}
              </OcDetailSection>
              <OcDetailSection title="Recebimento no estoque">
                {(() => {
                  const stockReceipt = selectedOrder.stockReceipt;
                  const hasReceipts = Boolean(stockReceipt?.hasReceipts);
                  const exitBatches = stockReceipt?.exitBatches ?? [];
                  const hasExits =
                    Boolean(stockReceipt?.hasExits) || exitBatches.length > 0;
                  const hasAnyStockActivity = hasReceipts || hasExits;
                  const stockStillLoading =
                    isFetchingStockReceipt && selectedOrderStockReceipt === undefined;

                  if (stockStillLoading) {
                    return (
                      <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        Carregando movimentações do estoque…
                      </p>
                    );
                  }

                  if (!hasAnyStockActivity) {
                    return (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Nenhum recebimento ou saída registrado no estoque para esta OC.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {hasReceipts ? (
                        <>
                          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                            <table className="w-full text-xs sm:text-sm">
                              <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr className="text-left">
                                  <th className="p-2 font-medium text-gray-700 dark:text-gray-300">Material</th>
                                  <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">
                                    Pedido
                                  </th>
                                  <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">
                                    Recebido
                                  </th>
                                  <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">
                                    Falta
                                  </th>
                                  <th className="p-2 font-medium text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">
                                    Unidade de medida
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                                {(stockReceipt?.lines || []).map((line, idx) => (
                                  <tr key={`${line.materialLabel}-${idx}`} className="text-gray-600 dark:text-gray-400">
                                    <td className="p-2 align-top max-w-[200px] sm:max-w-none">{line.materialLabel}</td>
                                    <td className="p-2 text-right whitespace-nowrap align-top">
                                      {line.ordered.toLocaleString('pt-BR')}
                                    </td>
                                    <td className="p-2 text-right whitespace-nowrap align-top">
                                      {line.received.toLocaleString('pt-BR')}
                                    </td>
                                    <td
                                      className={`p-2 text-right whitespace-nowrap align-top font-semibold ${
                                        line.gap > 0
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      {line.gap.toLocaleString('pt-BR')}
                                    </td>
                                    <td className="p-2 text-right whitespace-nowrap align-top">{line.unit}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <OcStockMovementHistoryList
                            title="Histórico de entradas"
                            movementLabel="Entrada"
                            batches={stockReceipt?.batches || []}
                          />
                        </>
                      ) : null}
                      <OcStockMovementHistoryList
                        title="Histórico de saídas"
                        movementLabel="Saída"
                        batches={exitBatches}
                      />
                    </div>
                  );
                })()}
              </OcDetailSection>
              {selectedOrderInFinancialLaunchPhase && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/25 px-3 py-3 space-y-3">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
                    Controle Financeiro (obrigatório)
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Registre o pagamento desta OC no Controle Financeiro antes de enviar para validação do
                    comprovante. O lançamento aparecerá no módulo{' '}
                    <Link
                      href="/ponto/financeiro/controle-financeiro"
                      className="text-amber-800 dark:text-amber-300 underline inline-flex items-center gap-0.5"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Controle Financeiro
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                    .
                  </p>
                  {hasFinancialEntryForOc ? (
                    <ul className="space-y-2 text-sm">
                      {financialEntriesByOc.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-100 dark:border-amber-900/40 bg-white/60 dark:bg-gray-950/30 px-2.5 py-2"
                        >
                          <span className="text-gray-800 dark:text-gray-200">
                            {MONTHS_PT[entry.paymentMonth - 1]}/{entry.paymentYear} —{' '}
                            {formatFinancialCurrency(entry.finalValue ?? entry.originalValue)} —{' '}
                            <span className="text-gray-500 dark:text-gray-400">
                              {entry.supplierName || 'Sem fornecedor'}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFinancialEntry(entry);
                              setFinancialEntryModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-amber-400/60 text-amber-900 dark:text-amber-200 hover:bg-amber-100/80 dark:hover:bg-amber-950/40"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                      Nenhum lançamento vinculado a esta OC. Clique no botão abaixo para registrar.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFinancialEntry(null);
                        setFinancialEntryModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                    >
                      <Wallet className="w-4 h-4 shrink-0" />
                      {hasFinancialEntryForOc
                        ? 'Novo lançamento no Controle Financeiro'
                        : 'Registrar lançamento no Controle Financeiro'}
                    </button>
                  </div>
                </div>
              )}
              {selectedOrder.status === 'APPROVED' &&
                selectedOrder.paymentType === 'BOLETO' &&
                selectedOrder.paymentBoletoPhaseReleased &&
                useParallelBoletoPaymentFlow(selectedOrder) && (
                  <div className="rounded-lg border border-sky-200 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/25 px-3 py-3 space-y-3">
                    <p className="text-xs font-semibold text-sky-900 dark:text-sky-200 uppercase tracking-wide">
                      Comprovantes por parcela (financeiro)
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Todos os boletos já estão anexados. Anexe o comprovante de pagamento de cada parcela e, em
                      seguida, envie a OC para validação do comprovante — não é necessário devolver ao comprador
                      para anexar boleto novamente.
                    </p>
                    {(() => {
                      const n = selectedOrder.paymentParcelCount ?? 1;
                      const rows = parsePaymentBoletoInstallments(selectedOrder.paymentBoletoInstallments);
                      const targets = financeProofTargetInstallmentIndices(selectedOrder);
                      return (
                        <div className="space-y-3">
                          {Array.from({ length: n }, (_, idx) => {
                            if (!targets.includes(idx)) return null;
                            const row = rows[idx];
                            const st = rowStatus(row);
                            const proofUrl =
                              (row?.installmentProofUrl || '').trim() ||
                              (st === 'PAID' && (selectedOrder.paymentProofUrl || '').trim()
                                ? (selectedOrder.paymentProofUrl || '').trim()
                                : '');
                            return (
                              <div
                                key={idx}
                                className="rounded-md border border-sky-100 dark:border-sky-900/40 bg-white/50 dark:bg-gray-950/30 px-2.5 py-2 space-y-2"
                              >
                                <div className="flex flex-wrap items-baseline gap-2">
                                  <span className="font-medium text-gray-800 dark:text-gray-200">
                                    Parcela {romanParcelLabel(idx)}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {installmentStatusLabel(st, !!((row?.boletoUrl || '').trim()))}
                                  </span>
                                </div>
                                {proofUrl ? (
                                  <p className="text-sm text-gray-700 dark:text-gray-300">
                                    Comprovante:{' '}
                                    <OcAttachmentActions
                                      url={proofUrl}
                                      fileName={
                                        row?.installmentProofName?.trim() ||
                                        `Comprovante parcela ${romanParcelLabel(idx)}`
                                      }
                                      icon={Receipt}
                                    />
                                  </p>
                                ) : isFinanceOrAdminUser ? (
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <input
                                      type="file"
                                      accept=".pdf,image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0] ?? null;
                                        setInstallmentProofDraftByIdx((prev) => ({
                                          ...prev,
                                          [idx]: file
                                        }));
                                      }}
                                      className="block w-full text-xs text-gray-600 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-sky-100 file:text-sky-900 dark:file:bg-sky-900/40 dark:file:text-sky-100"
                                    />
                                    <button
                                      type="button"
                                      disabled={
                                        !installmentProofDraftByIdx[idx] ||
                                        attachBoletoInstallmentProofMutation.isPending
                                      }
                                      onClick={() => {
                                        const file = installmentProofDraftByIdx[idx];
                                        if (!file) return;
                                        attachBoletoInstallmentProofMutation.mutate({
                                          id: selectedOrder.id,
                                          file,
                                          installmentIndex: idx
                                        });
                                      }}
                                      className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50"
                                    >
                                      {attachBoletoInstallmentProofMutation.isPending
                                        ? 'Enviando…'
                                        : 'Anexar comprovante'}
                                    </button>
                                  </div>
                                ) : (
                                  <p className="text-xs text-amber-700 dark:text-amber-300">
                                    Aguardando comprovante do financeiro.
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {isFinanceOrAdminUser && (
                      <>
                        <button
                          type="button"
                          disabled={submitProofValidationMutation.isPending || !canSubmitProofValidation}
                          onClick={() => submitProofValidationMutation.mutate(selectedOrder.id)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          {submitProofValidationMutation.isPending
                            ? 'Enviando…'
                            : 'Enviar para Validação Comprovante'}
                        </button>
                        {!financialEntriesLoading &&
                          !canSubmitProofValidation &&
                          proofValidationBlockers.map((message) => (
                            <p
                              key={message}
                              className="text-xs text-amber-700 dark:text-amber-300"
                            >
                              {message}
                            </p>
                          ))}
                      </>
                    )}
                  </div>
                )}
              {selectedOrder.status === 'APPROVED' &&
                selectedOrder.paymentType === 'BOLETO' &&
                showSequentialInstallmentProofSection(selectedOrder, hasFinancialEntryForOc) && (
                  <div className="rounded-lg border border-sky-200 dark:border-sky-900/50 bg-sky-50/60 dark:bg-sky-950/25 px-3 py-3 space-y-2">
                    <p className="text-xs font-semibold text-sky-900 dark:text-sky-200 uppercase tracking-wide">
                      Comprovante da parcela {(() => {
                        const idx = visiblePaymentBoletoInstallmentIndex(selectedOrder);
                        return idx != null ? `${idx + 1}/${selectedOrder.paymentParcelCount ?? 1}` : '';
                      })()}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Lançamento registrado. Anexe o comprovante desta parcela e envie para validação. Após a
                      validação, a OC volta para Pagamento (próxima parcela) ou Anexar NF (última parcela).
                    </p>
                    {(() => {
                      const instRows = parsePaymentBoletoInstallments(selectedOrder.paymentBoletoInstallments);
                      const curIdx = visiblePaymentBoletoInstallmentIndex(selectedOrder);
                      const curRow = curIdx != null ? instRows[curIdx] : undefined;
                      const proofUrl = (curRow?.installmentProofUrl || '').trim();
                      const proofName = (curRow?.installmentProofName || '').trim();
                      return proofUrl ? (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Comprovante desta parcela:{' '}
                          <a
                            href={absoluteUploadUrl(proofUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            {proofName || 'Abrir'}
                          </a>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Anexe o comprovante do pagamento desta parcela (PDF ou imagem).
                        </p>
                      );
                    })()}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => setInstallmentProofFileDraft(e.target.files?.[0] ?? null)}
                        className="block w-full text-xs text-gray-600 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-sky-100 file:text-sky-900 dark:file:bg-sky-900/40 dark:file:text-sky-100"
                      />
                      <button
                        type="button"
                        disabled={
                          !installmentProofFileDraft ||
                          attachBoletoInstallmentProofMutation.isPending ||
                          !selectedOrder
                        }
                        onClick={() => {
                          if (!selectedOrder || !installmentProofFileDraft) return;
                          const idx = visiblePaymentBoletoInstallmentIndex(selectedOrder);
                          if (idx == null) return;
                          attachBoletoInstallmentProofMutation.mutate({
                            id: selectedOrder.id,
                            file: installmentProofFileDraft,
                            installmentIndex: idx
                          });
                        }}
                        className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50"
                      >
                        {attachBoletoInstallmentProofMutation.isPending
                          ? 'Enviando…'
                          : 'Anexar / substituir comprovante da parcela'}
                      </button>
                    </div>
                    {isFinanceOrAdminUser && (
                      <>
                        <button
                          type="button"
                          disabled={submitProofValidationMutation.isPending || !canSubmitProofValidation}
                          onClick={() => submitProofValidationMutation.mutate(selectedOrder.id)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          {submitProofValidationMutation.isPending
                            ? 'Enviando…'
                            : 'Enviar para Validação Comprovante'}
                        </button>
                        {!financialEntriesLoading &&
                          !canSubmitProofValidation &&
                          proofValidationBlockers.map((message) => (
                            <p
                              key={message}
                              className="text-xs text-amber-700 dark:text-amber-300"
                            >
                              {message}
                            </p>
                          ))}
                      </>
                    )}
                  </div>
                )}
              {((selectedOrder.status === 'APPROVED' &&
                !orderNeedsPaymentBoleto(selectedOrder) &&
                canAttachComprovanteForBoletoOrder(selectedOrder) &&
                !useParallelBoletoPaymentFlow(selectedOrder)) ||
                selectedOrder.status === 'PENDING_PROOF_CORRECTION') && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/25 px-3 py-3 space-y-3">
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 uppercase tracking-wide">
                    {selectedOrder.status === 'PENDING_PROOF_CORRECTION'
                      ? 'Correção do comprovante'
                      : 'Comprovante de pagamento (fase Pagamento)'}
                  </p>
                  {selectedOrder.status === 'PENDING_PROOF_CORRECTION' && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      O comprovante precisa ser ajustado. Substitua o arquivo abaixo (se necessário) e reenvie para a
                      validação.
                    </p>
                  )}
                  {selectedOrder.paymentProofUrl?.trim() ? (
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Arquivo atual:{' '}
                      <a
                        href={absoluteUploadUrl(selectedOrder.paymentProofUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        {selectedOrder.paymentProofName || 'Abrir'}
                      </a>
                    </p>
                  ) : (() => {
                      const fromLast = lastPaidInstallmentProofUrl(selectedOrder);
                      return fromLast ? (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Comprovante da última parcela (será usado no envio à validação):{' '}
                          <a
                            href={absoluteUploadUrl(fromLast.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            {fromLast.name || 'Abrir'}
                          </a>
                          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Não é obrigatório anexar de novo aqui se o financeiro já anexou o comprovante ao pagar a
                            última parcela.
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Anexe o comprovante (PDF ou imagem) antes de enviar para validação.
                        </p>
                      );
                    })()}
                  {selectedOrder.status === 'PENDING_PROOF_CORRECTION' && !isFinanceOrAdminUser ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Apenas o financeiro pode substituir o comprovante e reenviar para validação.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={(e) => setProofFileDraft(e.target.files?.[0] ?? null)}
                          className="block w-full text-xs text-gray-600 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-emerald-100 file:text-emerald-900 dark:file:bg-emerald-900/40 dark:file:text-emerald-100"
                        />
                        <button
                          type="button"
                          disabled={
                            !proofFileDraft ||
                            attachPaymentProofMutation.isPending ||
                            !selectedOrder
                          }
                          onClick={() => {
                            if (!selectedOrder || !proofFileDraft) return;
                            attachPaymentProofMutation.mutate({ id: selectedOrder.id, file: proofFileDraft });
                          }}
                          className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {attachPaymentProofMutation.isPending ? 'Enviando…' : 'Anexar / substituir comprovante'}
                        </button>
                      </div>
                      {!financialEntriesLoading &&
                      !canSubmitProofValidation &&
                      proofValidationBlockers.length > 0 ? (
                        <div className="space-y-1">
                          {proofValidationBlockers.map((message) => (
                            <p
                              key={message}
                              className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-1.5"
                            >
                              {message}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={submitProofValidationMutation.isPending || !canSubmitProofValidation}
                          onClick={() => submitProofValidationMutation.mutate(selectedOrder.id)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          {submitProofValidationMutation.isPending
                            ? 'Enviando…'
                            : selectedOrder.status === 'PENDING_PROOF_CORRECTION'
                              ? 'Reenviar para validação do comprovante'
                              : 'Enviar para Validação Comprovante'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {stripOcCorrectionBlocksFromNotes(selectedOrder.notes) && (
                <OcDetailSection title="Observações">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {stripOcCorrectionBlocksFromNotes(selectedOrder.notes)}
                  </p>
                </OcDetailSection>
              )}

              <OcDetailSection title="Mapa de cotação">
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
              </OcDetailSection>
            </div>
            )}
            </div>
            <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-5 py-3 bg-gray-50/80 dark:bg-gray-900/40 rounded-b-xl">
            <div className="flex flex-wrap gap-2">
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
              {showListApprovalActions(selectedOrder.status) && (
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
              {showListApprovalActions(selectedOrder.status) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectTarget(selectedOrder);
                      setRejectReason('');
                    }}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => openOcCorrectionModal(selectedOrder)}
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
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => resubmitOcMutation.mutate(selectedOrder.id)}
                    disabled={resubmitOcMutation.isPending}
                    className="flex-1 min-w-[120px] px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {resubmitOcMutation.isPending ? 'Enviando…' : 'Enviar para Aprovação'}
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="mt-3 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Fechar
            </button>
            </div>
          </div>
        </div>
      )}

      {boletoParcelModalOrder && (
        <BoletoParcelasModal
          key={boletoParcelModalOrder.id}
          order={boletoParcelModalOrder}
          editable={
            boletoParcelModalOrder.status === 'APPROVED' &&
            boletoParcelModalOrder.paymentType === 'BOLETO' &&
            boletoParcelModalOrder.creator?.id === currentUserId
          }
          onClose={() => setBoletoParcelModalOrder(null)}
          onSaved={handleBoletoParcelsSaved}
          onReleaseToPayment={(id) => releasePaymentBoletoPhaseMutation.mutate(id)}
          releasePending={
            releasePaymentBoletoPhaseMutation.isPending &&
            releasePaymentBoletoPhaseMutation.variables === boletoParcelModalOrder.id
          }
        />
      )}

      {selectedOrder && financialEntryModalOpen && (
        <FinancialControlEntryFormModal
          isOpen={financialEntryModalOpen}
          onClose={() => {
            setFinancialEntryModalOpen(false);
            setEditingFinancialEntry(null);
          }}
          initialForm={
            editingFinancialEntry ? undefined : financialEntryInitialFormFromSelectedOrder
          }
          editingEntry={editingFinancialEntry}
          lockOcNumber={!editingFinancialEntry}
          simplifiedFromOc={!editingFinancialEntry}
          title={
            editingFinancialEntry
              ? `Editar lançamento — ${selectedOrder.orderNumber}`
              : `Registrar pagamento — ${selectedOrder.orderNumber}`
          }
        />
      )}

      {isApprovalFiltersModalOpen && (
        <div className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsApprovalFiltersModalOpen(false)}
            aria-hidden
          />
          <div className="relative mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
              <button
                type="button"
                onClick={() => setIsApprovalFiltersModalOpen(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Fechar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Exibir
                </label>
                <StringSingleSelectDropdown
                  value={approvalListPhase}
                  onChange={(v) => setApprovalListPhase(v as OcApprovalListPhase)}
                  options={OC_APPROVAL_LIST_PHASE_OPTIONS}
                  allowEmpty={false}
                />
              </div>
              {approvalListPhase === 'approved_by_me' ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Lista as OCs em que você registrou aprovação nesta fase (compras, gestor ou
                  diretoria), em qualquer status atual do fluxo.
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setApprovalListPhase('pending');
                  setIsApprovalFiltersModalOpen(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsApprovalFiltersModalOpen(false)}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={isPaymentDueFiltersModalOpen}
        onClose={() => setIsPaymentDueFiltersModalOpen(false)}
        title="Filtros — Pagamento"
        size="md"
        contentOverflowVisible
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Exibe OCs cuja parcela em aberto vence no período informado.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Vencimento (de)
              </label>
              <DatePickerField
                value={paymentDueFilters.dueDateFrom}
                onChange={(dueDateFrom) =>
                  setPaymentDueFilters((f) => ({ ...f, dueDateFrom }))
                }
                placeholder="dd/mm/aaaa"
                noFocusRing
                aria-label="Vencimento de"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Vencimento (até)
              </label>
              <DatePickerField
                value={paymentDueFilters.dueDateTo}
                onChange={(dueDateTo) => setPaymentDueFilters((f) => ({ ...f, dueDateTo }))}
                placeholder="dd/mm/aaaa"
                noFocusRing
                aria-label="Vencimento até"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPaymentDueFiltersModalOpen(false)}
            >
              Fechar
            </Button>
          </div>
        </div>
      </Modal>

      {isFinalizedFiltersModalOpen && (
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsFinalizedFiltersModalOpen(false)}
            aria-hidden
          />
          <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
              <button
                type="button"
                onClick={() => setIsFinalizedFiltersModalOpen(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Fechar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Data OC (de)
                  </label>
                  <input
                    type="date"
                    value={finalizedFilters.orderDateFrom}
                    onChange={(e) =>
                      setFinalizedFilters((f) => ({ ...f, orderDateFrom: e.target.value }))
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Data OC (até)
                  </label>
                  <input
                    type="date"
                    value={finalizedFilters.orderDateTo}
                    onChange={(e) =>
                      setFinalizedFilters((f) => ({ ...f, orderDateTo: e.target.value }))
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Fornecedor
                  </label>
                  <StringSingleSelectDropdown
                    value={finalizedFilters.supplierId}
                    onChange={(supplierId) =>
                      setFinalizedFilters((f) => ({ ...f, supplierId }))
                    }
                    options={supplierFilterSelectOptions}
                    allowEmpty={false}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Centro de custo
                  </label>
                  <StringSingleSelectDropdown
                    value={finalizedFilters.costCenterId}
                    onChange={(costCenterId) =>
                      setFinalizedFilters((f) => ({ ...f, costCenterId }))
                    }
                    options={costCenterFilterSelectOptions}
                    allowEmpty={false}
                  />
                </div>
              </div>
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                A exportação CSV usa a busca do cabeçalho e estes filtros (até 25 mil linhas).
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  clearFinalizedFilters();
                  setIsFinalizedFiltersModalOpen(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFinalizedFiltersModalOpen(false)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {ocActionMenu &&
        orderForActionMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0"
            style={{ zIndex: Z_ACTION_MENU }}
            onClick={() => setOcActionMenu(null)}
          >
            <div
              role="menu"
              className="absolute w-56 overflow-y-auto overflow-x-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
              style={{
                top: ocActionMenu.top,
                left: ocActionMenu.left,
                maxHeight: ocActionMenu.maxHeight,
                transform: ocActionMenu.placement === 'above' ? 'translateY(-100%)' : undefined,
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOcActionMenu(null);
                  openOrderDetail(orderForActionMenu);
                }}
                className={OC_MENU_ITEM_CLASS}
              >
                <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>Ver detalhes</span>
              </button>
              {activeTab === 'ATTACH_BOLETO' &&
                showInAttachBoletoTab(orderForActionMenu) &&
                orderForActionMenu.creator?.id === currentUserId && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcActionMenu(null);
                      setBoletoParcelModalOrder(orderForActionMenu);
                    }}
                    className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                  >
                    <Banknote className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                    <span>Anexar boleto</span>
                  </button>
                )}
              {activeTab === 'ATTACH_BOLETO' &&
                canSendCurrentBoletoToPayment(orderForActionMenu) &&
                orderForActionMenu.paymentBoletoPhaseReleased !== true && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={
                      releasePaymentBoletoPhaseMutation.isPending &&
                      releasePaymentBoletoPhaseMutation.variables === orderForActionMenu.id
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcActionMenu(null);
                      releasePaymentBoletoPhaseMutation.mutate(orderForActionMenu.id);
                    }}
                    className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                  >
                    {releasePaymentBoletoPhaseMutation.isPending &&
                    releasePaymentBoletoPhaseMutation.variables === orderForActionMenu.id ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Send className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    )}
                    <span>Enviar para Pagamento</span>
                  </button>
                )}
              {orderForActionMenu.status === 'APPROVED' &&
                activeTab !== 'ATTACH_BOLETO' &&
                isOcInFinancialLaunchPhase(orderForActionMenu) &&
                (() => {
                  const menuFinanceEntries =
                    financialEntriesByOcNumber.get(
                      orderForActionMenu.orderNumber.trim().toLowerCase()
                    ) ?? [];
                  const menuPaymentStatus = getOcPaymentListStatus(
                    orderForActionMenu,
                    menuFinanceEntries
                  );
                  if (menuPaymentStatus === 'pago') return null;
                  return (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOcActionMenu(null);
                        setFinancialEntryOrder(orderForActionMenu);
                      }}
                      className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                    >
                      <CircleDollarSign className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>Fazer lançamento</span>
                    </button>
                  );
                })()}
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOcActionMenu(null);
                  handleExportPdf(orderForActionMenu.id);
                }}
                disabled={pdfExportingId === orderForActionMenu.id}
                className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
              >
                {pdfExportingId === orderForActionMenu.id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-600 dark:text-slate-300" />
                ) : (
                  <Download className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                )}
                <span>Baixar OC</span>
              </button>
              {canUserAttachNfOnOrder(orderForActionMenu, currentUserId) && (
                <label
                  role="menuitem"
                  className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700 cursor-pointer`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {appendNfMutation.isPending &&
                  appendNfMutation.variables?.id === orderForActionMenu.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600 dark:text-teal-400" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                  )}
                  <span>Anexar NF</span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    disabled={
                      appendNfMutation.isPending &&
                      appendNfMutation.variables?.id === orderForActionMenu.id
                    }
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      setOcActionMenu(null);
                      if (file) {
                        appendNfMutation.mutate({ id: orderForActionMenu.id, file });
                      }
                    }}
                  />
                </label>
              )}
              {canUserFinalizeOcWithNf(orderForActionMenu, currentUserId) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOcActionMenu(null);
                    if (
                      !window.confirm(
                        'Finalizar esta OC? Ela irá para a fase Finalizadas. Confirme se todas as NFs necessárias foram anexadas.'
                      )
                    ) {
                      return;
                    }
                    completeOcToFinalizedMutation.mutate(orderForActionMenu.id);
                  }}
                  disabled={completeOcToFinalizedMutation.isPending}
                  className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                >
                  {completeOcToFinalizedMutation.isPending ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Send className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  )}
                  <span>Finalizar OC</span>
                </button>
              )}
              {orderForActionMenu.status === 'PENDING_PROOF_VALIDATION' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOcActionMenu(null);
                    if (
                      !window.confirm(
                        'Confirmar validação do comprovante e liberar a fase Anexar NF para o comprador?'
                      )
                    ) {
                      return;
                    }
                    validateProofMutation.mutate(orderForActionMenu.id);
                  }}
                  disabled={validateProofMutation.isPending}
                  className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                >
                  {validateProofMutation.isPending ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600 dark:text-teal-400" />
                  ) : (
                    <Check className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                  )}
                  <span>Validar comprovante</span>
                </button>
              )}
              {showListApprovalActions(orderForActionMenu.status) && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcActionMenu(null);
                      approveMutation.mutate({
                        id: orderForActionMenu.id,
                        currentStatus: orderForActionMenu.status
                      });
                    }}
                    disabled={approveMutation.isPending}
                    className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-green-600 dark:text-green-400" />
                    ) : (
                      <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    )}
                    <span>{approvalLabel(orderForActionMenu.status)}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcActionMenu(null);
                      openOcCorrectionModal(orderForActionMenu);
                    }}
                    className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                  >
                    <Wrench className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>Enviar para correção</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcActionMenu(null);
                      setRejectTarget(orderForActionMenu);
                      setRejectReason('');
                    }}
                    className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                  >
                    <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>Cancelar</span>
                  </button>
                </>
              )}
              {orderForActionMenu.status === 'IN_REVIEW' &&
                orderForActionMenu.creator?.id &&
                currentUserId === orderForActionMenu.creator.id && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOcActionMenu(null);
                        handleOpenEditOcForOrder(orderForActionMenu);
                      }}
                      disabled={orderDetailLoadingId === orderForActionMenu.id}
                      className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                    >
                      {orderDetailLoadingId === orderForActionMenu.id ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-600 dark:text-slate-300" />
                      ) : (
                        <Pencil className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
                      )}
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOcActionMenu(null);
                        resubmitOcMutation.mutate(orderForActionMenu.id);
                      }}
                      disabled={resubmitOcMutation.isPending}
                      className={`${OC_MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`}
                    >
                      {resubmitOcMutation.isPending ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <Send className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      )}
                      <span>Enviar para Aprovação</span>
                    </button>
                  </>
                )}
            </div>
          </div>,
          document.body
        )}

      <FinancialControlEntryModal
        isOpen={!!financialEntryOrder}
        onClose={() => setFinancialEntryOrder(null)}
        initialValues={financialEntryInitialValues}
        simplifiedFromOc
      />
    </>
  );
}

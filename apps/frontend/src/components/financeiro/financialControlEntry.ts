import { parsePaymentBoletoInstallments } from '@/components/oc/ocPaymentBoleto';

export type FinancialControlStatus =
  | 'PROCESSO_COMPLETO'
  | 'PAGO'
  | 'AGUARDAR_NOTA'
  | 'CANCELADO';

export interface FinancialControlEntry {
  id: string;
  paymentMonth: number;
  paymentYear: number;
  status: FinancialControlStatus;
  osCode: string | null;
  supplierName: string | null;
  parcelNumber: string | null;
  emissionDate: string | null;
  boleto: string | null;
  dueDate: string | null;
  originalValue: string | number | null;
  ocNumber: string | null;
  finalValue: string | number | null;
  paidDate: string | null;
  remainingDays: number | null;
  receivedNote: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const STATUS_OPTIONS: { value: FinancialControlStatus; label: string }[] = [
  { value: 'PAGO', label: 'PAGO' },
  { value: 'AGUARDAR_NOTA', label: 'PENDENTE' },
  { value: 'CANCELADO', label: 'CANCELADO' },
];

export interface EntryFormState {
  id?: string;
  paymentMonth: number;
  paymentYear: number;
  status: FinancialControlStatus;
  osCode: string;
  supplierName: string;
  parcelNumber: string;
  emissionDate: string;
  boleto: string;
  dueDate: string;
  originalValue: string;
  ocNumber: string;
  finalValue: string;
  paidDate: string;
  remainingDays: string;
  receivedNote: string;
  notes: string;
}

export function parseCurrencyInput(value: string): number | null {
  if (!value) return null;
  const digitsOnly = value.replace(/\D/g, '');
  if (!digitsOnly) return null;
  const n = parseInt(digitsOnly, 10) / 100;
  return isNaN(n) ? null : n;
}

export function formatCurrencyValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function calcRemainingDays(dueDate: string, paidDate: string): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return null;
  const ref = paidDate ? new Date(paidDate) : new Date();
  if (isNaN(ref.getTime())) return null;
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

export function dateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildInitialForm(month: number, year: number): EntryFormState {
  return {
    paymentMonth: month,
    paymentYear: year,
    status: 'AGUARDAR_NOTA',
    osCode: '',
    supplierName: '',
    parcelNumber: '',
    emissionDate: '',
    boleto: 'Não',
    dueDate: '',
    originalValue: '',
    ocNumber: '',
    finalValue: '',
    paidDate: '',
    remainingDays: '',
    receivedNote: '',
    notes: '',
  };
}

export function entryToForm(entry: FinancialControlEntry): EntryFormState {
  return {
    id: entry.id,
    paymentMonth: entry.paymentMonth,
    paymentYear: entry.paymentYear,
    status: entry.status,
    osCode: entry.osCode || '',
    supplierName: entry.supplierName || '',
    parcelNumber: entry.parcelNumber || '',
    emissionDate: dateInputValue(entry.emissionDate),
    boleto: entry.boleto || '',
    dueDate: dateInputValue(entry.dueDate),
    originalValue: formatCurrencyValue(entry.originalValue),
    ocNumber: entry.ocNumber || '',
    finalValue: formatCurrencyValue(entry.finalValue),
    paidDate: dateInputValue(entry.paidDate),
    remainingDays:
      entry.remainingDays !== null && entry.remainingDays !== undefined ? String(entry.remainingDays) : '',
    receivedNote: entry.receivedNote || '',
    notes: entry.notes || '',
  };
}

export function buildFinancialEntryPayload(form: EntryFormState) {
  const computedRemainingDays = calcRemainingDays(form.dueDate, form.paidDate);
  return {
    paymentMonth: form.paymentMonth,
    paymentYear: form.paymentYear,
    status: form.status,
    osCode: form.osCode || null,
    supplierName: form.supplierName || null,
    parcelNumber: form.parcelNumber || null,
    emissionDate: form.emissionDate || null,
    boleto: form.boleto || null,
    dueDate: form.dueDate || null,
    originalValue: parseCurrencyInput(form.originalValue),
    ocNumber: form.ocNumber || null,
    finalValue: parseCurrencyInput(form.finalValue),
    paidDate: form.paidDate || null,
    remainingDays: computedRemainingDays,
    receivedNote: form.receivedNote || null,
    notes: form.notes || null,
  };
}

function orderItemsTotal(items: Array<{ totalPrice: number }>): number {
  return items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
}

export function orderGrandTotalForFinancialEntry(order: {
  items: Array<{ totalPrice: number }>;
  freightAmount?: number | string | null;
  amountToPay?: number | string | null;
}): number {
  const items = orderItemsTotal(order.items);
  const fRaw = order.freightAmount;
  if (fRaw != null && fRaw !== '' && Number.isFinite(Number(fRaw))) {
    return Math.round((items + Number(fRaw)) * 100) / 100;
  }
  const paid = order.amountToPay != null && order.amountToPay !== '' ? Number(order.amountToPay) : NaN;
  if (Number.isFinite(paid)) return paid;
  return Math.round(items * 100) / 100;
}

/** Pré-preenche o formulário a partir de uma OC (fase pagamento). */
export function buildFormFromPurchaseOrder(order: {
  orderNumber: string;
  orderDate: string;
  paymentType?: string | null;
  paymentBoletoInstallments?: unknown;
  paymentParcelCount?: number;
  supplier?: { name: string };
  materialRequest?: {
    serviceOrder?: string | null;
    requestNumber?: string;
    costCenter?: { name?: string | null; code?: string | null };
  } | null;
  items: Array<{ totalPrice: number }>;
  freightAmount?: number | string | null;
  amountToPay?: number | string | null;
}): EntryFormState {
  const now = new Date();
  const base = buildInitialForm(now.getMonth() + 1, now.getFullYear());
  const total = orderGrandTotalForFinancialEntry(order);
  const totalStr = formatCurrencyValue(total);

  const osCode =
    order.materialRequest?.serviceOrder?.trim() ||
    order.materialRequest?.costCenter?.code?.trim() ||
    order.materialRequest?.costCenter?.name?.trim() ||
    '';

  let parcelNumber = '';
  let dueDate = '';
  if (order.paymentType === 'BOLETO' && order.paymentBoletoInstallments) {
    const rows = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
    const n = order.paymentParcelCount ?? rows.length ?? 1;
    const idx = rows.findIndex((r) => r.paymentStatus !== 'PAID');
    const pick = idx >= 0 ? rows[idx] : rows[0];
    if (pick) {
      dueDate = pick.dueDate || '';
      parcelNumber = n > 1 ? `${idx >= 0 ? idx + 1 : 1}/${n}` : '1/1';
    }
  }

  const scRef = order.materialRequest?.requestNumber
    ? `SC: ${order.materialRequest.requestNumber}`
    : '';

  return {
    ...base,
    osCode,
    supplierName: order.supplier?.name || '',
    ocNumber: order.orderNumber,
    originalValue: totalStr,
    finalValue: totalStr,
    emissionDate: dateInputValue(order.orderDate),
    boleto: order.paymentType === 'BOLETO' ? 'Sim' : 'Não',
    parcelNumber,
    dueDate,
    notes: scRef,
    receivedNote: `Lançamento originado da OC ${order.orderNumber}`,
  };
}

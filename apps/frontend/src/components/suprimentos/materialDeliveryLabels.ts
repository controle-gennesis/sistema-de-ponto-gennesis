export const CURRENT_STATUS_OPTIONS = [
  { value: 'ENTREGA_FORNECEDOR_CIF', label: 'Entrega Fornecedor - CIF', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200' },
  { value: 'APROVADO_SUPRIMENTOS', label: 'Aprovado - Suprimentos', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200' },
  { value: 'ENTREGA_LOGISTICA_FOB', label: 'Entrega Logística - FOB', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  { value: 'ENTREGUE', label: 'Entregue', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  { value: 'APROVAR_DIR', label: 'Aprovar - DIR', className: 'bg-red-700 text-white dark:bg-red-800 dark:text-red-100' },
  { value: 'CANCELADO', label: 'Cancelado', className: 'bg-gray-700 text-white dark:bg-gray-600 dark:text-gray-100' },
] as const;

export const PAYMENT_STATUS_OPTIONS = [
  { value: 'OK', label: 'Ok', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  { value: 'AGUARDANDO_PAGAMENTO', label: 'Aguardando - Pagamento', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200' },
  { value: 'BOLETO', label: 'Boleto', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
  { value: 'A_VISTA', label: 'À Vista', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200' },
  { value: 'CANCELADO', label: 'Cancelado', className: 'bg-gray-700 text-white dark:bg-gray-600 dark:text-gray-100' },
  { value: 'CREDITO', label: 'Crédito', className: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200' },
] as const;

export const STOCK_SHORTFALL_TYPE_OPTIONS = [
  { value: 'NORMAL', label: 'Normal', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { value: 'CORRECAO', label: 'Correção', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
] as const;

export const FINAL_STATUS_OPTIONS = [
  { value: 'PENDENTE', label: 'Pendente', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  { value: 'CONCLUIDO', label: 'Concluído', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  { value: 'CANCELADO', label: 'Cancelado', className: 'bg-gray-700 text-white dark:bg-gray-600 dark:text-gray-100' },
] as const;

export const POLO_OPTIONS = [
  { value: 'DF', label: 'DF' },
  { value: 'GO', label: 'GO' },
] as const;

export const DELIVERY_TYPE_OPTIONS = [
  { value: 'CIF', label: 'Entrega Fornecedor - CIF' },
  { value: 'FOB', label: 'Entrega Logística - FOB' },
] as const;

export type CurrentStatusValue = (typeof CURRENT_STATUS_OPTIONS)[number]['value'];
export type PaymentStatusValue = (typeof PAYMENT_STATUS_OPTIONS)[number]['value'];
export type StockShortfallTypeValue = (typeof STOCK_SHORTFALL_TYPE_OPTIONS)[number]['value'];
export type FinalStatusValue = (typeof FINAL_STATUS_OPTIONS)[number]['value'];
export type PoloValue = (typeof POLO_OPTIONS)[number]['value'];
export type DeliveryTypeValue = (typeof DELIVERY_TYPE_OPTIONS)[number]['value'];

export function normalizeDeliveryType(value: string | null | undefined): DeliveryTypeValue | '' {
  if (!value) return '';
  const upper = value.trim().toUpperCase();
  if (upper === 'CIF' || upper.includes('CIF')) return 'CIF';
  if (upper === 'FOB' || upper.includes('FOB')) return 'FOB';
  return '';
}

export function statusBadge(
  value: string | null | undefined,
  options: readonly { value: string; label: string; className: string }[]
) {
  const found = options.find((o) => o.value === value);
  if (!found) return { label: value || '—', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
  return { label: found.label, className: found.className };
}

export function formatCurrency(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function shortfallTypeLabel(value: StockShortfallTypeValue | null | undefined): string {
  if (!value) return '—';
  return statusBadge(value, STOCK_SHORTFALL_TYPE_OPTIONS).label;
}

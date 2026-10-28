export type ToolRentalRequestStatus =
  | 'OPEN'
  | 'SUPPLIER_RELATION'
  | 'QUOTATION'
  | 'AWAITING_PAYMENT'
  | 'AWAITING_RECEIPT'
  | 'IN_USE'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type ToolRentalDemandType = 'NOVA_LOCACAO' | 'RENOVACAO' | 'DEVOLUCAO' | 'COMPRA';

export type ToolRentalPriority = 'NORMAL' | 'URGENT';

export type ToolRentalLogisticsMode =
  | 'ENTREGA_LOGISTICA'
  | 'RETIRADA_LOGISTICA'
  | 'ENTREGA_FORNECEDOR'
  | 'RETIRADA_FORNECEDOR';

export const TOOL_RENTAL_STATUS_LABELS: Record<ToolRentalRequestStatus, string> = {
  OPEN: 'Aberta',
  SUPPLIER_RELATION: 'Em análise',
  QUOTATION: 'Cotação',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  AWAITING_RECEIPT: 'Aguardando recebimento',
  IN_USE: 'Em uso',
  COMPLETED: 'Finalizada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

export const TOOL_RENTAL_STATUS_BADGE: Record<ToolRentalRequestStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  SUPPLIER_RELATION: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  QUOTATION: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  AWAITING_PAYMENT: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  AWAITING_RECEIPT: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  IN_USE: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export const TOOL_RENTAL_DEMAND_LABELS: Record<ToolRentalDemandType, string> = {
  NOVA_LOCACAO: 'Locação',
  RENOVACAO: 'Renovação',
  DEVOLUCAO: 'Devolução',
  COMPRA: 'Compra',
};

export const TOOL_RENTAL_DEMAND_OPTIONS = (
  [
    { value: 'NOVA_LOCACAO', label: 'Locação' },
    { value: 'RENOVACAO', label: 'Renovação' },
    { value: 'DEVOLUCAO', label: 'Devolução' },
    { value: 'COMPRA', label: 'Compra' },
  ] as const
).map((opt) => opt);

export const TOOL_RENTAL_PRIORITY_LABELS: Record<ToolRentalPriority, string> = {
  NORMAL: 'Normal',
  URGENT: 'Urgente',
};

export const TOOL_RENTAL_PRIORITY_OPTIONS = (['NORMAL', 'URGENT'] as const).map((value) => ({
  value,
  label: TOOL_RENTAL_PRIORITY_LABELS[value],
  searchText: TOOL_RENTAL_PRIORITY_LABELS[value],
}));

export const TOOL_RENTAL_LOGISTICS_LABELS: Record<ToolRentalLogisticsMode, string> = {
  ENTREGA_LOGISTICA: 'Entrega pela logística',
  RETIRADA_LOGISTICA: 'Retirada pela logística',
  ENTREGA_FORNECEDOR: 'Entrega pelo fornecedor',
  RETIRADA_FORNECEDOR: 'Retirada pelo fornecedor',
};

export const TOOL_RENTAL_LOGISTICS_OPTIONS = (
  [
    'ENTREGA_LOGISTICA',
    'RETIRADA_LOGISTICA',
    'ENTREGA_FORNECEDOR',
    'RETIRADA_FORNECEDOR',
  ] as const
).map((value) => ({
  value,
  label: TOOL_RENTAL_LOGISTICS_LABELS[value],
  searchText: TOOL_RENTAL_LOGISTICS_LABELS[value],
}));

export function formatToolRentalStatus(status: string): string {
  return TOOL_RENTAL_STATUS_LABELS[status as ToolRentalRequestStatus] || status || '—';
}

export function toolRentalStatusBadgeClass(status: string): string {
  return (
    TOOL_RENTAL_STATUS_BADGE[status as ToolRentalRequestStatus] ||
    TOOL_RENTAL_STATUS_BADGE.OPEN
  );
}

/**
 * - IN_USE → Em uso
 * - COMPLETED/AWAITING_RECEIPT sem receivedAt → Aguardando recebimento
 * - COMPLETED com receivedAt → Finalizada (encerrada por renovação/devolução ou legado)
 */
export function resolveToolRentalDisplayStatus(
  status: string,
  receivedAt?: string | null,
): ToolRentalRequestStatus | string {
  if (status === 'IN_USE') return 'IN_USE';
  if (status === 'COMPLETED' || status === 'AWAITING_RECEIPT') {
    return receivedAt ? 'COMPLETED' : 'AWAITING_RECEIPT';
  }
  return status;
}

/** Texto auxiliar de prazo quando status (display) é Em uso. */
export function formatToolRentalInUsePeriodHint(periodoFim?: string | null): {
  text: string;
  tone: 'ok' | 'today' | 'overdue';
} | null {
  if (!periodoFim) return null;
  const end = new Date(periodoFim);
  if (Number.isNaN(end.getTime())) return null;
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((endDay.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) {
    const overdue = Math.abs(diffDays);
    return {
      text: overdue === 1 ? 'Período vencido · há 1 dia' : `Período vencido · há ${overdue} dias`,
      tone: 'overdue',
    };
  }
  if (diffDays === 0) {
    return { text: 'Em uso · vence hoje', tone: 'today' };
  }
  if (diffDays === 1) {
    return { text: 'Em uso · falta 1 dia', tone: 'ok' };
  }
  return { text: `Em uso · faltam ${diffDays} dias`, tone: 'ok' };
}

export function formatToolRentalDemand(type: string): string {
  return TOOL_RENTAL_DEMAND_LABELS[type as ToolRentalDemandType] || type || '—';
}

export function formatToolRentalPriority(priority: string): string {
  return TOOL_RENTAL_PRIORITY_LABELS[priority as ToolRentalPriority] || priority || '—';
}

export function formatToolRentalLogistics(mode: string): string {
  return TOOL_RENTAL_LOGISTICS_LABELS[mode as ToolRentalLogisticsMode] || mode || '—';
}

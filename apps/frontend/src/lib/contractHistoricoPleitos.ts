import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { formatOsSePasta } from '@/lib/formatOsSePasta';

export const PLEITO_HISTORY_MARKER = '__PLEITO_HISTORICO__';
export const PLEITO_HISTORY_MARKER_GERADO_100 = '__PLEITO_HISTORICO__GERADO_100__';
export const HISTORICO_ETIQUETA_GERADO_100 = 'Gerado 100%';
export const HISTORICO_ETIQUETA_FATURADO_100 = 'Faturado';
export const HISTORICO_ETIQUETA_FATURADO_PARCIAL = 'Faturado parcial';

export interface ContractPleitoHistorico {
  id: string;
  divSe: string | null;
  folderNumber: string | null;
  serviceDescription: string;
  budget: string | null;
  budgetStatus: string | null;
  executionStatus: string | null;
  billingStatus: string | null;
  invoiceNumber: string | null;
  creationMonth: string | null;
  creationYear: number | null;
  billingRequest?: number | null;
  accumulatedBilled?: number | null;
  reportsBilling: string | null;
  createdAt?: string;
}

export interface ContractBillingHistorico {
  id: string;
  pleitoId?: string | null;
  serviceOrder: string;
  grossValue: number;
}

const MESES_FILTRO = [
  { value: 0, label: 'Todos os meses' },
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

export const HIST_MONTH_FILTER_OPTIONS = labeledToSelectOptions(
  [{ value: 'all', label: 'Todos' }, ...MESES_FILTRO.filter((m) => m.value > 0).map((m) => ({
    value: String(m.value),
    label: m.label,
  }))]
);

export const HIST_ETIQUETA_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todas' },
  { value: 'gerado-100', label: HISTORICO_ETIQUETA_GERADO_100 },
  { value: 'faturado-parcial', label: HISTORICO_ETIQUETA_FATURADO_PARCIAL },
  { value: 'faturado-100', label: HISTORICO_ETIQUETA_FATURADO_100 },
]);

export const BILLING_STATUS_ROW_OPTIONS = labeledToSelectOptions([
  { value: 'nao-pago', label: 'Não pago' },
  { value: 'pago', label: 'Pago' },
]);

export function formatHistoricoCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function parseBudgetToNumberSafe(v: string | null | undefined): number {
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function getDateYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

export function getDateMonth(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.getMonth() + 1;
}

export function isPleitoHistorico(p: ContractPleitoHistorico): boolean {
  return (p.reportsBilling || '').trim() === PLEITO_HISTORY_MARKER;
}

export function isGeneratedPleito(p: ContractPleitoHistorico): boolean {
  return (
    isPleitoHistorico(p) ||
    (p.billingRequest != null ? Number(p.billingRequest) : 0) > 0
  );
}

export function isPleitoGerado100(p: ContractPleitoHistorico): boolean {
  const marker = (p.reportsBilling || '').trim();
  if (marker === PLEITO_HISTORY_MARKER_GERADO_100) return true;
  const orc = parseBudgetToNumberSafe(p.budget);
  const br = p.billingRequest != null ? Number(p.billingRequest) : 0;
  return orc > 0 && br >= orc - 0.01;
}

export function getPleitoBillableTotal(p: ContractPleitoHistorico): number {
  const br = p.billingRequest != null ? Number(p.billingRequest) : 0;
  if (Number.isFinite(br) && br > 0) return br;
  return parseBudgetToNumberSafe(p.budget);
}

export function getPleitoBilledAmount(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): number {
  const linked = billings
    .filter((b) => b.pleitoId === p.id)
    .reduce((sum, b) => sum + Number(b.grossValue || 0), 0);
  if (linked > 0) return linked;
  const accumulated = p.accumulatedBilled != null ? Number(p.accumulatedBilled) : 0;
  if (accumulated > 0) return accumulated;
  const os = (p.divSe || '').trim();
  if (!os) return 0;
  return billings
    .filter((b) => !b.pleitoId && (b.serviceOrder || '').trim() === os)
    .reduce((sum, b) => sum + Number(b.grossValue || 0), 0);
}

export function getPleitoRemainingBalance(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): number {
  const total = getPleitoBillableTotal(p);
  if (total <= 0) return 0;
  return Math.max(0, total - getPleitoBilledAmount(p, billings));
}

export function isPleitoFullyBilled(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): boolean {
  return getPleitoRemainingBalance(p, billings) <= 0.01;
}

export function canHistoricoFaturar100(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): boolean {
  const total = getPleitoBillableTotal(p);
  if (total <= 0) return false;
  return getPleitoBilledAmount(p, billings) <= 0.01;
}

export function getHistoricoClientePagoLabel(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): 'Pago' | 'Não pago' {
  return isPleitoFullyBilled(p, billings) ? 'Pago' : 'Não pago';
}

export function historicoClientePagoClass(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): string {
  return isPleitoFullyBilled(p, billings)
    ? 'text-sm font-semibold text-emerald-700 dark:text-emerald-400'
    : 'text-sm font-medium text-gray-600 dark:text-gray-400';
}

export function canHistoricoFaturarRestante(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): boolean {
  const billed = getPleitoBilledAmount(p, billings);
  const remaining = getPleitoRemainingBalance(p, billings);
  return billed > 0.01 && remaining > 0.01;
}

export function canHistoricoFaturar(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): boolean {
  return getPleitoRemainingBalance(p, billings) > 0.01;
}

export function parseHistoricoCurrencyInput(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const cleaned = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function getHistoricoEtiqueta(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): string | null {
  if (isPleitoFullyBilled(p, billings)) return HISTORICO_ETIQUETA_FATURADO_100;
  if (getPleitoBilledAmount(p, billings) > 0.01) return HISTORICO_ETIQUETA_FATURADO_PARCIAL;
  if (isPleitoGerado100(p)) return HISTORICO_ETIQUETA_GERADO_100;
  return null;
}

export function historicoEtiquetaBadgeClass(etiqueta: string): string {
  if (etiqueta === HISTORICO_ETIQUETA_FATURADO_100) {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
  }
  if (etiqueta === HISTORICO_ETIQUETA_FATURADO_PARCIAL) {
    return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300';
  }
  if (etiqueta === HISTORICO_ETIQUETA_GERADO_100) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
}

export function formatPleitoOsLabel(p: ContractPleitoHistorico): string {
  return formatOsSePasta(p.divSe || '-', p.folderNumber);
}

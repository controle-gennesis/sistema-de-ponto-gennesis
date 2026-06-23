import {
  isNaturezaExcludedFromContractPaidTotal,
  normalizeNaturezaLabel
} from '@/lib/contractPaidNaturezaExclusions';

/** Única natureza exibida como movimentação financeira no drill-down de Gastos Operacionais. */
const GASTOS_OPERACIONAIS_MOV_FINANCEIRA_NATUREZAS = [
  'REPASSE AO ADM - SAIDA - SV'
] as const;

const GASTOS_OPERACIONAIS_MOV_FINANCEIRA_KEYS = new Set(
  GASTOS_OPERACIONAIS_MOV_FINANCEIRA_NATUREZAS.map((natureza) => normalizeNaturezaLabel(natureza))
);

export function isGastosOperacionaisMovFinanceiraNatureza(natureza: string): boolean {
  return GASTOS_OPERACIONAIS_MOV_FINANCEIRA_KEYS.has(normalizeNaturezaLabel(natureza));
}

/** Oculta só mov. financeiras da blocklist (exceto repasse ao ADM, que aparece à parte). */
export function isGastosOperacionaisHiddenNatureza(natureza: string): boolean {
  if (isGastosOperacionaisMovFinanceiraNatureza(natureza)) return false;
  return isNaturezaExcludedFromContractPaidTotal(natureza);
}

/** Exibe gastos operacionais + repasse ao ADM; demais mov. financeiras ficam ocultas. */
export function shouldShowInGastosNaturezaModal(natureza: string): boolean {
  const key = normalizeNaturezaLabel(natureza);
  if (!key || key === '—' || key === '-') return false;
  return !isGastosOperacionaisHiddenNatureza(natureza);
}

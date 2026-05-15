/**
 * Naturezas que não entram no "Total Pago" do contrato (RM / Fluig).
 * Comparação normalizada (maiúsculas, sem acentos, espaços colapsados).
 */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeNaturezaLabel(natureza: string): string {
  return stripDiacritics(String(natureza ?? ''))
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Naturezas excluídas do total pago / da lista na modal — alinhado às capturas:
 * todas as linhas com checkbox desmarcado; as marcadas NÃO entram aqui.
 */
const EXCLUDED_FROM_CONTRACT_PAID_TOTAL = [
  // Captura 1 (desmarcadas)
  'RECEITA - MANUTENCAO',
  'TRANSFERENCIA - ENTRADA',
  'EMPRESTIMO ENTRE PROJETOS - SAIDA - SV',
  'EMPRESTIMO ENTRE PROJETOS - ENTRADA',
  'TRANSFERENCIA - SAIDA - SV',
  'EMPRESTIMO BANCARIO - SAIDA - SV',
  'EMPRESTIMO BANCARIO - ENTRADA',
  // Captura 2 (todas desmarcadas)
  'EMPRESTIMO DE SOCIOS - ENTRADA',
  'EMPRESTIMO DE SOCIOS - SAIDA - SV',
  'REPASSE AO ADM - SAIDA - SV',
  'REPASSES A DEMANDAS DA DIRETORIA - SV',
  'REEMBOLSO ENTRE CONTRATOS - ENTRADA',
  'DISTRIBUICAO DE LUCROS - SV',
  // Captura 3 (desmarcadas; INSUMOS - HIDRAULICA estava marcada — fora desta lista)
  'DEVOLUCAO PAGAMENTO INDEVIDO',
  'REEMBOLSO ENTRE CONTRATOS - SAIDA - SV',
  // Captura 4
  'PAGAMENTO INDEVIDO - SV',
  'PRO-LABORE',
  // Capturas 5–7
  'CONSIGNADOS DE COLABORADORES - SV',
  'REPASSE AO ADM - ENTRADA',
  'RENDIMENTOS DE APLICACOES FINANCEIRAS'
] as const;

const EXCLUDED_NORMALIZED = new Set(
  EXCLUDED_FROM_CONTRACT_PAID_TOTAL.map((n) => normalizeNaturezaLabel(n))
);

export function isNaturezaExcludedFromContractPaidTotal(natureza: string): boolean {
  const key = normalizeNaturezaLabel(natureza);
  if (!key || key === '—' || key === '-') return false;
  return EXCLUDED_NORMALIZED.has(key);
}

export function sumPaidByNaturezaRows(
  rows: { natureza: string; total: number; count?: number }[],
  options?: { excludeDefaultNaturezas?: boolean }
): { total: number; count: number; excludedTotal: number; excludedCount: number } {
  const exclude = options?.excludeDefaultNaturezas !== false;
  let total = 0;
  let count = 0;
  let excludedTotal = 0;
  let excludedCount = 0;
  for (const r of rows) {
    const skip = exclude && isNaturezaExcludedFromContractPaidTotal(r.natureza);
    if (skip) {
      excludedTotal += r.total;
      excludedCount += r.count ?? 0;
    } else {
      total += r.total;
      count += r.count ?? 0;
    }
  }
  return { total, count, excludedTotal, excludedCount };
}

export function sumPaidFluigSolicitations(
  rows: { natureza: string; valor: number }[],
  options?: { excludeDefaultNaturezas?: boolean }
): { total: number; count: number; excludedTotal: number; excludedCount: number } {
  const exclude = options?.excludeDefaultNaturezas !== false;
  let total = 0;
  let count = 0;
  let excludedTotal = 0;
  let excludedCount = 0;
  for (const r of rows) {
    const skip = exclude && isNaturezaExcludedFromContractPaidTotal(r.natureza);
    if (skip) {
      excludedTotal += r.valor;
      excludedCount += 1;
    } else {
      total += r.valor;
      count += 1;
    }
  }
  return { total, count, excludedTotal, excludedCount };
}

/** Linhas que aparecem na modal de totais por natureza (fixas já removidas da lista). */
export function filterNaturezaRowsForPaidModalDisplay<T extends { natureza: string }>(
  rows: T[]
): T[] {
  return rows.filter((r) => !isNaturezaExcludedFromContractPaidTotal(r.natureza));
}

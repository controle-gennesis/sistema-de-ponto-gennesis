import type { ExtratoCaixaItem } from '@/app/ponto/financeiro/analise-extrato/extratoCaixaTypes';
import { normalizeBudgetNatureCode } from '@/lib/budgetNatureMatch';

export const SEM_NATUREZA_KEY = '__SEM_NAT__';
export const SEM_CENTRO_CUSTO_KEY = '__SEM_CC__';
export const SEM_FILIAL_KEY = '__SEM_FILIAL__';
export const SEM_FORNECEDOR_KEY = '__SEM_FORN__';

/** Tipo de operação das linhas geradas por ajuste manual no extrato. */
export const EXTRATO_TIPO_OPERACAO_AJUSTE_MANUAL = 'Ajuste manual';

export function isExtratoAjusteManual(
  item: Pick<ExtratoCaixaItem, 'isAjusteManual' | 'ajusteId'>
): boolean {
  return Boolean(item.isAjusteManual || item.ajusteId);
}

export type AjusteSelectOption = { value: string; label: string };

export function buildCcSelectOptions(items: ExtratoCaixaItem[]): AjusteSelectOption[] {
  const byCode = new Map<string, AjusteSelectOption>();
  let hasSem = false;
  for (const item of items) {
    const code = item.codCCusto.trim();
    if (!code) {
      hasSem = true;
      continue;
    }
    const key = code.toUpperCase();
    if (byCode.has(key)) continue;
    const label = item.ccusto.trim() || code;
    byCode.set(key, { value: code, label });
  }
  const options = Array.from(byCode.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR')
  );
  if (hasSem) {
    options.unshift({ value: SEM_CENTRO_CUSTO_KEY, label: 'Sem centro de custo' });
  }
  return options;
}

export function buildNatureSelectOptions(items: ExtratoCaixaItem[]): AjusteSelectOption[] {
  const byCode = new Map<string, AjusteSelectOption>();
  let hasSem = false;
  for (const item of items) {
    const code = normalizeBudgetNatureCode(item.codNatFinanceira);
    if (!code) {
      hasSem = true;
      continue;
    }
    const key = code.toUpperCase();
    if (byCode.has(key)) continue;
    const label = item.natureza.trim() || code;
    byCode.set(key, { value: code, label });
  }
  const options = Array.from(byCode.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR')
  );
  if (hasSem) {
    options.unshift({ value: SEM_NATUREZA_KEY, label: 'Sem natureza financeira' });
  }
  return options;
}

export function buildFornecedorSelectOptions(items: ExtratoCaixaItem[]): AjusteSelectOption[] {
  const names = new Set<string>();
  let hasSem = false;
  for (const item of items) {
    const n = item.fornecedor.trim();
    if (n) names.add(n);
    else hasSem = true;
  }
  const options = Array.from(names)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((name) => ({ value: name, label: name }));
  if (hasSem) {
    options.unshift({ value: SEM_FORNECEDOR_KEY, label: 'Sem fornecedor' });
  }
  return options;
}

export function resolveCcFromSelect(
  value: string,
  items: ExtratoCaixaItem[]
): { codCCusto: string; ccusto: string } {
  if (value === SEM_CENTRO_CUSTO_KEY) {
    return { codCCusto: '', ccusto: 'Sem centro de custo' };
  }
  const match = items.find((i) => i.codCCusto.trim() === value);
  const label = match?.ccusto.trim() || value;
  return { codCCusto: value, ccusto: label };
}

export function resolveNatureFromSelect(
  value: string,
  items: ExtratoCaixaItem[]
): { codNatFinanceira: string; natureza: string } {
  if (value === SEM_NATUREZA_KEY) {
    return { codNatFinanceira: '', natureza: 'Sem natureza financeira' };
  }
  const match = items.find(
    (i) => normalizeBudgetNatureCode(i.codNatFinanceira) === value
  );
  const label = match?.natureza.trim() || value;
  return { codNatFinanceira: value, natureza: label };
}

export function resolveFornecedorFromSelect(value: string): string {
  if (value === SEM_FORNECEDOR_KEY) return '';
  return value;
}

/** Valor usado no select de centro de custo a partir do ajuste salvo. */
export function ccSelectValueFromAjuste(ajuste: {
  codCCusto: string;
  ccusto: string;
}): string {
  if (!ajuste.codCCusto.trim()) return SEM_CENTRO_CUSTO_KEY;
  return ajuste.codCCusto.trim();
}

export function natureSelectValueFromAjuste(ajuste: {
  codNatFinanceira: string;
}): string {
  if (!normalizeBudgetNatureCode(ajuste.codNatFinanceira)) return SEM_NATUREZA_KEY;
  return normalizeBudgetNatureCode(ajuste.codNatFinanceira);
}

export function fornecedorSelectValueFromAjuste(fornecedor: string): string {
  if (!fornecedor.trim()) return SEM_FORNECEDOR_KEY;
  return fornecedor.trim();
}

export type ExtratoCaixaAjuste = {
  id: string;
  dataCompensacao: string;
  codCCusto: string;
  ccusto: string;
  codNatFinanceira: string;
  natureza: string;
  codFilial: number | null;
  fornecedor: string;
  valor: number;
  observacao: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExtratoCaixaAjusteForm = {
  dataCompensacao: string;
  codCCusto: string;
  ccusto: string;
  codNatFinanceira: string;
  natureza: string;
  codFilial: string;
  fornecedor: string;
  valor: string;
  observacao: string;
};

export const EMPTY_AJUSTE_FORM: ExtratoCaixaAjusteForm = {
  dataCompensacao: '',
  codCCusto: '',
  ccusto: '',
  codNatFinanceira: '',
  natureza: '',
  codFilial: '',
  fornecedor: '',
  valor: '',
  observacao: ''
};

export function ajusteToExtratoItem(ajuste: ExtratoCaixaAjuste): ExtratoCaixaItem {
  const v = ajuste.valor;
  return {
    idxcx: null,
    codColigada: null,
    historico: ajuste.observacao?.trim() || 'Ajuste manual',
    codCxa: '',
    codCCusto: ajuste.codCCusto,
    ccusto: ajuste.ccusto,
    valor: v,
    valorBaixa: 0,
    entrada: v > 0 ? v : 0,
    saida: v < 0 ? v : 0,
    codFilial: ajuste.codFilial,
    data: ajuste.dataCompensacao,
    dataCompensacao: ajuste.dataCompensacao,
    codNatFinanceira: ajuste.codNatFinanceira,
    natureza: ajuste.natureza,
    numeroDocumento: '',
    fornecedor: ajuste.fornecedor,
    tipoOperacao: EXTRATO_TIPO_OPERACAO_AJUSTE_MANUAL,
    ajusteId: ajuste.id,
    isAjusteManual: true
  };
}

export function ajusteToForm(ajuste: ExtratoCaixaAjuste): ExtratoCaixaAjusteForm {
  return {
    dataCompensacao: ajuste.dataCompensacao,
    codCCusto: ccSelectValueFromAjuste(ajuste),
    ccusto: ajuste.ccusto,
    codNatFinanceira: natureSelectValueFromAjuste(ajuste),
    natureza: ajuste.natureza,
    codFilial: ajuste.codFilial != null ? String(ajuste.codFilial) : '',
    fornecedor: fornecedorSelectValueFromAjuste(ajuste.fornecedor),
    valor: String(ajuste.valor),
    observacao: ajuste.observacao ?? ''
  };
}

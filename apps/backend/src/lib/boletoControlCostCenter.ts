import { normalizeHeader } from './boletoControlImport';

/**
 * De-para decidido pelo Financeiro: nome (como vem na planilha) → nome oficial do cadastro de centros de custo.
 * As chaves são comparadas sem acento, pontuação e caixa.
 */
export const BOLETO_COST_CENTER_ALIASES: Record<string, string> = {
  // No cadastro existem dois ITAMARATY (mão de obra e serviços eventuais); os boletos são de serviços eventuais.
  ITAMARATY: 'ITAMARATY - SERVIÇOS EVENTUAIS',
  // Lote 5 do TJGO: sempre o R5 (o cadastro também tem o PARCEIROS, que não é usado aqui).
  'TJGO RETROFIT - LOTE 5': 'TJGO RETROFIT R5 - LOTE 5',
  'TJGO RETROFIT LOTE 05': 'TJGO RETROFIT R5 - LOTE 5',
  'TJGO RETROFIT LT 05': 'TJGO RETROFIT R5 - LOTE 5',
  'TJGO RETROFIT R5 - LOTE 05': 'TJGO RETROFIT R5 - LOTE 5',
  // Lote 4 do TJGO
  'TJGO RETROFIT LOTE 04': 'TJGO RETROFIT R5 - LOTE 4',
  'TJGO RETROFIT - LOTE 4': 'TJGO RETROFIT R5 - LOTE 4',
  'TJGO RETROFIT R5 - LOTE 04': 'TJGO RETROFIT R5 - LOTE 4',
  // Nomes abreviados na planilha
  'TJ CALDAS NOVAS': 'TJ MANUTENÇÃO CALDAS NOVAS - CORRETIVA',
  'TJ MANUTENÇÃO RIO VERDE': 'TJ MANUTENÇÃO RIO VERDE - CORRETIVA',
  BBGO: 'BBGO - MANUTENÇÃO',
};

export type CostCenterResolution = {
  name: string | null;
  how: 'empty' | 'exact' | 'alias' | 'prefix' | 'unmatched';
};

/**
 * Resolve o nome da planilha para o nome oficial:
 * 1) igual ao cadastro (sem acento/pontuação/caixa); 2) de-para acima; 3) o nome da planilha é o começo de
 * exatamente UM nome do cadastro (ex.: «BBGO» → «BBGO - MANUTENÇÃO»); 4) sem correspondência: mantém o texto.
 */
export function buildCostCenterResolver(officialNames: string[]) {
  const official = Array.from(new Set(officialNames.map((n) => n.trim()).filter(Boolean)));
  const byNorm = new Map(official.map((n) => [normalizeHeader(n), n]));
  const aliasByNorm = new Map(
    Object.entries(BOLETO_COST_CENTER_ALIASES).map(([k, v]) => [normalizeHeader(k), v] as const)
  );
  const normalized = official.map((n) => ({ name: n, norm: normalizeHeader(n) }));

  return (raw: string | null | undefined): CostCenterResolution => {
    const text = (raw ?? '').trim();
    if (!text) return { name: null, how: 'empty' };
    const norm = normalizeHeader(text);

    const exact = byNorm.get(norm);
    if (exact) return { name: exact, how: 'exact' };

    const alias = aliasByNorm.get(norm);
    if (alias) return { name: alias, how: 'alias' };

    const starts = normalized.filter((o) => o.norm.startsWith(`${norm} `));
    if (starts.length === 1) return { name: starts[0].name, how: 'prefix' };

    return { name: text, how: 'unmatched' };
  };
}

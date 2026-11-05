/**
 * Mapa de Cotação das composições próprias do orçamento (código com "COMP. COTAÇÃO").
 * Cada composição tem propostas de fornecedores/plataformas; o valor adotado sai da menor proposta,
 * de uma proposta escolhida ou de um valor informado na mão.
 */

export type MapaCotacaoAnexo = { url: string; name: string };

export type MapaCotacaoProposta = {
  id: string;
  /** Fornecedor ou plataforma (ex.: Mercado Livre, Shopee). */
  fornecedor: string;
  cnpj: string;
  valor: number | null;
  site: string;
  telefone: string;
  /** AAAA-MM-DD */
  data: string;
  /** Print da página da proposta. */
  anexo: MapaCotacaoAnexo | null;
};

export type MapaCotacao = {
  propostas: MapaCotacaoProposta[];
};

/** Chave = código da composição normalizado (ex.: "COMP. COTAÇÃO - 12"). */
export type MapasCotacao = Record<string, MapaCotacao>;

export const MAPA_COTACAO_MIN_PROPOSTAS = 3;
export const MAPA_COTACAO_MAX_PROPOSTAS = 6;

// Vai para o Mapa de Cotação a composição cujo código contém "COMP. COTAÇÃO".
const CODIGO_COTACAO_RE = /COMP\.?\s*COTA[ÇC][ÃA]O/i;

export function isCodigoCotacao(codigo: string | null | undefined): boolean {
  return CODIGO_COTACAO_RE.test(String(codigo ?? '').trim());
}

export function chaveMapaCotacao(codigo: string): string {
  return String(codigo ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

let seq = 0;
function novoId(): string {
  seq += 1;
  return `p${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function novaProposta(): MapaCotacaoProposta {
  return { id: novoId(), fornecedor: '', cnpj: '', valor: null, site: '', telefone: '', data: '', anexo: null };
}

export function mapaCotacaoVazio(): MapaCotacao {
  return {
    propostas: Array.from({ length: MAPA_COTACAO_MIN_PROPOSTAS }, novaProposta),
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseMapasCotacao(raw: unknown): MapasCotacao {
  const out: MapasCotacao = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [chave, valor] of Object.entries(raw as Record<string, unknown>)) {
    if (!valor || typeof valor !== 'object') continue;
    const v = valor as Record<string, unknown>;
    const propostas = (Array.isArray(v.propostas) ? v.propostas : [])
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => {
        const anexoRaw = p.anexo as Record<string, unknown> | null | undefined;
        const anexo =
          anexoRaw && typeof anexoRaw.url === 'string' && anexoRaw.url
            ? { url: anexoRaw.url, name: str(anexoRaw.name) || 'Print' }
            : null;
        return {
          id: str(p.id) || novoId(),
          fornecedor: str(p.fornecedor),
          cnpj: str(p.cnpj),
          valor: numOrNull(p.valor),
          site: str(p.site),
          telefone: str(p.telefone),
          data: str(p.data),
          anexo,
        } satisfies MapaCotacaoProposta;
      })
      .slice(0, MAPA_COTACAO_MAX_PROPOSTAS);
    while (propostas.length < MAPA_COTACAO_MIN_PROPOSTAS) propostas.push(novaProposta());
    out[chave] = {
      propostas,
    };
  }
  return out;
}

/** Proposta de menor valor (só entre as que têm valor > 0). */
export function propostaMenorValor(mapa: MapaCotacao): MapaCotacaoProposta | null {
  let melhor: MapaCotacaoProposta | null = null;
  for (const p of mapa.propostas) {
    if (p.valor == null || !(p.valor > 0)) continue;
    if (!melhor || p.valor < (melhor.valor as number)) melhor = p;
  }
  return melhor;
}

export type ValorAdotado = {
  valor: number | null;
  /** Proposta de menor valor (o valor adotado é sempre o menor). */
  propostaId: string | null;
};

/** O valor adotado é fixo: sempre o menor valor entre as propostas. */
export function valorAdotadoDoMapa(mapa: MapaCotacao | undefined): ValorAdotado {
  const menor = mapa ? propostaMenorValor(mapa) : null;
  return menor ? { valor: menor.valor, propostaId: menor.id } : { valor: null, propostaId: null };
}

export type StatusMapaCotacao = 'completo' | 'parcial' | 'vazio';

/** Completo = pelo menos 3 propostas com valor; parcial = 1 ou 2; vazio = nenhuma. */
export function statusDoMapa(mapa: MapaCotacao | undefined): { status: StatusMapaCotacao; comValor: number } {
  const comValor = (mapa?.propostas ?? []).filter((p) => p.valor != null && p.valor > 0).length;
  if (comValor >= MAPA_COTACAO_MIN_PROPOSTAS) return { status: 'completo', comValor };
  if (comValor > 0) return { status: 'parcial', comValor };
  return { status: 'vazio', comValor };
}

export function mapaCotacaoTemDados(mapas: MapasCotacao | undefined): boolean {
  return Object.values(mapas ?? {}).some(
    (m) =>
      m.propostas.some((p) => p.valor != null || p.fornecedor.trim() || p.site.trim() || p.anexo)
  );
}

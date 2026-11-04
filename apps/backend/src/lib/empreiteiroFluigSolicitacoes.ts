import { prisma } from './prisma';

/** Datasets do espelho do Fluig (G5) onde ficam as solicitações de pagamento de empreitas. */
const DATASET_JURIDICO = 'G5-Relatorio-DF-GO-JURIDICO';
const DATASET_TODOS_SETORES = 'G5-Relatorio-DF-GO-TODOS-SETORES';

export type FluigSolicitacaoEmpreiteiro = {
  numero: string;
  titulo: string;
  natureza: string;
  fase: string;
  contrato: string;
  filial: string;
  solicitante: string;
  favorecido: string;
  /** AAAA-MM-DD */
  data: string | null;
  vencimento: string | null;
  pagamento: string | null;
  valor: number;
  dataset: string;
  /** Como a solicitação foi ligada à empreita. */
  vinculo: 'documento' | 'nome';
};

export type FluigSolicitacoesEmpreiteiro = {
  itens: FluigSolicitacaoEmpreiteiro[];
  total: number;
  totalPago: number;
};

function somenteDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/[^0-9]/g, '');
}

function texto(valor: unknown): string {
  return String(valor ?? '').trim();
}

function normalizarNome(valor: unknown): string {
  return texto(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** "1.234,56" ou "300,00" → número. */
function parseValorBr(valor: unknown): number {
  const bruto = texto(valor).replace(/[R$\s]/g, '');
  if (!bruto) return 0;
  const n = bruto.includes(',') ? parseFloat(bruto.replace(/\./g, '').replace(',', '.')) : parseFloat(bruto);
  return Number.isFinite(n) ? n : 0;
}

/** "2026-09-15 14:44:28.0" ou "15/09/2026" → "2026-09-15". */
function dataIso(valor: unknown): string | null {
  const t = texto(valor);
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

type LinhaEspelho = { datasetId: string; payload: Record<string, unknown> };

/**
 * Solicitações do Fluig (natureza de serviços tomados / prestadores de serviço de engenharia) de uma empreita.
 * A ligação é pelo CPF/CNPJ do favorecido; o nome só entra quando o documento não bate.
 */
export async function listarSolicitacoesFluigDaEmpreita(empreita: {
  name: string;
  tradeName: string | null;
  document: string;
  cpf: string | null;
}): Promise<FluigSolicitacoesEmpreiteiro> {
  const documentos = [...new Set([somenteDigitos(empreita.document), somenteDigitos(empreita.cpf)].filter((d) => d.length >= 11))];
  const nomes = [...new Set([normalizarNome(empreita.name), normalizarNome(empreita.tradeName)].filter((n) => n.length >= 4))];
  if (documentos.length === 0 && nomes.length === 0) return { itens: [], total: 0, totalPago: 0 };

  const linhas = await prisma.$queryRaw<LinhaEspelho[]>`
    SELECT "datasetId", payload
    FROM "fluig_dataset_mirror_rows"
    WHERE "datasetId" IN (${DATASET_JURIDICO}, ${DATASET_TODOS_SETORES})
      AND (
        "datasetId" = ${DATASET_JURIDICO}
        OR payload->>'natureza' ~* 'servi[cç]os? tomados|prestadores de servi'
      )
      AND (
        regexp_replace(COALESCE(payload->>'CGCCFO', ''), '[^0-9]', '', 'g') = ANY(${documentos}::text[])
        OR regexp_replace(COALESCE(payload->>'CpfCnpj_favorecido', ''), '[^0-9]', '', 'g') = ANY(${documentos}::text[])
        OR regexp_replace(COALESCE(payload->>'CNPJ', ''), '[^0-9]', '', 'g') = ANY(${documentos}::text[])
        OR regexp_replace(COALESCE(payload->>'CPF', ''), '[^0-9]', '', 'g') = ANY(${documentos}::text[])
        OR upper(btrim(COALESCE(payload->>'nome_social', ''))) = ANY(${nomes}::text[])
        OR upper(btrim(COALESCE(payload->>'favorecido', ''))) = ANY(${nomes}::text[])
      )
    LIMIT 1000
  `;

  const porProcesso = new Map<string, FluigSolicitacaoEmpreiteiro>();
  for (const linha of linhas) {
    const p = linha.payload ?? {};
    const numero = texto(p.NUM_PROCES);
    const idsDoc = [p.CGCCFO, p.CpfCnpj_favorecido, p.CNPJ, p.CPF].map(somenteDigitos);
    const vinculo: 'documento' | 'nome' = idsDoc.some((d) => d && documentos.includes(d)) ? 'documento' : 'nome';
    const item: FluigSolicitacaoEmpreiteiro = {
      numero,
      titulo: texto(p.titulo_solicitacao),
      natureza: texto(p.natureza),
      fase: texto(p.fase_Atual),
      contrato: texto(p.contrato),
      filial: texto(p.filial),
      solicitante: texto(p.solicitante),
      favorecido: texto(p.nome_social) || texto(p.favorecido),
      data: dataIso(p.START_DATE),
      vencimento: dataIso(p.data_vencimento),
      pagamento: dataIso(p.data_pagamento),
      valor: parseValorBr(p.Valor),
      dataset: linha.datasetId,
      vinculo,
    };
    // O mesmo processo pode aparecer nos dois datasets (ou em várias linhas de rateio): fica uma linha por processo e valor.
    const chave = numero ? `${numero}|${item.valor}` : `${linha.datasetId}|${porProcesso.size}`;
    const atual = porProcesso.get(chave);
    if (!atual || (atual.vinculo === 'nome' && item.vinculo === 'documento')) porProcesso.set(chave, item);
  }

  const itens = [...porProcesso.values()].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
  const total = itens.reduce((soma, i) => soma + i.valor, 0);
  const totalPago = itens.filter((i) => i.pagamento).reduce((soma, i) => soma + i.valor, 0);
  return { itens, total, totalPago };
}

export type FluigStatusParcela = {
  fase: string;
  /** AAAA-MM-DD */
  vencimento: string | null;
  pagamento: string | null;
};

/** Fase atual e vencimento no Fluig de cada solicitação informada (pelo número do processo). */
export async function buscarStatusFluigPorNumeros(numeros: string[]): Promise<Record<string, FluigStatusParcela>> {
  const lista = [...new Set(numeros.map((n) => somenteDigitos(n)).filter(Boolean))];
  const resultado: Record<string, FluigStatusParcela> = {};
  if (lista.length === 0) return resultado;
  const linhas = await prisma.$queryRaw<LinhaEspelho[]>`
    SELECT "datasetId", payload
    FROM "fluig_dataset_mirror_rows"
    WHERE "datasetId" IN (${DATASET_JURIDICO}, ${DATASET_TODOS_SETORES})
      AND regexp_replace(COALESCE(payload->>'NUM_PROCES', ''), '[^0-9]', '', 'g') = ANY(${lista}::text[])
    LIMIT 2000
  `;
  for (const linha of linhas) {
    const p = linha.payload ?? {};
    const numero = somenteDigitos(p.NUM_PROCES);
    if (!numero) continue;
    const atual = resultado[numero];
    const item: FluigStatusParcela = {
      fase: texto(p.fase_Atual),
      vencimento: dataIso(p.data_vencimento),
      pagamento: dataIso(p.data_pagamento),
    };
    // Se o processo aparece em várias linhas, fica a que tem mais informação.
    if (!atual || (!atual.vencimento && item.vencimento) || (!atual.fase && item.fase)) resultado[numero] = item;
  }
  return resultado;
}

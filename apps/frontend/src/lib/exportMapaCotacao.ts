import { exportBrandedExcelTable, type BrandedExcelColumn } from '@/lib/exportBrandedExcelTable';
import {
  brandedPdfUsableWidth,
  exportBrandedPdfTable,
  type BrandedPdfColumn,
  type BrandedPdfSection,
} from '@/lib/exportBrandedPdfTable';

type FdMaterialExport = { materialLabel: string; quantity: number; unit: string; detalhamento?: string };

/** Itens da FD de onde saiu a RM (painel "Itens da FD" do mapa). */
export type MapaCotacaoExportFdItem = {
  fdItem: string;
  descricao: string;
  quantidadeFd: number | null;
  unidadeFd: string;
  custoEstimado40: number | null;
  alertas: string[];
  materiais: FdMaterialExport[];
};

/** O que já foi solicitado da FD, agrupado por RM (modal "Itens já solicitados"). */
export type MapaCotacaoExportFdSolicitado = {
  rm: { requestNumber: string; status: string };
  itens: {
    fdItem: string;
    descricao: string;
    quantidadeFd: number | null;
    unidadeFd: string;
    alertas: string[];
    materiais: (FdMaterialExport & {
      ocs: { orderNumber: string; status: string; totvsIdMov: number | null; valorPago: string }[];
    })[];
  }[];
};

export type MapaCotacaoExportFd = {
  codigo: string;
  itens: MapaCotacaoExportFdItem[];
  solicitados?: {
    grupos: MapaCotacaoExportFdSolicitado[];
    totalItens: number;
    comOc: number;
    ocsPagas: number;
    totalPago: number;
  };
};

export type MapaCotacaoExportItem = {
  codigo: string;
  material: string;
  detalhamento?: string;
  unidade: string;
  qtdRm: number;
  qtdOc: number;
  valorReferencia: number | null;
  /** Valor unitário cotado por fornecedor (mesma ordem de `fornecedores`); null = sem preço. */
  precos: (number | null)[];
  vencedor: string;
  vencedorUnitario: number | null;
  vencedorTotal: number | null;
  empateTecnico?: boolean;
};

export type MapaCotacaoExportFornecedor = {
  nome: string;
  frete: number | null;
  desconto: number | null;
  /** Valor total da OC do fornecedor (itens vencidos + frete − desconto); null = não venceu itens. */
  valorTotal: number | null;
  ordemCompra: string;
};

export type MapaCotacaoExportOptions = {
  formato: 'pdf' | 'excel';
  orientacao: 'landscape' | 'portrait';
  titulo: string;
  subtitulo: string;
  arquivoBase: string;
  itens: MapaCotacaoExportItem[];
  fornecedores: MapaCotacaoExportFornecedor[];
  /** Só no PDF: itens da FD e o que já foi solicitado dela (quando a RM saiu de uma FD). */
  fd?: MapaCotacaoExportFd | null;
};

const ALERTA_LABEL: Record<string, string> = { '1:N': 'vários materiais', unidade: 'unidade diferente da FD' };

function colunasPorPeso(
  pesos: { key: string; label: string; peso: number; tone?: BrandedPdfColumn['tone'] }[],
  orientacao: 'landscape' | 'portrait'
): BrandedPdfColumn[] {
  const soma = pesos.reduce((a, c) => a + c.peso, 0);
  const largura = brandedPdfUsableWidth(orientacao);
  return pesos.map((c) => ({
    key: c.key,
    label: c.label,
    width: (c.peso / soma) * largura,
    ...(c.tone ? { tone: c.tone } : {}),
  }));
}

/** Célula "Item da FD": código + descrição; alertas em negrito abaixo. */
function celulaItemFd(it: { fdItem: string; descricao: string; alertas: string[] }): Record<string, string> {
  const alertas = it.alertas.map((a) => ALERTA_LABEL[a] ?? a).join(' e ');
  return {
    itemFd: `${it.fdItem} ${it.descricao}`.trim(),
    ...(alertas ? { itemFdBold: `Atenção: ${alertas}` } : {}),
  };
}

const qtdUnid = (n: number | null | undefined, unidade: string) =>
  n == null || !Number.isFinite(n) ? '—' : `${qtd(n)} ${unidade}`.trim();

function secoesFd(fd: MapaCotacaoExportFd, orientacao: 'landscape' | 'portrait'): BrandedPdfSection[] {
  const secoes: BrandedPdfSection[] = [];

  if (fd.itens.length) {
    const columns = colunasPorPeso(
      [
        { key: 'itemFd', label: 'Item da FD', peso: 4 },
        { key: 'qtdFd', label: 'Qtd. FD', peso: 0.9 },
        { key: 'custo40', label: 'Custo est. 40%', peso: 1.1, tone: 'bold' },
        { key: 'material', label: 'Material', peso: 3.2 },
        { key: 'qtdPedida', label: 'Qtd. pedida', peso: 0.9 },
      ],
      orientacao
    );
    const rows: Record<string, string>[] = [];
    for (const it of fd.itens) {
      const mats = it.materiais.length ? it.materiais : [null];
      mats.forEach((m, idx) => {
        rows.push({
          ...(idx === 0
            ? {
                ...celulaItemFd(it),
                qtdFd: qtdUnid(it.quantidadeFd, it.unidadeFd),
                custo40: brl(it.custoEstimado40),
              }
            : { itemFd: ' ', qtdFd: ' ', custo40: ' ' }),
          material: m?.materialLabel || '—',
          qtdPedida: m ? qtdUnid(m.quantity, m.unit) : '—',
        });
      });
    }
    secoes.push({ title: 'Itens da FD', subtitle: `${fd.codigo} · Custo estimado 40%`, columns, rows });
  }

  const sol = fd.solicitados;
  if (sol) {
    secoes.push({
      title: 'Itens já solicitados',
      subtitle:
        `${fd.codigo} · ${sol.totalItens} item(ns) solicitados · ${sol.comOc} com ordem de compra` +
        ` · Total pago: ${brl(sol.totalPago)} (${sol.ocsPagas} OC(s))`,
      ...(sol.grupos.length ? {} : { rows: [] }),
    });
    const columns = colunasPorPeso(
      [
        { key: 'itemFd', label: 'Item da FD', peso: 3.2 },
        { key: 'qtdFd', label: 'Qtd. FD', peso: 0.9 },
        { key: 'material', label: 'Material', peso: 3 },
        { key: 'qtdPedida', label: 'Qtd. pedida', peso: 0.9 },
        { key: 'oc', label: 'Ordem de compra', peso: 1.4 },
        { key: 'idMov', label: 'IdMov TOTVS', peso: 0.9 },
        { key: 'pago', label: 'Valor pago', peso: 1.1 },
      ],
      orientacao
    );
    for (const g of sol.grupos) {
      const rows: Record<string, string>[] = [];
      for (const it of g.itens) {
        const mats = it.materiais.length ? it.materiais : [null];
        mats.forEach((m, idx) => {
          const ocs = m?.ocs ?? [];
          rows.push({
            ...(idx === 0
              ? { ...celulaItemFd(it), qtdFd: qtdUnid(it.quantidadeFd, it.unidadeFd) }
              : { itemFd: ' ', qtdFd: ' ' }),
            material: m?.materialLabel || '—',
            ...(m?.detalhamento ? { materialBold: `Detalhamento: ${m.detalhamento}` } : {}),
            qtdPedida: m ? qtdUnid(m.quantity, m.unit) : '—',
            oc: ocs.length ? ocs.map((o) => `${o.orderNumber} · ${o.status}`).join('\n') : 'Aguardando OC',
            idMov: ocs.length ? ocs.map((o) => (o.totvsIdMov != null ? String(o.totvsIdMov) : 'Não enviada')).join('\n') : '—',
            pago: ocs.length ? ocs.map((o) => o.valorPago).join('\n') : '—',
          });
        });
      }
      secoes.push({ kind: 'group', title: g.rm.requestNumber, subtitle: g.rm.status, columns, rows });
    }
  }
  return secoes;
}

const brl = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const MOEDA = '"R$" #,##0.00';

function nomeArquivo(base: string, ext: string) {
  const limpo = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${limpo || 'Mapa-cotacao'}.${ext}`;
}

/** Exporta o mapa de cotação como está na tela (PDF ou Excel, retrato ou paisagem). */
export async function exportarMapaCotacao(opts: MapaCotacaoExportOptions): Promise<void> {
  const { itens, fornecedores } = opts;
  if (!itens.length) throw new Error('Nenhum item para exportar');

  if (opts.formato === 'excel') {
    const columns: BrandedExcelColumn[] = [
      { header: 'Item', width: 6, align: 'center' },
      { header: 'Código', width: 14 },
      { header: 'Material', width: 42 },
      { header: 'Unidade', width: 9, align: 'center' },
      { header: 'Qtd. RM', width: 10, align: 'right' },
      { header: 'Qtd. OC', width: 10, align: 'right' },
      { header: 'Valor referência', width: 16, align: 'right', numFmt: MOEDA },
      ...fornecedores.flatMap<BrandedExcelColumn>((f) => [
        { header: `${f.nome} — unitário`, width: 18, align: 'right', numFmt: MOEDA },
        { header: `${f.nome} — total`, width: 18, align: 'right', numFmt: MOEDA },
      ]),
      { header: 'Vencedor', width: 28 },
      { header: 'Vencedor — unitário', width: 18, align: 'right', numFmt: MOEDA },
      { header: 'Vencedor — total', width: 18, align: 'right', numFmt: MOEDA },
    ];
    const num = (n: number | null | undefined): string | number => (n == null || !Number.isFinite(n) ? '' : n);
    const rows: (string | number)[][] = itens.map((it, idx) => [
      idx + 1,
      it.codigo || '—',
      it.detalhamento ? `${it.material}\nDetalhamento: ${it.detalhamento}` : it.material,
      it.unidade || '—',
      it.qtdRm,
      it.qtdOc,
      num(it.valorReferencia),
      ...it.precos.flatMap((p) => [num(p), p == null ? '' : Math.round(p * it.qtdOc * 100) / 100]),
      it.vencedor ? `${it.vencedor}${it.empateTecnico ? ' (empate técnico)' : ''}` : '—',
      num(it.vencedorUnitario),
      num(it.vencedorTotal),
    ]);
    // Linhas finais por fornecedor: valor na coluna "total" de cada um.
    const linhaFinal = (rotulo: string, valor: (f: MapaCotacaoExportFornecedor) => string | number) => [
      '',
      '',
      rotulo,
      '',
      '',
      '',
      '',
      ...fornecedores.flatMap((f) => ['', valor(f)]),
      '',
      '',
      '',
    ];
    rows.push(linhaFinal('FRETE', (f) => num(f.frete)));
    rows.push(linhaFinal('DESCONTO', (f) => num(f.desconto)));
    rows.push(linhaFinal('VALOR TOTAL', (f) => num(f.valorTotal)));
    rows.push(linhaFinal('ORDEM DE COMPRA', (f) => f.ordemCompra || '—'));
    await exportBrandedExcelTable({
      title: opts.titulo,
      subtitle: opts.subtitulo,
      sheetName: 'Mapa de cotação',
      filename: nomeArquivo(opts.arquivoBase, 'xlsx'),
      columns,
      rows,
      orientation: opts.orientacao,
    });
    return;
  }

  // PDF: cada fornecedor numa coluna (unitário + total); larguras ajustadas à orientação escolhida.
  // O valor de referência não sai no PDF (só no Excel).
  const pesos: { key: string; label: string; peso: number; tone?: BrandedPdfColumn['tone'] }[] = [
    { key: 'item', label: 'Item', peso: 0.5 },
    { key: 'codigo', label: 'Código', peso: 1.1 },
    { key: 'material', label: 'Material', peso: 3 },
    { key: 'und', label: 'Und.', peso: 0.6 },
    { key: 'qtdRm', label: 'Qtd. RM', peso: 0.8 },
    { key: 'qtdOc', label: 'Qtd. OC', peso: 0.8 },
    ...fornecedores.map((f, i) => ({ key: `f${i}`, label: f.nome, peso: 1.4 })),
    { key: 'vencedor', label: 'Vencedor', peso: 1.7, tone: 'bold' as const },
  ];
  const somaPesos = pesos.reduce((a, c) => a + c.peso, 0);
  const largura = brandedPdfUsableWidth(opts.orientacao);
  const columns: BrandedPdfColumn[] = pesos.map((c) => ({
    key: c.key,
    label: c.label,
    width: (c.peso / somaPesos) * largura,
    ...(c.tone ? { tone: c.tone } : {}),
  }));

  const rows: Record<string, string>[] = itens.map((it, idx) => {
    const row: Record<string, string> = {
      item: String(idx + 1),
      codigo: it.codigo || '—',
      material: it.material,
      // Detalhamento em negrito, abaixo do nome do material.
      ...(it.detalhamento ? { materialBold: `Detalhamento: ${it.detalhamento}` } : {}),
      und: it.unidade || '—',
      qtdRm: qtd(it.qtdRm),
      qtdOc: qtd(it.qtdOc),
      vencedor: it.vencedor
        ? `${it.vencedor}\n${brl(it.vencedorUnitario)} · ${brl(it.vencedorTotal)}${it.empateTecnico ? '\nEmpate técnico' : ''}`
        : '—',
    };
    it.precos.forEach((p, i) => {
      row[`f${i}`] = p == null ? '—' : `${brl(p)}\nTotal ${brl(p * it.qtdOc)}`;
    });
    return row;
  });
  const linhaFinal = (rotulo: string, valor: (f: MapaCotacaoExportFornecedor) => string) => {
    const row: Record<string, string> = { item: '', codigo: '', material: rotulo, und: '', qtdRm: '', qtdOc: '', vencedor: '' };
    fornecedores.forEach((f, i) => {
      row[`f${i}`] = valor(f);
    });
    return row;
  };
  rows.push(linhaFinal('FRETE', (f) => brl(f.frete)));
  rows.push(linhaFinal('DESCONTO', (f) => brl(f.desconto)));
  rows.push(linhaFinal('VALOR TOTAL', (f) => brl(f.valorTotal)));
  rows.push(linhaFinal('ORDEM DE COMPRA', (f) => f.ordemCompra || '—'));

  await exportBrandedPdfTable({
    title: opts.titulo,
    subtitle: opts.subtitulo,
    filename: nomeArquivo(opts.arquivoBase, 'pdf'),
    columns,
    rows,
    orientation: opts.orientacao,
    sections: opts.fd ? secoesFd(opts.fd, opts.orientacao) : undefined,
  });
}

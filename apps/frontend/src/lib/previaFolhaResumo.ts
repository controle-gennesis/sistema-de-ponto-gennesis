import ExcelJS from 'exceljs';
import { loadExcelDualLogoStrip } from '@/lib/exportBrandingLogos';

/**
 * Prévia da Folha — resumo para a diretoria: resultado por empresa, por polo e por centro de custo.
 * Resultado da folha = proventos + descontos de todos os eventos (VALOR da FOLPAG).
 */

export type DimensaoResumo = 'empresa' | 'polo' | 'cc';
export type EventoResumo = { nome: string; tipo: 'P' | 'D'; valor: number };
export type LinhaResumo = {
  nome: string;
  colaboradores: number;
  resultado: number;
  pct: number;
  /** Eventos da linha (proventos + descontos); a soma é igual ao resultado. */
  eventos: EventoResumo[];
};
export type ResumoDimensao = { linhas: LinhaResumo[]; colaboradores: number; resultado: number };
export type ResumoFolha = Record<DimensaoResumo, ResumoDimensao>;

export const DIMENSOES: { key: DimensaoResumo; aba: string; coluna: string }[] = [
  { key: 'empresa', aba: 'Resultado por empresa', coluna: 'Empresa' },
  { key: 'polo', aba: 'Resultado por polo', coluna: 'Polo' },
  { key: 'cc', aba: 'Resultado por centro de custo', coluna: 'Centro de custo' },
];

export type ChavesResumo = {
  empresa?: string;
  polo?: string;
  cc?: string;
  valor?: string;
  pessoa?: string;
  evento?: string;
  tipoEvento?: string;
};

const txt = (v: unknown) => (v == null ? '' : String(v).trim());

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = txt(v);
  if (!s) return 0;
  const norm = /,\d{1,4}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

/** "01 - GENNESIS ENGENHARIA..." → "GENNESIS ENGENHARIA..." */
export function nomeEmpresa(v: unknown): string {
  const s = txt(v).replace(/^\d+\s*-\s*/, '').trim();
  return s || 'Sem empresa';
}

/** "(DF) - OPERACIONAL" → "DF" */
export function poloDaSecao(v: unknown): string {
  const m = txt(v).match(/^\(([^)]+)\)/);
  return m ? m[1].trim().toUpperCase() : 'Sem polo';
}

export function montarResumoFolha(rows: Record<string, unknown>[], k: ChavesResumo): ResumoFolha {
  type Acc = { pessoas: Set<string>; resultado: number; eventos: Map<string, { tipo: 'P' | 'D'; valor: number }> };
  const grupos: Record<DimensaoResumo, Map<string, Acc>> = { empresa: new Map(), polo: new Map(), cc: new Map() };
  const total: Acc = { pessoas: new Set(), resultado: 0, eventos: new Map() };

  for (const r of rows) {
    const empresa = nomeEmpresa(k.empresa ? r[k.empresa] : '');
    const chave: Record<DimensaoResumo, string> = {
      empresa,
      polo: k.polo ? poloDaSecao(r[k.polo]) : 'Sem polo',
      cc: (k.cc ? txt(r[k.cc]) : '') || 'Sem centro de custo',
    };
    const valor = k.valor ? num(r[k.valor]) : 0;
    const pessoa = k.pessoa ? txt(r[k.pessoa]) : '';
    // A chapa se repete entre coligadas: colaborador = empresa + chapa.
    const idPessoa = pessoa ? `${empresa}|${pessoa}` : '';
    const evento = (k.evento ? txt(r[k.evento]) : '') || 'Sem evento';
    // "1-Proventos" / "2-Descontos"; sem a coluna, o sinal do valor decide.
    const tipoTxt = k.tipoEvento ? txt(r[k.tipoEvento]) : '';
    const tipo: 'P' | 'D' = /desc/i.test(tipoTxt) || (!/prov/i.test(tipoTxt) && valor < 0) ? 'D' : 'P';

    total.resultado += valor;
    if (idPessoa) total.pessoas.add(idPessoa);
    for (const d of Object.keys(grupos) as DimensaoResumo[]) {
      let acc = grupos[d].get(chave[d]);
      if (!acc) grupos[d].set(chave[d], (acc = { pessoas: new Set(), resultado: 0, eventos: new Map() }));
      acc.resultado += valor;
      if (idPessoa) acc.pessoas.add(idPessoa);
      const ev = acc.eventos.get(evento);
      if (ev) ev.valor += valor;
      else acc.eventos.set(evento, { tipo, valor });
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const montar = (m: Map<string, Acc>): ResumoDimensao => ({
    colaboradores: total.pessoas.size,
    resultado: r2(total.resultado),
    linhas: [...m.entries()]
      .map(([nome, a]) => ({
        nome,
        colaboradores: a.pessoas.size,
        resultado: r2(a.resultado),
        pct: total.resultado ? Math.round((a.resultado / total.resultado) * 10000) / 100 : 0,
        eventos: [...a.eventos.entries()]
          .map(([en, ev]) => ({ nome: en, tipo: ev.tipo, valor: r2(ev.valor) }))
          .filter((ev) => ev.valor !== 0)
          .sort((x, y) => (x.tipo !== y.tipo ? (x.tipo === 'P' ? -1 : 1) : Math.abs(y.valor) - Math.abs(x.valor))),
      }))
      .sort((a, b) => b.resultado - a.resultado || a.nome.localeCompare(b.nome, 'pt-BR')),
  });
  return { empresa: montar(grupos.empresa), polo: montar(grupos.polo), cc: montar(grupos.cc) };
}

/** Excel do resumo: uma aba por agrupamento (empresa, polo, centro de custo). */
export async function exportarResumoFolhaExcel(
  resumo: ResumoFolha,
  opts: { subtitulo: string; filtros: string[]; arquivo: string }
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const logo = await loadExcelDualLogoStrip();
  const borda: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
  const MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const NCOL = 4;

  for (const dim of DIMENSOES) {
    const dados = resumo[dim.key];
    const ws = wb.addWorksheet(dim.aba.replace('Resultado por ', 'Por '), {
      views: [{ state: 'frozen', ySplit: 7 }],
      pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    ws.columns = [{ width: dim.key === 'polo' ? 22 : 50 }, { width: 16 }, { width: 22 }, { width: 13 }];
    if (logo) {
      const id = wb.addImage({ base64: logo.base64, extension: logo.extension });
      ws.addImage(id, { tl: { col: 0.1, row: 0.2 }, ext: { width: logo.widthPx, height: logo.heightPx }, editAs: 'absolute' });
    }
    for (const [row, valor, fonte] of [
      [1, `Prévia da Folha — ${dim.aba}`, { bold: true, size: 14 }],
      [2, opts.subtitulo, { size: 9, color: { argb: 'FF4B5563' } }],
      [3, opts.filtros.length ? `Filtros: ${opts.filtros.join(' · ')}` : 'Sem filtros', { size: 9, color: { argb: 'FF4B5563' } }],
    ] as const) {
      ws.mergeCells(row, 2, row, NCOL);
      const c = ws.getCell(row, 2);
      c.value = valor;
      c.font = fonte;
    }
    ws.getRow(1).height = 22;
    for (let c = 1; c <= NCOL; c++) ws.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    ws.getRow(4).height = 4;

    const head = ws.getRow(7);
    [dim.coluna, 'Colaboradores', 'Resultado da folha', '% do total'].forEach((h, i) => {
      const c = head.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
      c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle' };
      c.border = borda;
    });
    head.height = 20;

    let r = 8;
    const escrever = (vals: [string, number, number, number], estilo: 'linha' | 'zebra' | 'total') => {
      const row = ws.getRow(r++);
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = i === 3 ? Number(v) / 100 : v;
        c.border = borda;
        c.font = { bold: estilo === 'total', color: { argb: estilo === 'total' ? 'FFFFFFFF' : 'FF111827' } };
        if (estilo !== 'linha') {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: estilo === 'total' ? 'FF262626' : 'FFF9FAFB' } };
        }
        if (i === 1) c.numFmt = '#,##0';
        if (i === 2) c.numFmt = MOEDA;
        if (i === 3) c.numFmt = '0.00%';
        c.alignment = { horizontal: i === 0 ? 'left' : 'right' };
      });
    };
    dados.linhas.forEach((l, i) => escrever([l.nome, l.colaboradores, l.resultado, l.pct], i % 2 ? 'zebra' : 'linha'));
    escrever(['Total geral', dados.colaboradores, dados.resultado, dados.linhas.length ? 100 : 0], 'total');
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.arquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

import ExcelJS from 'exceljs';

/**
 * Exportação do cronograma para Excel, no mesmo formato da tela: Item, Serviço, Unidade, Quantidade,
 * Custo, datas planejadas e reais, Dias, % executado, Status e a linha do tempo (barras). Os totais dos
 * serviços, os dias e as barras são fórmulas, então a planilha continua viva se alguém editar as datas.
 */

export type CronogramaExcelStatus = 'pendente' | 'em_andamento' | 'concluido' | 'atrasado';

export type CronogramaExcelLinha = {
  item: string;
  label: string;
  /** 0 = serviço, 1 = composição (2 = composição sob subtítulo). */
  nivel: 0 | 1 | 2;
  /** Serviço que tem composições: totais viram fórmulas sobre as composições. */
  cabecalhoServico: boolean;
  unidade?: string;
  quantidade?: number;
  custo?: number;
  /** Datas no formato AAAA-MM-DD. */
  inicio?: string;
  fim?: string;
  inicioReal?: string;
  fimReal?: string;
  /** 0 a 100. */
  pct: number;
  status: CronogramaExcelStatus;
  statusLabel: string;
};

export type CronogramaExcelAparencia = {
  tituloFundo?: string;
  tituloTexto?: string;
  composicaoFundo?: string;
  composicaoTexto?: string;
  composicaoFundoAlt?: string;
  composicaoTextoAlt?: string;
  headerFundo?: string;
  headerTexto?: string;
  fonte?: string;
  linhasGrade?: boolean;
  ocultarTitulos?: boolean;
};

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BORDA = 'FFE5E7EB';
const BORDA_FORTE = 'FFCBD5E1';
const TEXTO = 'FF111827';
const CINZA_TEXTO = 'FF6B7280';

const FMT_DATA = 'dd/mm/yyyy';
const FMT_MOEDA = '_-[$R$-416]* #,##0.00_-;-[$R$-416]* #,##0.00_-;_-[$R$-416]* "-"??_-;_-@_-';

const STATUS_TOM: Record<CronogramaExcelStatus, { bg: string; fg: string; barra: string }> = {
  pendente: { bg: 'FFF3F4F6', fg: 'FF4B5563', barra: 'FF9CA3AF' },
  em_andamento: { bg: 'FFE0F2FE', fg: 'FF0369A1', barra: 'FF0EA5E9' },
  concluido: { bg: 'FFDCFCE7', fg: 'FF15803D', barra: 'FF22C55E' },
  atrasado: { bg: 'FFFEE2E2', fg: 'FFB91C1C', barra: 'FFEF4444' },
};

const COL = {
  item: 1,
  servico: 2,
  unidade: 3,
  quantidade: 4,
  custo: 5,
  inicio: 6,
  fim: 7,
  inicioReal: 8,
  fimReal: 9,
  dias: 10,
  pct: 11,
  status: 12,
} as const;
const COLUNAS_TABELA = 12;
// Sem linhas de título: o cabeçalho da tabela é a primeira linha da planilha.
const LINHA_HEADER_1 = 1;
const LINHA_HEADER_2 = 2;
const PRIMEIRA_LINHA_DADOS = 3;

function hexToArgb(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  const h = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return `FF${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) return `FF${h}`.toUpperCase();
  return fallback;
}

function resolveFonte(css?: string): string {
  const s = (css || '').toLowerCase();
  if (s.includes('arial')) return 'Arial';
  if (s.includes('times')) return 'Times New Roman';
  if (s.includes('georgia')) return 'Georgia';
  if (s.includes('courier')) return 'Courier New';
  return 'Calibri';
}

/** AAAA-MM-DD → data do Excel (meio-dia UTC, sem virar o dia por fuso). */
function paraData(iso?: string): Date | null {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
}

function letra(coluna: number): string {
  let n = coluna;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const NOMES_MES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export async function buildCronogramaExcel(
  linhasEntrada: CronogramaExcelLinha[],
  opts: { contrato?: string; titulo?: string; aparencia?: CronogramaExcelAparencia; hoje?: Date }
): Promise<ArrayBuffer> {
  const ap = opts.aparencia ?? {};
  const fonte = resolveFonte(ap.fonte);
  const tituloBg = hexToArgb(ap.tituloFundo, 'FFDC2626');
  const tituloFg = hexToArgb(ap.tituloTexto, 'FFFFFFFF');
  const compBg = hexToArgb(ap.composicaoFundo, 'FFFFFFFF');
  const compFg = hexToArgb(ap.composicaoTexto, TEXTO);
  const compBgAlt = hexToArgb(ap.composicaoFundoAlt, 'FFF1F5F9');
  const compFgAlt = hexToArgb(ap.composicaoTextoAlt, TEXTO);
  const headerBg = hexToArgb(ap.headerFundo, 'FFF9FAFB');
  const headerFg = hexToArgb(ap.headerTexto, 'FF4B5563');
  const grade = ap.linhasGrade === true;

  // Igual à tela: com "ocultar títulos", só ficam as composições.
  const linhas = linhasEntrada.filter((l) => !(ap.ocultarTitulos && l.cabecalhoServico));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gennesis Conecta';
  workbook.created = new Date();
  workbook.modified = new Date();

  // ---- linha do tempo: dia a dia (semanal só em obras muito longas)
  const datas: number[] = [];
  for (const l of linhas) {
    for (const iso of [l.inicio, l.fim, l.inicioReal, l.fimReal]) {
      const d = paraData(iso);
      if (d) datas.push(d.getTime());
    }
  }
  const hoje = opts.hoje ?? new Date();
  const hojeMs = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0);
  const temTimeline = datas.length > 0;
  const iniMs = temTimeline ? Math.min(...datas) : 0;
  const fimMs = temTimeline ? Math.max(...datas) : 0;
  const totalDias = temTimeline ? Math.round((fimMs - iniMs) / DIA_MS) + 1 : 0;
  // Um dia por coluna (como na visão "Obra"); só obras muito longas (> 520 dias) caem para semanas.
  const passo = totalDias > 520 ? 7 : 1;
  const nColsTimeline = temTimeline ? Math.min(520, Math.ceil(totalDias / passo)) : 0;
  const primeiraColTimeline = COLUNAS_TABELA + 1;
  const ultimaColTimeline = COLUNAS_TABELA + nColsTimeline;

  const sheet = workbook.addWorksheet('Cronograma', {
    views: [
      {
        state: 'frozen',
        xSplit: COL.quantidade,
        ySplit: LINHA_HEADER_2,
        showGridLines: false,
        zoomScale: 85,
        zoomScaleNormal: 85,
      },
    ],
    properties: { defaultRowHeight: 22 },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  // ---- larguras
  const larguras = [8, 54, 10, 12, 18, 13, 13, 13, 13, 8, 10, 15];
  larguras.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
  for (let c = primeiraColTimeline; c <= ultimaColTimeline; c++) {
    sheet.getColumn(c).width = passo === 1 ? 3.2 : 5.2;
  }

  // ---- cabeçalho (2 linhas: a tabela mescla as duas; a linha do tempo tem mês e dia)
  const titulosColunas = [
    'Item',
    'Serviço',
    'Unidade',
    'Quantidade',
    'Custo c/ BDI e desconto',
    'Início plan.',
    'Fim plan.',
    'Início real',
    'Fim real',
    'Dias',
    '% Exec.',
    'Status',
  ];
  titulosColunas.forEach((t, i) => {
    const c = i + 1;
    sheet.mergeCells(LINHA_HEADER_1, c, LINHA_HEADER_2, c);
    const cell = sheet.getCell(LINHA_HEADER_1, c);
    cell.value = t.toUpperCase();
    cell.font = { name: fonte, size: 10, bold: true, color: { argb: headerFg } };
    cell.fill = fill(headerBg);
    cell.alignment = { vertical: 'middle', horizontal: c === COL.servico ? 'left' : 'center', wrapText: true, indent: c === COL.servico ? 1 : 0 };
    cell.border = {
      top: { style: 'thin', color: { argb: BORDA_FORTE } },
      bottom: { style: 'thin', color: { argb: BORDA_FORTE } },
      left: { style: 'thin', color: { argb: BORDA_FORTE } },
      right: { style: 'thin', color: { argb: BORDA_FORTE } },
    };
  });
  sheet.getRow(LINHA_HEADER_1).height = 18;
  sheet.getRow(LINHA_HEADER_2).height = 20;

  if (temTimeline) {
    // 2ª linha: data de início de cada coluna (valor real, usado pelas regras das barras)
    let mesAtual = -1;
    let inicioMes = primeiraColTimeline;
    const fecharMes = (ate: number) => {
      if (mesAtual < 0 || ate < inicioMes) return;
      if (ate > inicioMes) sheet.mergeCells(LINHA_HEADER_1, inicioMes, LINHA_HEADER_1, ate);
      const cell = sheet.getCell(LINHA_HEADER_1, inicioMes);
      const d = new Date(iniMs + (inicioMes - primeiraColTimeline) * passo * DIA_MS);
      cell.value = `${NOMES_MES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
    };
    for (let k = 0; k < nColsTimeline; k++) {
      const c = primeiraColTimeline + k;
      const ms = iniMs + k * passo * DIA_MS;
      const d = new Date(ms);
      const chaveMes = d.getUTCFullYear() * 12 + d.getUTCMonth();
      if (chaveMes !== mesAtual) {
        fecharMes(c - 1);
        mesAtual = chaveMes;
        inicioMes = c;
      }
      const cell2 = sheet.getCell(LINHA_HEADER_2, c);
      cell2.value = d;
      cell2.numFmt = passo === 1 ? 'dd' : 'dd/mm';
      const ehHoje = hojeMs >= ms && hojeMs < ms + passo * DIA_MS;
      cell2.font = { name: fonte, size: passo === 1 ? 8 : 8, bold: ehHoje, color: { argb: ehHoje ? 'FFFFFFFF' : headerFg } };
      cell2.fill = fill(ehHoje ? 'FFDC2626' : headerBg);
      cell2.alignment = { vertical: 'middle', horizontal: 'center', textRotation: passo === 1 ? 0 : 90 };
      cell2.border = {
        left: { style: 'thin', color: { argb: BORDA } },
        right: { style: 'thin', color: { argb: BORDA } },
        bottom: { style: 'thin', color: { argb: BORDA_FORTE } },
      };
    }
    fecharMes(ultimaColTimeline);
    for (let c = primeiraColTimeline; c <= ultimaColTimeline; c++) {
      const cell1 = sheet.getCell(LINHA_HEADER_1, c);
      cell1.font = { name: fonte, size: 9, bold: true, color: { argb: headerFg } };
      cell1.fill = fill(headerBg);
      cell1.alignment = { vertical: 'middle', horizontal: 'left', indent: 0 };
      cell1.border = {
        top: { style: 'thin', color: { argb: BORDA_FORTE } },
        left: { style: 'thin', color: { argb: BORDA_FORTE } },
      };
    }
    if (passo === 7) sheet.getRow(LINHA_HEADER_2).height = 34;
  }

  // ---- linhas
  const ultimaLinhaDados = PRIMEIRA_LINHA_DADOS + linhas.length - 1;
  let listra = 0;
  linhas.forEach((l, idx) => {
    const r = PRIMEIRA_LINHA_DADOS + idx;
    const row = sheet.getRow(r);
    const ehServico = l.nivel === 0;
    const filhas: number[] = [];
    if (ehServico && l.cabecalhoServico) {
      for (let j = idx + 1; j < linhas.length && linhas[j].nivel > 0; j++) {
        filhas.push(PRIMEIRA_LINHA_DADOS + j);
      }
    }
    const temFilhas = filhas.length > 0;
    const a = filhas[0];
    const b = filhas[filhas.length - 1];

    let bg = compBg;
    let fg = compFg;
    if (ehServico && !ap.ocultarTitulos) {
      bg = tituloBg;
      fg = tituloFg;
    } else if (!ehServico) {
      listra += 1;
      if (listra % 2 === 0) {
        bg = compBgAlt;
        fg = compFgAlt;
      }
    }
    row.height = ehServico ? 24 : 26;

    const dataInicio = paraData(l.inicio);
    const dataFim = paraData(l.fim);
    const dataInicioReal = paraData(l.inicioReal);
    const dataFimReal = paraData(l.fimReal);

    const set = (c: number, valor: ExcelJS.CellValue, numFmt?: string, formula?: string) => {
      const cell = row.getCell(c);
      if (formula) {
        cell.value = {
          formula,
          result: valor as number | string | Date | undefined,
        } as ExcelJS.CellFormulaValue;
      } else {
        cell.value = valor;
      }
      if (numFmt) cell.numFmt = numFmt;
      return cell;
    };

    set(COL.item, l.item);
    set(COL.servico, l.label);
    set(COL.unidade, ehServico ? null : l.unidade?.trim() || null);
    set(COL.quantidade, ehServico ? null : l.quantidade ?? null, '#,##0.00##');

    // Custo do serviço = soma das composições.
    if (temFilhas) {
      const soma = filhas.reduce((acc, fr) => acc + (linhas[fr - PRIMEIRA_LINHA_DADOS].custo ?? 0), 0);
      set(COL.custo, soma, FMT_MOEDA, `SUM(${letra(COL.custo)}${a}:${letra(COL.custo)}${b})`);
    } else {
      set(COL.custo, l.custo ?? null, FMT_MOEDA);
    }

    // Datas do serviço = menor início e maior fim das composições.
    const colDatas: Array<[number, Date | null]> = [
      [COL.inicio, dataInicio],
      [COL.fim, dataFim],
      [COL.inicioReal, dataInicioReal],
      [COL.fimReal, dataFimReal],
    ];
    for (const [c, d] of colDatas) {
      if (temFilhas) {
        const col = letra(c);
        const fn = c === COL.inicio || c === COL.inicioReal ? 'MIN' : 'MAX';
        set(c, d ?? '', FMT_DATA, `IF(COUNT(${col}${a}:${col}${b})=0,"",${fn}(${col}${a}:${col}${b}))`);
      } else {
        set(c, d, FMT_DATA);
      }
    }

    // Dias = fim − início + 1.
    const diasCalc =
      dataInicio && dataFim && dataFim >= dataInicio
        ? Math.round((dataFim.getTime() - dataInicio.getTime()) / DIA_MS) + 1
        : '';
    const iniL = `${letra(COL.inicio)}${r}`;
    const fimL = `${letra(COL.fim)}${r}`;
    set(COL.dias, diasCalc, '0', `IF(AND(ISNUMBER(${iniL}),ISNUMBER(${fimL}),${fimL}>=${iniL}),${fimL}-${iniL}+1,"")`);

    // % executado: média das composições no serviço.
    const pct = Math.max(0, Math.min(100, l.pct || 0)) / 100;
    if (temFilhas) {
      const col = letra(COL.pct);
      set(COL.pct, pct, '0.00%', `AVERAGE(${col}${a}:${col}${b})`);
    } else {
      set(COL.pct, pct, '0.00%');
    }

    const tom = STATUS_TOM[l.status];
    set(COL.status, l.statusLabel);

    for (let c = 1; c <= COLUNAS_TABELA; c++) {
      const cell = row.getCell(c);
      cell.fill = fill(bg);
      cell.font = { name: fonte, size: ehServico ? 10 : 10, bold: ehServico, color: { argb: fg } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === COL.servico ? 'left' : c === COL.custo ? 'right' : 'center',
        wrapText: c === COL.servico,
        indent: c === COL.servico ? 1 + (l.nivel > 0 ? l.nivel : 0) : 0,
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: BORDA } },
        ...(grade
          ? {
              left: { style: 'thin' as const, color: { argb: BORDA } },
              right: { style: 'thin' as const, color: { argb: BORDA } },
            }
          : {}),
      };
    }
    // Status com a mesma cor da tela.
    const st = row.getCell(COL.status);
    st.fill = fill(tom.bg);
    st.font = { name: fonte, size: 10, bold: true, color: { argb: tom.fg } };

    // Linha do tempo: fundo da linha + barras por regra condicional.
    if (temTimeline) {
      for (let c = primeiraColTimeline; c <= ultimaColTimeline; c++) {
        const cell = row.getCell(c);
        cell.fill = fill(ehServico && !ap.ocultarTitulos ? tituloBg : bg);
        cell.border = {
          left: { style: 'hair', color: { argb: BORDA } },
          bottom: { style: 'thin', color: { argb: BORDA } },
        };
      }
      if (!l.cabecalhoServico) {
        const ref = `${letra(primeiraColTimeline)}${r}:${letra(ultimaColTimeline)}${r}`;
        const colIni = letra(primeiraColTimeline);
        const iR = `$${letra(COL.inicioReal)}${r}`;
        const fR = `$${letra(COL.fimReal)}${r}`;
        const iP = `$${letra(COL.inicio)}${r}`;
        const fP = `$${letra(COL.fim)}${r}`;
        const cab = `${colIni}$${LINHA_HEADER_2}`;
        const passoTxt = String(passo - 1);
        sheet.addConditionalFormatting({
          ref,
          rules: [
            {
              type: 'expression',
              priority: 1,
              formulae: [`AND(ISNUMBER(${iR}),ISNUMBER(${fR}),${cab}<=${fR},${cab}+${passoTxt}>=${iR})`],
              style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: tom.barra } } },
            },
            {
              type: 'expression',
              priority: 2,
              formulae: [`AND(ISNUMBER(${iP}),ISNUMBER(${fP}),${cab}<=${fP},${cab}+${passoTxt}>=${iP})`],
              style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFCBD5E1' } } },
            },
          ],
        });
      }
    }
  });

  // ---- filtro e área de impressão
  if (linhas.length > 0) {
    sheet.autoFilter = {
      from: { row: LINHA_HEADER_2, column: 1 },
      to: { row: ultimaLinhaDados, column: COLUNAS_TABELA },
    };
    sheet.pageSetup.printArea = `A1:${letra(Math.max(COLUNAS_TABELA, ultimaColTimeline))}${ultimaLinhaDados}`;
    sheet.pageSetup.printTitlesRow = `${LINHA_HEADER_1}:${LINHA_HEADER_2}`;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function downloadCronogramaExcel(
  linhas: CronogramaExcelLinha[],
  filename: string,
  opts: { contrato?: string; titulo?: string; aparencia?: CronogramaExcelAparencia }
): Promise<void> {
  const buffer = await buildCronogramaExcel(linhas, opts);
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

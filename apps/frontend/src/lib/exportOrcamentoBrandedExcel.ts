import ExcelJS from 'exceljs';
import { EXPORT_COMPANY } from '@/lib/exportBrandingLogos';

const BRAND_RED = 'FFB91C1C';
const TITLE_TEXT = 'FF111827';
const MUTED_TEXT = 'FF4B5563';
const BORDER = 'FF000000';
const ROW_ALT = 'FFF9FAFB';
const WHITE = 'FFFFFFFF';
const HEADER_BG = 'FFF9FAFB';
const HEADER_FG = 'FF4B5563';
const TITLE_BG = 'FFDC2626';
const SUBTITLE_BG = 'FFE2E8F0';
const SUBTITLE_FG = 'FF1F2937';
const TOTAL_BG = 'FFF9FAFB';
const SECTION_BG = 'FFF3F4F6';
const RODAPE_ROTULO_BG = 'FFD9D9D9';
/** Rótulos do quadro de identificação do orçamento (cinza claro). */
const ROTULO_CLARO_BG = 'FFF2F2F2';
const SERVICO_BARRA_BG = 'FF000000';
const GREEN_BG = 'FFDCFCE7';
const GREEN_FG = 'FF166534';
const AMBER_BG = 'FFFEF3C7';
const AMBER_FG = 'FF92400E';
const RED_BG = 'FFFEE2E2';
const RED_FG = 'FF991B1B';

/** Logos do cabeçalho: `orcamento` (public/logo-orcamento.jpg, 212×185) e `nome` (public/logonome.jpg, 879×284). */
const LOGOS_CABECALHO = {
  orcamento: { url: '/logo-orcamento.jpg', largura: 212, altura: 185 },
  nome: { url: '/logonome.jpg', largura: 879, altura: 284 },
} as const;

/** A linha da legenda tem fonte fixa (Calibri 9, itálico), independente da fonte escolhida na aparência. */
const FONTE_LEGENDA = 'Calibri';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type OrcamentoExcelColFormat = 'text' | 'int' | 'qty' | 'qty4' | 'currency' | 'percent';

export type OrcamentoExcelColumn = {
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  format?: OrcamentoExcelColFormat;
  /** Não ajusta a largura ao maior texto da coluna. */
  larguraFixa?: boolean;
};

export type OrcamentoExcelRowKind =
  | 'item'
  | 'titulo'
  | 'itemBarra'
  /** Linha de composição no analítico (usa a cor de composição da aparência). */
  | 'composicao'
  | 'subtitulo'
  | 'cabecalho'
  | 'total'
  /** Caixa de resumo no canto direito: rótulos cinza nas colunas 11–12 e valor na 13. */
  | 'rodape'
  /** Barra preta com o nome do serviço (memória de cálculo). */
  | 'servico'
  | 'section'
  | 'legenda'
  | 'blank';

export type OrcamentoExcelCellValue = string | number | null | undefined;

export type OrcamentoExcelRow = {
  kind?: OrcamentoExcelRowKind;
  values: OrcamentoExcelCellValue[];
  /**
   * Fórmulas Excel; chave = coluna 0-based. Use `{r}` para a linha real da planilha e
   * `{R<n>}` para a linha real da n-ésima linha de `rows` (0-based), ex.: `SUM(M{R3}:M{R9})`.
   */
  formulas?: Record<number, string>;
  formats?: Record<number, OrcamentoExcelColFormat>;
  /** Mescla colunas 0-based inclusive, ex.: [0, 7] junta A até H. */
  merge?: [number, number];
  /** Mescla para baixo: coluna 0-based → quantas linhas a célula ocupa (inclui a atual). */
  rowSpan?: Record<number, number>;
  /** Rodapé: rótulo e valor na cor do título dos serviços (ex.: TOTAL GERAL). */
  destaqueTitulo?: boolean;
  /** Cor por célula, por cima do tipo da linha. `item` usa a cor do item; `plain` fica branco. */
  tones?: Record<number, 'item' | 'plain' | 'label'>;
};

/** Célula do quadro de identificação no topo da aba; `de`/`ate` são colunas 0-based (inclusive). */
export type OrcamentoExcelCabecalhoCelula = {
  texto: string;
  de: number;
  ate: number;
  /** Rótulo: fundo cinza, negrito e centralizado. Sem isso, é valor (fundo branco). */
  rotulo?: boolean;
  alinhamento?: 'left' | 'center' | 'right';
  /** `barra` = faixa preta com texto branco; `destaque` = valor maior, em negrito; `rotuloClaro` = rótulo em negrito, fundo cinza claro. */
  estilo?: 'barra' | 'destaque' | 'legenda' | 'rotuloClaro';
  /** Mescla para baixo: quantas linhas a mais a célula ocupa (0 = só a atual). */
  linhasAbaixo?: number;
  /** Reserva a célula para a logo (sem isso, a logo usa a 1ª célula da 1ª linha). */
  espacoLogo?: boolean;
};

/** Quadro de rótulo/valor acima do cabeçalho das colunas: cada item de `linhas` é uma linha da planilha. */
export type OrcamentoExcelCabecalho = {
  linhas: OrcamentoExcelCabecalhoCelula[][];
  /** Altura por linha (padrão 20). */
  alturas?: number[];
  /** Coloca a logo da Gennesis no canto superior esquerdo (sobre as células vazias da 1ª linha). */
  logo?: boolean;
  /** Qual logo usar (padrão `orcamento`). A Memória de cálculo usa `nome`. */
  logoVariante?: keyof typeof LOGOS_CABECALHO;
  /** Contornos em borda média ao redor de blocos: linhas 1-based e colunas 0-based (inclusive). */
  molduras?: Array<{ linhaDe: number; linhaAte: number; colDe: number; colAte: number }>;
};

/** Caixa de texto fora da tabela, à direita (ex.: bancos de composições usados no orçamento). */
export type OrcamentoExcelCaixaLateral = {
  titulo: string;
  texto: string;
  /** Linha (1-based) onde a caixa começa; padrão 1. */
  linhaDe?: number;
  /** Quantas linhas o texto ocupa abaixo do título; padrão 6. */
  linhasTexto?: number;
  /** Colunas 0-based (inclusive). */
  colDe: number;
  colAte: number;
  larguraColuna?: number;
};

export type OrcamentoExcelSheetSpec = {
  name: string;
  title: string;
  subtitle?: string;
  /** Escrito acima do cabeçalho das colunas (precisa de pelo menos 14 colunas). */
  cabecalho?: OrcamentoExcelCabecalho;
  columns: OrcamentoExcelColumn[];
  rows: OrcamentoExcelRow[];
  autoFilter?: boolean;
  /** Se false, não escreve o cabeçalho global (útil quando cada bloco já tem o próprio). */
  showHeader?: boolean;
  /** Cores desta aba. Se omitido, usa a aparência geral do arquivo. */
  aparencia?: OrcamentoExcelAparencia;
  /** Caixa à direita da tabela; a área de impressão continua só na tabela. */
  caixaLateral?: OrcamentoExcelCaixaLateral;
  /** Tamanho da fonte (pt) das linhas de item e do cabeçalho das colunas. */
  tamanhos?: { item?: number; header?: number };
  /** Linhas de item todas brancas, sem alternar com cinza claro. */
  semZebra?: boolean;
};

export type OrcamentoExcelAparencia = {
  tituloFundo?: string;
  tituloTexto?: string;
  subtituloFundo?: string;
  subtituloTexto?: string;
  headerFundo?: string;
  headerTexto?: string;
  /** Faixa do item na memória de cálculo. */
  itemFundo?: string;
  itemTexto?: string;
  /** Linha de composição no analítico. */
  composicaoFundo?: string;
  composicaoTexto?: string;
  fonte?: string;
};

function colunaEhDescricao(header?: string): boolean {
  const h = String(header ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return h.includes('descri');
}

function hexToArgb(hex?: string, fallback = BRAND_RED): string {
  if (!hex) return fallback;
  const h = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return `FF${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) return `FF${h}`.toUpperCase();
  return fallback;
}

function resolveExcelFont(css?: string): string {
  const s = (css || '').toLowerCase();
  if (s.includes('arial')) return 'Arial';
  if (s.includes('times')) return 'Times New Roman';
  if (s.includes('georgia')) return 'Georgia';
  if (s.includes('courier')) return 'Courier New';
  if (s.includes('calibri')) return 'Calibri';
  return 'Calibri';
}

function applyThinBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: BORDER } },
    left: { style: 'thin', color: { argb: BORDER } },
    bottom: { style: 'thin', color: { argb: BORDER } },
    right: { style: 'thin', color: { argb: BORDER } },
  };
}

function excelNumFmt(format: OrcamentoExcelColFormat | undefined): string | undefined {
  switch (format) {
    case 'currency':
      return '_-[$R$-416]* #,##0.00_-;-[$R$-416]* #,##0.00_-;_-[$R$-416]* "-"??_-;_-@_-';
    case 'qty':
      return '#,##0.00';
    case 'qty4':
      return '#,##0.0000';
    case 'percent':
      return '0.00"%"';
    case 'int':
      return '#,##0';
    default:
      return undefined;
  }
}

function statusTone(value: string): { bg: string; fg: string } | null {
  const v = value.trim().toUpperCase();
  if (['CONCLUÍDO', 'CONCLUIDO', 'NO PRAZO', 'ATIVO'].includes(v)) {
    return { bg: GREEN_BG, fg: GREEN_FG };
  }
  if (['EM ANDAMENTO', 'A INICIAR', 'PENDENTE'].includes(v)) {
    return { bg: AMBER_BG, fg: AMBER_FG };
  }
  if (['ATRASADO', 'ATRASADA', 'PARADO'].includes(v)) {
    return { bg: RED_BG, fg: RED_FG };
  }
  return null;
}

function applyCellFormat(
  cell: ExcelJS.Cell,
  value: OrcamentoExcelCellValue,
  format: OrcamentoExcelColFormat | undefined,
  formula: string | undefined,
  excelRow: number,
  primeiraLinhaDados: number
) {
  if (formula) {
    const expr = formula
      .replace(/\{r\}/g, String(excelRow))
      .replace(/\{R(\d+)\}/g, (_, i: string) => String(primeiraLinhaDados + Number(i)))
      .replace(/^=/, '');
    // `result` guarda o valor já calculado: leitores que não recalculam continuam mostrando o número.
    cell.value =
      typeof value === 'number' && Number.isFinite(value)
        ? { formula: expr, result: value }
        : { formula: expr };
  } else if (value === null || value === undefined || value === '') {
    // Célula realmente vazia: uma string vazia daria #VALOR! em fórmulas que a referenciam.
    cell.value = null;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    cell.value = value;
  } else {
    cell.value = value;
  }
  const numFmt = excelNumFmt(format);
  if (numFmt && (typeof cell.value === 'number' || formula)) {
    cell.numFmt = numFmt;
  }
}

async function fillWorkbook(
  sheets: OrcamentoExcelSheetSpec[],
  options?: { contrato?: string; aparencia?: OrcamentoExcelAparencia }
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = EXPORT_COMPANY;
  workbook.created = new Date();
  workbook.modified = new Date();

  for (const spec of sheets) {
    if (!spec.columns.length) continue;
    const aparencia = spec.aparencia ?? options?.aparencia;
    const fontName = resolveExcelFont(aparencia?.fonte);
    const tituloBg = hexToArgb(aparencia?.tituloFundo, TITLE_BG);
    const tituloFg = hexToArgb(aparencia?.tituloTexto, WHITE);
    const subtituloBg = hexToArgb(aparencia?.subtituloFundo, SUBTITLE_BG);
    const subtituloFg = hexToArgb(aparencia?.subtituloTexto, SUBTITLE_FG);
    const headerBg = hexToArgb(aparencia?.headerFundo, HEADER_BG);
    const headerFg = hexToArgb(aparencia?.headerTexto, HEADER_FG);
    const itemBg = hexToArgb(aparencia?.itemFundo, tituloBg);
    const itemFg = hexToArgb(aparencia?.itemTexto, tituloFg);
    const composicaoBg = hexToArgb(aparencia?.composicaoFundo, 'FFF1F5F9');
    const composicaoFg = hexToArgb(aparencia?.composicaoTexto, TITLE_TEXT);
    const tamItem = spec.tamanhos?.item ?? 10;
    const tamHeader = spec.tamanhos?.header ?? 8;
    const colCount = spec.columns.length;
    const showHeader = spec.showHeader !== false;
    const cabecalho = spec.cabecalho;
    /** Linhas ocupadas acima do cabeçalho das colunas: o quadro de identificação e uma linha de respiro. */
    const offsetCabecalho = cabecalho ? cabecalho.linhas.length + 1 : 0;
    const linhaHeaderColunas = offsetCabecalho + 1;
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31), {
      // Abre em «Visualização de Quebra de Página» (fora da área de impressão fica cinza), em 70%, sem linhas de grade (fundo branco).
      views: [
        showHeader && !cabecalho
          ? {
              state: 'frozen',
              ySplit: 1,
              style: 'pageBreakPreview',
              zoomScale: 70,
              zoomScaleNormal: 70,
              showGridLines: false,
            }
          : { style: 'pageBreakPreview', zoomScale: 70, zoomScaleNormal: 70, showGridLines: false },
      ],
      properties: { defaultRowHeight: 30 },
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        horizontalCentered: true,
      },
    });

    spec.columns.forEach((col, i) => {
      sheet.getColumn(i + 1).width = col.width ?? 14;
    });

    if (cabecalho) {
      cabecalho.linhas.forEach((celulas, i) => {
        const linha = i + 1;
        sheet.getRow(linha).height = cabecalho.alturas?.[i] ?? 20;
        for (const celula of celulas) {
          const de = celula.de + 1;
          const ate = Math.min(celula.ate, colCount - 1) + 1;
          const extra = Math.max(0, celula.linhasAbaixo ?? 0);
          for (let r = linha; r <= linha + extra; r++) {
            for (let c = de; c <= ate; c++) {
              const cell = sheet.getCell(r, c);
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: {
                  argb:
                    celula.estilo === 'barra'
                      ? SERVICO_BARRA_BG
                      : celula.rotulo
                        ? RODAPE_ROTULO_BG
                        : celula.estilo === 'rotuloClaro'
                          ? ROTULO_CLARO_BG
                          : WHITE,
                },
              };
              applyThinBorder(cell);
            }
          }
          const cell = sheet.getCell(linha, de);
          cell.value = celula.texto;
          cell.font =
            celula.estilo === 'barra'
              ? { name: fontName, size: 11, bold: true, color: { argb: WHITE } }
              : celula.estilo === 'destaque'
                ? { name: fontName, size: 14, bold: true, color: { argb: TITLE_TEXT } }
                : celula.estilo === 'legenda'
                  ? { name: FONTE_LEGENDA, size: 9, italic: true, color: { argb: TITLE_TEXT } }
                : {
                    name: fontName,
                    size: 10,
                    bold: Boolean(celula.rotulo) || celula.estilo === 'rotuloClaro',
                    color: { argb: TITLE_TEXT },
                  };
          cell.alignment = {
            vertical: 'middle',
            horizontal:
              celula.alinhamento ??
              (celula.rotulo || (celula.estilo && celula.estilo !== 'rotuloClaro') ? 'center' : 'left'),
            wrapText: true,
          };
          if (ate > de || extra > 0) sheet.mergeCells(linha, de, linha + extra, ate);
        }
      });
      sheet.getRow(cabecalho.linhas.length + 1).height = 10;
    }

    if (showHeader) {
      const headerRow = sheet.getRow(linhaHeaderColunas);
      headerRow.height = 30;
      spec.columns.forEach((col, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = col.header;
        cell.font = { name: fontName, size: tamHeader, bold: true, color: { argb: headerFg } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, shrinkToFit: false };
        applyThinBorder(cell);
      });
    }

    let itemStripe = 0;
    const mesclasVerticais: Array<[number, number, number]> = [];
    spec.rows.forEach((rowSpec, i) => {
      const excelRow = offsetCabecalho + (showHeader ? 2 : 1) + i;
      const row = sheet.getRow(excelRow);
      const kind = rowSpec.kind ?? 'item';
      row.height = 30;

      if (kind === 'item') itemStripe += 1;

      for (let c = 0; c < colCount; c++) {
        const col = spec.columns[c];
        const cell = row.getCell(c + 1);
        const format = rowSpec.formats?.[c] ?? col?.format;
        applyCellFormat(
          cell,
          rowSpec.values[c],
          format,
          rowSpec.formulas?.[c],
          excelRow,
          offsetCabecalho + (showHeader ? 2 : 1)
        );
        const mergeTo = rowSpec.merge?.[0] === c ? rowSpec.merge[1] : undefined;
        const alinhamento =
          colunaEhDescricao(col?.header) ||
          (mergeTo != null && colunaEhDescricao(spec.columns[mergeTo]?.header))
            ? 'left'
            : 'center';
        cell.font = { name: fontName, size: tamItem, color: { argb: TITLE_TEXT } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: alinhamento,
          wrapText: kind === 'legenda' || kind === 'section' || colunaEhDescricao(col?.header),
        };

        if (kind === 'blank') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
          continue;
        }

        if (kind === 'servico') {
          row.height = 28;
          applyThinBorder(cell);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SERVICO_BARRA_BG } };
          cell.font = { name: fontName, size: 12, bold: true, color: { argb: WHITE } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          continue;
        }

        if (kind === 'rodape') {
          row.height = 20;
          const ehRotulo = c === 11 || c === 12;
          if (!ehRotulo && c !== 13) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
            continue;
          }
          applyThinBorder(cell);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {
              argb: rowSpec.destaqueTitulo ? tituloBg : ehRotulo ? RODAPE_ROTULO_BG : WHITE,
            },
          };
          cell.font = {
            name: fontName,
            size: 10,
            bold: true,
            color: { argb: rowSpec.destaqueTitulo ? tituloFg : TITLE_TEXT },
          };
          cell.alignment = {
            vertical: 'middle',
            horizontal: ehRotulo ? 'center' : 'right',
          };
          continue;
        }

        applyThinBorder(cell);

        if (kind === 'titulo' || kind === 'itemBarra') {
          const fundo = kind === 'itemBarra' ? itemBg : tituloBg;
          const letra = kind === 'itemBarra' ? itemFg : tituloFg;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } };
          cell.font = { name: fontName, size: 10, bold: true, color: { argb: letra } };
          cell.alignment = {
            vertical: 'middle',
            horizontal: colunaEhDescricao(col?.header) ? 'left' : 'center',
            wrapText: true,
          };
        } else if (kind === 'composicao') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: composicaoBg } };
          cell.font = { name: fontName, size: tamItem, bold: true, color: { argb: composicaoFg } };
        } else if (kind === 'subtitulo') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: subtituloBg } };
          cell.font = { name: fontName, size: 10, bold: true, color: { argb: subtituloFg } };
        } else if (kind === 'cabecalho') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
          cell.font = { name: fontName, size: 9, bold: true, color: { argb: headerFg } };
        } else if (kind === 'total') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } };
          cell.font = { name: fontName, size: 10, bold: true, color: { argb: TITLE_TEXT } };
        } else if (kind === 'section' || kind === 'legenda') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_BG } };
          cell.font = {
            name: fontName,
            size: 9,
            italic: kind === 'legenda',
            bold: kind === 'section',
            color: { argb: MUTED_TEXT },
          };
        } else {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: !spec.semZebra && itemStripe % 2 === 0 ? ROW_ALT : WHITE },
          };
          if (c === colCount - 1 || spec.columns[c]?.header.toLowerCase() === 'status') {
            const tone = statusTone(String(rowSpec.values[c] ?? ''));
            if (tone) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.bg } };
              cell.font = { name: fontName, size: 10, bold: true, color: { argb: tone.fg } };
            }
          }
        }

        const cellTone = rowSpec.tones?.[c];
        if (cellTone === 'item') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: itemBg } };
          cell.font = { name: fontName, size: 10, bold: true, color: { argb: itemFg } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        } else if (cellTone === 'plain' || cellTone === 'label') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
          cell.font = { name: fontName, size: 10, bold: true, color: { argb: TITLE_TEXT } };
          cell.alignment = {
            vertical: 'middle',
            horizontal: cellTone === 'label' || colunaEhDescricao(col?.header) ? 'left' : 'center',
            wrapText: true,
          };
        }
      }
      if (rowSpec.rowSpan) {
        // Mescla só depois de todas as linhas: escrever numa célula coberta apagaria o valor da principal.
        for (const [col, n] of Object.entries(rowSpec.rowSpan)) {
          if (n > 1) mesclasVerticais.push([excelRow, Number(col) + 1, excelRow + n - 1]);
        }
      }
      if (rowSpec.merge) {
        const [from, to] = rowSpec.merge;
        sheet.mergeCells(excelRow, from + 1, excelRow, to + 1);
      }
    });

    for (const [de, col, ate] of mesclasVerticais) sheet.mergeCells(de, col, ate, col);

    spec.columns.forEach((col, i) => {
      if (!colunaEhDescricao(col.header) || col.larguraFixa) return;
      let maior = String(col.header || '').length;
      for (const rowSpec of spec.rows) {
        const valor = rowSpec.values[i];
        if (typeof valor !== 'string') continue;
        maior = Math.max(maior, valor.trim().length);
      }
      const largura = Math.min(120, Math.max(col.width ?? 20, maior + 3));
      sheet.getColumn(i + 1).width = largura;
    });

    if (cabecalho?.logo) {
      try {
        // Logo do orçamento (public/logo-orcamento.jpg), centralizada na área reservada do cabeçalho.
        const logoDef = LOGOS_CABECALHO[cabecalho.logoVariante ?? 'orcamento'];
        const resp = await fetch(logoDef.url);
        if (resp.ok) {
          const bytes = new Uint8Array(await resp.arrayBuffer());
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          }
          const imageId = workbook.addImage({ base64: btoa(bin), extension: 'jpeg' });
          // Área da logo: célula marcada com `espacoLogo` (pode ocupar várias linhas) ou a 1ª da 1ª linha.
          let linhaLogo = 0;
          let primeira = cabecalho.linhas[0]?.[0];
          cabecalho.linhas.forEach((celulas, i) => {
            const marcada = celulas.find((c) => c.espacoLogo);
            if (marcada) {
              linhaLogo = i;
              primeira = marcada;
            }
          });
          const de = primeira?.de ?? 0;
          const ate = Math.min(primeira?.ate ?? 2, colCount - 1);
          const colPx = (c: number) => Math.round((sheet.getColumn(c + 1).width ?? 8.43) * 7 + 5);
          let larguraPx = 0;
          for (let c = de; c <= ate; c++) larguraPx += colPx(c);
          const alturaLinhaPx = (i: number) => (((cabecalho.alturas?.[i] ?? 20) as number) * 96) / 72;
          const nLinhas = 1 + Math.max(0, primeira?.linhasAbaixo ?? 0);
          let alturaPx = 0;
          for (let i = 0; i < nLinhas; i++) alturaPx += alturaLinhaPx(linhaLogo + i);
          const h = Math.max(20, Math.round(alturaPx - 10));
          const w = Math.min(Math.round(h * (logoDef.largura / logoDef.altura)), Math.max(40, larguraPx - 10));
          const hFinal = Math.round(w * (logoDef.altura / logoDef.largura));
          // Fração de coluna: deslocamento em px dentro da coluna onde a logo começa.
          let restante = (larguraPx - w) / 2;
          let col = de;
          while (col < ate && restante >= colPx(col)) {
            restante -= colPx(col);
            col += 1;
          }
          // Idem na vertical: linha e fração de linha onde a logo começa.
          let restanteV = (alturaPx - hFinal) / 2;
          let linhaIdx = linhaLogo;
          while (linhaIdx < linhaLogo + nLinhas - 1 && restanteV >= alturaLinhaPx(linhaIdx)) {
            restanteV -= alturaLinhaPx(linhaIdx);
            linhaIdx += 1;
          }
          // Posição nativa (EMU = px × 9525): a conversão de fração de coluna/linha do ExcelJS
          // ignora a largura real da coluna e deixava a logo deslocada para a esquerda.
          sheet.addImage(imageId, {
            tl: {
              nativeCol: col,
              nativeColOff: Math.round(restante * 9525),
              nativeRow: linhaIdx,
              nativeRowOff: Math.round(restanteV * 9525),
            },
            ext: { width: w, height: hFinal },
            editAs: 'absolute',
          } as unknown as ExcelJS.ImageRange);
        }
      } catch {
        /* sem logo: o cabeçalho continua válido */
      }
    }

    if (spec.caixaLateral) {
      const cx = spec.caixaLateral;
      const l0 = cx.linhaDe ?? 1;
      const l1 = l0 + 1;
      const l2 = l1 + (cx.linhasTexto ?? 6) - 1;
      const c0 = cx.colDe + 1;
      const c1 = cx.colAte + 1;
      // Só ajusta a largura das colunas fora da tabela (caixa dentro da tabela respeita as colunas).
      for (let c = c0; c <= c1; c++) {
        if (c > colCount) sheet.getColumn(c).width = cx.larguraColuna ?? 22;
      }
      for (let r = l0; r <= l2; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = sheet.getCell(r, c);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: r === l0 ? ROTULO_CLARO_BG : WHITE },
          };
          applyThinBorder(cell);
        }
      }
      sheet.mergeCells(l0, c0, l0, c1);
      sheet.mergeCells(l1, c0, l2, c1);
      const titulo = sheet.getCell(l0, c0);
      titulo.value = cx.titulo;
      titulo.font = { name: fontName, size: 11, bold: true, color: { argb: TITLE_TEXT } };
      titulo.alignment = { vertical: 'middle', horizontal: 'center' };
      const corpo = sheet.getCell(l1, c0);
      corpo.value = cx.texto;
      corpo.font = { name: fontName, size: 9, bold: true, color: { argb: TITLE_TEXT } };
      corpo.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      const ultimaLinhaTabela = offsetCabecalho + (showHeader ? 1 : 0) + spec.rows.length;
      sheet.pageSetup.printArea = `A1:${sheet.getColumn(colCount).letter}${Math.max(ultimaLinhaTabela, l2)}`;
    }

    if (!spec.caixaLateral) {
      // Área de impressão = só a tabela; o resto da planilha aparece cinza na quebra de página.
      const ultimaLinha = offsetCabecalho + (showHeader ? 1 : 0) + spec.rows.length;
      sheet.pageSetup.printArea = `A1:${sheet.getColumn(colCount).letter}${Math.max(1, ultimaLinha)}`;
    }

    // Contornos médios ao redor dos blocos do cabeçalho (aplicados por último, sobre as bordas finas).
    for (const m of cabecalho?.molduras ?? []) {
      const medio = { style: 'medium' as const, color: { argb: BORDER } };
      for (let r = m.linhaDe; r <= m.linhaAte; r++) {
        for (let c = m.colDe + 1; c <= m.colAte + 1; c++) {
          const cell = sheet.getCell(r, c);
          const b = { ...(cell.border ?? {}) };
          if (r === m.linhaDe) b.top = medio;
          if (r === m.linhaAte) b.bottom = medio;
          if (c === m.colDe + 1) b.left = medio;
          if (c === m.colAte + 1) b.right = medio;
          cell.border = b;
        }
      }
    }

    if (spec.autoFilter !== false && spec.rows.length) {
      sheet.autoFilter = {
        from: { row: linhaHeaderColunas, column: 1 },
        to: { row: linhaHeaderColunas + spec.rows.length, column: colCount },
      };
    }
  }

  return workbook;
}

export async function buildOrcamentoBrandedWorkbook(
  sheets: OrcamentoExcelSheetSpec[],
  options?: { contrato?: string; aparencia?: OrcamentoExcelAparencia }
): Promise<ArrayBuffer> {
  const workbook = await fillWorkbook(sheets.filter(Boolean), options);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export async function downloadOrcamentoBrandedExcel(
  sheets: OrcamentoExcelSheetSpec[],
  filename: string,
  options?: { contrato?: string; aparencia?: OrcamentoExcelAparencia }
): Promise<void> {
  const buffer = await buildOrcamentoBrandedWorkbook(sheets, options);
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

export function orcamentoWorkbookToFile(buffer: ArrayBuffer, filename: string): File {
  return new File([buffer], filename, { type: XLSX_MIME });
}

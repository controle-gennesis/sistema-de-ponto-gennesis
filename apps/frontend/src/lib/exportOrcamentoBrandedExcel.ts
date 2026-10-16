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
const SERVICO_BARRA_BG = 'FF000000';
const GREEN_BG = 'FFDCFCE7';
const GREEN_FG = 'FF166534';
const AMBER_BG = 'FFFEF3C7';
const AMBER_FG = 'FF92400E';
const RED_BG = 'FFFEE2E2';
const RED_FG = 'FF991B1B';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type OrcamentoExcelColFormat = 'text' | 'int' | 'qty' | 'qty4' | 'currency' | 'percent';

export type OrcamentoExcelColumn = {
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  format?: OrcamentoExcelColFormat;
};

export type OrcamentoExcelRowKind =
  | 'item'
  | 'titulo'
  | 'itemBarra'
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
  alinhamento?: 'left' | 'center';
};

/** Quadro de rótulo/valor acima do cabeçalho das colunas: cada item de `linhas` é uma linha da planilha. */
export type OrcamentoExcelCabecalho = {
  linhas: OrcamentoExcelCabecalhoCelula[][];
  /** Altura por linha (padrão 20). */
  alturas?: number[];
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
    cell.value = '';
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
    const colCount = spec.columns.length;
    const showHeader = spec.showHeader !== false;
    const cabecalho = spec.cabecalho && colCount >= 14 ? spec.cabecalho : undefined;
    /** Linhas ocupadas acima do cabeçalho das colunas: o quadro de identificação e uma linha de respiro. */
    const offsetCabecalho = cabecalho ? cabecalho.linhas.length + 1 : 0;
    const linhaHeaderColunas = offsetCabecalho + 1;
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31), {
      views: showHeader && !cabecalho ? [{ state: 'frozen', ySplit: 1 }] : [{}],
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
          for (let c = de; c <= ate; c++) {
            const cell = sheet.getCell(linha, c);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: celula.rotulo ? RODAPE_ROTULO_BG : WHITE },
            };
            applyThinBorder(cell);
          }
          const cell = sheet.getCell(linha, de);
          cell.value = celula.texto;
          cell.font = { name: fontName, size: 10, bold: Boolean(celula.rotulo), color: { argb: TITLE_TEXT } };
          cell.alignment = {
            vertical: 'middle',
            horizontal: celula.alinhamento ?? (celula.rotulo ? 'center' : 'left'),
            wrapText: true,
          };
          if (ate > de) sheet.mergeCells(linha, de, linha, ate);
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
        cell.font = { name: fontName, size: 8, bold: true, color: { argb: headerFg } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, shrinkToFit: false };
        applyThinBorder(cell);
      });
    }

    let itemStripe = 0;
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
        cell.font = { name: fontName, size: 10, color: { argb: TITLE_TEXT } };
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
            fgColor: { argb: ehRotulo ? RODAPE_ROTULO_BG : WHITE },
          };
          cell.font = { name: fontName, size: 10, bold: true, color: { argb: TITLE_TEXT } };
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
            fgColor: { argb: itemStripe % 2 === 0 ? ROW_ALT : WHITE },
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
      if (rowSpec.merge) {
        const [from, to] = rowSpec.merge;
        sheet.mergeCells(excelRow, from + 1, excelRow, to + 1);
      }
    });

    spec.columns.forEach((col, i) => {
      if (!colunaEhDescricao(col.header)) return;
      let maior = String(col.header || '').length;
      for (const rowSpec of spec.rows) {
        const valor = rowSpec.values[i];
        if (typeof valor !== 'string') continue;
        maior = Math.max(maior, valor.trim().length);
      }
      const largura = Math.min(120, Math.max(col.width ?? 20, maior + 3));
      sheet.getColumn(i + 1).width = largura;
    });

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

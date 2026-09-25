import ExcelJS from 'exceljs';
import { EXPORT_COMPANY } from '@/lib/exportBrandingLogos';

const BRAND_RED = 'FFB91C1C';
const TITLE_TEXT = 'FF111827';
const MUTED_TEXT = 'FF4B5563';
const BORDER = 'FFE5E7EB';
const ROW_ALT = 'FFF9FAFB';
const WHITE = 'FFFFFFFF';
const HEADER_BG = 'FFF9FAFB';
const HEADER_FG = 'FF4B5563';
const TITLE_BG = 'FFDC2626';
const SUBTITLE_BG = 'FFE2E8F0';
const SUBTITLE_FG = 'FF1F2937';
const TOTAL_BG = 'FFF9FAFB';
const SECTION_BG = 'FFF3F4F6';
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
  | 'subtitulo'
  | 'total'
  | 'section'
  | 'legenda'
  | 'blank';

export type OrcamentoExcelCellValue = string | number | null | undefined;

export type OrcamentoExcelRow = {
  kind?: OrcamentoExcelRowKind;
  values: OrcamentoExcelCellValue[];
  /** Fórmulas Excel; chave = coluna 0-based. Use `{r}` para a linha real da planilha. */
  formulas?: Record<number, string>;
  formats?: Record<number, OrcamentoExcelColFormat>;
  /** Mescla colunas 0-based inclusive, ex.: [0, 7] junta A até H. */
  merge?: [number, number];
};

export type OrcamentoExcelSheetSpec = {
  name: string;
  title: string;
  subtitle?: string;
  columns: OrcamentoExcelColumn[];
  rows: OrcamentoExcelRow[];
  autoFilter?: boolean;
  /** Se false, não escreve o cabeçalho global (útil quando cada bloco já tem o próprio). */
  showHeader?: boolean;
};

export type OrcamentoExcelAparencia = {
  tituloFundo?: string;
  tituloTexto?: string;
  subtituloFundo?: string;
  subtituloTexto?: string;
  fonte?: string;
};

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
      return 'R$ #,##0.00';
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
  excelRow: number
) {
  if (formula) {
    const expr = formula.replace(/\{r\}/g, String(excelRow)).replace(/^=/, '');
    cell.value = { formula: expr };
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

  const fontName = resolveExcelFont(options?.aparencia?.fonte);
  const tituloBg = hexToArgb(options?.aparencia?.tituloFundo, TITLE_BG);
  const tituloFg = hexToArgb(options?.aparencia?.tituloTexto, WHITE);
  const subtituloBg = hexToArgb(options?.aparencia?.subtituloFundo, SUBTITLE_BG);
  const subtituloFg = hexToArgb(options?.aparencia?.subtituloTexto, SUBTITLE_FG);

  for (const spec of sheets) {
    if (!spec.columns.length) continue;
    const colCount = spec.columns.length;
    const showHeader = spec.showHeader !== false;
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31), {
      views: showHeader ? [{ state: 'frozen', ySplit: 1 }] : [{}],
      properties: { defaultRowHeight: 18 },
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

    if (showHeader) {
      const headerRow = sheet.getRow(1);
      headerRow.height = 36;
      spec.columns.forEach((col, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = col.header;
        cell.font = { name: fontName, size: 8, bold: true, color: { argb: HEADER_FG } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, shrinkToFit: false };
        applyThinBorder(cell);
      });
    }

    let itemStripe = 0;
    spec.rows.forEach((rowSpec, i) => {
      const excelRow = (showHeader ? 2 : 1) + i;
      const row = sheet.getRow(excelRow);
      const kind = rowSpec.kind ?? 'item';
      row.height =
        kind === 'titulo' ? 24 : kind === 'legenda' || kind === 'section' ? 20 : kind === 'blank' ? 22 : 18;

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
          excelRow
        );
        cell.font = { name: fontName, size: 10, color: { argb: TITLE_TEXT } };
        cell.alignment = {
          vertical: 'middle',
          horizontal: col?.align || (format && format !== 'text' ? 'right' : 'left'),
          wrapText: kind === 'legenda' || kind === 'section',
        };

        if (kind === 'blank') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
          continue;
        }

        applyThinBorder(cell);

        if (kind === 'titulo') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tituloBg } };
          cell.font = { name: fontName, size: 10, bold: true, color: { argb: tituloFg } };
          cell.alignment = {
            vertical: 'middle',
            horizontal: c === colCount - 1 ? 'center' : 'left',
            wrapText: true,
          };
        } else if (kind === 'subtitulo') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: subtituloBg } };
          cell.font = { name: fontName, size: 10, bold: true, color: { argb: subtituloFg } };
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
      }
      if (rowSpec.merge) {
        const [from, to] = rowSpec.merge;
        sheet.mergeCells(excelRow, from + 1, excelRow, to + 1);
      }
    });

    if (spec.autoFilter !== false && spec.rows.length) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1 + spec.rows.length, column: colCount },
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

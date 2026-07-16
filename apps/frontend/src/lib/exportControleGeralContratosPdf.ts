import jsPDF from 'jspdf';
import { loadPdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';

export type ControleGeralPdfContractRow = {
  contract: string;
  mesesLabel: string;
  anoLabel: string;
  faturamento: number;
  liquido: number;
  recebido: number;
  gastos: number;
  lucroLiquido: number;
  gastoFatPercent: string;
  gastoRecPercent: string;
};

export type ControleGeralPdfFinancialSummary = {
  faturamento: number;
  liquido: number;
  recebido: number;
  gastos: number;
  lucroLiquido: number;
  gastoFatPercent: string;
  gastoRecPercent: string;
};

export type ControleGeralPdfLocalityGroup = {
  localityLabel: string;
  contractCount: number;
  rows: ControleGeralPdfContractRow[];
  summary: ControleGeralPdfFinancialSummary;
};

export type ExportControleGeralContratosPdfInput = {
  filterLines: string[];
  groups: ControleGeralPdfLocalityGroup[];
  grandSummary: ControleGeralPdfFinancialSummary;
  contractCount: number;
  sheetUpdatedAt?: string;
  generatedAt?: Date;
  overviewSection?: ControleGeralPdfOverviewSection;
};

export type ControleGeralPdfOverviewRow = {
  name: string;
  number: string;
  costCenter: string;
  faturamentoAcumulado: number;
  faturamentoAnual: number | null;
  totalProducaoSemanal: number;
  valorOrcado: number;
  pendenteFaturamento: number;
};

export type ControleGeralPdfOverviewTotals = {
  contractCount: number;
  faturamentoAcumulado: number;
  faturamentoAnual: number | null;
  totalProducaoSemanal: number;
  valorOrcado: number;
  pendenteFaturamento: number;
};

export type ControleGeralPdfOverviewSection = {
  searchTerm?: string;
  filterYear?: number | null;
  rows: ControleGeralPdfOverviewRow[];
  totals: ControleGeralPdfOverviewTotals;
};

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_PAGE_BG: [number, number, number] = [180, 185, 192];
const HEADER_TABLE_BG: [number, number, number] = [209, 213, 219];
const SECTION_TITLE_BG: [number, number, number] = [248, 249, 250];
const ROW_ALT: [number, number, number] = [252, 252, 253];
const BORDER: [number, number, number] = [209, 213, 219];
const TOTAL_ROW_BG: [number, number, number] = [241, 245, 249];
const GRAND_TOTAL_BG: [number, number, number] = [255, 251, 235];
const TEXT_GREEN: [number, number, number] = [22, 101, 52];
const TEXT_RED: [number, number, number] = [185, 28, 28];
const TEXT_BLUE: [number, number, number] = [29, 78, 216];
const TEXT_SKY: [number, number, number] = [3, 105, 161];
const TEXT_BLACK: [number, number, number] = [0, 0, 0];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];

const COMPANY = {
  name: 'Gennesis Engenharia e Consultoria LTDA'
};

type PdfColumn = {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'right';
};

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyCell(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '—';
  return formatCurrency(value);
}

function calcGastoFaturamentoPercent(gastos: number, faturamento: number): number | null {
  if (!Number.isFinite(faturamento) || faturamento <= 0) return null;
  return (Math.abs(gastos) / faturamento) * 100;
}

function calcGastoRecebidoPercent(gastos: number, recebido: number): number | null {
  if (!Number.isFinite(recebido) || recebido <= 0) return null;
  return (Math.abs(gastos) / recebido) * 100;
}

function pdfLucroLiquidoColor(value: number): [number, number, number] {
  if (value > 0) return TEXT_GREEN;
  if (value < 0) return TEXT_RED;
  return TEXT_BLACK;
}

/** Espelha a tela: G/FAT vermelho ≥ 70%, verde caso contrário. */
function pdfGastoFaturamentoPercentColor(
  gastos: number,
  faturamento: number
): [number, number, number] {
  const percent = calcGastoFaturamentoPercent(gastos, faturamento);
  if (percent == null) return TEXT_MUTED;
  if (percent >= 70) return TEXT_RED;
  return TEXT_GREEN;
}

/** Espelha a tela: G/REC vermelho ≥ 85%, verde caso contrário. */
function pdfGastoRecebidoPercentColor(gastos: number, recebido: number): [number, number, number] {
  const percent = calcGastoRecebidoPercent(gastos, recebido);
  if (percent == null) return TEXT_MUTED;
  if (percent >= 85) return TEXT_RED;
  return TEXT_GREEN;
}

const SECTION_TITLE_BLOCK = 12;
const TABLE_HEADER_HEIGHT = 8;
const DATA_ROW_HEIGHT = 7;
const LOCALITY_SUMMARY_BLOCK = 12;
const GRAND_SUMMARY_BLOCK = 15;
const FOOTER_RESERVE = 14;

function getPageContentBottom(doc: jsPDF, margin: number): number {
  return doc.internal.pageSize.getHeight() - margin - FOOTER_RESERVE;
}

function estimateLocalitySectionHeight(rowCount: number): number {
  return (
    SECTION_TITLE_BLOCK +
    TABLE_HEADER_HEIGHT +
    rowCount * DATA_ROW_HEIGHT +
    LOCALITY_SUMMARY_BLOCK
  );
}

/** Evita iniciar uma localidade no fim da página se ela não couber inteira. */
function ensureLocalityFitsOnPage(
  doc: jsPDF,
  y: number,
  margin: number,
  group: ControleGeralPdfLocalityGroup
): number {
  const needed = estimateLocalitySectionHeight(group.rows.length);
  if (y + needed > getPageContentBottom(doc, margin)) {
    doc.addPage();
    return margin;
  }
  return y;
}

function ensureSpace(doc: jsPDF, y: number, need: number, margin: number): number {
  if (y + need > getPageContentBottom(doc, margin)) {
    doc.addPage();
    return margin;
  }
  return y;
}

function truncateText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

async function loadCompanyLogo(): Promise<{
  dataUrl: string;
  wMm: number;
  hMm: number;
} | null> {
  return loadPdfBrandingLogo({ userBrandingOnly: true, maxW: 36, maxH: 22 });
}

function drawPageHeader(
  doc: jsPDF,
  margin: number,
  pageWidth: number,
  logo: { dataUrl: string; wMm: number; hMm: number } | null,
  generatedAt: Date,
  sheetUpdatedAt?: string
): number {
  const headerH = 32;
  doc.setFillColor(...HEADER_PAGE_BG);
  doc.rect(0, 0, pageWidth, headerH, 'F');
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, headerH - 1.2, pageWidth, 1.2, 'F');

  let textX = margin;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', margin, 6, logo.wMm, logo.hMm);
    textX = margin + logo.wMm + 6;
  }

  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Controle Geral de Contratos', textX, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(COMPANY.name, textX, 21);

  const dateStr = generatedAt.toLocaleDateString('pt-BR');
  const timeStr = generatedAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.setFontSize(8);
  doc.text(`Gerado em ${dateStr} às ${timeStr}`, pageWidth - margin, 14, { align: 'right' });
  if (sheetUpdatedAt) {
    doc.text(`Planilha: ${sheetUpdatedAt}`, pageWidth - margin, 20, { align: 'right' });
  }
  doc.text(`${generatedAt.getFullYear()} — Confidencial`, pageWidth - margin, 26, { align: 'right' });

  return headerH + 6;
}

function drawFilterBox(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  filterLines: string[]
): number {
  const lines =
    filterLines.length > 0
      ? filterLines
      : ['Nenhum filtro restritivo aplicado (todos os contratos visíveis).'];

  doc.setFontSize(8);
  const wrapped: string[] = [];
  for (const line of lines) {
    wrapped.push(...doc.splitTextToSize(line, contentW - 12));
  }
  const boxH = 10 + wrapped.length * 4.2;
  y = ensureSpace(doc, y, boxH + 4, margin);

  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(margin, y, contentW, boxH, 2, 2, 'FD');
  doc.setFillColor(...BRAND_RED);
  doc.rect(margin, y + 2, 2.5, boxH - 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_BLACK);
  doc.text('Filtros aplicados', margin + 8, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  let ly = y + 12;
  for (const line of wrapped) {
    doc.text(line, margin + 6, ly);
    ly += 4.2;
  }

  doc.setTextColor(...TEXT_BLACK);
  return y + boxH + 8;
}

function buildColumns(contentW: number): PdfColumn[] {
  const fixed = [
    { key: 'mes', label: 'Mês', width: 16, align: 'left' as const },
    { key: 'ano', label: 'Ano', width: 12, align: 'left' as const },
    { key: 'fat', label: 'Faturamento', width: 24, align: 'right' as const },
    { key: 'liq', label: 'Líquido', width: 24, align: 'right' as const },
    { key: 'rec', label: 'Recebido', width: 24, align: 'right' as const },
    { key: 'gastos', label: 'Gastos', width: 24, align: 'right' as const },
    { key: 'lucro', label: 'Lucro líq.', width: 24, align: 'right' as const },
    { key: 'gfat', label: 'G/FAT %', width: 16, align: 'right' as const },
    { key: 'grec', label: 'G/REC %', width: 16, align: 'right' as const }
  ];

  const fixedWidth = fixed.reduce((sum, col) => sum + col.width, 0);
  const contractWidth = Math.max(48, contentW - fixedWidth);

  return [{ key: 'contract', label: 'Contrato', width: contractWidth, align: 'left' }, ...fixed];
}

function getColumnXs(margin: number, columns: PdfColumn[]): number[] {
  const xs: number[] = [];
  let x = margin;
  for (const col of columns) {
    xs.push(x);
    x += col.width;
  }
  return xs;
}

function drawSectionTitle(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  title: string,
  footnote?: string
): number {
  const titleH = 9;
  y = ensureSpace(doc, y, titleH + 4, margin);
  doc.setFillColor(...SECTION_TITLE_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(margin, y, contentW, titleH, 1.5, 1.5, 'FD');
  doc.setFillColor(...BRAND_RED);
  doc.rect(margin, y + 1.5, 2.5, titleH - 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_BLACK);
  doc.text(title, margin + 6, y + 6);
  if (footnote) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(footnote, margin + contentW - 4, y + 6, { align: 'right' });
  }
  return y + titleH + 3;
}

function drawTableHeader(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  columns: PdfColumn[],
  colX: number[]
): number {
  const headerH = 8;
  doc.setFillColor(...HEADER_TABLE_BG);
  doc.setDrawColor(...BORDER);
  doc.rect(margin, y, contentW, headerH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT_BLACK);

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const x = col.align === 'right' ? colX[i] + col.width - 2 : colX[i] + 2;
    doc.text(col.label, x, y + 5.5, col.align === 'right' ? { align: 'right' } : undefined);
  }

  return y + headerH;
}

function drawDataRow(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  columns: PdfColumn[],
  colX: number[],
  row: ControleGeralPdfContractRow,
  rowIndex: number
): number {
  const rowH = 7;

  if (rowIndex % 2 === 0) {
    doc.setFillColor(...ROW_ALT);
    doc.rect(margin, y, contentW, rowH, 'F');
  }
  doc.setDrawColor(...BORDER);
  doc.line(margin, y + rowH, margin + contentW, y + rowH);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);

  const values: Record<string, string> = {
    contract: truncateText(doc, row.contract, columns[0].width - 4),
    mes: row.mesesLabel,
    ano: row.anoLabel,
    fat: formatCurrencyCell(row.faturamento),
    liq: formatCurrencyCell(row.liquido),
    rec: formatCurrencyCell(row.recebido),
    gastos: formatCurrencyCell(row.gastos),
    lucro: formatCurrencyCell(row.lucroLiquido),
    gfat: row.gastoFatPercent,
    grec: row.gastoRecPercent
  };

  const colors: Record<string, [number, number, number]> = {
    contract: TEXT_BLACK,
    mes: TEXT_MUTED,
    ano: TEXT_MUTED,
    fat: TEXT_GREEN,
    liq: TEXT_BLUE,
    rec: TEXT_SKY,
    gastos: TEXT_RED,
    lucro: pdfLucroLiquidoColor(row.lucroLiquido),
    gfat: pdfGastoFaturamentoPercentColor(row.gastos, row.faturamento),
    grec: pdfGastoRecebidoPercentColor(row.gastos, row.recebido)
  };

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    doc.setTextColor(...colors[col.key]);
    const x = col.align === 'right' ? colX[i] + col.width - 2 : colX[i] + 2;
    doc.text(values[col.key] ?? '—', x, y + 5, col.align === 'right' ? { align: 'right' } : undefined);
  }

  return y + rowH;
}

function drawSummaryRow(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  columns: PdfColumn[],
  colX: number[],
  label: string,
  summary: ControleGeralPdfFinancialSummary,
  variant: 'locality' | 'grand'
): number {
  const rowH = 7;
  y = ensureSpace(doc, y, rowH + 2, margin);

  doc.setFillColor(...(variant === 'grand' ? GRAND_TOTAL_BG : TOTAL_ROW_BG));
  doc.rect(margin, y, contentW, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, margin + contentW, y);
  doc.line(margin, y + rowH, margin + contentW, y + rowH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT_BLACK);
  doc.text(truncateText(doc, label, columns[0].width - 4), colX[0] + 2, y + 5);

  const summaryValues: Record<string, { text: string; color: [number, number, number] }> = {
    mes: { text: '', color: TEXT_BLACK },
    ano: { text: '', color: TEXT_BLACK },
    fat: { text: formatCurrency(summary.faturamento), color: TEXT_GREEN },
    liq: { text: formatCurrency(summary.liquido), color: TEXT_BLUE },
    rec: { text: formatCurrency(summary.recebido), color: TEXT_SKY },
    gastos: { text: formatCurrency(summary.gastos), color: TEXT_RED },
    lucro: {
      text: formatCurrency(summary.lucroLiquido),
      color: pdfLucroLiquidoColor(summary.lucroLiquido)
    },
    gfat: {
      text: summary.gastoFatPercent,
      color: pdfGastoFaturamentoPercentColor(summary.gastos, summary.faturamento)
    },
    grec: {
      text: summary.gastoRecPercent,
      color: pdfGastoRecebidoPercentColor(summary.gastos, summary.recebido)
    }
  };

  for (let i = 1; i < columns.length; i++) {
    const col = columns[i];
    const item = summaryValues[col.key];
    if (!item?.text) continue;
    doc.setTextColor(...item.color);
    const x = col.align === 'right' ? colX[i] + col.width - 2 : colX[i] + 2;
    doc.text(item.text, x, y + 5, col.align === 'right' ? { align: 'right' } : undefined);
  }

  return y + rowH + (variant === 'grand' ? 8 : 5);
}

function drawLocalitySection(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  group: ControleGeralPdfLocalityGroup,
  columns: PdfColumn[],
  colX: number[]
): number {
  const footnote = `${group.contractCount} ${group.contractCount === 1 ? 'contrato' : 'contratos'}`;
  const pageBottom = () => getPageContentBottom(doc, margin);

  y = drawSectionTitle(doc, y, margin, contentW, group.localityLabel, footnote);
  y = drawTableHeader(doc, y, margin, contentW, columns, colX);

  for (let i = 0; i < group.rows.length; i++) {
    const isLastRow = i === group.rows.length - 1;
    const spaceNeeded = DATA_ROW_HEIGHT + (isLastRow ? LOCALITY_SUMMARY_BLOCK : 0);

    if (y + spaceNeeded > pageBottom()) {
      doc.addPage();
      y = margin;
      y = drawSectionTitle(doc, y, margin, contentW, `${group.localityLabel} (continuação)`);
      y = drawTableHeader(doc, y, margin, contentW, columns, colX);
    }

    y = drawDataRow(doc, y, margin, contentW, columns, colX, group.rows[i], i);
  }

  if (y + DATA_ROW_HEIGHT + 5 > pageBottom()) {
    doc.addPage();
    y = margin;
  }

  y = drawSummaryRow(
    doc,
    y,
    margin,
    contentW,
    columns,
    colX,
    `Total — ${group.localityLabel}`,
    group.summary,
    'locality'
  );

  return y;
}

function buildOverviewColumns(contentW: number): PdfColumn[] {
  const fixed = [
    { key: 'cc', label: 'Centro de Custo', width: 38, align: 'left' as const },
    { key: 'fatAc', label: 'Fat. acumulado', width: 28, align: 'right' as const },
    { key: 'fatAn', label: 'Fat. anual', width: 28, align: 'right' as const },
    { key: 'prod', label: 'Produção', width: 24, align: 'right' as const },
    { key: 'orc', label: 'Valor orçado', width: 26, align: 'right' as const },
    { key: 'pend', label: 'Pend. fat.', width: 26, align: 'right' as const }
  ];
  const fixedWidth = fixed.reduce((sum, col) => sum + col.width, 0);
  const contractWidth = Math.max(50, contentW - fixedWidth);
  return [{ key: 'contract', label: 'Contrato', width: contractWidth, align: 'left' }, ...fixed];
}

function formatOverviewContractLabel(name: string, number: string): string {
  const trimmedName = name.trim();
  const trimmedNumber = number.trim();
  if (trimmedName && trimmedNumber) return `${trimmedName} (nº ${trimmedNumber})`;
  return trimmedName || trimmedNumber || '—';
}

function drawOverviewDataRow(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  columns: PdfColumn[],
  colX: number[],
  row: ControleGeralPdfOverviewRow,
  rowIndex: number
): number {
  const rowH = 7;

  if (rowIndex % 2 === 0) {
    doc.setFillColor(...ROW_ALT);
    doc.rect(margin, y, contentW, rowH, 'F');
  }
  doc.setDrawColor(...BORDER);
  doc.line(margin, y + rowH, margin + contentW, y + rowH);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);

  const values: Record<string, string> = {
    contract: truncateText(doc, formatOverviewContractLabel(row.name, row.number), columns[0].width - 4),
    cc: truncateText(doc, row.costCenter || '—', columns[1].width - 4),
    fatAc: formatCurrency(row.faturamentoAcumulado),
    fatAn: row.faturamentoAnual == null ? '—' : formatCurrency(row.faturamentoAnual),
    prod: formatCurrency(row.totalProducaoSemanal),
    orc: formatCurrency(row.valorOrcado),
    pend: formatCurrency(row.pendenteFaturamento)
  };

  const colors: Record<string, [number, number, number]> = {
    contract: TEXT_BLACK,
    cc: TEXT_MUTED,
    fatAc: TEXT_GREEN,
    fatAn: TEXT_GREEN,
    prod: TEXT_BLACK,
    orc: TEXT_BLACK,
    pend: [180, 83, 9]
  };

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    doc.setTextColor(...colors[col.key]);
    const x = col.align === 'right' ? colX[i] + col.width - 2 : colX[i] + 2;
    doc.text(values[col.key] ?? '—', x, y + 5, col.align === 'right' ? { align: 'right' } : undefined);
  }

  return y + rowH;
}

function drawOverviewTotalsRow(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  columns: PdfColumn[],
  colX: number[],
  totals: ControleGeralPdfOverviewTotals
): number {
  const rowH = 7;
  y = ensureSpace(doc, y, rowH + 2, margin);

  doc.setFillColor(...TOTAL_ROW_BG);
  doc.rect(margin, y, contentW, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, margin + contentW, y);
  doc.line(margin, y + rowH, margin + contentW, y + rowH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT_BLACK);
  const label = `Total (${totals.contractCount} ${totals.contractCount === 1 ? 'contrato' : 'contratos'})`;
  doc.text(truncateText(doc, label, columns[0].width + columns[1].width - 4), colX[0] + 2, y + 5);

  const summaryValues: Record<string, { text: string; color: [number, number, number] }> = {
    fatAc: { text: formatCurrency(totals.faturamentoAcumulado), color: TEXT_GREEN },
    fatAn: {
      text: totals.faturamentoAnual == null ? '—' : formatCurrency(totals.faturamentoAnual),
      color: TEXT_GREEN
    },
    prod: { text: formatCurrency(totals.totalProducaoSemanal), color: TEXT_BLACK },
    orc: { text: formatCurrency(totals.valorOrcado), color: TEXT_BLACK },
    pend: { text: formatCurrency(totals.pendenteFaturamento), color: [180, 83, 9] }
  };

  for (let i = 2; i < columns.length; i++) {
    const col = columns[i];
    const entry = summaryValues[col.key];
    if (!entry) continue;
    doc.setTextColor(...entry.color);
    const x = colX[i] + col.width - 2;
    doc.text(entry.text, x, y + 5, { align: 'right' });
  }

  return y + rowH + 4;
}

function drawOverviewSection(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  section: ControleGeralPdfOverviewSection
): number {
  if (section.rows.length === 0) return y;

  const footnotes: string[] = [];
  if (section.filterYear != null) footnotes.push(`Ano: ${section.filterYear}`);
  if (section.searchTerm?.trim()) footnotes.push(`Busca: "${section.searchTerm.trim()}"`);
  const footnote = footnotes.length ? footnotes.join(' · ') : undefined;

  y = ensureSpace(doc, y, SECTION_TITLE_BLOCK + TABLE_HEADER_HEIGHT + DATA_ROW_HEIGHT + 16, margin);
  y += 6;
  y = drawSectionTitle(
    doc,
    y,
    margin,
    contentW,
    'Controle geral — faturamento e produção',
    footnote
  );

  const columns = buildOverviewColumns(contentW);
  const colX = getColumnXs(margin, columns);
  y = drawTableHeader(doc, y, margin, contentW, columns, colX);

  for (let i = 0; i < section.rows.length; i++) {
    if (y + DATA_ROW_HEIGHT > getPageContentBottom(doc, margin)) {
      doc.addPage();
      y = margin;
      y = drawSectionTitle(doc, y, margin, contentW, 'Controle geral (continuação)');
      y = drawTableHeader(doc, y, margin, contentW, columns, colX);
    }
    y = drawOverviewDataRow(doc, y, margin, contentW, columns, colX, section.rows[i], i);
  }

  return drawOverviewTotalsRow(doc, y, margin, contentW, columns, colX, section.totals);
}

function drawFooter(doc: jsPDF, margin: number) {
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`${COMPANY.name} — Controle Geral de Contratos`, margin, pageH - 6);
    doc.text(`Página ${p} de ${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
  }
}

export async function exportControleGeralContratosPdf(
  input: ExportControleGeralContratosPdfInput
): Promise<void> {
  const generatedAt = input.generatedAt ?? new Date();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const contentW = pageWidth - margin * 2;

  // Logo pelo usuário (centro de custo UNB/Predial), não pelos contratos da planilha.
  // Admin e demais usuários veem Gennesis; Predial só quem tem só UNB no cadastro.
  const logo = await loadCompanyLogo();
  let y = drawPageHeader(doc, margin, pageWidth, logo, generatedAt, input.sheetUpdatedAt);
  y = drawFilterBox(doc, y, margin, contentW, input.filterLines);

  const columns = buildColumns(contentW);
  const colX = getColumnXs(margin, columns);

  for (const group of input.groups) {
    y = ensureLocalityFitsOnPage(doc, y, margin, group);
    y = drawLocalitySection(doc, y, margin, contentW, group, columns, colX);
  }

  if (input.groups.length > 0) {
    if (y + GRAND_SUMMARY_BLOCK > getPageContentBottom(doc, margin)) {
      doc.addPage();
      y = margin;
    }
    y = drawSummaryRow(
      doc,
      y,
      margin,
      contentW,
      columns,
      colX,
      `Total geral — todas as localidades (${input.contractCount} contratos)`,
      input.grandSummary,
      'grand'
    );
  }

  if (input.overviewSection) {
    y = drawOverviewSection(doc, y, margin, contentW, input.overviewSection);
  }

  drawFooter(doc, margin);

  const datePart = generatedAt.toISOString().slice(0, 10);
  doc.save(`controle-geral-contratos_${datePart}.pdf`);
}

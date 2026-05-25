import jsPDF from 'jspdf';

export type ExtratoCaixaResumoRow = {
  key: string;
  label: string;
  totalEntrada: number;
  totalSaida: number;
  totalValor: number;
};

export type ExtratoCaixaPdfSection = {
  title: string;
  rowLabelHeader: string;
  rows: ExtratoCaixaResumoRow[];
  totalRowLabel?: string;
  footnote?: string;
  /** Mantém a ordem recebida (ex.: top entradas + top saídas). */
  preserveRowOrder?: boolean;
};

export type ExtratoCaixaPdfStats = {
  totalEntrada: number;
  totalSaida: number;
  saldoLiquido: number;
  qtdEntrada: number;
  qtdSaida: number;
};

export type ExtratoCaixaPdfAjusteRow = {
  data: string;
  centroCusto: string;
  natureza: string;
  polo: string;
  observacao: string;
  valor: number;
};

export type ExportExtratoCaixaPdfInput = {
  title?: string;
  subtitle?: string;
  generatedAt?: Date;
  stats: ExtratoCaixaPdfStats;
  movimentacoesFiltradas: number;
  filterLines: string[];
  /** Ajustes manuais do recorte (período/busca), exibidos antes dos resumos. */
  ajustesManuais?: ExtratoCaixaPdfAjusteRow[];
  sections: ExtratoCaixaPdfSection[];
};

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_PAGE_BG: [number, number, number] = [180, 185, 192];
const HEADER_TABLE_BG: [number, number, number] = [209, 213, 219];
const SECTION_TITLE_BG: [number, number, number] = [248, 249, 250];
const ROW_ALT: [number, number, number] = [252, 252, 253];
const BORDER: [number, number, number] = [209, 213, 219];
const TOTAL_ROW_BG: [number, number, number] = [241, 245, 249];
const TEXT_GREEN: [number, number, number] = [22, 101, 52];
const TEXT_RED: [number, number, number] = [185, 28, 28];
const TEXT_BLACK: [number, number, number] = [0, 0, 0];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];

const COMPANY = {
  name: 'Gennesis Engenharia e Consultoria LTDA',
  subtitle: 'Engenharia e Consultoria'
};

export const EXTRATO_RESUMO_TOP_SAIDA = 20;

/** @deprecated Use EXTRATO_RESUMO_TOP_SAIDA */
export const EXTRATO_RESUMO_TOP_PADRAO = EXTRATO_RESUMO_TOP_SAIDA;

export function sortResumoRowsBySaidaDesc(rows: ExtratoCaixaResumoRow[]): ExtratoCaixaResumoRow[] {
  return [...rows].sort((a, b) => Math.abs(b.totalSaida) - Math.abs(a.totalSaida));
}

export function resumoRowSaidaMagnitude(row: ExtratoCaixaResumoRow): number {
  return Math.abs(row.totalSaida);
}

export function getTopSaidaKeys(
  allRows: ExtratoCaixaResumoRow[],
  topLimit = EXTRATO_RESUMO_TOP_SAIDA
): string[] {
  return sortResumoRowsBySaidaDesc(allRows)
    .filter((row) => resumoRowSaidaMagnitude(row) > 0)
    .slice(0, topLimit)
    .map((row) => row.key);
}

export function pickTopSaidaRows(
  allRows: ExtratoCaixaResumoRow[],
  topLimit = EXTRATO_RESUMO_TOP_SAIDA
): ExtratoCaixaResumoRow[] {
  const byKey = new Map(allRows.map((row) => [row.key, row]));
  return getTopSaidaKeys(allRows, topLimit)
    .map((key) => byKey.get(key))
    .filter((row): row is ExtratoCaixaResumoRow => row != null);
}

export function pickResumoRowsForPdf(
  allRows: ExtratoCaixaResumoRow[],
  includeAll: boolean,
  topLimit = EXTRATO_RESUMO_TOP_SAIDA
): ExtratoCaixaResumoRow[] {
  if (includeAll) return sortResumoRowsBySaidaDesc(allRows);
  return pickTopSaidaRows(allRows, topLimit);
}

function setTextColorByValue(doc: jsPDF, value: number): void {
  if (value > 0) doc.setTextColor(...TEXT_GREEN);
  else if (value < 0) doc.setTextColor(...TEXT_RED);
  else doc.setTextColor(...TEXT_BLACK);
}

function drawSectionTitleBar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  footnote?: string
): void {
  doc.setFillColor(...SECTION_TITLE_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(x, y, width, height, 1.5, 1.5, 'FD');
  doc.setFillColor(...BRAND_RED);
  doc.rect(x, y + 1.5, 2.5, height - 3, 'F');
  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(title, x + 6, y + height / 2 + 1.2);
  if (footnote) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(footnote, x + width - 4, y + height / 2 + 1.2, { align: 'right' });
  }
}

function drawTableHeaderRow(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  columns: { label: string; x: number; align?: 'left' | 'right' }[]
): void {
  doc.setFillColor(...HEADER_TABLE_BG);
  doc.setDrawColor(...BORDER);
  doc.rect(x, y, width, height, 'FD');
  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  for (const col of columns) {
    if (col.align === 'right') {
      doc.text(col.label, col.x, y + 5.5, { align: 'right' });
    } else {
      doc.text(col.label, col.x, y + 5.5);
    }
  }
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyCell(value: number): string {
  if (value === 0) return '—';
  return formatCurrency(value);
}

function computeSectionTotals(rows: ExtratoCaixaResumoRow[]) {
  let totalEntrada = 0;
  let totalSaida = 0;
  let totalValor = 0;
  for (const row of rows) {
    totalEntrada += row.totalEntrada;
    totalSaida += row.totalSaida;
    totalValor += row.totalValor;
  }
  return { totalEntrada, totalSaida, totalValor };
}

async function loadCompanyLogo(): Promise<{
  dataUrl: string;
  wMm: number;
  hMm: number;
} | null> {
  const candidates = ['/logopv.png', '/logo.png', '/logobranca.png'];
  for (const src of candidates) {
    const loaded = await tryLoadImage(src);
    if (loaded) return loaded;
  }
  return null;
}

function tryLoadImage(src: string): Promise<{
  dataUrl: string;
  wMm: number;
  hMm: number;
} | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        const dataUrl = c.toDataURL('image/png');
        const maxW = 36;
        const maxH = 22;
        const mmPerPx = 25.4 / 96;
        const iw = img.naturalWidth * mmPerPx;
        const ih = img.naturalHeight * mmPerPx;
        const s = Math.min(maxW / iw, maxH / ih, 1);
        resolve({ dataUrl, wMm: iw * s, hMm: ih * s });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    const url = src.startsWith('http')
      ? src
      : `${window.location.origin}${src.startsWith('/') ? src : `/${src}`}`;
    img.src = url;
  });
}

function ensureSpace(doc: jsPDF, y: number, need: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - margin) {
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

function drawPageHeader(
  doc: jsPDF,
  margin: number,
  pageWidth: number,
  logo: { dataUrl: string; wMm: number; hMm: number } | null,
  title: string,
  generatedAt: Date,
  incluiAjustesManuais: boolean
): number {
  const headerH = 36;
  doc.setFillColor(...HEADER_PAGE_BG);
  doc.rect(0, 0, pageWidth, headerH, 'F');
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, headerH - 1.2, pageWidth, 1.2, 'F');

  let textX = margin;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', margin, 7, logo.wMm, logo.hMm);
    textX = margin + logo.wMm + 6;
  }

  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, textX, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(COMPANY.name, textX, 23);

  const dateStr = generatedAt.toLocaleDateString('pt-BR');
  const timeStr = generatedAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.setFontSize(8);
  doc.text(`Gerado em ${dateStr} às ${timeStr}`, pageWidth - margin, 15, { align: 'right' });
  doc.text(
    incluiAjustesManuais
      ? 'Consolidado e ajustes manuais do recorte filtrado'
      : 'Consolidado — movimentações detalhadas não incluídas',
    pageWidth - margin,
    22,
    { align: 'right' }
  );

  doc.setTextColor(...TEXT_BLACK);
  return headerH + 8;
}

function drawStatsCards(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  stats: ExtratoCaixaPdfStats,
  movimentacoesFiltradas: number
): number {
  y = ensureSpace(doc, y, 28, margin);
  const gap = 4;
  const cardW = (contentW - gap * 2) / 3;
  const cardH = 22;
  const labels = ['Saídas', 'Entradas', 'Saldo líquido'];
  const values = [
    formatCurrency(stats.totalSaida),
    formatCurrency(stats.totalEntrada),
    formatCurrency(stats.saldoLiquido)
  ];
  const subs = [
    `${stats.qtdSaida} mov.`,
    `${stats.qtdEntrada} mov.`,
    `${movimentacoesFiltradas} no período filtrado`
  ];

  for (let i = 0; i < 3; i++) {
    const x = margin + i * (cardW + gap);
    const accent =
      i === 0 ? TEXT_RED : i === 1 ? TEXT_GREEN : stats.saldoLiquido >= 0 ? TEXT_GREEN : TEXT_RED;

    doc.setDrawColor(...BORDER);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, 'FD');
    doc.setFillColor(...accent);
    doc.roundedRect(x, y + 2, 2.5, cardH - 4, 1, 1, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(labels[i], x + 6, y + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    if (i === 0) {
      doc.setTextColor(...TEXT_RED);
    } else if (i === 1) {
      doc.setTextColor(...TEXT_GREEN);
    } else if (stats.saldoLiquido > 0) {
      doc.setTextColor(...TEXT_GREEN);
    } else if (stats.saldoLiquido < 0) {
      doc.setTextColor(...TEXT_RED);
    } else {
      doc.setTextColor(...TEXT_BLACK);
    }
    doc.text(values[i], x + 6, y + 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(subs[i], x + 6, y + 20);
  }

  doc.setTextColor(...TEXT_BLACK);
  return y + cardH + 8;
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
      : ['Nenhum filtro restritivo aplicado (todos os registros visíveis).'];
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

  doc.setTextColor(0, 0, 0);
  return y + boxH + 8;
}

function drawResumoSection(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  section: ExtratoCaixaPdfSection
): number {
  const rowH = 7;
  const headerH = 8;
  const titleH = 10;
  const sortedRows = section.preserveRowOrder
    ? [...section.rows]
    : [...section.rows].sort((a, b) => b.totalValor - a.totalValor);
  const totais = computeSectionTotals(sortedRows);
  const totalLabel = section.totalRowLabel ?? 'Total';

  y = ensureSpace(doc, y, titleH + headerH + rowH * Math.min(sortedRows.length, 3) + 20, margin);

  drawSectionTitleBar(doc, margin, y, contentW, titleH, section.title, section.footnote);
  y += titleH + 3;

  const colLabel = contentW * 0.42;
  const colVal = (contentW - colLabel) / 3;
  const colX = [margin, margin + colLabel, margin + colLabel + colVal, margin + colLabel + colVal * 2];

  const drawTableHeader = () => {
    drawTableHeaderRow(doc, margin, y, contentW, headerH, [
      { label: section.rowLabelHeader, x: colX[0] + 3 },
      { label: 'Saída', x: colX[1] + colVal - 3, align: 'right' },
      { label: 'Entrada', x: colX[2] + colVal - 3, align: 'right' },
      { label: 'Valor', x: colX[3] + colVal - 3, align: 'right' }
    ]);
    y += headerH;
  };

  drawTableHeader();

  if (sortedRows.length === 0) {
    y = ensureSpace(doc, y, rowH + 4, margin);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Nenhum registro neste resumo com os filtros atuais.', margin + 3, y + 5);
    doc.setTextColor(...TEXT_BLACK);
    return y + rowH + 6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  for (let i = 0; i < sortedRows.length; i++) {
    if (y + rowH > doc.internal.pageSize.getHeight() - margin - 14) {
      doc.addPage();
      y = margin;
      drawSectionTitleBar(doc, margin, y, contentW, titleH, `${section.title} (continuação)`);
      y += titleH + 3;
      drawTableHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
    }

    if (i % 2 === 0) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(margin, y, contentW, rowH, 'F');
    }
    doc.setDrawColor(...BORDER);
    doc.line(margin, y + rowH, margin + contentW, y + rowH);

    const row = sortedRows[i];
    const label = truncateText(doc, row.label, colLabel - 6);
    doc.setTextColor(...TEXT_BLACK);
    doc.text(label, colX[0] + 3, y + 5);
    setTextColorByValue(doc, row.totalSaida);
    doc.text(formatCurrencyCell(row.totalSaida), colX[1] + colVal - 3, y + 5, { align: 'right' });
    setTextColorByValue(doc, row.totalEntrada);
    doc.text(formatCurrencyCell(row.totalEntrada), colX[2] + colVal - 3, y + 5, { align: 'right' });
    setTextColorByValue(doc, row.totalValor);
    doc.text(formatCurrencyCell(row.totalValor), colX[3] + colVal - 3, y + 5, { align: 'right' });
    y += rowH;
  }

  y = ensureSpace(doc, y, rowH + 4, margin);
  doc.setFillColor(...TOTAL_ROW_BG);
  doc.rect(margin, y, contentW, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, margin + contentW, y);
  doc.line(margin, y + rowH, margin + contentW, y + rowH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_BLACK);
  doc.text(totalLabel, colX[0] + 3, y + 5);
  setTextColorByValue(doc, totais.totalSaida);
  doc.text(formatCurrency(totais.totalSaida), colX[1] + colVal - 3, y + 5, { align: 'right' });
  setTextColorByValue(doc, totais.totalEntrada);
  doc.text(formatCurrency(totais.totalEntrada), colX[2] + colVal - 3, y + 5, { align: 'right' });
  setTextColorByValue(doc, totais.totalValor);
  doc.text(formatCurrency(totais.totalValor), colX[3] + colVal - 3, y + 5, { align: 'right' });
  y += rowH + 10;

  return y;
}

const AJUSTE_ROW_FILL: [number, number, number] = [255, 251, 235];

function drawAjustesManuaisSection(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  rows: ExtratoCaixaPdfAjusteRow[]
): number {
  if (rows.length === 0) return y;

  const rowH = 7;
  const headerH = 8;
  const titleH = 10;

  const colData = 18;
  const colValor = 26;
  const colPolo = 14;
  const colNatureza = 32;
  const colCc = 48;
  const colObservacao = contentW - colData - colCc - colNatureza - colPolo - colValor;

  const colX = [
    margin,
    margin + colData,
    margin + colData + colCc,
    margin + colData + colCc + colNatureza,
    margin + colData + colCc + colNatureza + colPolo,
    margin + colData + colCc + colNatureza + colPolo + colObservacao
  ];

  y = ensureSpace(doc, y, titleH + headerH + rowH * Math.min(rows.length, 3) + 20, margin);

  drawSectionTitleBar(doc, margin, y, contentW, titleH, 'Ajustes manuais', 'Somados ao extrato do TOTVS');
  y += titleH + 3;

  const drawTableHeader = () => {
    drawTableHeaderRow(doc, margin, y, contentW, headerH, [
      { label: 'Data', x: colX[0] + 2 },
      { label: 'Centro de custo', x: colX[1] + 2 },
      { label: 'Natureza', x: colX[2] + 2 },
      { label: 'Polo', x: colX[3] + 2 },
      { label: 'Observação', x: colX[4] + 2 },
      { label: 'Valor', x: colX[5] + colValor - 2, align: 'right' }
    ]);
    y += headerH;
  };

  drawTableHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);

  let totalValor = 0;

  for (let i = 0; i < rows.length; i++) {
    if (y + rowH > doc.internal.pageSize.getHeight() - margin - 14) {
      doc.addPage();
      y = margin;
      drawSectionTitleBar(doc, margin, y, contentW, titleH, 'Ajustes manuais (continuação)');
      y += titleH + 3;
      drawTableHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
    }

    doc.setFillColor(...AJUSTE_ROW_FILL);
    doc.rect(margin, y, contentW, rowH, 'F');
    doc.setDrawColor(...BORDER);
    doc.line(margin, y + rowH, margin + contentW, y + rowH);

    const row = rows[i];
    totalValor += row.valor;

    doc.setTextColor(31, 41, 55);
    doc.text(row.data, colX[0] + 2, y + 5);
    doc.text(truncateText(doc, row.centroCusto, colCc - 4), colX[1] + 2, y + 5);
    doc.text(truncateText(doc, row.natureza, colNatureza - 4), colX[2] + 2, y + 5);
    doc.text(truncateText(doc, row.polo, colPolo - 4), colX[3] + 2, y + 5);
    doc.text(truncateText(doc, row.observacao, colObservacao - 4), colX[4] + 2, y + 5);

    if (row.valor < 0) doc.setTextColor(185, 28, 28);
    else if (row.valor > 0) doc.setTextColor(22, 101, 52);
    doc.text(formatCurrency(row.valor), colX[5] + colValor - 2, y + 5, { align: 'right' });
    doc.setTextColor(31, 41, 55);

    y += rowH;
  }

  y = ensureSpace(doc, y, rowH + 4, margin);
  doc.setFillColor(...TOTAL_ROW_BG);
  doc.rect(margin, y, contentW, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, margin + contentW, y);
  doc.line(margin, y + rowH, margin + contentW, y + rowH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT_BLACK);
  doc.text('Total dos ajustes', colX[0] + 2, y + 5);
  setTextColorByValue(doc, totalValor);
  doc.text(formatCurrency(totalValor), colX[5] + colValor - 2, y + 5, { align: 'right' });
  y += rowH + 10;

  return y;
}

function drawFooter(doc: jsPDF, margin: number) {
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...BORDER);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`${COMPANY.name} — Extrato de Caixa`, margin, pageH - 8);
    doc.text(`Página ${p} de ${pageCount}`, pageW - margin, pageH - 8, { align: 'right' });
  }
}

export async function exportExtratoCaixaPdf(input: ExportExtratoCaixaPdfInput): Promise<void> {
  const logo = await loadCompanyLogo();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentW = pageWidth - margin * 2;
  const generatedAt = input.generatedAt ?? new Date();
  const title = input.title ?? 'Extrato de Caixa';
  const ajustesRows = input.ajustesManuais ?? [];

  let y = drawPageHeader(
    doc,
    margin,
    pageWidth,
    logo,
    title,
    generatedAt,
    ajustesRows.length > 0
  );

  if (input.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    doc.text(input.subtitle, margin, y);
    y += 6;
  }

  y = drawFilterBox(doc, y, margin, contentW, input.filterLines);
  y = drawStatsCards(doc, y, margin, contentW, input.stats, input.movimentacoesFiltradas);
  y = drawAjustesManuaisSection(doc, y, margin, contentW, ajustesRows);

  for (const section of input.sections) {
    if (section.rows.length === 0) continue;
    y = drawResumoSection(doc, y, margin, contentW, section);
  }

  drawFooter(doc, margin);

  const datePart = generatedAt.toISOString().slice(0, 10);
  doc.save(`extrato-caixa-resumos_${datePart}.pdf`);
}

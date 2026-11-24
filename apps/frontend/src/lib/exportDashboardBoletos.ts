import jsPDF from 'jspdf';
import ExcelJS from 'exceljs';
import {
  EXPORT_COMPANY,
  loadExcelDualLogoStrip,
  loadPdfGennesisLogoStrip,
} from '@/lib/exportBrandingLogos';

/**
 * Relatório do Dashboard de Boletos (PDF com gráficos + tabelas; Excel com resumo, tabelas e lista).
 * Só logo Gennesis (nunca ENG PAC).
 */
export type DashReportKpi = { label: string; value: string; detail?: string };
export type DashReportTable = {
  title: string;
  /** Nome curto da aba no Excel (até 31 caracteres). */
  sheet: string;
  headers: string[];
  /** Colunas numéricas (valores/quantidades): alinhadas à direita. */
  numeric: boolean[];
  rows: (string | number)[][];
  /** Linha de total (opcional), mesmo formato de rows. */
  total?: (string | number)[];
};
export type DashReportChart = { title: string; dataUrl: string; widthPx: number; heightPx: number };

export type DashReport = {
  title: string;
  filtros: string[];
  kpis: DashReportKpi[];
  charts: DashReportChart[];
  tables: DashReportTable[];
  /** Lista detalhada de boletos (só no Excel). */
  boletos?: DashReportTable;
  fileBase: string;
};

const RED: [number, number, number] = [185, 28, 28];
const GRAY_TXT: [number, number, number] = [75, 85, 99];
const DARK: [number, number, number] = [17, 24, 39];
const BORDER: [number, number, number] = [229, 231, 235];
const ZEBRA: [number, number, number] = [249, 250, 251];
const M = 12;

const brlNum = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cellText = (v: string | number, numeric: boolean) =>
  typeof v === 'number' ? (numeric && !Number.isInteger(v) ? brlNum(v) : v.toLocaleString('pt-BR')) : v;

function geradoEm(): string {
  return new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// ---------------------------------------------------------------- PDF

export async function exportDashboardBoletosPdf(report: DashReport): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const usable = W - M * 2;
  const bottom = H - 12;
  const logo = await loadPdfGennesisLogoStrip(14);

  let y = M;
  // Cabeçalho
  if (logo) doc.addImage(logo.dataUrl, 'PNG', M, y, logo.wMm, logo.hMm);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_TXT);
  doc.text(`Gerado em ${geradoEm()}`, W - M, y + 4, { align: 'right' });
  y += (logo?.hMm ?? 10) + 3;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.9);
  doc.line(M, y, W - M, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...DARK);
  doc.text(report.title, M, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TXT);
  const filtrosTxt = report.filtros.length ? `Filtros: ${report.filtros.join(' · ')}` : 'Filtros: nenhum (todos os boletos)';
  const filtrosLinhas = doc.splitTextToSize(filtrosTxt, usable) as string[];
  doc.text(filtrosLinhas, M, y);
  y += filtrosLinhas.length * 4 + 3;

  // Cards
  const porLinha = 4;
  const gap = 3;
  const cw = (usable - gap * (porLinha - 1)) / porLinha;
  const ch = 17;
  report.kpis.forEach((k, i) => {
    const col = i % porLinha;
    if (col === 0 && i > 0) y += ch + gap;
    const x = M + col * (cw + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.rect(x, y, cw, ch, 'FD');
    doc.setFillColor(...RED);
    doc.rect(x, y, cw, 0.9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_TXT);
    doc.text(k.label.toUpperCase(), x + 3, y + 5);
    doc.setFontSize(11.5);
    doc.setTextColor(...DARK);
    doc.text(k.value, x + 3, y + 11);
    if (k.detail) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_TXT);
      doc.text(k.detail, x + 3, y + 15);
    }
  });
  y += ch + 7;

  const novaPagina = () => {
    doc.addPage();
    y = M;
  };

  const titulo = (t: string) => {
    if (y + 12 > bottom) novaPagina();
    doc.setFillColor(...RED);
    doc.rect(M, y - 3.6, 1.2, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text(t, M + 3, y);
    y += 4;
  };

  // Gráficos: dois por linha quando couberem (largos ocupam a linha toda).
  let i = 0;
  while (i < report.charts.length) {
    const c = report.charts[i];
    const largo = c.widthPx / c.heightPx > 2.6;
    const par = !largo && i + 1 < report.charts.length && report.charts[i + 1].widthPx / report.charts[i + 1].heightPx <= 2.6;
    const itens = par ? [c, report.charts[i + 1]] : [c];
    const colW = par ? (usable - 6) / 2 : usable;
    const alturas = itens.map((it) => Math.min(colW * (it.heightPx / it.widthPx), bottom - M - 10));
    const hMax = Math.max(...alturas);
    if (y + hMax + 8 > bottom) novaPagina();
    itens.forEach((it, k) => {
      const x = M + k * (colW + 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      doc.text(it.title, x, y);
      const w = alturas[k] < colW * (it.heightPx / it.widthPx) ? alturas[k] * (it.widthPx / it.heightPx) : colW;
      doc.addImage(it.dataUrl, 'PNG', x, y + 2, w, alturas[k]);
    });
    y += hMax + 9;
    i += itens.length;
  }

  // Tabelas
  const desenharTabela = (t: DashReportTable) => {
    titulo(t.title);
    const n = t.headers.length;
    // Primeira coluna (rótulo) mais larga; numéricas dividem o resto.
    const firstW = n === 1 ? usable : Math.max(usable * 0.34, usable - (n - 1) * 32);
    const restW = n > 1 ? (usable - firstW) / (n - 1) : 0;
    const widths = t.headers.map((_, k) => (k === 0 ? firstW : restW));
    const rowH = 6;
    const header = () => {
      doc.setFillColor(...RED);
      doc.rect(M, y, usable, rowH, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      let x = M;
      t.headers.forEach((h, k) => {
        if (t.numeric[k]) doc.text(h, x + widths[k] - 2, y + 4.1, { align: 'right' });
        else doc.text(h, x + 2, y + 4.1);
        x += widths[k];
      });
      y += rowH;
    };
    header();
    const linhas = t.total ? [...t.rows, t.total] : t.rows;
    linhas.forEach((row, r) => {
      if (y + rowH > bottom) {
        novaPagina();
        header();
      }
      const ehTotal = !!t.total && r === linhas.length - 1;
      if (ehTotal) doc.setFillColor(243, 244, 246);
      else if (r % 2 === 1) doc.setFillColor(...ZEBRA);
      else doc.setFillColor(255, 255, 255);
      doc.rect(M, y, usable, rowH, 'F');
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.1);
      doc.line(M, y + rowH, M + usable, y + rowH);
      doc.setFont('helvetica', ehTotal ? 'bold' : 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...DARK);
      let x = M;
      row.forEach((v, k) => {
        const txt = String(cellText(v, t.numeric[k]));
        if (t.numeric[k]) doc.text(txt, x + widths[k] - 2, y + 4.1, { align: 'right' });
        else {
          const cortado = doc.splitTextToSize(txt, widths[k] - 4)[0] as string;
          doc.text(cortado, x + 2, y + 4.1);
        }
        x += widths[k];
      });
      y += rowH;
    });
    if (linhas.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_TXT);
      doc.text('Sem registros neste filtro.', M + 2, y + 4);
      y += rowH;
    }
    y += 7;
  };
  report.tables.forEach(desenharTabela);

  // Rodapé com paginação
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(EXPORT_COMPANY, M, H - 6);
    doc.text(`Página ${p} de ${total}`, W - M, H - 6, { align: 'right' });
  }
  doc.save(`${report.fileBase}.pdf`);
}

// ---------------------------------------------------------------- Excel

const XL_RED = 'FFB91C1C';
const XL_BORDER = 'FFE5E7EB';

function borda(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: XL_BORDER } },
    left: { style: 'thin', color: { argb: XL_BORDER } },
    bottom: { style: 'thin', color: { argb: XL_BORDER } },
    right: { style: 'thin', color: { argb: XL_BORDER } },
  };
}

async function cabecalhoAba(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  titulo: string,
  subtitulo: string,
  colCount: number,
  logo: Awaited<ReturnType<typeof loadExcelDualLogoStrip>>
): Promise<number> {
  const startCol = Math.min(3, Math.max(1, colCount));
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 18;
  if (colCount >= startCol) {
    ws.mergeCells(1, startCol, 1, Math.max(startCol, colCount));
    ws.mergeCells(2, startCol, 2, Math.max(startCol, colCount));
  }
  const t = ws.getCell(1, startCol);
  t.value = titulo;
  t.font = { bold: true, size: 14, color: { argb: 'FF111827' } };
  const s = ws.getCell(2, startCol);
  s.value = subtitulo;
  s.font = { size: 9, color: { argb: 'FF4B5563' } };
  if (logo) {
    const id = wb.addImage({ base64: logo.base64, extension: logo.extension });
    ws.addImage(id, { tl: { col: 0.1, row: 0.2 }, ext: { width: logo.widthPx, height: logo.heightPx }, editAs: 'absolute' });
  }
  for (let c = 1; c <= Math.max(colCount, 1); c++) {
    ws.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_RED } };
  }
  ws.getRow(4).height = 4;
  return 6;
}

function escreverTabela(ws: ExcelJS.Worksheet, startRow: number, t: DashReportTable): number {
  let r = startRow;
  const head = ws.getRow(r);
  t.headers.forEach((h, k) => {
    const c = head.getCell(k + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_RED } };
    c.alignment = { horizontal: t.numeric[k] ? 'right' : 'left', vertical: 'middle' };
    borda(c);
  });
  head.height = 20;
  r += 1;
  const linhas = t.total ? [...t.rows, t.total] : t.rows;
  linhas.forEach((row, i) => {
    const ehTotal = !!t.total && i === linhas.length - 1;
    const xr = ws.getRow(r);
    row.forEach((v, k) => {
      const c = xr.getCell(k + 1);
      c.value = v;
      if (typeof v === 'number' && t.numeric[k]) c.numFmt = Number.isInteger(v) && !/valor|pago|vencer|vencido|total|%/i.test(t.headers[k]) ? '#,##0' : '#,##0.00';
      c.alignment = { horizontal: t.numeric[k] ? 'right' : 'left' };
      if (ehTotal) {
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      } else if (i % 2 === 1) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
      borda(c);
    });
    r += 1;
  });
  return r;
}

export async function exportDashboardBoletosExcel(report: DashReport): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = EXPORT_COMPANY;
  wb.created = new Date();
  const logo = await loadExcelDualLogoStrip();
  const sub = `${report.filtros.length ? `Filtros: ${report.filtros.join(' · ')}` : 'Filtros: nenhum (todos os boletos)'} · Gerado em ${geradoEm()}`;

  // Resumo
  const resumo = wb.addWorksheet('Resumo', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  resumo.getColumn(1).width = 34;
  resumo.getColumn(2).width = 22;
  resumo.getColumn(3).width = 18;
  let r = await cabecalhoAba(wb, resumo, report.title, sub, 3, logo);
  r = escreverTabela(resumo, r, {
    title: 'Indicadores',
    sheet: 'Resumo',
    headers: ['Indicador', 'Valor', 'Detalhe'],
    numeric: [false, true, false],
    rows: report.kpis.map((k) => [k.label, k.value, k.detail ?? '']),
  });

  const abas = [...report.tables, ...(report.boletos ? [report.boletos] : [])];
  const usados = new Set<string>(['Resumo']);
  for (const t of abas) {
    let nome = t.sheet.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Tabela';
    let n = 2;
    while (usados.has(nome)) nome = `${nome.slice(0, 28)} ${n++}`;
    usados.add(nome);
    const ws = wb.addWorksheet(nome, {
      views: [{ state: 'frozen', ySplit: 6 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    t.headers.forEach((h, k) => {
      ws.getColumn(k + 1).width = k === 0 ? 42 : Math.max(14, h.length + 4);
    });
    const start = await cabecalhoAba(wb, ws, t.title, sub, t.headers.length, logo);
    escreverTabela(ws, start, t);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.fileBase}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

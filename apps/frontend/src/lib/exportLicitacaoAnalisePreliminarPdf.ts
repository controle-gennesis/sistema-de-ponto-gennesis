import jsPDF from 'jspdf';
import {
  analisePreliminarRows,
  type AnalisePreliminarData,
} from '@/app/ponto/licitacoes/licitacaoAnalisePreliminar';

export type ExportLicitacaoAnalisePreliminarPdfInput = {
  data: AnalisePreliminarData;
  titulo?: string;
  responsavelAnalise?: string;
  linkNotebookLm?: string;
  generatedAt?: Date;
};

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_BG: [number, number, number] = [248, 249, 250];
const BORDER: [number, number, number] = [209, 213, 219];
const TEXT_BLACK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];

const COMPANY = {
  name: 'Gennesis Engenharia e Consultoria LTDA',
};

const FOOTER_RESERVE = 14;
const MARGIN = 15;
const LABEL_COL_W = 48;

function getPageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - MARGIN - FOOTER_RESERVE;
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  if (y + need > getPageBottom(doc)) {
    doc.addPage();
    return MARGIN;
  }
  return y;
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
        const maxW = 32;
        const maxH = 20;
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

function drawPageHeader(
  doc: jsPDF,
  pageWidth: number,
  logo: { dataUrl: string; wMm: number; hMm: number } | null,
  generatedAt: Date,
  titulo: string
): number {
  const headerH = 28;
  doc.setFillColor(...HEADER_BG);
  doc.rect(0, 0, pageWidth, headerH, 'F');
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, headerH - 1, pageWidth, 1, 'F');

  let textX = MARGIN;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', MARGIN, 5, logo.wMm, logo.hMm);
    textX = MARGIN + logo.wMm + 5;
  }

  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Licitações — Análise Preliminar', textX, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(COMPANY.name, textX, 18);

  const dateStr = generatedAt.toLocaleDateString('pt-BR');
  const timeStr = generatedAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Gerado em ${dateStr} às ${timeStr}`, pageWidth - MARGIN, 12, { align: 'right' });

  let y = headerH + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const titleLines = doc.splitTextToSize(titulo, pageWidth - MARGIN * 2) as string[];
  for (const line of titleLines) {
    y = ensureSpace(doc, y, 6);
    doc.text(line, MARGIN, y);
    y += 5.5;
  }

  return y + 4;
}

function drawResponsavelBlock(
  doc: jsPDF,
  y: number,
  contentW: number,
  responsavelAnalise: string | undefined
): number {
  y = ensureSpace(doc, y, 16);
  doc.setDrawColor(...BORDER);
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(MARGIN, y, contentW, 14, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('RESPONSÁVEL PELA ANÁLISE', MARGIN + 4, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_BLACK);
  doc.text(responsavelAnalise?.trim() || '—', MARGIN + 4, y + 11);

  return y + 18;
}

function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`${COMPANY.name} — Licitações`, MARGIN, pageH - 6);
    doc.text(`Página ${p} de ${pageCount}`, pageW - MARGIN, pageH - 6, { align: 'right' });
  }
}

function slugifyFileName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase();
}

export async function exportLicitacaoAnalisePreliminarPdf(
  input: ExportLicitacaoAnalisePreliminarPdfInput
): Promise<void> {
  const data = input.data;
  const generatedAt = input.generatedAt ?? new Date();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentW = pageWidth - MARGIN * 2;
  const valueColW = contentW - LABEL_COL_W;

  const titulo =
    data.cabecalho.trim() ||
    input.titulo?.trim() ||
    'Análise preliminar';

  const logo = await loadCompanyLogo();
  let y = drawPageHeader(doc, pageWidth, logo, generatedAt, titulo);
  y = drawResponsavelBlock(doc, y, contentW, input.responsavelAnalise);

  const rows = [
    ...analisePreliminarRows(data),
    {
      label: 'NOTEBOOK LM',
      value: (input.linkNotebookLm ?? '').trim() || '—',
    },
  ];

  for (const row of rows) {
    const labelLines = doc.splitTextToSize(row.label, LABEL_COL_W - 4) as string[];
    const valueLines = doc.splitTextToSize(row.value || '—', valueColW - 4) as string[];
    const rowH = Math.max(8, Math.max(labelLines.length, valueLines.length) * 4.2 + 4);

    y = ensureSpace(doc, y, rowH + 0.5);

    doc.setDrawColor(...TEXT_BLACK);
    doc.setLineWidth(0.35);
    doc.rect(MARGIN, y, LABEL_COL_W, rowH);
    doc.rect(MARGIN + LABEL_COL_W, y, valueColW, rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_BLACK);
    let ly = y + 5;
    for (const line of labelLines) {
      doc.text(line, MARGIN + LABEL_COL_W - 2, ly, { align: 'right' });
      ly += 4.2;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    let vy = y + 5;
    for (const line of valueLines) {
      doc.text(line, MARGIN + LABEL_COL_W + 2, vy);
      vy += 4.2;
    }

    y += rowH;
  }

  drawFooter(doc);

  const stamp = generatedAt.toISOString().slice(0, 10);
  doc.save(`analise-preliminar_${slugifyFileName(titulo) || 'licitacao'}_${stamp}.pdf`);
}

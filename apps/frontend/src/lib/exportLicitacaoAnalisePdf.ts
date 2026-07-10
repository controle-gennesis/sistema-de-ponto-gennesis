import jsPDF from 'jspdf';

export type LicitacaoAnalisePdfChecklistItem = {
  label: string;
  checked: boolean;
  comentario: string;
};

export type LicitacaoAnalisePdfChecklistSection = {
  title: string;
  items: LicitacaoAnalisePdfChecklistItem[];
};

export type ExportLicitacaoAnalisePdfInput = {
  titulo: string;
  responsavelAnalise?: string;
  linkNotebookLm?: string;
  analiseUsuario?: string;
  sections: LicitacaoAnalisePdfChecklistSection[];
  generatedAt?: Date;
};

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_BG: [number, number, number] = [248, 249, 250];
const SECTION_BG: [number, number, number] = [241, 245, 249];
const BORDER: [number, number, number] = [209, 213, 219];
const TEXT_BLACK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];
const TEXT_GREEN: [number, number, number] = [22, 101, 52];

const COMPANY = {
  name: 'Gennesis Engenharia e Consultoria LTDA',
};

const FOOTER_RESERVE = 14;
const MARGIN = 15;

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
  doc.text('Licitações — Checklist da análise', textX, 12);

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
  const nome = responsavelAnalise?.trim() || '—';
  doc.text(nome, MARGIN + 4, y + 11);

  return y + 18;
}

function normalizeNotebookLmUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function drawNotebookLinkBlock(
  doc: jsPDF,
  y: number,
  contentW: number,
  linkNotebookLm: string | undefined
): number {
  const raw = linkNotebookLm?.trim() ?? '';
  const href = raw ? normalizeNotebookLmUrl(raw) : '';
  const displayLines = raw
    ? (doc.splitTextToSize(raw, contentW - 10) as string[])
    : ['—'];
  const blockH = Math.max(14, 10 + Math.max(0, displayLines.length - 1) * 4.5);

  y = ensureSpace(doc, y, blockH + 4);
  doc.setDrawColor(...BORDER);
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(MARGIN, y, contentW, blockH, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('CADERNO NO NOTEBOOK LM', MARGIN + 4, y + 5.5);

  let ly = y + 11;
  if (!href) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_BLACK);
    doc.text('—', MARGIN + 4, ly);
    return y + blockH + 4;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(37, 99, 235);
  for (const line of displayLines) {
    doc.textWithLink(line, MARGIN + 4, ly, { url: href });
    ly += 4.5;
  }

  return y + blockH + 4;
}

function drawMetaLines(
  doc: jsPDF,
  y: number,
  contentW: number,
  stats: { totalItens: number; totalMarcados: number; totalComentados: number }
): number {
  y = ensureSpace(doc, y, 12);
  doc.setDrawColor(...BORDER);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, y, contentW, 10, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_MUTED);

  const parts = [
    `${stats.totalItens} item(ns) no checklist`,
    `${stats.totalMarcados} marcado(s)`,
    `${stats.totalComentados} com comentário`,
  ];

  doc.text(parts.join('   ·   '), MARGIN + 4, y + 6.5);
  doc.setTextColor(...TEXT_BLACK);
  return y + 14;
}

function drawSectionTitle(doc: jsPDF, y: number, contentW: number, title: string): number {
  y = ensureSpace(doc, y, 10);
  doc.setFillColor(...SECTION_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(MARGIN, y, contentW, 8, 1.5, 1.5, 'FD');
  doc.setFillColor(...BRAND_RED);
  doc.rect(MARGIN, y + 1.5, 2, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_BLACK);
  doc.text(title, MARGIN + 5, y + 5.5);
  return y + 11;
}

function measureItemBlockHeight(
  doc: jsPDF,
  contentW: number,
  item: LicitacaoAnalisePdfChecklistItem
): number {
  const innerW = contentW - 10;
  const labelLines = doc.splitTextToSize(item.label, innerW - 14) as string[];
  let h = 8 + labelLines.length * 4.2;
  if (item.comentario.trim()) {
    const commentLines = doc.splitTextToSize(item.comentario.trim(), innerW - 8) as string[];
    h += 3 + commentLines.length * 4;
  } else {
    h += 5;
  }
  return h + 4;
}

function drawChecklistItem(
  doc: jsPDF,
  y: number,
  contentW: number,
  item: LicitacaoAnalisePdfChecklistItem
): number {
  const blockH = measureItemBlockHeight(doc, contentW, item);
  y = ensureSpace(doc, y, blockH);

  doc.setDrawColor(...BORDER);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, y, contentW, blockH - 2, 1.5, 1.5, 'FD');

  const mark = item.checked ? '[x]' : '[ ]';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...(item.checked ? TEXT_GREEN : TEXT_MUTED));
  doc.text(mark, MARGIN + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_BLACK);
  const labelLines = doc.splitTextToSize(item.label, contentW - 24) as string[];
  let ly = y + 6;
  for (const line of labelLines) {
    doc.text(line, MARGIN + 14, ly);
    ly += 4.2;
  }

  if (item.comentario.trim()) {
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    const commentLines = doc.splitTextToSize(item.comentario.trim(), contentW - 18) as string[];
    ly += 1;
    for (const line of commentLines) {
      doc.text(line, MARGIN + 10, ly);
      ly += 4;
    }
  } else {
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text('Sem comentário', MARGIN + 10, ly + 1);
  }

  return y + blockH + 2;
}

function drawAnaliseSection(
  doc: jsPDF,
  y: number,
  contentW: number,
  analiseUsuario: string | undefined
): number {
  y = ensureSpace(doc, y, 14);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('SUA ANÁLISE', MARGIN, y);
  y += 6;

  const text = analiseUsuario?.trim();
  if (!text) {
    y = ensureSpace(doc, y, 12);
    doc.setDrawColor(...BORDER);
    doc.setLineDashPattern([2, 2], 0);
    doc.roundedRect(MARGIN, y, contentW, 12, 2, 2, 'S');
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Nenhuma análise escrita ainda.', MARGIN + contentW / 2, y + 7, { align: 'center' });
    return y + 16;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(text, contentW - 10) as string[];
  const boxH = Math.max(14, lines.length * 4.8 + 8);
  y = ensureSpace(doc, y, boxH);

  doc.setDrawColor(...BORDER);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, y, contentW, boxH, 2, 2, 'FD');

  let ly = y + 6;
  doc.setTextColor(...TEXT_BLACK);
  for (const line of lines) {
    if (ly > y + boxH - 2) {
      doc.addPage();
      y = MARGIN;
      ly = MARGIN + 6;
      doc.setDrawColor(...BORDER);
      doc.roundedRect(MARGIN, y, contentW, getPageBottom(doc) - MARGIN - 6, 2, 2, 'S');
      ly = y + 6;
    }
    doc.text(line, MARGIN + 5, ly);
    ly += 4.8;
  }

  return Math.max(ly + 4, y + boxH + 4);
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

export async function exportLicitacaoAnalisePdf(input: ExportLicitacaoAnalisePdfInput): Promise<void> {
  const generatedAt = input.generatedAt ?? new Date();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentW = pageWidth - MARGIN * 2;

  const totalItens = input.sections.reduce((acc, s) => acc + s.items.length, 0);
  const totalMarcados = input.sections.reduce(
    (acc, s) => acc + s.items.filter((i) => i.checked).length,
    0
  );
  const totalComentados = input.sections.reduce(
    (acc, s) => acc + s.items.filter((i) => i.comentario.trim()).length,
    0
  );

  const logo = await loadCompanyLogo();
  let y = drawPageHeader(doc, pageWidth, logo, generatedAt, input.titulo);
  y = drawResponsavelBlock(doc, y, contentW, input.responsavelAnalise);
  y = drawNotebookLinkBlock(doc, y, contentW, input.linkNotebookLm);
  y = drawMetaLines(doc, y, contentW, {
    totalItens,
    totalMarcados,
    totalComentados,
  });

  y = drawSectionTitle(doc, y, contentW, 'Checklist — Análise de Viabilidade');
  y += 6;

  if (input.sections.length === 0) {
    y = ensureSpace(doc, y, 14);
    doc.setDrawColor(...BORDER);
    doc.setLineDashPattern([2, 2], 0);
    doc.roundedRect(MARGIN, y, contentW, 14, 2, 2, 'S');
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      'Nenhum item no checklist.',
      MARGIN + contentW / 2,
      y + 8,
      { align: 'center' }
    );
    y += 20;
  } else {
    for (const section of input.sections) {
      y = ensureSpace(doc, y, 10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXT_BLACK);
      doc.text(section.title, MARGIN, y);
      y += 5;

      for (const item of section.items) {
        y = drawChecklistItem(doc, y, contentW, item);
      }
      y += 3;
    }
  }

  drawAnaliseSection(doc, y, contentW, input.analiseUsuario);
  drawFooter(doc);

  const datePart = generatedAt.toISOString().slice(0, 10);
  const slug = slugifyFileName(input.titulo) || 'licitacao';
  doc.save(`licitacao-checklist_${slug}_${datePart}.pdf`);
}

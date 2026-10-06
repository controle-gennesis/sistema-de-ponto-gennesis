import jsPDF from 'jspdf';
import { loadPdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';

export type HabilitacaoPendentePdfItem = {
  descricao: string;
  quantidade: string;
  unidade: string;
  acaoSugerida: string;
  status: string;
};

export type ExportHabilitacoesPendentesPdfInput = {
  titulo: string;
  items: HabilitacaoPendentePdfItem[];
  generatedAt?: Date;
};

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_BG: [number, number, number] = [248, 249, 250];
const TABLE_HEAD: [number, number, number] = [31, 41, 55];
const ROW_ALT: [number, number, number] = [249, 250, 251];
const BORDER: [number, number, number] = [209, 213, 219];
const TEXT_BLACK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];
const TEXT_WHITE: [number, number, number] = [255, 255, 255];
const COMPANY = 'Gennesis Engenharia e Consultoria LTDA';
const MARGIN = 12;
const FOOTER_RESERVE = 12;

function pageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - MARGIN - FOOTER_RESERVE;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function drawFooters(doc: jsPDF, titulo: string, generatedAt: Date) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dateStr = generatedAt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN, pageHeight - MARGIN - 6, pageWidth - MARGIN, pageHeight - MARGIN - 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`${titulo} · ${dateStr}`, MARGIN, pageHeight - MARGIN - 2);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - MARGIN, pageHeight - MARGIN - 2, {
      align: 'right',
    });
  }
}

export async function exportHabilitacoesPendentesPdf(
  input: ExportHabilitacoesPendentesPdfInput
): Promise<void> {
  if (input.items.length === 0) {
    throw new Error('Não há habilitações para exportar neste quadro.');
  }

  const generatedAt = input.generatedAt ?? new Date();
  const logo = await loadPdfBrandingLogo({ maxW: 28, maxH: 14, userBrandingOnly: true });
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentW = pageWidth - MARGIN * 2;

  const columns = [
    { title: 'Descrição', width: contentW * 0.32 },
    { title: 'Quantidade', width: contentW * 0.12 },
    { title: 'Unidade', width: contentW * 0.1 },
    { title: 'Ação sugerida', width: contentW * 0.3 },
    { title: 'Status', width: contentW * 0.16 },
  ];

  const drawPageHeader = () => {
    const headerH = 22;
    doc.setFillColor(...HEADER_BG);
    doc.rect(0, 0, pageWidth, headerH, 'F');
    doc.setFillColor(...BRAND_RED);
    doc.rect(0, headerH - 1.2, pageWidth, 1.2, 'F');

    let textX = MARGIN;
    if (logo) {
      doc.addImage(logo.dataUrl, 'PNG', MARGIN, 4, logo.wMm, logo.hMm);
      textX = MARGIN + logo.wMm + 4;
    }

    doc.setTextColor(...TEXT_BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(input.titulo, textX, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(COMPANY, textX, 16);
    doc.text(
      generatedAt.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      pageWidth - MARGIN,
      10,
      { align: 'right' }
    );
    return headerH + 6;
  };

  const drawTableHead = (y: number) => {
    doc.setFillColor(...TABLE_HEAD);
    doc.rect(MARGIN, y, contentW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_WHITE);
    let x = MARGIN;
    for (const column of columns) {
      doc.text(column.title, x + 2, y + 5.2);
      x += column.width;
    }
    return y + 8;
  };

  let y = drawPageHeader();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    `${input.items.length} ${input.items.length === 1 ? 'registro' : 'registros'}`,
    MARGIN,
    y
  );
  y += 4;
  y = drawTableHead(y);

  input.items.forEach((item, index) => {
    const values = [
      item.descricao.trim() || '—',
      item.quantidade.trim() || '—',
      item.unidade.trim() || '—',
      item.acaoSugerida.trim() || '—',
      item.status.trim() || '—',
    ];
    const lineSets = values.map((value, colIndex) =>
      doc.splitTextToSize(value, columns[colIndex].width - 4) as string[]
    );
    const lineCount = Math.max(...lineSets.map((lines) => lines.length), 1);
    const rowH = Math.max(8, lineCount * 4 + 3);

    if (y + rowH > pageBottom(doc)) {
      doc.addPage();
      y = drawPageHeader();
      y = drawTableHead(y);
    }

    if (index % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(MARGIN, y, contentW, rowH, 'F');
    }
    doc.setDrawColor(...BORDER);
    doc.rect(MARGIN, y, contentW, rowH, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_BLACK);
    let x = MARGIN;
    lineSets.forEach((lines, colIndex) => {
      doc.text(lines, x + 2, y + 5);
      x += columns[colIndex].width;
    });
    y += rowH;
  });

  drawFooters(doc, input.titulo, generatedAt);
  const stamp = generatedAt.toISOString().slice(0, 10);
  doc.save(`habilitacoes-${slugify(input.titulo) || 'lista'}_${stamp}.pdf`);
}

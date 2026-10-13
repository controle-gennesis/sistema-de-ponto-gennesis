import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { EXPORT_COMPANY, loadPdfGennesisLogoStrip } from '@/lib/exportBrandingLogos';

export type FuelReportLine = { label: string; value: string };
export type FuelReportTable = { title: string; headers: string[]; rows: string[][] };

export type FuelAnalysesExport = {
  periodLabel: string;
  summary: FuelReportLine[];
  tables: FuelReportTable[];
};

const CARD_ACCENTS = ['#059669', '#0284c7', '#b45309', '#b91c1c', '#d97706', '#2563eb', '#4b5563'];

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fileSlug(periodLabel: string) {
  const slug = periodLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug ? `analise-abastecimento-${slug}` : 'analise-abastecimento';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao montar a imagem do relatório'));
    img.src = src;
  });
}

function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll('img'));
  if (!imgs.length) return Promise.resolve();
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }),
    ),
  );
}

function generatedLabel() {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function headerSection(report: FuelAnalysesExport, logoSrc: string | null, generatedAt: string) {
  const logo = logoSrc
    ? `<img src="${logoSrc}" alt="Gennesis" style="display:block;height:64px;width:auto;max-width:280px;" />`
    : `<div style="font-size:22px;font-weight:700;color:#111827;letter-spacing:0.6px;">GENNESIS</div><div style="font-size:11px;font-weight:700;color:#b91c1c;">ENGENHARIA E CONSULTORIA</div>`;
  const withValue = report.summary.find((line) => line.label === 'Concluídas com valor');
  return `<div data-section style="background:#ffffff;border-bottom:4px solid #b91c1c;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 16px 8px 20px;vertical-align:middle;">${logo}</td>
        <td style="width:170px;padding:16px 20px 8px 8px;vertical-align:middle;text-align:right;font-size:12px;line-height:1.5;color:#6b7280;">
          Gerado em<br/><span style="color:#111827;font-weight:700;">${esc(generatedAt)}</span><br/>${esc(withValue?.value || '0')} com valor
        </td>
      </tr>
    </table>
    <div style="padding:2px 20px 14px;">
      <div style="font-size:20px;line-height:1.2;font-weight:700;color:#111827;">Análises de abastecimento</div>
      <div style="margin-top:4px;font-size:13px;color:#4b5563;">${esc(report.periodLabel || 'Todo o período')}</div>
    </div>
  </div>`;
}

function summarySection(summary: FuelReportLine[]) {
  const rows: string[] = [];
  for (let i = 0; i < summary.length; i += 4) {
    const chunk = summary.slice(i, i + 4);
    const cells = chunk
      .map((line, index) => {
        const accent = CARD_ACCENTS[(i + index) % CARD_ACCENTS.length];
        return `<td style="width:${Math.floor(100 / chunk.length)}%;vertical-align:top;padding:0 6px 0 0;">
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-top:3px solid ${accent};padding:10px 12px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#6b7280;">${esc(line.label)}</div>
            <div style="margin-top:4px;font-size:16px;font-weight:700;color:#111827;">${esc(line.value)}</div>
          </div>
        </td>`;
      })
      .join('');
    rows.push(`<tr>${cells}</tr>`);
  }
  return `<div data-section style="padding:16px 18px 4px;background:#ffffff;">
    <table style="width:100%;border-collapse:separate;border-spacing:0 8px;">${rows.join('')}</table>
  </div>`;
}

function tableSection(table: FuelReportTable) {
  const head = table.headers
    .map((header, index) => {
      const align = index === 0 ? 'left' : 'right';
      return `<th style="padding:8px 10px;text-align:${align};font-size:11px;font-weight:700;color:#ffffff;background:#b91c1c;">${esc(header)}</th>`;
    })
    .join('');
  const body =
    table.rows.length === 0
      ? `<tr><td colspan="${table.headers.length}" style="padding:12px 10px;font-size:12px;color:#6b7280;background:#f9fafb;">Sem registros neste recorte.</td></tr>`
      : table.rows
          .map((row, rowIndex) => {
            const bg = rowIndex % 2 === 0 ? '#ffffff' : '#f9fafb';
            const cells = row
              .map((value, index) => {
                const align = index === 0 ? 'left' : 'right';
                const weight = index === 0 ? '600' : '400';
                return `<td style="padding:7px 10px;text-align:${align};font-size:12px;font-weight:${weight};color:#111827;background:${bg};border-bottom:1px solid #e5e7eb;">${esc(value)}</td>`;
              })
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');
  return `<div data-section style="padding:8px 18px 6px;background:#ffffff;">
    <div style="margin:8px 0 8px;padding-left:8px;border-left:4px solid #b91c1c;font-size:15px;font-weight:700;color:#111827;">${esc(table.title)}</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function noteSection() {
  return `<div data-section style="padding:8px 18px 18px;background:#ffffff;">
    <div style="padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;font-size:11px;line-height:1.45;color:#4b5563;">
      Disponível na semana mostra só a semana corrente e não entra neste recorte.
    </div>
    <div style="margin-top:10px;font-size:10px;color:#9ca3af;">${esc(EXPORT_COMPANY)}</div>
  </div>`;
}

function buildSections(report: FuelAnalysesExport, logoSrc: string | null, generatedAt: string) {
  return [
    headerSection(report, logoSrc, generatedAt),
    summarySection(report.summary),
    ...report.tables.map((table) => tableSection(table)),
    noteSection(),
  ];
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src.startsWith('http') ? src : `${window.location.origin}${src}`;
  });
}

async function loadLogoSrc() {
  const named = await loadImageElement('/logonome.jpg');
  if (named?.naturalWidth && named.naturalHeight) {
    const maxH = 128;
    const scale = Math.min(1, maxH / named.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(named.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(named.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(named, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.92);
    }
  }
  const logo = await loadPdfGennesisLogoStrip(18);
  return logo?.dataUrl ?? null;
}

export async function downloadFuelAnalysesWord(report: FuelAnalysesExport) {
  try {
    await saveFuelAnalysesWord(report);
  } catch {
    window.alert('Não foi possível gerar o Word.');
  }
}

async function saveFuelAnalysesWord(report: FuelAnalysesExport) {
  const generatedAt = generatedLabel();
  const logoSrc = await loadLogoSrc();
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8" />
<title>Análises de abastecimento</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 12mm 12mm 14mm 12mm; }
  body { margin: 0; font-family: Calibri, Arial, sans-serif; color: #111827; }
</style>
</head>
<body>${buildSections(report, logoSrc, generatedAt).join('')}</body>
</html>`;
  downloadBlob(
    new Blob(['\ufeff', html], { type: 'application/msword' }),
    `${fileSlug(report.periodLabel)}.doc`,
  );
}

export async function downloadFuelAnalysesPdf(report: FuelAnalysesExport) {
  const generatedAt = generatedLabel();
  const logoSrc = await loadLogoSrc();
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-12000px;top:0;width:760px;background:#ffffff;font-family:Calibri,Arial,sans-serif;color:#111827;pointer-events:none;';
  host.innerHTML = buildSections(report, logoSrc, generatedAt).join('');
  document.body.appendChild(host);

  try {
    await waitForImages(host);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const contentW = pageW - margin * 2;
    const bottom = pageH - 12;
    let y = margin;

    const sections = Array.from(host.querySelectorAll<HTMLElement>('[data-section]'));
    for (const section of sections) {
      const png = await toPng(section, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      const img = await loadImage(png);
      const height = (img.naturalHeight / img.naturalWidth) * contentW;
      if (y > margin && y + height > bottom) {
        pdf.addPage();
        y = margin;
      }
      pdf.addImage(png, 'PNG', margin, y, contentW, height);
      y += height + 1.5;
    }

    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(156, 163, 175);
      pdf.text(`${page} / ${pageCount}`, pageW - margin, pageH - 5, { align: 'right' });
    }

    pdf.save(`${fileSlug(report.periodLabel)}.pdf`);
  } catch {
    window.alert('Não foi possível gerar o PDF.');
  } finally {
    host.remove();
  }
}

import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';
import type { GestaoOsAssetQr } from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';

function locationLine(label: GestaoOsAssetQr): string {
  const parts = [label.buildingName, label.sectorName, label.placeName]
    .map((part) => part?.trim())
    .filter(Boolean) as string[];
  if (parts.length) return parts.join(' > ');
  return label.locationLabel.replace(/ › /g, ' > ').replace(/ · /g, ' > ');
}

function expandLabels(
  labels: GestaoOsAssetQr[],
  quantities?: Record<string, number>
): GestaoOsAssetQr[] {
  if (!quantities) return labels;
  const expanded: GestaoOsAssetQr[] = [];
  for (const label of labels) {
    const qty = Math.min(20, Math.max(0, Math.round(Number(quantities[label.assetId]) || 0)));
    for (let i = 0; i < qty; i += 1) expanded.push(label);
  }
  return expanded;
}

function waitForImages(root: HTMLElement): Promise<void> {
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
        })
    )
  ).then(() => undefined);
}

/** Monta o mesmo layout visual de GestaoOsAssetQrLabel fora da tela. */
function buildLabelElement(
  label: GestaoOsAssetQr,
  opts: { companyName: string; logoSrc: string }
): HTMLElement {
  const location = locationLine(label);

  const article = document.createElement('article');
  article.style.cssText = [
    'width:420px',
    'box-sizing:border-box',
    'display:grid',
    'grid-template-columns:1fr 148px',
    'overflow:hidden',
    'border-radius:16px',
    'border:1px solid #e4e4e7',
    'background:#ffffff',
    'font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
    'color:#18181b',
  ].join(';');

  const left = document.createElement('div');
  left.style.cssText =
    'display:flex;flex-direction:column;justify-content:space-between;padding:20px;min-width:0';

  const brandRow = document.createElement('div');
  brandRow.style.cssText = 'display:flex;align-items:center;gap:8px';

  if (opts.logoSrc) {
    const img = document.createElement('img');
    img.src = opts.logoSrc;
    img.alt = opts.companyName;
    img.crossOrigin = 'anonymous';
    img.style.cssText = 'height:40px;width:auto;object-fit:contain;display:block';
    brandRow.appendChild(img);
  }

  const copy = document.createElement('div');
  copy.style.cssText = 'min-width:0';

  const name = document.createElement('p');
  name.textContent = label.name;
  name.style.cssText =
    'margin:0;font-size:15px;font-weight:600;line-height:1.35;letter-spacing:-0.01em;color:#18181b;word-break:break-word';
  copy.appendChild(name);

  if (location) {
    const loc = document.createElement('p');
    loc.textContent = location;
    loc.style.cssText =
      'margin:4px 0 0;font-size:11px;line-height:1.45;font-weight:400;color:#a1a1aa;word-break:break-word';
    copy.appendChild(loc);
  }

  left.appendChild(brandRow);
  left.appendChild(copy);

  const right = document.createElement('div');
  right.style.cssText =
    'display:flex;align-items:center;justify-content:center;padding:12px 16px 12px 12px';

  const qr = document.createElement('img');
  qr.src = label.dataUrl;
  qr.alt = `QR Code ${label.name}`;
  qr.crossOrigin = 'anonymous';
  qr.style.cssText =
    'height:132px;width:132px;background:#ffffff;object-fit:contain;display:block';
  right.appendChild(qr);

  article.appendChild(left);
  article.appendChild(right);
  return article;
}

async function renderLabelPng(
  label: GestaoOsAssetQr,
  opts: { companyName: string; logoSrc: string }
): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;z-index:-1;pointer-events:none;opacity:1;background:#fff';
  const article = buildLabelElement(label, opts);
  host.appendChild(article);
  document.body.appendChild(host);

  try {
    await waitForImages(host);
    // Garante layout calculado antes do snapshot
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dataUrl = await toPng(article, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: '#ffffff',
    });
    return {
      dataUrl,
      widthPx: article.offsetWidth || 420,
      heightPx: article.offsetHeight || 176,
    };
  } finally {
    host.remove();
  }
}

function drawCropMarks(pdf: jsPDF, x: number, y: number, w: number, h: number) {
  const len = 2.2;
  const gap = 1.5;
  pdf.setDrawColor(190, 190, 190);
  pdf.setLineWidth(0.12);
  const marks: Array<[number, number, number, number]> = [
    [x - gap - len, y, x - gap, y],
    [x, y - gap - len, x, y - gap],
    [x + w + gap, y, x + w + gap + len, y],
    [x + w, y - gap - len, x + w, y - gap],
    [x - gap - len, y + h, x - gap, y + h],
    [x, y + h + gap, x, y + h + gap + len],
    [x + w + gap, y + h, x + w + gap + len, y + h],
    [x + w, y + h + gap, x + w, y + h + gap + len],
  ];
  for (const [x1, y1, x2, y2] of marks) pdf.line(x1, y1, x2, y2);
}

export async function downloadGestaoOsAssetQrLabelsPdf(
  labels: GestaoOsAssetQr[],
  opts?: {
    companyName?: string;
    forceUnbBranding?: boolean;
    quantities?: Record<string, number>;
    logoSrc?: string;
  }
): Promise<number> {
  const copies = expandLabels(labels, opts?.quantities).slice(0, 200);
  if (!copies.length) return 0;
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;

  const companyName = opts?.companyName?.trim() || 'Gennesis Engenharia';
  const logoSrc =
    opts?.logoSrc ||
    (opts?.forceUnbBranding ? '/predialpreto.png' : '/logopv.png');

  const rendered: Array<{ dataUrl: string; widthPx: number; heightPx: number }> = [];
  for (const label of copies) {
    rendered.push(await renderLabelPng(label, { companyName, logoSrc }));
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 12;
  const marginY = 14;
  const gapX = 8;
  const gapY = 10;

  // Proporção da prévia (~420×176): etiqueta larga como no modal
  const labelW = copies.length === 1 ? 120 : 90;
  const sample = rendered[0];
  const aspect = sample.heightPx / Math.max(1, sample.widthPx);
  const labelH = labelW * aspect;

  const cols =
    copies.length === 1 || labelW * 2 + gapX + marginX * 2 > pageW - 0.5 ? 1 : 2;
  const usableW = pageW - marginX * 2;
  const colGap = cols === 1 ? 0 : gapX;
  const cellW = cols === 1 ? labelW : (usableW - colGap) / cols;
  const cellH = cellW * aspect;
  const rowsPerPage = Math.max(1, Math.floor((pageH - marginY * 2 + gapY) / (cellH + gapY)));
  const perPage = cols * rowsPerPage;

  rendered.forEach((shot, index) => {
    if (index > 0 && index % perPage === 0) pdf.addPage();
    const slot = index % perPage;
    const col = slot % cols;
    const row = Math.floor(slot / cols);

    let x: number;
    let y: number;
    if (cols === 1 && copies.length === 1) {
      x = (pageW - cellW) / 2;
      y = Math.max(marginY, (pageH - cellH) / 2 - 8);
    } else {
      x = marginX + col * (cellW + colGap);
      y = marginY + row * (cellH + gapY);
    }

    drawCropMarks(pdf, x, y, cellW, cellH);
    pdf.addImage(shot.dataUrl, 'PNG', x, y, cellW, cellH);
  });

  pdf.save(copies.length === 1 ? 'etiqueta-qr-ativo.pdf' : 'etiquetas-qr-ativos.pdf');
  return copies.length;
}

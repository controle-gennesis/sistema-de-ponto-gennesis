import type jsPDF from 'jspdf';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { EXPORT_COMPANY, loadPdfGennesisLogoStrip } from '@/lib/exportBrandingLogos';

type Cell = string | number | null | undefined | unknown[];
type Row = Record<string, Cell>;
type Period = { sky: string | null; practicable: boolean | null };
type PhotoRef = { url?: string; key?: string; name?: string };

export type DiarioObraPdfInput = {
  obraName: string;
  contratoName: string;
  dateIso: string;
  weekday: string;
  finalized: boolean;
  noActivity: boolean;
  noActivityReason: string;
  noActivityNote: string;
  weather: { morning: Period; afternoon: Period };
  activities: Row[];
  laborDirect: Row[];
  laborIndirect: Row[];
  equipment: Row[];
  materials: Row[];
  occurrences: Row[];
  notes: Row[];
  /** Nome de quem gerou o PDF (aparece no rodapé). */
  generatedBy?: string;
};

type RGB = [number, number, number];
const RED: RGB = [206, 55, 54];
const TEXT: RGB = [17, 24, 39];
const MUTED: RGB = [107, 114, 128];
const BORDER: RGB = [222, 226, 231];
const SOFT: RGB = [247, 248, 250];
const WHITE: RGB = [255, 255, 255];
const GREEN: RGB = [22, 163, 74];
const AMBER: RGB = [217, 119, 6];
const ORANGE: RGB = [234, 88, 12];

const MARGIN = 14;
const SKY_LABEL: Record<string, string> = { SUN: 'Ensolarado', PARTLY: 'Nublado', RAIN: 'Chuvoso' };
const SEVERITY_LABEL: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta' };
const SEVERITY_COLOR: Record<string, RGB> = { LOW: AMBER, MEDIUM: ORANGE, HIGH: RED };

const s = (v: Cell) => (v === null || v === undefined || Array.isArray(v) ? '' : String(v).trim());
const numStr = (v: Cell) => (v === null || v === undefined || v === '' || Array.isArray(v) ? '' : String(v).replace('.', ','));
const numVal = (v: Cell) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const join = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' · ');
const interval = (r: Row) => (s(r.start) || s(r.end) ? `${s(r.start) || '--:--'} às ${s(r.end) || '--:--'}` : '');
const brDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const photosOf = (r: Row): PhotoRef[] => (Array.isArray(r.photos) ? (r.photos as PhotoRef[]).filter((p) => p?.url) : []);

function periodText(p: Period): { sky: string; work: string } {
  return {
    sky: p.sky ? SKY_LABEL[p.sky] ?? 'Não informado' : 'Não informado',
    work: p.practicable === true ? 'Praticável' : p.practicable === false ? 'Impraticável' : 'Não informado',
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Fotos: baixa cada imagem, reduz e converte para JPEG (PDF leve, sem estourar o tamanho)
// ─────────────────────────────────────────────────────────────────────────────────────────

type LoadedPhoto = { dataUrl: string; w: number; h: number };
const MAX_PHOTO_PX = 1100;

async function fetchBlob(url: string, withAuth: boolean): Promise<Blob> {
  const token =
    withAuth && typeof window !== 'undefined' ? localStorage.getItem('token') || sessionStorage.getItem('token') : null;
  const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

async function loadPhoto(rawUrl: string): Promise<LoadedPhoto | null> {
  const url = absoluteUploadUrl(rawUrl);
  if (!url) return null;
  try {
    let blob: Blob;
    try {
      blob = await fetchBlob(url, true);
    } catch {
      // Arquivo público (ex.: armazenamento externo): tenta sem o cabeçalho de login.
      blob = await fetchBlob(url, false);
    }
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_PHOTO_PX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), w, h };
  } catch {
    return null;
  }
}

/** Baixa as fotos em pequenos grupos, para não travar o navegador com muitas de uma vez. */
async function loadPhotos(urls: string[]): Promise<Map<string, LoadedPhoto | null>> {
  const out = new Map<string, LoadedPhoto | null>();
  const unique = [...new Set(urls)];
  for (let i = 0; i < unique.length; i += 4) {
    const chunk = unique.slice(i, i + 4);
    const loaded = await Promise.all(chunk.map((u) => loadPhoto(u)));
    chunk.forEach((u, idx) => out.set(u, loaded[idx]));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────────────────

export async function exportDiarioObraPdf(input: DiarioObraPdfInput): Promise<void> {
  const [{ default: JsPdf }, logo, photoMap] = await Promise.all([
    import('jspdf'),
    loadPdfGennesisLogoStrip(13).catch(() => null),
    loadPhotos(input.noActivity ? [] : input.activities.flatMap((a) => photosOf(a).map((p) => String(p.url)))),
  ]);

  const doc: jsPDF = new JsPdf({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const bottom = pageH - MARGIN - 6;
  let y = 0;

  const ensure = (need: number) => {
    if (y + need > bottom) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const setText = (size: number, bold = false, color: RGB = TEXT) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  /** Selo de situação (fundo claro na cor do texto), alinhado à esquerda em `x`. */
  const pill = (text: string, x: number, topY: number, color: RGB) => {
    setText(8, true, color);
    const w = doc.getTextWidth(text) + 8;
    doc.setFillColor(...(color.map((c) => Math.round(c + (255 - c) * 0.86)) as RGB));
    doc.roundedRect(x, topY, w, 6.4, 3.2, 3.2, 'F');
    doc.text(text, x + w / 2, topY + 4.4, { align: 'center' });
  };

  // ───────────────────────────── cabeçalho ─────────────────────────────
  doc.setFillColor(...RED);
  doc.rect(0, 0, pageW, 3, 'F');
  let titleX = MARGIN;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', MARGIN, 8, logo.wMm, logo.hMm);
    titleX = MARGIN + logo.wMm + 6;
  }
  setText(8, false, MUTED);
  doc.text(EXPORT_COMPANY.toUpperCase(), pageW - MARGIN, 11, { align: 'right' });
  setText(16, true, TEXT);
  doc.text('Relatório Diário de Obra', pageW - MARGIN, 18, { align: 'right' });
  setText(9, false, MUTED);
  doc.text('RDO', pageW - MARGIN, 23, { align: 'right' });
  if (logo) {
    // Texto de apoio à esquerda, ao lado da logo.
    setText(9, false, MUTED);
    doc.text('Gennesis Conecta', titleX, 8 + logo.hMm / 2 + 1);
  }
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 27, pageW - MARGIN, 27);
  y = 32;

  // ───────────────────────────── identificação ─────────────────────────────
  const status: { text: string; color: RGB } = input.noActivity
    ? { text: 'Sem atividade', color: RED }
    : input.finalized
      ? { text: 'Finalizado', color: GREEN }
      : { text: 'Em andamento', color: AMBER };

  const infoH = 28;
  doc.setFillColor(...SOFT);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(MARGIN, y, contentW, infoH, 2.5, 2.5, 'FD');
  const colW = contentW / 2;
  const label = (text: string, x: number, yy: number) => {
    setText(7, true, MUTED);
    doc.text(text.toUpperCase(), x, yy);
  };
  label('Obra', MARGIN + 5, y + 6.5);
  setText(11.5, true, TEXT);
  doc.text(input.obraName || '—', MARGIN + 5, y + 12.5, { maxWidth: colW - 10 });
  label('Contrato', MARGIN + 5, y + 18);
  setText(9.5, false, TEXT);
  doc.text(input.contratoName || '—', MARGIN + 5, y + 22.2, { maxWidth: colW - 10 });
  label('Data', MARGIN + colW + 5, y + 6.5);
  setText(11.5, true, TEXT);
  doc.text(brDate(input.dateIso), MARGIN + colW + 5, y + 12.5);
  const dateW = doc.getTextWidth(brDate(input.dateIso));
  setText(9.5, false, MUTED);
  doc.text(input.weekday, MARGIN + colW + 5 + dateW + 3, y + 12.5);
  label('Situação', MARGIN + colW + 5, y + 18);
  pill(status.text, MARGIN + colW + 5, y + 19.6, status.color);
  y += infoH + 6;

  // ───────────────────────────── blocos ─────────────────────────────
  const sectionTitle = (title: string, subtitle?: string) => {
    ensure(16);
    doc.setFillColor(...RED);
    doc.roundedRect(MARGIN, y, 1.4, 6, 0.7, 0.7, 'F');
    setText(11, true, TEXT);
    doc.text(title, MARGIN + 4, y + 4.7);
    if (subtitle) {
      setText(8.5, false, MUTED);
      doc.text(subtitle, pageW - MARGIN, y + 4.7, { align: 'right' });
    }
    y += 9.5;
  };

  const emptyNote = (text: string) => {
    ensure(8);
    setText(9, false, MUTED);
    doc.text(text, MARGIN + 4, y + 3.5);
    y += 9;
  };

  type Col = { label: string; w: number; align?: 'left' | 'center' | 'right' };
  type TableCell =
    | string
    | { text: string; sub?: string; color?: RGB; bold?: boolean; pill?: boolean };
  type TableRow = TableCell[];

  const table = (cols: Col[], rows: TableRow[]) => {
    const totalW = cols.reduce((t, c) => t + c.w, 0);
    const widths = cols.map((c) => (c.w / totalW) * contentW);
    const cellX = (i: number) => MARGIN + widths.slice(0, i).reduce((t, w) => t + w, 0);
    const textX = (i: number) => {
      const c = cols[i];
      return c.align === 'center' ? cellX(i) + widths[i] / 2 : c.align === 'right' ? cellX(i) + widths[i] - 3 : cellX(i) + 3;
    };
    const drawHeader = () => {
      ensure(16);
      doc.setFillColor(...SOFT);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.roundedRect(MARGIN, y, contentW, 7.4, 1.6, 1.6, 'FD');
      setText(7.2, true, MUTED);
      cols.forEach((c, i) => doc.text(c.label.toUpperCase(), textX(i), y + 4.9, { align: c.align ?? 'left' }));
      y += 8.4;
    };
    drawHeader();
    rows.forEach((row, ri) => {
      const cells = row.map((cell, i) => {
        const obj = typeof cell === 'string' ? { text: cell } : cell;
        setText(9.5, !!obj.bold, obj.color ?? TEXT);
        const main = doc.splitTextToSize(obj.text || '—', widths[i] - 7) as string[];
        setText(8.5, false, MUTED);
        const sub = obj.sub ? (doc.splitTextToSize(obj.sub, widths[i] - 7) as string[]) : [];
        return { ...obj, main, sub };
      });
      const h = Math.max(...cells.map((c) => c.main.length * 4.7 + c.sub.length * 4.1)) + 6;
      if (y + h > bottom) {
        doc.addPage();
        y = MARGIN;
        drawHeader();
      }
      cells.forEach((c, i) => {
        const align = cols[i].align ?? 'left';
        if (c.pill && c.color) {
          setText(8, true, c.color);
          const w = doc.getTextWidth(c.text) + 8;
          const px = align === 'center' ? cellX(i) + widths[i] / 2 - w / 2 : textX(i);
          doc.setFillColor(...(c.color.map((v) => Math.round(v + (255 - v) * 0.86)) as RGB));
          doc.roundedRect(px, y + h / 2 - 3.2, w, 6.4, 3.2, 3.2, 'F');
          doc.text(c.text, px + w / 2, y + h / 2 + 1.1, { align: 'center' });
          return;
        }
        setText(9.5, !!c.bold, c.color ?? TEXT);
        c.main.forEach((line, li) => doc.text(line, textX(i), y + 6 + li * 4.7, { align }));
        setText(8.5, false, MUTED);
        c.sub.forEach((line, li) => doc.text(line, textX(i), y + 6 + c.main.length * 4.7 - 0.4 + li * 4.1, { align }));
      });
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y + h, pageW - MARGIN, y + h);
      y += h;
    });
    y += 8;
  };

  const finish = () => {
    // Assinaturas
    ensure(34);
    y += 8;
    const sigW = (contentW - 16) / 2;
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y + 14, MARGIN + sigW, y + 14);
    doc.line(MARGIN + sigW + 16, y + 14, MARGIN + contentW, y + 14);
    setText(8.5, true, TEXT);
    doc.text('Responsável pela obra', MARGIN + sigW / 2, y + 19, { align: 'center' });
    doc.text('Fiscalização / Contratante', MARGIN + sigW + 16 + sigW / 2, y + 19, { align: 'center' });
    setText(7.5, false, MUTED);
    doc.text('Nome e assinatura', MARGIN + sigW / 2, y + 23, { align: 'center' });
    doc.text('Nome e assinatura', MARGIN + sigW + 16 + sigW / 2, y + 23, { align: 'center' });

    // Rodapé em todas as páginas
    const pageCount = doc.getNumberOfPages();
    const generated = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    const stamp = `${p2(generated.getDate())}/${p2(generated.getMonth() + 1)}/${generated.getFullYear()} às ${p2(generated.getHours())}:${p2(generated.getMinutes())}`;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, pageH - MARGIN - 1, pageW - MARGIN, pageH - MARGIN - 1);
      setText(7.5, false, MUTED);
      doc.text(
        `${EXPORT_COMPANY} · Diário de Obra · ${input.obraName} · ${brDate(input.dateIso)}`,
        MARGIN,
        pageH - MARGIN + 3,
        { maxWidth: contentW - 40 },
      );
      doc.text(`Página ${i} de ${pageCount}`, pageW - MARGIN, pageH - MARGIN + 3, { align: 'right' });
      doc.text(
        `Gerado em ${stamp}${input.generatedBy ? ` por ${input.generatedBy}` : ''}`,
        MARGIN,
        pageH - MARGIN + 7,
        { maxWidth: contentW },
      );
    }

    const safe = (t: string) =>
      t
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    doc.save(`RDO_${safe(input.obraName) || 'obra'}_${input.dateIso}.pdf`);
  };

  // ───────────────────────────── dia sem atividade ─────────────────────────────
  if (input.noActivity) {
    sectionTitle('Sem atividade');
    const motivos = input.noActivityReason
      .split('; ')
      .map((m) => m.trim())
      .filter(Boolean);
    table(
      [{ label: 'Motivo', w: 1 }],
      (motivos.length ? motivos : ['Sem motivo informado']).map((m) => [m]),
    );
    if (input.noActivityNote) {
      sectionTitle('Nota');
      setText(9.5, false, TEXT);
      for (const line of doc.splitTextToSize(input.noActivityNote, contentW - 6) as string[]) {
        ensure(5);
        doc.text(line, MARGIN + 4, y + 3.5);
        y += 4.7;
      }
      y += 4;
    }
    // Dia sem atividade: o restante do RDO não é preenchido nem exportado.
    finish();
    return;
  }

  // ───────────────────────────── resumo do dia ─────────────────────────────
  const people = (rows: Row[]) => rows.reduce((t, r) => t + (numVal(r.quantity) || 1), 0);
  const photoTotal = input.activities.reduce((t, a) => t + photosOf(a).length, 0);
  const kpis: Array<{ label: string; value: number }> = [
    { label: 'Atividades', value: input.activities.length },
    { label: 'Pessoas', value: people(input.laborDirect) + people(input.laborIndirect) },
    { label: 'Equipamentos', value: input.equipment.length },
    { label: 'Ocorrências', value: input.occurrences.length },
    { label: 'Fotos', value: photoTotal },
  ];
  const gap = 3;
  const kW = (contentW - gap * (kpis.length - 1)) / kpis.length;
  ensure(20);
  kpis.forEach((k, i) => {
    const x = MARGIN + i * (kW + gap);
    doc.setFillColor(...WHITE);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, kW, 16, 2.2, 2.2, 'FD');
    setText(15, true, k.label === 'Ocorrências' && k.value > 0 ? AMBER : TEXT);
    doc.text(String(k.value), x + kW / 2, y + 8.2, { align: 'center' });
    setText(7.5, false, MUTED);
    doc.text(k.label, x + kW / 2, y + 12.8, { align: 'center' });
  });
  y += 22;

  // ───────────────────────────── clima ─────────────────────────────
  sectionTitle('Clima');
  ensure(18);
  const wW = (contentW - 4) / 2;
  (
    [
      ['Manhã', input.weather.morning],
      ['Tarde', input.weather.afternoon],
    ] as const
  ).forEach(([name, period], i) => {
    const x = MARGIN + i * (wW + 4);
    const t = periodText(period);
    doc.setFillColor(...SOFT);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, wW, 15, 2.2, 2.2, 'FD');
    setText(7, true, MUTED);
    doc.text(name.toUpperCase(), x + 4, y + 5.2);
    setText(10, true, TEXT);
    doc.text(t.sky, x + 4, y + 11);
    const workColor: RGB = period.practicable === true ? GREEN : period.practicable === false ? RED : MUTED;
    setText(9, true, workColor);
    doc.text(t.work, x + wW - 4, y + 11, { align: 'right' });
  });
  y += 21;

  // ───────────────────────────── atividades (com fotos) ─────────────────────────────
  sectionTitle('Atividades', `${input.activities.length} registro(s)`);
  if (input.activities.length === 0) emptyNote('Nenhuma atividade registrada.');
  input.activities.forEach((a, idx) => {
    const photos = photosOf(a);
    const description = s(a.description);
    setText(9.5, false, MUTED);
    const descLines = description ? (doc.splitTextToSize(description, contentW - 20) as string[]) : [];

    const PAD = 4;
    const innerX = MARGIN + PAD;
    const innerW = contentW - PAD * 2;
    // Fotos: 1 foto ocupa metade, 2 fotos ficam lado a lado, 3 ou mais em linhas de 3 (sempre preenchendo a largura).
    const cols = Math.min(Math.max(photos.length, 1), 3);
    const pg = 3;
    const cw = cols === 1 ? Math.min(innerW * 0.6, 100) : (innerW - pg * (cols - 1)) / cols;
    const ch = cols === 1 ? cw * 0.66 : cw * 0.74;
    const photoRows = Math.ceil(photos.length / cols);

    const headH = 11 + descLines.length * 4.6;
    const photosH = photos.length ? 6 + photoRows * (ch + pg) : 0;
    const cardH = PAD + headH + photosH + (photos.length ? 1 : PAD - 2);
    const fits = cardH <= bottom - MARGIN;

    if (fits) ensure(cardH);
    else ensure(headH + PAD * 2);

    const top = y;
    if (fits) {
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.roundedRect(MARGIN, top, contentW, cardH, 2.6, 2.6, 'FD');
    }
    // número + título + horário
    doc.setFillColor(...RED);
    doc.roundedRect(innerX, top + PAD, 7.5, 7.5, 1.8, 1.8, 'F');
    setText(9, true, WHITE);
    doc.text(String(idx + 1), innerX + 3.75, top + PAD + 5.3, { align: 'center' });
    setText(11, true, TEXT);
    const time = interval(a);
    doc.text(s(a.title) || '—', innerX + 11.5, top + PAD + 5.4, { maxWidth: innerW - 12 - (time ? 38 : 0) });
    if (time) {
      setText(8.5, false, MUTED);
      doc.text(time, innerX + innerW, top + PAD + 5.4, { align: 'right' });
    }
    let ty = top + PAD + 12.2;
    setText(9.5, false, MUTED);
    for (const line of descLines) {
      doc.text(line, innerX + 11.5, ty);
      ty += 4.6;
    }
    y = top + PAD + headH;

    if (photos.length > 0) {
      setText(7.2, true, MUTED);
      doc.text(`FOTOS (${photos.length})`, innerX, y + 1.5);
      y += 5;
      for (let i = 0; i < photos.length; i += cols) {
        if (!fits) ensure(ch + pg + 2);
        const rowPhotos = photos.slice(i, i + cols);
        rowPhotos.forEach((p, j) => {
          const x = innerX + j * (cw + pg);
          doc.setFillColor(...SOFT);
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.2);
          doc.roundedRect(x, y, cw, ch, 1.8, 1.8, 'FD');
          const img = photoMap.get(String(p.url));
          if (img) {
            const sc = Math.min((cw - 1.6) / img.w, (ch - 1.6) / img.h);
            const dw = img.w * sc;
            const dh = img.h * sc;
            doc.addImage(img.dataUrl, 'JPEG', x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh);
          } else {
            setText(8, false, MUTED);
            doc.text('Foto indisponível', x + cw / 2, y + ch / 2, { align: 'center' });
          }
        });
        y += ch + pg;
      }
    }
    y = fits ? top + cardH + 6 : y + 6;
  });
  if (input.activities.length) y += 2;

  // ───────────────────────────── equipe, equipamentos, materiais ─────────────────────────────
  const qtyCols = (first: string, last: string): Col[] => [
    { label: first, w: 6 },
    { label: 'Qtd', w: 1.3, align: 'center' },
    { label: last, w: 1.6, align: 'center' },
  ];
  const laborRows = (rows: Row[]): TableRow[] =>
    rows.map((r) => [
      { text: s(r.role), sub: s(r.notes), bold: true },
      { text: numStr(r.quantity) || '1', bold: true },
      r.hours ? `${numStr(r.hours)} h` : '—',
    ]);

  sectionTitle('Mão de Obra Direta', `${people(input.laborDirect)} pessoa(s)`);
  if (input.laborDirect.length === 0) emptyNote('Nenhuma função lançada.');
  else table(qtyCols('Função', 'Horas'), laborRows(input.laborDirect));

  sectionTitle('Mão de Obra Indireta', `${people(input.laborIndirect)} pessoa(s)`);
  if (input.laborIndirect.length === 0) emptyNote('Nenhuma função lançada.');
  else table(qtyCols('Função', 'Horas'), laborRows(input.laborIndirect));

  sectionTitle('Equipamentos', `${input.equipment.length} registro(s)`);
  if (input.equipment.length === 0) emptyNote('Nenhum equipamento lançado.');
  else
    table(
      qtyCols('Equipamento', 'Horas'),
      input.equipment.map((r) => [
        { text: s(r.name), sub: s(r.notes), bold: true },
        { text: numStr(r.quantity) || '1', bold: true },
        r.hours ? `${numStr(r.hours)} h` : '—',
      ]),
    );

  sectionTitle('Materiais Recebidos', `${input.materials.length} registro(s)`);
  if (input.materials.length === 0) emptyNote('Nenhum material recebido neste dia.');
  else
    table(
      qtyCols('Material', 'Unidade'),
      input.materials.map((r) => [
        { text: s(r.name), sub: s(r.notes), bold: true },
        { text: numStr(r.quantity) || '—', bold: true },
        s(r.unit) || '—',
      ]),
    );

  // ───────────────────────────── ocorrências ─────────────────────────────
  sectionTitle('Ocorrências', `${input.occurrences.length} registro(s)`);
  if (input.occurrences.length === 0) emptyNote('Nenhuma ocorrência registrada.');
  else
    table(
      [
        { label: 'Ocorrência', w: 6 },
        { label: 'Horário', w: 2.2, align: 'center' },
        { label: 'Severidade', w: 2, align: 'center' },
      ],
      input.occurrences.map((r) => {
        const sev = s(r.severity) || 'LOW';
        return [
          { text: s(r.description), sub: s(r.actions) ? `Ações tomadas: ${s(r.actions)}` : '', bold: true },
          interval(r) || '—',
          { text: SEVERITY_LABEL[sev] ?? 'Baixa', color: SEVERITY_COLOR[sev] ?? AMBER, pill: true },
        ];
      }),
    );

  // ───────────────────────────── observações ─────────────────────────────
  sectionTitle('Observações Gerais', `${input.notes.length} registro(s)`);
  if (input.notes.length === 0) emptyNote('Nenhuma observação registrada.');
  else table([{ label: 'Observação', w: 1 }], input.notes.map((r) => [s(r.text)]));

  finish();
}

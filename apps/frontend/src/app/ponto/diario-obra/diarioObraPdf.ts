import type jsPDF from 'jspdf';

type Cell = string | number | null | undefined | unknown[];
type Row = Record<string, Cell>;
type Period = { sky: string | null; practicable: boolean | null };

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
};

type Item = { title: string; detail: string };

const BRAND_RED: [number, number, number] = [220, 38, 38];
const TEXT: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [209, 213, 219];
const SOFT: [number, number, number] = [249, 250, 251];

const MARGIN = 14;
const SKY_LABEL: Record<string, string> = { SUN: 'Ensolarado', PARTLY: 'Nublado', RAIN: 'Chuvoso' };
const SEVERITY_LABEL: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta' };

const s = (v: Cell) => (v === null || v === undefined || Array.isArray(v) ? '' : String(v).trim());
const num = (v: Cell) => (v === null || v === undefined || v === '' || Array.isArray(v) ? '' : String(v).replace('.', ','));
const join = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' · ');
const interval = (r: Row) => (s(r.start) || s(r.end) ? `${s(r.start) || '--:--'} às ${s(r.end) || '--:--'}` : '');

const brDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function periodText(p: Period): string {
  const sky = p.sky ? SKY_LABEL[p.sky] ?? '' : '';
  const work = p.practicable === true ? 'Praticável' : p.practicable === false ? 'Impraticável' : '';
  return join(sky, work) || 'Não informado';
}

export async function exportDiarioObraPdf(input: DiarioObraPdfInput): Promise<void> {
  const { default: JsPdf } = await import('jspdf');
  const doc: jsPDF = new JsPdf({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const bottom = pageH - MARGIN - 8;
  let y = 0;

  const ensure = (need: number) => {
    if (y + need > bottom) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // ------------------------------ cabeçalho ------------------------------
  doc.setFillColor(...SOFT);
  doc.rect(0, 0, pageW, 30, 'F');
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 28.8, pageW, 1.2, 'F');
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Diário de Obra — RDO', MARGIN, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(join(input.obraName, input.contratoName), MARGIN, 19, { maxWidth: contentW - 50 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text(brDate(input.dateIso), pageW - MARGIN, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(input.weekday, pageW - MARGIN, 18, { align: 'right' });
  doc.text(input.finalized ? 'RDO finalizado' : 'RDO em andamento', pageW - MARGIN, 24, { align: 'right' });
  y = 38;

  // ------------------------------ blocos ------------------------------
  const sectionTitle = (title: string, subtitle?: string) => {
    ensure(14);
    doc.setFillColor(...BRAND_RED);
    doc.rect(MARGIN, y, 1.2, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text(title, MARGIN + 3.5, y + 4.6);
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(subtitle, pageW - MARGIN, y + 4.6, { align: 'right' });
    }
    y += 9;
  };

  const paragraph = (text: string, muted = false) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...(muted ? MUTED : TEXT));
    const lines = doc.splitTextToSize(text, contentW - 3) as string[];
    for (const line of lines) {
      ensure(5);
      doc.text(line, MARGIN + 3, y + 3.5);
      y += 4.6;
    }
  };

  const items = (list: Item[], emptyText: string) => {
    if (list.length === 0) {
      paragraph(emptyText, true);
      y += 3;
      return;
    }
    list.forEach((it, i) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const titleLines = doc.splitTextToSize(it.title || '—', contentW - 8) as string[];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const detailLines = it.detail ? (doc.splitTextToSize(it.detail, contentW - 8) as string[]) : [];
      const h = titleLines.length * 4.6 + detailLines.length * 4 + 3;
      ensure(h);
      if (i % 2 === 0) {
        doc.setFillColor(...SOFT);
        doc.rect(MARGIN, y, contentW, h, 'F');
      }
      let ty = y + 4.2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXT);
      for (const line of titleLines) {
        doc.text(line, MARGIN + 3, ty);
        ty += 4.6;
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      for (const line of detailLines) {
        doc.text(line, MARGIN + 3, ty - 0.4);
        ty += 4;
      }
      y += h;
    });
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN, y, pageW - MARGIN, y);
    y += 6;
  };

  const finish = () => {
    // ------------------------------ rodapé ------------------------------
    const pageCount = doc.getNumberOfPages();
    const generated = new Date();
    const stamp = `${String(generated.getDate()).padStart(2, '0')}/${String(generated.getMonth() + 1).padStart(2, '0')}/${generated.getFullYear()} ${String(generated.getHours()).padStart(2, '0')}:${String(generated.getMinutes()).padStart(2, '0')}`;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(...BORDER);
      doc.line(MARGIN, pageH - MARGIN - 4, pageW - MARGIN, pageH - MARGIN - 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(`Diário de Obra · ${input.obraName} · ${brDate(input.dateIso)} · Gerado em ${stamp}`, MARGIN, pageH - MARGIN);
      doc.text(`Página ${i} de ${pageCount}`, pageW - MARGIN, pageH - MARGIN, { align: 'right' });
    }

    const safe = (t: string) =>
      t
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    doc.save(`RDO_${safe(input.obraName) || 'obra'}_${input.dateIso}.pdf`);
  };

  // Situação do dia
  if (input.noActivity) {
    sectionTitle('Sem atividade');
    const motivos = input.noActivityReason
      .split('; ')
      .map((m) => m.trim())
      .filter(Boolean);
    if (motivos.length === 0) paragraph('Sem motivo informado');
    for (const m of motivos) paragraph(`• ${m}`);
    if (input.noActivityNote) paragraph(input.noActivityNote, true);
    // Dia sem atividade: o restante do RDO não é preenchido nem exportado.
    finish();
    return;
  }

  // Clima
  sectionTitle('Clima');
  paragraph(`Manhã: ${periodText(input.weather.morning)}`);
  paragraph(`Tarde: ${periodText(input.weather.afternoon)}`);
  y += 4;

  const laborItem = (r: Row): Item => ({
    title: join(s(r.role), r.quantity ? `× ${num(r.quantity)}` : ''),
    detail: join(r.hours ? `${num(r.hours)} h` : '', s(r.notes)),
  });

  sectionTitle('Atividades', `${input.activities.length} registro(s)`);
  items(
    input.activities.map((r) => {
      const fotos = Array.isArray(r.photos) ? r.photos.length : 0;
      return {
        title: s(r.title),
        detail: join(interval(r), s(r.description), fotos > 0 && `${fotos} foto(s)`),
      };
    }),
    'Nenhuma atividade registrada.',
  );

  sectionTitle('Mão de Obra Direta', `${input.laborDirect.length} registro(s)`);
  items(input.laborDirect.map(laborItem), 'Nenhuma função lançada.');

  sectionTitle('Mão de Obra Indireta', `${input.laborIndirect.length} registro(s)`);
  items(input.laborIndirect.map(laborItem), 'Nenhuma função lançada.');

  sectionTitle('Equipamentos', `${input.equipment.length} registro(s)`);
  items(
    input.equipment.map((r) => ({
      title: join(s(r.name), r.quantity ? `× ${num(r.quantity)}` : ''),
      detail: join(r.hours ? `${num(r.hours)} h` : '', s(r.notes)),
    })),
    'Nenhum equipamento lançado.',
  );

  sectionTitle('Materiais Recebidos', `${input.materials.length} registro(s)`);
  items(
    input.materials.map((r) => ({
      title: s(r.name),
      detail: join([num(r.quantity), s(r.unit)].filter(Boolean).join(' '), s(r.notes)),
    })),
    'Nenhum material recebido neste dia.',
  );

  sectionTitle('Ocorrências', `${input.occurrences.length} registro(s)`);
  items(
    input.occurrences.map((r) => ({
      title: s(r.description),
      detail: join(`Severidade ${SEVERITY_LABEL[s(r.severity)] ?? 'Baixa'}`, interval(r), s(r.actions)),
    })),
    'Nenhuma ocorrência registrada.',
  );

  sectionTitle('Observações Gerais', `${input.notes.length} registro(s)`);
  items(
    input.notes.map((r) => ({ title: s(r.text), detail: '' })),
    'Nenhuma observação registrada.',
  );

  finish();
}

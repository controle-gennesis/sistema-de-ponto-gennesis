import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

/**
 * PDF do Controle de Contratos: uma ficha por contrato (com resumo na frente quando há vários).
 * Pensado para diretoria e consulta interna.
 */

export type RegistryPdfArt = { art: string; professional?: string | null };

export type RegistryPdfContract = {
  contractorName: string;
  uf: string | null;
  contractNumber: string;
  document: string | null;
  signedAt: string | null;
  notes: string | null;
  value: number | null;
  startDate: string | null;
  endDate: string | null;
  guarantee: string | null;
  arts: RegistryPdfArt[];
  costCenters: string[];
  addendaTotal: number;
  addenda: Array<{
    addendumNumber: string | null;
    arts: RegistryPdfArt[];
    signedAt: string | null;
    startDate: string | null;
    endDate: string | null;
    guarantee: string | null;
    amount: number;
    note: string | null;
  }>;
  cats: Array<{ catNumber: string; professional: string | null; protocol: string | null; issuedAt: string | null }>;
  looseArts: Array<{ art: string; professional: string | null; baixada: string; notes: string | null }>;
};

const LOGO_PATH = path.resolve(__dirname, '../../assets/contratos/logo-gennesis.jpg');
const RED = '#ce3736';
const INK = '#1f2937';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const SOFT = '#f3f4f6';

const MARGIN = 40;
const TOP = 96; // abaixo do cabeçalho
const BOTTOM_LIMIT = 800; // acima do rodapé

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dateBr = (iso: string | null | undefined) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

function effectiveEnd(c: RegistryPdfContract): string | null {
  const ends = [c.endDate, ...c.addenda.map((a) => a.endDate)]
    .filter((d): d is string => !!d)
    .map((d) => d.slice(0, 10))
    .sort();
  return ends.length ? ends[ends.length - 1] : null;
}

function statusOf(c: RegistryPdfContract, today: string): string {
  const s = c.startDate?.slice(0, 10);
  const e = effectiveEnd(c);
  if (e && e < today) return 'Encerrado';
  if (s && s > today) return 'A iniciar';
  if (!s && !e) return 'Sem datas';
  return 'Em andamento';
}

function diasRestantes(c: RegistryPdfContract, today: string): string {
  const e = effectiveEnd(c);
  if (!e) return '—';
  const dias = Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (dias < 0) return `encerrado há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return 'vence hoje';
  return `${dias} dia(s)`;
}

const totalOf = (c: RegistryPdfContract) => (c.value ?? 0) + (c.addendaTotal || 0);

function artsText(arts: RegistryPdfArt[]): string {
  const lista = arts.filter((a) => a.art);
  if (!lista.length) return '—';
  return lista.map((a) => (a.professional ? `${a.art} (${a.professional})` : a.art)).join('; ');
}

type Doc = InstanceType<typeof PDFDocument>;

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > BOTTOM_LIMIT) doc.addPage();
}

function sectionTitle(doc: Doc, text: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.6);
  const y = doc.y;
  doc.rect(MARGIN, y, 3, 13).fill(RED);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(text.toUpperCase(), MARGIN + 9, y + 1, {
    characterSpacing: 0.4,
  });
  doc.moveDown(0.4);
}

/** Linha "rótulo: valor" em duas colunas. */
function keyValueGrid(doc: Doc, items: Array<[string, string]>) {
  const colW = (595.28 - MARGIN * 2) / 2;
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    const heights = pair.map(([label, value]) => {
      doc.font('Helvetica').fontSize(9.5);
      return doc.heightOfString(value || '—', { width: colW - 12 }) + 13;
    });
    const h = Math.max(...heights);
    ensureSpace(doc, h + 4);
    const y = doc.y;
    pair.forEach(([label, value], k) => {
      const x = MARGIN + k * colW;
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(label.toUpperCase(), x, y, { width: colW - 12 });
      doc.fillColor(INK).font('Helvetica').fontSize(9.5).text(value || '—', x, y + 10, { width: colW - 12 });
    });
    doc.y = y + h + 2;
  }
}

function valueBoxes(doc: Doc, boxes: Array<{ label: string; value: string; color?: string }>) {
  const gap = 8;
  const w = (595.28 - MARGIN * 2 - gap * (boxes.length - 1)) / boxes.length;
  ensureSpace(doc, 52);
  const y = doc.y;
  boxes.forEach((b, i) => {
    const x = MARGIN + i * (w + gap);
    doc.roundedRect(x, y, w, 44, 5).fillAndStroke(SOFT, LINE);
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(b.label.toUpperCase(), x + 8, y + 8, { width: w - 16 });
    doc.fillColor(b.color || INK).font('Helvetica-Bold').fontSize(12).text(b.value, x + 8, y + 22, { width: w - 16 });
  });
  doc.y = y + 52;
}

type Col = { label: string; width: number; align?: 'left' | 'right' };

function table(doc: Doc, cols: Col[], rows: string[][]) {
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const scale = (595.28 - MARGIN * 2) / totalW;
  const widths = cols.map((c) => c.width * scale);

  const header = () => {
    ensureSpace(doc, 40);
    const y = doc.y;
    doc.rect(MARGIN, y, 595.28 - MARGIN * 2, 18).fill(SOFT);
    let x = MARGIN;
    cols.forEach((c, i) => {
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7.5).text(c.label.toUpperCase(), x + 5, y + 5, {
        width: widths[i] - 10,
        align: c.align || 'left',
      });
      x += widths[i];
    });
    doc.y = y + 20;
  };

  header();
  for (const row of rows) {
    doc.font('Helvetica').fontSize(8.5);
    const h = Math.max(
      ...row.map((cell, i) => doc.heightOfString(cell || '—', { width: widths[i] - 10 })),
      10
    ) + 8;
    if (doc.y + h > BOTTOM_LIMIT) {
      doc.addPage();
      header();
    }
    const y = doc.y;
    let x = MARGIN;
    row.forEach((cell, i) => {
      doc.fillColor(INK).font('Helvetica').fontSize(8.5).text(cell || '—', x + 5, y + 4, {
        width: widths[i] - 10,
        align: cols[i].align || 'left',
      });
      x += widths[i];
    });
    doc.moveTo(MARGIN, y + h).lineTo(595.28 - MARGIN, y + h).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.y = y + h;
  }
  doc.moveDown(0.4);
}

function paragraph(doc: Doc, text: string) {
  doc.font('Helvetica').fontSize(9.5);
  ensureSpace(doc, Math.min(doc.heightOfString(text, { width: 595.28 - MARGIN * 2 }) + 6, 120));
  doc.fillColor(INK).text(text, MARGIN, doc.y, { width: 595.28 - MARGIN * 2 });
  doc.moveDown(0.3);
}

function fichaDoContrato(doc: Doc, c: RegistryPdfContract, today: string) {
  const st = statusOf(c, today);
  const cor = st === 'Encerrado' ? '#b91c1c' : st === 'Em andamento' ? '#047857' : '#b45309';

  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('FICHA DO CONTRATO', MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(`Contrato ${c.contractNumber}`, MARGIN, doc.y + 1, {
    width: 595.28 - MARGIN * 2,
  });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(c.contractorName.toUpperCase(), MARGIN, doc.y + 1, {
    width: 595.28 - MARGIN * 2,
  });
  doc.fillColor(cor).font('Helvetica-Bold').fontSize(10).text(`• ${st}`, MARGIN, doc.y + 3);
  doc.moveDown(0.3);

  sectionTitle(doc, 'Valores');
  valueBoxes(doc, [
    { label: 'Valor original', value: c.value != null ? brl(c.value) : '—' },
    { label: 'Aditivos', value: brl(c.addendaTotal || 0), color: '#047857' },
    { label: 'Valor total', value: brl(totalOf(c)), color: '#1d4ed8' },
    { label: 'Garantia', value: c.guarantee || '—' },
  ]);

  sectionTitle(doc, 'Identificação');
  keyValueGrid(doc, [
    ['Contratante', c.contractorName],
    ['CPF / CNPJ', c.document || '—'],
    ['Número do contrato', c.contractNumber],
    ['Estado (UF)', c.uf || '—'],
    ['Data de assinatura', dateBr(c.signedAt)],
    ['Centros de custo', c.costCenters.length ? c.costCenters.join('; ') : '—'],
  ]);

  sectionTitle(doc, 'Prazos');
  keyValueGrid(doc, [
    ['Início', dateBr(c.startDate)],
    ['Término do contrato', dateBr(c.endDate)],
    ['Término em vigor (com aditivos)', dateBr(effectiveEnd(c))],
    ['Prazo restante', diasRestantes(c, today)],
  ]);

  sectionTitle(doc, 'ARTs do contrato');
  paragraph(doc, artsText(c.arts));

  sectionTitle(doc, `Aditivos (${c.addenda.length})`);
  if (c.addenda.length) {
    table(
      doc,
      [
        { label: 'Nº', width: 26 },
        { label: 'Assinatura', width: 56 },
        { label: 'Vigência', width: 92 },
        { label: 'Valor', width: 66, align: 'right' },
        { label: 'Garantia', width: 44 },
        { label: 'ARTs', width: 118 },
        { label: 'Observação', width: 90 },
      ],
      c.addenda.map((a) => [
        a.addendumNumber || '—',
        dateBr(a.signedAt),
        a.startDate || a.endDate ? `${dateBr(a.startDate)} a ${dateBr(a.endDate)}` : '—',
        brl(a.amount),
        a.guarantee || '—',
        artsText(a.arts),
        a.note || '—',
      ])
    );
  } else {
    paragraph(doc, 'Nenhum aditivo cadastrado.');
  }

  sectionTitle(doc, `CATs (${c.cats.length})`);
  if (c.cats.length) {
    table(
      doc,
      [
        { label: 'CAT', width: 90 },
        { label: 'Profissional', width: 150 },
        { label: 'Protocolo', width: 130 },
        { label: 'Emissão', width: 70 },
      ],
      c.cats.map((k) => [k.catNumber, k.professional || '—', k.protocol || '—', dateBr(k.issuedAt)])
    );
  } else {
    paragraph(doc, 'Nenhuma CAT cadastrada.');
  }

  sectionTitle(doc, `ARTs avulsas (${c.looseArts.length})`);
  if (c.looseArts.length) {
    table(
      doc,
      [
        { label: 'ART', width: 100 },
        { label: 'Profissional', width: 150 },
        { label: 'Baixada', width: 55 },
        { label: 'Observação', width: 140 },
      ],
      c.looseArts.map((a) => [a.art, a.professional || '—', a.baixada || '—', a.notes || '—'])
    );
  } else {
    paragraph(doc, 'Nenhuma ART avulsa cadastrada.');
  }

  if (c.notes) {
    sectionTitle(doc, 'Observações');
    paragraph(doc, c.notes);
  }
}

function resumo(doc: Doc, contratos: RegistryPdfContract[], today: string) {
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('CONTROLE DE CONTRATOS', MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text('Resumo dos contratos', MARGIN, doc.y + 1);
  doc.moveDown(0.5);

  const total = contratos.reduce((s, c) => s + totalOf(c), 0);
  const andamento = contratos.filter((c) => statusOf(c, today) === 'Em andamento').length;
  const encerrados = contratos.filter((c) => statusOf(c, today) === 'Encerrado').length;
  valueBoxes(doc, [
    { label: 'Contratos', value: String(contratos.length) },
    { label: 'Em andamento', value: String(andamento), color: '#047857' },
    { label: 'Encerrados', value: String(encerrados), color: '#b91c1c' },
    { label: 'Valor total', value: brl(total), color: '#1d4ed8' },
  ]);

  sectionTitle(doc, 'Contratos incluídos');
  table(
    doc,
    [
      { label: 'Contrato', width: 62 },
      { label: 'Contratante', width: 150 },
      { label: 'UF', width: 24 },
      { label: 'Término', width: 58 },
      { label: 'Situação', width: 62 },
      { label: 'Valor total', width: 80, align: 'right' },
    ],
    contratos.map((c) => [
      c.contractNumber,
      c.contractorName,
      c.uf || '—',
      dateBr(effectiveEnd(c)),
      statusOf(c, today),
      brl(totalOf(c)),
    ])
  );
}

export function gerarPdfControleContratos(contratos: RegistryPdfContract[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: TOP, bottom: 40, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: { Title: 'Controle de Contratos', Author: 'Gennesis Engenharia' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const today = new Date().toISOString().slice(0, 10);
    const multiplos = contratos.length > 1;

    if (multiplos) resumo(doc, contratos, today);
    contratos.forEach((c, i) => {
      if (multiplos || i > 0) doc.addPage();
      doc.y = TOP;
      fichaDoContrato(doc, c, today);
    });

    // cabeçalho e rodapé em todas as páginas
    const geradoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const prevBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // permite escrever no rodapé sem abrir página nova
      if (fs.existsSync(LOGO_PATH)) doc.image(LOGO_PATH, MARGIN, 26, { height: 44 });
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Gennesis Engenharia e Consultoria', 300, 40, {
        width: 595.28 - MARGIN - 300,
        align: 'right',
      });
      doc.text('Controle de Contratos', 300, 52, { width: 595.28 - MARGIN - 300, align: 'right' });
      doc.moveTo(MARGIN, 80).lineTo(595.28 - MARGIN, 80).lineWidth(1.2).strokeColor(RED).stroke();
      doc.moveTo(MARGIN, 812).lineTo(595.28 - MARGIN, 812).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(`Gerado em ${geradoEm}`, MARGIN, 818, {
        width: 300,
        lineBreak: false,
      });
      doc.text(`Página ${i - range.start + 1} de ${range.count}`, 595.28 - MARGIN - 120, 818, {
        width: 120,
        align: 'right',
        lineBreak: false,
      });
      doc.page.margins.bottom = prevBottom;
    }
    doc.end();
  });
}

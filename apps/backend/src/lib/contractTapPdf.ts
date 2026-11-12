import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { RegistryPdfContract } from './contractRegistryPdf';

/**
 * TAP (Termo de Abertura do Projeto) de um contrato do Controle de Contratos.
 * Dados do contrato vêm do cadastro; os campos do TAP ficam em `ContractRegistryEntry.tap` (JSON).
 */

export type TapRow3 = { a: string; b: string; c: string };
export type TapRisk = { risk: string; probability: string; impact: string; response: string };

export type TapData = {
  managerName: string;
  sponsorName: string;
  justification: string;
  objectives: string; // uma linha por objetivo
  scopeIn: string; // uma linha por item
  scopeOut: string;
  deliverables: TapRow3[]; // a = entrega, b = prazo, c = responsável
  assumptions: string; // premissas e restrições, uma por linha
  risks: TapRisk[];
  stakeholders: TapRow3[]; // a = parte, b = papel, c = interesse
};

export const EMPTY_TAP: TapData = {
  managerName: '',
  sponsorName: '',
  justification: '',
  objectives: '',
  scopeIn: '',
  scopeOut: '',
  deliverables: [],
  assumptions: '',
  risks: [],
  stakeholders: [],
};

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>).slice(0, 30) : [];

export function sanitizeTap(raw: unknown): TapData {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rows3 = (v: unknown): TapRow3[] =>
    arr(v)
      .map((r) => ({ a: str(r.a, 300), b: str(r.b, 200), c: str(r.c, 300) }))
      .filter((r) => r.a || r.b || r.c);
  return {
    managerName: str(o.managerName, 200),
    sponsorName: str(o.sponsorName, 200),
    justification: str(o.justification, 4000),
    objectives: str(o.objectives, 4000),
    scopeIn: str(o.scopeIn, 4000),
    scopeOut: str(o.scopeOut, 4000),
    deliverables: rows3(o.deliverables),
    assumptions: str(o.assumptions, 4000),
    risks: arr(o.risks)
      .map((r) => ({ risk: str(r.risk, 300), probability: str(r.probability, 40), impact: str(r.impact, 40), response: str(r.response, 400) }))
      .filter((r) => r.risk || r.probability || r.impact || r.response),
    stakeholders: rows3(o.stakeholders),
  };
}

export const TAP_REQUIRED: Array<{ key: keyof TapData; label: string }> = [
  { key: 'managerName', label: 'Gerente do projeto' },
  { key: 'justification', label: 'Justificativa' },
  { key: 'objectives', label: 'Objetivos' },
  { key: 'scopeIn', label: 'Escopo (o que está incluído)' },
];

/** Campos obrigatórios que ainda estão em branco. */
export function tapMissingFields(tap: TapData): string[] {
  return TAP_REQUIRED.filter((f) => !String(tap[f.key] ?? '').trim()).map((f) => f.label);
}

// ───────────────────────── PDF ─────────────────────────

const LOGO_PATH = path.resolve(__dirname, '../../assets/contratos/logo-gennesis.jpg');
const RED = '#ce3736';
const INK = '#1f2937';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const SOFT = '#f3f4f6';
const DANGER = '#b91c1c';
const PW = 595.28;
const M = 44;
const W = PW - M * 2;
const TOP = 96;
const BOTTOM = 782;

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBr = (iso: string | null | undefined) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const lines = (t: string) => t.split(/\r?\n/).map((l) => l.replace(/^[\s\-•*]+/, '').trim()).filter(Boolean);

function effectiveEnd(c: RegistryPdfContract): string | null {
  const ends = [c.endDate, ...c.addenda.map((a) => a.endDate)].filter((d): d is string => !!d).map((d) => d.slice(0, 10)).sort();
  return ends.length ? ends[ends.length - 1] : null;
}

type Doc = InstanceType<typeof PDFDocument>;

export function gerarPdfTap(c: RegistryPdfContract, tap: TapData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: TOP, bottom: 50, left: M, right: M },
      bufferPages: true,
      info: { Title: `TAP - Contrato ${c.contractNumber}`, Author: 'Gennesis Engenharia' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const space = (h: number) => {
      if (doc.y + h > BOTTOM) doc.addPage();
    };
    let sec = 0;
    const section = (title: string) => {
      sec += 1;
      space(46);
      doc.moveDown(0.3);
      const y = doc.y;
      doc.rect(M, y, 3, 14).fill(RED);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(`${sec}. ${title}`.toUpperCase(), M + 9, y + 1, { characterSpacing: 0.3 });
      doc.y = y + 21;
    };
    const para = (text: string) => {
      doc.font('Helvetica').fontSize(9.5);
      space(Math.min(doc.heightOfString(text, { width: W }) + 6, 120));
      doc.fillColor(INK).text(text, M, doc.y, { width: W, lineGap: 2 });
      doc.moveDown(0.3);
    };
    const label = (text: string) => {
      space(24);
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text(text.toUpperCase(), M, doc.y, { characterSpacing: 0.4 });
      doc.moveDown(0.25);
    };
    const bullets = (items: string[]) => {
      items.forEach((t) => {
        doc.font('Helvetica').fontSize(9.5);
        space(doc.heightOfString(t, { width: W - 14 }) + 4);
        const y = doc.y;
        doc.fillColor(RED).font('Helvetica-Bold').fontSize(9.5).text('•', M + 3, y);
        doc.fillColor(INK).font('Helvetica').fontSize(9.5).text(t, M + 14, y, { width: W - 14, lineGap: 1.5 });
        doc.moveDown(0.15);
      });
      doc.moveDown(0.2);
    };
    const kvGrid = (items: Array<[string, string]>) => {
      const cw = W / 2;
      for (let i = 0; i < items.length; i += 2) {
        space(30);
        const y = doc.y;
        let h = 0;
        items.slice(i, i + 2).forEach(([l, v], k) => {
          const x = M + k * cw;
          doc.fillColor(MUTED).font('Helvetica').fontSize(7.2).text(l.toUpperCase(), x, y, { width: cw - 10 });
          doc.fillColor(INK).font('Helvetica').fontSize(9.5).text(v || '—', x, y + 10, { width: cw - 10 });
          h = Math.max(h, doc.y - y);
        });
        doc.y = y + Math.max(27, h + 4);
      }
    };
    const table = (cols: number[], rows: string[][], rightLast = false) => {
      const tw = cols.reduce((a, b) => a + b, 0);
      const w = cols.map((x) => (x / tw) * W);
      const drawRow = (cells: string[], head: boolean) => {
        doc.font(head ? 'Helvetica-Bold' : 'Helvetica').fontSize(head ? 7.5 : 8.8);
        const h = Math.max(...cells.map((cell, i) => doc.heightOfString(head ? cell.toUpperCase() : cell || '—', { width: w[i] - 12 }))) + 8;
        if (doc.y + h > BOTTOM) doc.addPage();
        const y = doc.y;
        if (head) doc.rect(M, y, W, h).fill(SOFT);
        let x = M;
        cells.forEach((cell, i) => {
          doc.fillColor(head ? MUTED : INK).font(head ? 'Helvetica-Bold' : 'Helvetica').fontSize(head ? 7.5 : 8.8)
            .text(head ? cell.toUpperCase() : cell || '—', x + 6, y + 4, { width: w[i] - 12, lineGap: 1, align: rightLast && i === cells.length - 1 ? 'right' : 'left' });
          x += w[i];
        });
        doc.moveTo(M, y + h).lineTo(PW - M, y + h).lineWidth(0.5).strokeColor(LINE).stroke();
        doc.y = y + h;
      };
      drawRow(rows[0], true);
      rows.slice(1).forEach((r) => drawRow(r, false));
      doc.moveDown(0.4);
    };

    // ───── título ─────
    const hoje = new Date();
    const hojeYmd = hoje.toISOString().slice(0, 10);
    const emitido = hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    doc.y = TOP;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text('TERMO DE ABERTURA DO PROJETO', M, doc.y, { characterSpacing: 0.8 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(19).text(`TAP - Contrato ${c.contractNumber}`, M, doc.y + 2, { width: W });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11.5).text(c.contractorName.toUpperCase(), M, doc.y + 2, { width: W });
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(`TAP do contrato ${c.contractNumber} · Emitido em ${emitido}`, M, doc.y + 3);
    doc.moveDown(0.2);

    // ───── 1. identificação ─────
    const fim = effectiveEnd(c);
    section('Identificação do projeto');
    kvGrid([
      ['Projeto', `Contrato ${c.contractNumber} - ${c.contractorName}`],
      ['Contratante', c.contractorName],
      ['CPF / CNPJ do contratante', c.document || '—'],
      ['Número do contrato', c.contractNumber],
      ['Data de assinatura', dateBr(c.signedAt)],
      ['Vigência', c.startDate || fim ? `${dateBr(c.startDate)} a ${dateBr(fim)}` : '—'],
      ['Estado', c.uf || '—'],
      ['Centros de custo', c.costCenters.length ? c.costCenters.join('; ') : '—'],
      ['Gerente do projeto', tap.managerName],
      ['Patrocinador', tap.sponsorName || '—'],
    ]);

    // ───── justificativa, objetivos, escopo ─────
    section('Justificativa');
    para(tap.justification);
    section('Objetivos');
    bullets(lines(tap.objectives));
    section('Escopo');
    label('Dentro do escopo');
    bullets(lines(tap.scopeIn));
    if (tap.scopeOut) {
      label('Fora do escopo');
      bullets(lines(tap.scopeOut));
    }

    if (tap.deliverables.length) {
      section('Entregas principais');
      table([4, 2, 3], [['Entrega', 'Prazo', 'Responsável'], ...tap.deliverables.map((d) => [d.a, d.b, d.c])]);
    }
    if (tap.assumptions) {
      section('Premissas e restrições');
      bullets(lines(tap.assumptions));
    }

    // ───── marcos e prazos ─────
    section('Marcos e prazos');
    {
      const marks: Array<[string, string]> = [];
      if (c.signedAt) marks.push(['Assinatura', c.signedAt.slice(0, 10)]);
      if (c.startDate && c.startDate !== c.signedAt) marks.push(['Início', c.startDate.slice(0, 10)]);
      if (c.endDate) marks.push(['Término original', c.endDate.slice(0, 10)]);
      if (fim && fim !== (c.endDate || '').slice(0, 10)) marks.push(['Término em vigor', fim]);
      if (marks.length < 2) {
        para(marks.length ? `${marks[0][0]}: ${dateBr(marks[0][1])}` : 'Datas do contrato não informadas.');
      } else {
        space(70);
        const y0 = doc.y;
        const x0 = M + 40;
        const x1 = PW - M - 40;
        const ly = y0 + 8;
        const first = Date.parse(`${marks[0][1]}T00:00:00Z`);
        const last = Date.parse(`${marks[marks.length - 1][1]}T00:00:00Z`);
        const pct = last > first ? Math.max(0, Math.min(1, (Date.parse(`${hojeYmd}T00:00:00Z`) - first) / (last - first))) : 1;
        doc.moveTo(x0, ly).lineTo(x1, ly).lineWidth(2).strokeColor(LINE).stroke();
        doc.moveTo(x0, ly).lineTo(x0 + (x1 - x0) * pct, ly).lineWidth(2).strokeColor(RED).stroke();
        marks.forEach(([l, d], i) => {
          const x = x0 + ((x1 - x0) * i) / (marks.length - 1);
          doc.circle(x, ly, 4.5).fillAndStroke('#fff', RED);
          doc.fillColor(INK).font('Helvetica-Bold').fontSize(8).text(l, x - 55, ly + 9, { width: 110, align: 'center' });
          doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(dateBr(d), x - 55, ly + 20, { width: 110, align: 'center' });
        });
        const encerrado = fim && fim < hojeYmd;
        if (encerrado) {
          const dias = Math.round((Date.parse(`${hojeYmd}T00:00:00Z`) - Date.parse(`${fim}T00:00:00Z`)) / 86_400_000);
          doc.fillColor(DANGER).font('Helvetica-Bold').fontSize(8.5).text(`Situação: encerrado há ${dias} dia(s)`, M, ly + 34, { width: W, align: 'center' });
        }
        doc.y = y0 + 54;
      }
    }

    // ───── orçamento ─────
    section('Orçamento');
    table([3, 3, 2], [
      ['Descrição', 'Referência', 'Valor'],
      ['Valor original do contrato', c.signedAt ? `Assinatura em ${dateBr(c.signedAt)}` : '', c.value != null ? brl(c.value) : '—'],
      ['Aditivos', c.addenda.length ? `${c.addenda.length} aditivo(s)` : 'Nenhum aditivo registrado', brl(c.addendaTotal || 0)],
      ['Valor total', c.guarantee ? `Garantia: ${c.guarantee}` : '', brl((c.value ?? 0) + (c.addendaTotal || 0))],
    ], true);

    // ───── equipe técnica ─────
    const arts = [
      ...c.arts.filter((a) => a.art).map((a) => ['ART ' + a.art, a.professional || '—', 'ART do contrato']),
      ...c.looseArts.map((a) => ['ART ' + a.art, a.professional || '—', a.baixada ? `Baixada: ${a.baixada}${a.notes ? ' - ' + a.notes : ''}` : a.notes || 'ART avulsa']),
    ];
    if (arts.length) {
      section('Equipe técnica (ARTs)');
      table([3, 2, 5], [['Documento', 'Profissional', 'Observação'], ...arts]);
    }

    if (tap.risks.length) {
      section('Riscos iniciais');
      table([4, 1.9, 1.3, 4.8], [['Risco', 'Probabilidade', 'Impacto', 'Resposta'], ...tap.risks.map((r) => [r.risk, r.probability, r.impact, r.response])]);
    }
    if (tap.stakeholders.length) {
      section('Partes interessadas');
      table([3, 3, 4], [['Parte', 'Papel', 'Interesse'], ...tap.stakeholders.map((s) => [s.a, s.b, s.c])]);
    }
    if (c.notes) {
      section('Observações do contrato');
      para(c.notes);
    }

    // ───── aprovações ─────
    section('Aprovações');
    space(78);
    {
      const y = doc.y + 34;
      const cw = (W - 24) / 3;
      const sig: Array<[string, string]> = [
        ['Gerente do projeto', tap.managerName],
        ['Patrocinador / Diretoria', tap.sponsorName || 'Nome e data'],
        ['Ciente - Contratante', 'Nome, cargo e data'],
      ];
      sig.forEach(([a, b], i) => {
        const x = M + i * (cw + 12);
        doc.moveTo(x, y).lineTo(x + cw, y).lineWidth(0.7).strokeColor(INK).stroke();
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(8.5).text(a, x, y + 4, { width: cw });
        doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(b, x, y + 15, { width: cw });
      });
      doc.y = y + 32;
    }

    // ───── cabeçalho e rodapé ─────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const mb = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      if (fs.existsSync(LOGO_PATH)) doc.image(LOGO_PATH, M, 26, { height: 44 });
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Gennesis Engenharia e Consultoria', 300, 40, { width: PW - M - 300, align: 'right' });
      doc.text('CNPJ 17.851.596/0001-36', 300, 52, { width: PW - M - 300, align: 'right' });
      doc.moveTo(M, 80).lineTo(PW - M, 80).lineWidth(1.3).strokeColor(RED).stroke();
      doc.moveTo(M, 806).lineTo(PW - M, 806).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text('Gennesis Engenharia e Consultoria Ltda. - Q SHCGN CLR 705, Bloco E, Loja 08, Parte MO - Brasília/DF', M, 811, { width: W - 100, lineBreak: false });
      doc.text(`Página ${i - range.start + 1} de ${range.count}`, PW - M - 90, 811, { width: 90, align: 'right', lineBreak: false });
      doc.page.margins.bottom = mb;
    }
    doc.end();
  });
}

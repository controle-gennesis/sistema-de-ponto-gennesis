import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

/** Campos mínimos do espelho (espelho-nf/page.tsx) */
export type EspelhoMirrorDraft = {
  contract: string;
  measurementRef: string;
  costCenter: string;
  dueDate: string;
  notes: string;
  providerId: string;
  providerName: string;
  takerId: string;
  takerName: string;
  bankAccountId: string;
  bankAccountName: string;
  taxCodeId: string;
  taxCodeCityName: string;
};

export type EspelhoExportProvider = {
  id: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  tradeName: string;
  address: string;
  city: string;
  state: string;
  email: string;
};

export type EspelhoExportTaker = {
  id: string;
  name: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  address: string;
  city: string;
  state: string;
  contractRef: string;
  serviceDescription: string;
};

export type EspelhoExportBank = {
  id: string;
  name: string;
  bank: string;
  agency: string;
  account: string;
};

export type EspelhoTaxRule = { collectionType: 'RETIDO' | 'RECOLHIDO' };

export type EspelhoExportTaxCode = {
  id: string;
  cityName: string;
  issRate: string;
  cofins: EspelhoTaxRule;
  csll: EspelhoTaxRule;
  inss: EspelhoTaxRule;
  irpj: EspelhoTaxRule;
  pis: EspelhoTaxRule;
  iss: EspelhoTaxRule;
  inssMaterialLimit: string;
  issMaterialLimit: string;
};

export type EspelhoFederalRates = {
  cofins: string;
  csll: string;
  inss: string;
  irpj: string;
  pis: string;
};

export type EspelhoExportBundle = {
  draft: EspelhoMirrorDraft;
  provider: EspelhoExportProvider | null;
  taker: EspelhoExportTaker | null;
  bank: EspelhoExportBank | null;
  taxCode: EspelhoExportTaxCode | null;
  federal: EspelhoFederalRates;
};

const COLS = 12;

function dash(s: string | undefined | null): string {
  const t = (s ?? '').trim();
  return t || '—';
}

function fmtPct(v: string | undefined | null): string {
  const t = (v ?? '').trim();
  return t ? `${t}%` : '—';
}

function fmtDateBr(iso: string): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'dd/MM/yyyy');
}

function nowEmissionBr(): string {
  return format(new Date(), 'dd/MM/yyyy HH:mm');
}

function row(...parts: string[]): string[] {
  const r = [...parts];
  while (r.length < COLS) r.push('');
  return r.slice(0, COLS);
}

function mergeRow(r: number): XLSX.Range {
  return { s: { r, c: 0 }, e: { r, c: COLS - 1 } };
}

function serviceCodeLine(tax: EspelhoExportTaxCode | null): string {
  if (!tax?.cityName) return '—';
  return `Serviço / município: ${tax.cityName} (alíquota ISS ${fmtPct(tax.issRate)})`;
}

function issRetidoLine(tax: EspelhoExportTaxCode | null): string {
  const ret = tax?.iss.collectionType === 'RETIDO';
  return `SIM ( ${ret ? 'X' : ' '} )    NÃO ( ${ret ? ' ' : 'X'} )`;
}

function resolveBundle(
  draft: EspelhoMirrorDraft,
  providers: EspelhoExportProvider[],
  takers: EspelhoExportTaker[],
  banks: EspelhoExportBank[],
  taxCodes: EspelhoExportTaxCode[],
  federal: EspelhoFederalRates
): EspelhoExportBundle {
  return {
    draft,
    provider: providers.find((p) => p.id === draft.providerId) ?? null,
    taker: takers.find((t) => t.id === draft.takerId) ?? null,
    bank: banks.find((b) => b.id === draft.bankAccountId) ?? null,
    taxCode: taxCodes.find((c) => c.id === draft.taxCodeId) ?? null,
    federal
  };
}

/** Monta planilha no padrão “espelho para emissão de NF” (estrutura por seções e mesclagens). */
function buildExcelSheet(b: EspelhoExportBundle): { sheet: XLSX.WorkSheet; merges: XLSX.Range[] } {
  const { draft, provider, taker, bank, taxCode } = b;
  const aoa: string[][] = [];
  const merges: XLSX.Range[] = [];
  let r = 0;

  const pushMergeTitle = (title: string) => {
    aoa.push(row(title));
    merges.push(mergeRow(r));
    r++;
  };

  pushMergeTitle('ESPELHO PARA EMISSÃO DE NOTA FISCAL');
  aoa.push(row());
  r++;
  aoa.push(row('', '', '', '', '', '', '', '', 'Número da Nota', '', '', '—'));
  r++;
  aoa.push(row('', '', '', '', '', '', '', '', 'Data e Hora de Emissão', '', '', nowEmissionBr()));
  r++;
  aoa.push(row('', '', '', '', '', '', '', '', 'Código de Verificação', '', '', '—'));
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('PRESTADOR DE SERVIÇOS');
  aoa.push(
    row(
      'CNPJ',
      dash(provider?.cnpj),
      'Inscrição Municipal',
      dash(provider?.municipalRegistration),
      'Inscrição Estadual',
      dash(provider?.stateRegistration),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row('Nome/Razão Social', dash(provider?.corporateName || draft.providerName)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Nome Fantasia', dash(provider?.tradeName)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Endereço', dash(provider?.address)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Município',
      dash(provider?.city),
      'UF',
      dash(provider?.state),
      'E-mail',
      dash(provider?.email),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('TOMADOR DE SERVIÇOS');
  aoa.push(
    row(
      'CNPJ',
      dash(taker?.cnpj),
      'Inscrição Municipal',
      dash(taker?.municipalRegistration),
      'Inscrição Estadual (ÓRGÃO PÚBLICO)',
      dash(taker?.stateRegistration),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row('Nome/Razão Social', dash(taker?.corporateName || draft.takerName)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Endereço', dash(taker?.address)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Município',
      dash(taker?.city),
      'UF',
      dash(taker?.state),
      'Contrato',
      dash(draft.contract || taker?.contractRef),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('DISCRIMINAÇÃO DOS SERVIÇOS');
  const disc = dash(taker?.serviceDescription || draft.notes);
  aoa.push(row(disc));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const refLine = `REFERÊNCIA: ${dash(draft.measurementRef)} | CC: ${dash(draft.costCenter)}`;
  aoa.push(row(refLine));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('VALORES / INFORMAÇÕES FINANCEIRAS E BANCÁRIAS');
  aoa.push(
    row(
      'Medição (valor total)',
      '—',
      '',
      '',
      'OBSERVAÇÕES (corpo da NF)',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Mão-de-obra',
      '—',
      'Material aplicado',
      '—',
      dash(draft.notes),
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Vale-transporte', '—', 'Vale-alimentação', '—'));
  r++;
  aoa.push(row('Limite material (INSS/ISS conforme cadastro)', `INSS ${fmtPct(taxCode?.inssMaterialLimit)} | ISS ${fmtPct(taxCode?.issMaterialLimit)}`));
  merges.push({ s: { r, c: 1 }, e: { r, c: 3 } });
  r++;
  aoa.push(row('Base de cálculo INSS', '—', 'ISS retido (R$)', '—'));
  r++;
  aoa.push(
    row(
      'Centro de custo',
      dash(draft.costCenter),
      'Vencimento',
      fmtDateBr(draft.dueDate),
      'ENVIAR NF EM ARQUIVOS PDF e XML',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Banco',
      dash(bank?.bank),
      'Agência',
      dash(bank?.agency),
      'C/C',
      dash(bank?.account),
      'CONSTAR NA NOTA FISCAL: ENDEREÇO DA OBRA',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 6 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Conta (nome)',
      dash(bank?.name || draft.bankAccountName),
      '',
      '',
      'Nº Ordem de Serviço / CNO',
      '—',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
  r++;
  aoa.push(row('Reforço de garantia (%)', '—', '', '', '', '', '', '', '', '', '', ''));
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('RETENÇÕES (VALORES A INFORMAR NA NF)');
  aoa.push(
    row(
      'COFINS',
      '0,00',
      'CSLL',
      '0,00',
      'INSS',
      '0,00',
      'IRPJ',
      '0,00',
      'PIS',
      '0,00',
      'ISS',
      '0,00'
    )
  );
  r++;
  aoa.push(
    row(
      `Alíq. federal COFINS ${fmtPct(b.federal.cofins)} (${taxCode?.cofins.collectionType ?? '—'})`,
      '',
      `CSLL ${fmtPct(b.federal.csll)}`,
      '',
      `INSS ${fmtPct(b.federal.inss)}`,
      '',
      `IRPJ ${fmtPct(b.federal.irpj)}`,
      '',
      `PIS ${fmtPct(b.federal.pis)}`,
      '',
      `ISS ${fmtPct(taxCode?.issRate)} (${taxCode?.iss.collectionType ?? '—'})`,
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('VALOR DA NOTA');
  aoa.push(row('—'));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('TRIBUTAÇÃO DO ISSQN (RESUMO)');
  aoa.push(row(serviceCodeLine(taxCode)));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row('Deduções', '—', 'Desconto incond.', '—', 'Base de cálculo', '—', 'Alíquota (%)', fmtPct(taxCode?.issRate), 'Valor do ISS', '—', 'ISS a recolher', '—')
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('OUTRAS INFORMAÇÕES');
  aoa.push(
    row(
      'Retenções federais e contribuições devem observar a legislação vigente e as alíquotas cadastradas no sistema.',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      `O ISS desta NF-e será RETIDO pelo tomador? SIM ( ${taxCode?.iss.collectionType === 'RETIDO' ? 'X' : ' '} )   NÃO ( ${taxCode?.iss.collectionType !== 'RETIDO' ? 'X' : ' '} )`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      `O ISS desta NF-e é devido no Município de ${dash(taxCode?.cityName || draft.taxCodeCityName)}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Lista de Serviços - ISSQN', '—', 'CNAE', '—', '', '', '', '', '', '', '', ''));
  r++;
  aoa.push(row('Valor líquido a pagar', '—', '', '', '', '', '', '', '', '', '', ''));
  r++;
  aoa.push(row('Medição — Início', '—', 'Término', '—', '', '', '', '', '', '', '', ''));
  r++;

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = Array.from({ length: COLS }, () => ({ wch: 14 }));

  return { sheet: ws, merges };
}

function pdfCheckPage(doc: jsPDF, y: number, step: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + step > pageH - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

function pdfBar(doc: jsPDF, y: number, margin: number, contentW: number, title: string): number {
  const h = 6;
  doc.setFillColor(0, 0, 0);
  doc.rect(margin, y, contentW, h, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), margin + 2, y + 4.2);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + h + 2;
}

function pdfKeyRow(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  pairs: { k: string; v: string }[],
  opts?: { valueYellow?: boolean[] }
): number {
  const lineH = 4.5;
  let x = margin;
  const n = pairs.length;
  const colW = contentW / Math.max(n, 1);
  doc.setFontSize(7);
  pairs.forEach((p, i) => {
    if (opts?.valueYellow?.[i]) {
      doc.setFillColor(255, 248, 150);
      doc.rect(x + colW * 0.38, y - 3, colW * 0.6, lineH, 'F');
    }
    doc.setFont('helvetica', 'bold');
    const kw = doc.getTextWidth(p.k + ' ');
    doc.text(p.k, x, y);
    doc.setFont('helvetica', 'normal');
    const vx = x + Math.min(kw, colW * 0.42);
    const lines = doc.splitTextToSize(p.v, colW - (vx - x) - 1);
    doc.text(lines, vx, y);
    x += colW;
  });
  return y + lineH + 1;
}

function pdfWrappedBlock(doc: jsPDF, y: number, margin: number, contentW: number, label: string, text: string): number {
  y = pdfCheckPage(doc, y, 14, margin);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(label, margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(dash(text), contentW);
  lines.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  return y + 2;
}

function buildPdf(b: EspelhoExportBundle): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 8;
  const contentW = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;
  const { draft, provider, taker, bank, taxCode } = b;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const title = 'ESPELHO PARA EMISSÃO DE NOTA FISCAL';
  doc.text(title, margin + contentW / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Número da Nota:', margin + contentW - 42, y);
  doc.text('—', margin + contentW - 8, y, { align: 'right' });
  y += 4;
  doc.text('Data e Hora de Emissão:', margin + contentW - 42, y);
  doc.text(nowEmissionBr(), margin + contentW - 8, y, { align: 'right' });
  y += 4;
  doc.text('Código de Verificação:', margin + contentW - 42, y);
  doc.text('—', margin + contentW - 8, y, { align: 'right' });
  y += 6;

  y = pdfBar(doc, y, margin, contentW, 'PRESTADOR DE SERVIÇOS');
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'CNPJ:', v: dash(provider?.cnpj) },
    { k: 'Insc. Mun.:', v: dash(provider?.municipalRegistration) },
    { k: 'Insc. Est.:', v: dash(provider?.stateRegistration) }
  ]);
  y = pdfWrappedBlock(doc, y, margin, contentW, 'Nome/Razão Social:', dash(provider?.corporateName || draft.providerName));
  y = pdfWrappedBlock(doc, y, margin, contentW, 'Nome Fantasia:', dash(provider?.tradeName));
  y = pdfWrappedBlock(doc, y, margin, contentW, 'Endereço:', dash(provider?.address));
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Município:', v: dash(provider?.city) },
    { k: 'UF:', v: dash(provider?.state) },
    { k: 'E-mail:', v: dash(provider?.email) }
  ]);
  y += 2;

  y = pdfBar(doc, y, margin, contentW, 'TOMADOR DE SERVIÇOS');
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'CNPJ:', v: dash(taker?.cnpj) },
    { k: 'Insc. Mun.:', v: dash(taker?.municipalRegistration) },
    { k: 'Insc. Est. (ÓRGÃO PÚBLICO):', v: dash(taker?.stateRegistration) }
  ]);
  y = pdfWrappedBlock(doc, y, margin, contentW, 'Nome/Razão Social:', dash(taker?.corporateName || draft.takerName));
  y = pdfWrappedBlock(doc, y, margin, contentW, 'Endereço:', dash(taker?.address));
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Município:', v: dash(taker?.city) },
    { k: 'UF:', v: dash(taker?.state) },
    { k: 'Contrato:', v: dash(draft.contract || taker?.contractRef) }
  ]);
  y += 2;

  y = pdfBar(doc, y, margin, contentW, 'DISCRIMINAÇÃO DOS SERVIÇOS');
  doc.setFontSize(7);
  const disc = taker?.serviceDescription?.trim() || draft.notes.trim() || '—';
  const discLines = doc.splitTextToSize(disc, contentW);
  discLines.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  y += 2;
  doc.setTextColor(0, 120, 40);
  const refText = `REFERÊNCIA: ${dash(draft.measurementRef)} | CC: ${dash(draft.costCenter)}`;
  const refLines = doc.splitTextToSize(refText, contentW);
  refLines.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  doc.setTextColor(0, 0, 0);
  y += 3;

  y = pdfBar(doc, y, margin, contentW, 'VALORES / INFORMAÇÕES FINANCEIRAS E BANCÁRIAS');

  doc.setFillColor(255, 248, 120);
  doc.rect(margin, y, contentW, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('Medição (valor total)', margin + 1, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.text('—', margin + 55, y + 4);
  y += 8;

  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Mão-de-obra:', v: '—' },
    { k: 'Material aplicado:', v: '—' }
  ]);
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Vale-transporte:', v: '—' },
    { k: 'Vale-alimentação:', v: '—' }
  ]);
  doc.setFontSize(6.5);
  y = pdfCheckPage(doc, y, 6, margin);
  doc.text(
    `Limite – material (cadastro): INSS ${fmtPct(taxCode?.inssMaterialLimit)} | ISS ${fmtPct(taxCode?.issMaterialLimit)}`,
    margin,
    y
  );
  y += 5;
  y = pdfKeyRow(
    doc,
    y,
    margin,
    contentW,
    [
      { k: 'Base de cálculo INSS:', v: '—' },
      { k: 'ISS retido (R$):', v: '—' }
    ],
    { valueYellow: [true, true] }
  );

  doc.setFillColor(255, 248, 120);
  doc.rect(margin, y, contentW, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('OBSERVAÇÕES', margin + 1, y + 3.5);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.splitTextToSize(dash(draft.notes), contentW).forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  y += 2;

  doc.setFontSize(7);
  doc.text('ENVIAR NF EM ARQUIVOS PDF e XML', margin, y);
  y += 4;
  doc.text('CONSTAR NA NOTA FISCAL: ENDEREÇO DA OBRA', margin, y);
  y += 4;
  doc.text('Número da Ordem de Serviço / Inscrição da Obra (CNO): —', margin, y);
  y += 5;

  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Centro de custo:', v: dash(draft.costCenter) },
    { k: 'Vencimento:', v: fmtDateBr(draft.dueDate) },
    { k: 'Banco:', v: dash(bank?.bank) }
  ]);
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Agência:', v: dash(bank?.agency) },
    { k: 'C/C:', v: dash(bank?.account) },
    { k: 'Conta (nome):', v: dash(bank?.name || draft.bankAccountName) }
  ]);

  doc.setFillColor(255, 248, 120);
  doc.rect(margin, y, contentW, 6, 'F');
  doc.setFontSize(7);
  doc.text('Reforço de garantia (valor / %): —', margin + 1, y + 4);
  y += 9;

  y = pdfBar(doc, y, margin, contentW, 'RETENÇÕES');
  const retY = y;
  const cellW = contentW / 6;
  const labels = ['COFINS', 'CSLL', 'INSS', 'IRPJ', 'PIS', 'ISS'];
  labels.forEach((lb, i) => {
    const red = lb === 'COFINS' || lb === 'CSLL' || lb === 'PIS' || lb === 'ISS';
    const yellow = lb === 'INSS' || lb === 'IRPJ';
    if (red) doc.setFillColor(255, 210, 210);
    else if (yellow) doc.setFillColor(255, 248, 120);
    else doc.setFillColor(255, 255, 255);
    doc.rect(margin + i * cellW, retY - 4, cellW - 0.5, 10, 'FD');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(lb, margin + i * cellW + 1, retY);
    doc.setFont('helvetica', 'normal');
    doc.text('0,00', margin + i * cellW + 1, retY + 5);
  });
  y = retY + 12;
  doc.setFontSize(6);
  doc.text(
    `Alíq. COFINS ${fmtPct(b.federal.cofins)} (${taxCode?.cofins.collectionType}) | CSLL ${fmtPct(b.federal.csll)} | INSS ${fmtPct(b.federal.inss)} | IRPJ ${fmtPct(b.federal.irpj)} | PIS ${fmtPct(b.federal.pis)} | ISS ${fmtPct(taxCode?.issRate)} (${taxCode?.iss.collectionType})`,
    margin,
    y
  );
  y += 6;

  y = pdfBar(doc, y, margin, contentW, 'VALOR DA NOTA');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('—', margin + contentW / 2, y + 2, { align: 'center' });
  y += 10;

  y = pdfBar(doc, y, margin, contentW, 'TRIBUTAÇÃO DO ISSQN');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(serviceCodeLine(taxCode), margin, y);
  y += 5;
  y = pdfKeyRow(
    doc,
    y,
    margin,
    contentW,
    [
      { k: 'Deduções:', v: '—' },
      { k: 'Desc. incond.:', v: '—' },
      { k: 'Base cálculo:', v: '—' }
    ],
    { valueYellow: [false, false, true] }
  );
  y = pdfKeyRow(
    doc,
    y,
    margin,
    contentW,
    [
      { k: 'Alíq.:', v: fmtPct(taxCode?.issRate) },
      { k: 'Valor ISS:', v: '—' },
      { k: 'ISS recolher:', v: '—' }
    ],
    { valueYellow: [true, true, true] }
  );
  y += 4;

  y = pdfBar(doc, y, margin, contentW, 'OUTRAS INFORMAÇÕES');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const legal =
    'Retenções e contribuições observam alíquotas e regras cadastradas (federais e municipais) e a legislação aplicável.';
  doc.splitTextToSize(legal, contentW).forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  y += 2;
  doc.splitTextToSize(
    `O ISS desta NF-e será RETIDO pelo tomador? ${issRetidoLine(taxCode)}`,
    contentW
  ).forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  y += 5;
  doc.setFillColor(255, 248, 120);
  doc.rect(margin, y - 3, contentW, 6, 'F');
  doc.text(
    `O ISS desta NF-e é devido no Município de ${dash(taxCode?.cityName || draft.taxCodeCityName)}`,
    margin + 1,
    y + 1
  );
  y += 8;
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Lista Serv. ISSQN:', v: '—' },
    { k: 'CNAE:', v: '—' }
  ], { valueYellow: [true, true] });
  doc.setFont('helvetica', 'bold');
  doc.text('Valor líquido a pagar: —', margin + contentW / 2, y + 2, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFillColor(255, 248, 120);
  doc.rect(margin + contentW * 0.55, y - 2, contentW * 0.43, 8, 'F');
  doc.text('Medição — Início: —', margin + contentW * 0.55, y + 2);
  doc.text('Término: —', margin + contentW * 0.55, y + 6);

  return doc;
}

export function sanitizeEspelhoFilenameBase(name: string): string {
  const s = name.trim().slice(0, 60) || 'espelho-nf';
  return s.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '_');
}

export function exportEspelhoNfExcel(
  draft: EspelhoMirrorDraft,
  providers: EspelhoExportProvider[],
  takers: EspelhoExportTaker[],
  banks: EspelhoExportBank[],
  taxCodes: EspelhoExportTaxCode[],
  federal: EspelhoFederalRates
): void {
  const b = resolveBundle(draft, providers, takers, banks, taxCodes, federal);
  const { sheet } = buildExcelSheet(b);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Espelho NF');
  const base = sanitizeEspelhoFilenameBase(draft.contract || draft.measurementRef || 'espelho-nf');
  XLSX.writeFile(wb, `espelho-nf_${base}.xlsx`);
}

export function exportEspelhoNfPdf(
  draft: EspelhoMirrorDraft,
  providers: EspelhoExportProvider[],
  takers: EspelhoExportTaker[],
  banks: EspelhoExportBank[],
  taxCodes: EspelhoExportTaxCode[],
  federal: EspelhoFederalRates
): void {
  const b = resolveBundle(draft, providers, takers, banks, taxCodes, federal);
  const doc = buildPdf(b);
  const base = sanitizeEspelhoFilenameBase(draft.contract || draft.measurementRef || 'espelho-nf');
  doc.save(`espelho-nf_${base}.pdf`);
}

/** Linhas simples para modal “Ver detalhes” (mantém compatibilidade com a tela). */
export function buildEspelhoDetailRows(m: EspelhoMirrorDraft): [string, string][] {
  return [
    ['Contrato', m.contract],
    ['Referência da medição', m.measurementRef],
    ['Centro de custo', m.costCenter],
    ['Vencimento', m.dueDate || '—'],
    ['Prestador', m.providerName],
    ['Tomador', m.takerName],
    ['Conta bancária', m.bankAccountName],
    ['Código tributário (município)', m.taxCodeCityName],
    ['Observações', m.notes.trim() ? m.notes : '—']
  ];
}

import * as XLSX from 'xlsx';
import { parseBudgetToNumber } from '@/lib/pleitoForm';
import { parseImportDate } from '@/lib/osPleitoBillingImport';

export type BillingOnlyImportRow = {
  line: number;
  invoiceNumber: string;
  issueDate: string;
  grossValue: number;
  netValue: number;
};

export type BillingOnlyImportSkipped = { line: number; reasons: string[]; preview: string };

export type BillingOnlyImportResult = {
  rows: BillingOnlyImportRow[];
  skipped: BillingOnlyImportSkipped[];
};

function cell(row: Record<string, unknown>, ...keys: string[]): string {
  const normalizeKey = (k: string) =>
    k
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*\*\s*$/g, '')
      .replace(/\s+/g, ' ');
  for (const key of keys) {
    const want = normalizeKey(key);
    const found = Object.keys(row).find((k) => normalizeKey(k) === want);
    if (found == null) continue;
    const v = row[found];
    if (v == null) continue;
    return String(v).trim();
  }
  return '';
}

function rowPreview(row: Record<string, unknown>): string {
  const vals = Object.values(row)
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .slice(0, 3);
  return vals.join(' · ') || '(vazio)';
}

function parseMoney(raw: string): number {
  return parseBudgetToNumber(raw || null);
}

function pickSheetName(wb: XLSX.WorkBook): string | null {
  if (!wb.SheetNames.length) return null;
  const named = wb.SheetNames.find((n) => n.trim().toLowerCase().includes('faturamento'));
  return named || wb.SheetNames[0];
}

export function downloadBillingOnlyImportTemplate(): void {
  const wb = XLSX.utils.book_new();
  const rows = [
    ['NOTA FISCAL', 'EMISSÃO', 'VALOR BRUTO', 'VALOR LÍQUIDO'],
    ['3611', '13/03/2026', '232982,01', '201878,91'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Faturamento');
  XLSX.writeFile(wb, 'modelo-importacao-faturamento.xlsx');
}

export async function parseBillingOnlyWorkbook(file: File): Promise<BillingOnlyImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheetName = pickSheetName(wb);
  const skipped: BillingOnlyImportSkipped[] = [];
  const rows: BillingOnlyImportRow[] = [];
  if (!sheetName) return { rows, skipped };

  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });

  raw.forEach((row, idx) => {
    const line = idx + 2;
    const invoiceNumber = cell(
      row,
      'NOTA FISCAL',
      'Número da NF',
      'Numero da NF',
      'Número',
      'Numero',
      'NF',
    );
    const issueRaw =
      row['EMISSÃO'] ??
      row['EMISSAO'] ??
      row['Data de emissão'] ??
      row['Data de emissao'] ??
      cell(row, 'EMISSÃO', 'EMISSAO', 'Data de emissão', 'Data de emissao', 'Data emissão');
    const issueDate = parseImportDate(issueRaw);
    const grossValue = parseMoney(cell(row, 'VALOR BRUTO', 'Valor bruto', 'Bruto'));
    const netRaw = cell(row, 'VALOR LÍQUIDO', 'VALOR LIQUIDO', 'Valor líquido', 'Valor liquido', 'Líquido');
    const netValue = netRaw ? parseMoney(netRaw) : 0;

    const empty = !invoiceNumber && !issueDate && grossValue <= 0 && netValue <= 0;
    if (empty) return;
    if (/^total$/i.test(invoiceNumber)) return;

    const reasons: string[] = [];
    if (!invoiceNumber) reasons.push('Informe o número da nota fiscal');
    if (!issueDate) reasons.push('Informe a data de emissão');
    if (grossValue <= 0) reasons.push('Informe o valor bruto');
    if (netValue <= 0) reasons.push('Informe o valor líquido');

    if (reasons.length) {
      skipped.push({ line, reasons, preview: rowPreview(row) });
      return;
    }

    rows.push({
      line,
      invoiceNumber,
      issueDate,
      grossValue,
      netValue,
    });
  });

  return { rows, skipped };
}

import crypto from 'crypto';
import * as XLSX from 'xlsx';

export const BOLETO_CONTROL_STATUSES = ['PAGO', 'A_VENCER', 'VENCIDO'] as const;
export type BoletoControlStatus = (typeof BOLETO_CONTROL_STATUSES)[number];

export type BoletoControlParsedEntry = {
  polo: string | null;
  supplierName: string | null;
  costCenterName: string | null;
  ocNumber: string | null;
  idMov: string | null;
  value: number | null;
  nfNumber: string | null;
  nfEmissionDate: string | null; // YYYY-MM-DD
  paymentCondition: string | null;
  dueDate: string | null; // YYYY-MM-DD
  status: BoletoControlStatus;
  notes: string | null;
  contractManager: string | null;
  technicalConfirmed: boolean;
  importKey: string;
};

export type BoletoControlParseResult = {
  entries: BoletoControlParsedEntry[];
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  blankRows: number;
};

/** «Pagamento confirmado – Técnico» → PAGAMENTO CONFIRMADO TECNICO (sem acento, pontuação e caixa). */
export function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const HEADER_ALIASES: Record<string, string> = {
  POLO: 'polo',
  FORNECEDORES: 'supplierName',
  FORNECEDOR: 'supplierName',
  'CENTRO DE CUSTO': 'costCenterName',
  OC: 'ocNumber',
  ID: 'idMov',
  VALOR: 'value',
  'N NF': 'nfNumber',
  'NUMERO NF': 'nfNumber',
  NF: 'nfNumber',
  'EMISSAO DA NF': 'nfEmissionDate',
  'EMISSAO NF': 'nfEmissionDate',
  'CONDICAO DE PAGAMENTO': 'paymentCondition',
  VENCIMENTO: 'dueDate',
  STATUS: 'status',
  OBSERVACOES: 'notes',
  'GESTOR DO CONTRATO': 'contractManager',
  'PAGAMENTO CONFIRMADO TECNICO': 'technicalConfirmed',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function validYmd(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Aceita Date do Excel, dd/mm/aaaa, d/m/aaaa, dd/mm//aaaa (barra repetida), ddmmaaaa e aaaa-mm-dd. */
export function parseBoletoDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    // +12h: evita virar o dia por causa de fuso ou dos segundos de ajuste do Excel.
    const d = new Date(raw.getTime() + 12 * 3600 * 1000);
    return validYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  const s = String(raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.replace(/\/{2,}/g, '/').match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (m[3].length === 2) y += 2000;
    return validYmd(y, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return validYmd(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** Aceita número, "R$ 4.916,50" (BR) e "R$4,916.50" (US). Devolve null se não for valor. */
export function parseBoletoValue(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : null;
  let s = String(raw).replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let decimalSep: ',' | '.' | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (lastComma >= 0) {
    decimalSep = s.length - lastComma - 1 <= 2 ? ',' : null;
  } else if (lastDot >= 0) {
    decimalSep = s.length - lastDot - 1 <= 2 ? '.' : null;
  }
  let intPart = s;
  let decPart = '';
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    decPart = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, '');
  const n = Number(`${intPart || '0'}${decPart ? `.${decPart}` : ''}`);
  if (!Number.isFinite(n)) return null;
  return Math.round((negative ? -n : n) * 100) / 100;
}

function text(raw: unknown): string | null {
  if (raw == null) return null;
  const s = (raw instanceof Date ? '' : String(raw)).replace(/\s+/g, ' ').trim();
  return s || null;
}

/** Códigos (OC, ID) vêm como número no Excel: sem casas decimais e sem notação científica. */
function code(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.round(raw));
  return text(raw);
}

/** NF «802.503» (milhar com ponto) vira «802503». */
function nf(raw: unknown): string | null {
  const s = code(raw);
  if (!s) return null;
  return /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
}

export function normalizeBoletoStatus(raw: unknown): BoletoControlStatus | null {
  const n = normalizeHeader(raw);
  if (!n) return null;
  if (n === 'PAGO' || n === 'PAGA' || n === 'PAGOS') return 'PAGO';
  if (n === 'A VENCER' || n === 'AVENCER' || n === 'VENCER') return 'A_VENCER';
  if (n === 'VENCIDO' || n === 'VENCIDOS' || n === 'VENCIDA') return 'VENCIDO';
  return null;
}

function isTruthyConfirmation(raw: unknown): boolean {
  const n = normalizeHeader(raw);
  return ['PAGO', 'SIM', 'S', 'OK', 'X', 'CONFIRMADO', 'CONFIRMADA'].includes(n);
}

export function buildBoletoImportKey(
  e: Pick<BoletoControlParsedEntry, 'ocNumber' | 'idMov' | 'nfNumber' | 'dueDate' | 'value' | 'supplierName'>,
  occurrence: number
): string {
  const base = [
    e.ocNumber ?? '',
    e.idMov ?? '',
    e.nfNumber ?? '',
    e.dueDate ?? '',
    e.value != null ? Math.round(e.value * 100) : '',
    (e.supplierName ?? '').toUpperCase(),
  ].join('|');
  return `${crypto.createHash('sha1').update(base).digest('hex')}#${occurrence}`;
}

/** Lê a primeira aba (ou a que tiver o cabeçalho esperado) e devolve as linhas já normalizadas. */
export function parseBoletoControlSpreadsheet(buffer: Buffer): BoletoControlParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const result: BoletoControlParseResult = { entries: [], errors: [], warnings: [], blankRows: 0 };

  let rows: unknown[][] = [];
  let headerIdx = -1;
  let columnOf: Record<string, number> = {};
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      const map: Record<string, number> = {};
      (aoa[i] as unknown[]).forEach((cell, c) => {
        const field = HEADER_ALIASES[normalizeHeader(cell)];
        if (field && map[field] === undefined) map[field] = c;
      });
      if (Object.keys(map).length >= 5) {
        rows = aoa as unknown[][];
        headerIdx = i;
        columnOf = map;
        break;
      }
    }
    if (headerIdx >= 0) break;
  }
  if (headerIdx < 0) {
    throw new Error(
      'Não encontrei o cabeçalho da planilha. Esperado: POLO, FORNECEDORES, CENTRO DE CUSTO, OC, ID, VALOR, Nº NF, EMISSÃO DA NF, CONDIÇÃO DE PAGAMENTO, VENCIMENTO, STATUS, OBSERVAÇÕES, GESTOR DO CONTRATO, PAGAMENTO CONFIRMADO - TÉCNICO.'
    );
  }

  const get = (row: unknown[], field: string): unknown => {
    const c = columnOf[field];
    return c === undefined ? '' : row[c];
  };

  const occurrences = new Map<string, number>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const excelRow = i + 1;
    if (!row || row.every((cell) => String(cell ?? '').trim() === '')) {
      result.blankRows += 1;
      continue;
    }

    const rawValue = get(row, 'value');
    const value = parseBoletoValue(rawValue);
    const rawDue = get(row, 'dueDate');
    const dueDate = parseBoletoDate(rawDue);
    const rawEmission = get(row, 'nfEmissionDate');
    const nfEmissionDate = parseBoletoDate(rawEmission);

    const entryBase = {
      polo: text(get(row, 'polo')),
      supplierName: text(get(row, 'supplierName')),
      costCenterName: text(get(row, 'costCenterName')),
      ocNumber: code(get(row, 'ocNumber')),
      idMov: code(get(row, 'idMov')),
      value,
      nfNumber: nf(get(row, 'nfNumber')),
      nfEmissionDate,
      paymentCondition: text(get(row, 'paymentCondition')),
      dueDate,
      notes: text(get(row, 'notes')),
      contractManager: text(get(row, 'contractManager')),
    };

    if (!entryBase.supplierName && !entryBase.ocNumber && value == null) {
      result.blankRows += 1;
      continue;
    }

    if (String(rawValue ?? '').trim() !== '' && value == null) {
      result.errors.push({ row: excelRow, message: `Valor inválido: "${String(rawValue)}"` });
      continue;
    }
    if (String(rawDue ?? '').trim() !== '' && !dueDate) {
      result.errors.push({ row: excelRow, message: `Vencimento inválido: "${String(rawDue)}"` });
      continue;
    }
    if (String(rawEmission ?? '').trim() !== '' && !nfEmissionDate) {
      result.warnings.push({ row: excelRow, message: `Emissão da NF ignorada (data inválida): "${String(rawEmission)}"` });
    }

    const rawStatus = get(row, 'status');
    let status = normalizeBoletoStatus(rawStatus);
    if (!status) {
      if (String(rawStatus ?? '').trim() !== '') {
        result.warnings.push({ row: excelRow, message: `Status desconhecido "${String(rawStatus)}": importado como À VENCER` });
      }
      status = 'A_VENCER';
    }

    // Boleto pago entra com o pagamento confirmado (decisão do Financeiro), mesmo que a coluna esteja vazia.
    const technicalConfirmed = status === 'PAGO' || isTruthyConfirmation(get(row, 'technicalConfirmed'));

    const keyBase = buildBoletoImportKey(entryBase, 0).split('#')[0];
    const occ = (occurrences.get(keyBase) ?? 0) + 1;
    occurrences.set(keyBase, occ);

    result.entries.push({
      ...entryBase,
      nfEmissionDate,
      status,
      technicalConfirmed,
      importKey: `${keyBase}#${occ}`,
    });
  }
  return result;
}

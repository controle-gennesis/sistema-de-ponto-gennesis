import * as XLSX from 'xlsx';
import {
  FINANCIAL_CONTROL_STATUS_EXPORT_LABELS,
  type FinancialControlStatus,
} from '@/lib/financialControlStatus';
import { formatDateBr, parseDateSafe } from '@/lib/dateTimeBr';

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export type FinancialControlExportEntry = {
  paymentMonth: number;
  paymentYear: number;
  status: string;
  osCode: string | null;
  supplierName: string | null;
  parcelNumber: string | null;
  emissionDate: string | null;
  boleto: string | null;
  dueDate: string | null;
  originalValue: string | number | null;
  ocNumber: string | null;
  finalValue: string | number | null;
  paidDate: string | null;
  remainingDays: number | null;
  receivedNote: string | null;
};

function formatDateBrExport(value: string | null | undefined): string {
  if (!value) return '';
  const d = parseDateSafe(value);
  if (!d || d.getFullYear() < 1990) return '';
  return formatDateBr(value, '');
}

function calcRemainingDays(dueDate: string, paidDate: string): number | '' {
  const due = parseDateSafe(dueDate);
  const paid = parseDateSafe(paidDate);
  if (!due || !paid) return '';
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(paid.getFullYear(), paid.getMonth(), paid.getDate());
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

function toNumber(value: string | number | null | undefined): number | '' {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return isNaN(n) ? '' : n;
}

function resolveRemainingDays(entry: FinancialControlExportEntry): number | '' {
  if (entry.dueDate && entry.paidDate) {
    return calcRemainingDays(entry.dueDate, entry.paidDate);
  }
  if (entry.remainingDays === null || entry.remainingDays === undefined) return '';
  return entry.remainingDays;
}

export function exportFinancialControlEntries(
  entries: FinancialControlExportEntry[],
  filenameSuffix: string
): void {
  const rows = entries.map((entry) => {
    const monthLabel = MONTHS_PT[entry.paymentMonth - 1] ?? String(entry.paymentMonth);
    return {
      Mês: monthLabel,
      Ano: entry.paymentYear,
      Status:
        FINANCIAL_CONTROL_STATUS_EXPORT_LABELS[entry.status as FinancialControlStatus] ??
        entry.status,
      'O.S.': entry.osCode ?? '',
      'Nome do Fornecedor': entry.supplierName ?? '',
      'Número da Parcela': entry.parcelNumber ?? '',
      'Data Emissão': formatDateBrExport(entry.emissionDate),
      Boleto: entry.boleto ?? '',
      'Data de Vencimento': formatDateBrExport(entry.dueDate),
      'Valor Original': toNumber(entry.originalValue),
      'O.C.': entry.ocNumber ?? '',
      'Valor Final': toNumber(entry.finalValue),
      'Data de Pagamento': formatDateBrExport(entry.paidDate),
      'Diferença de Dias': resolveRemainingDays(entry),
      Observação: entry.receivedNote ?? '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 6 },
    { wch: 12 },
    { wch: 14 },
    { wch: 36 },
    { wch: 16 },
    { wch: 14 },
    { wch: 8 },
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 28 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Lançamentos');
  XLSX.writeFile(workbook, `controle-financeiro_${filenameSuffix}.xlsx`);
}

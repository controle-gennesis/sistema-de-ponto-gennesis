import * as XLSX from 'xlsx';

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

const STATUS_LABELS: Record<string, string> = {
  PROCESSO_COMPLETO: 'PAGO',
  PAGO: 'PAGO',
  AGUARDAR_NOTA: 'PENDENTE',
  CANCELADO: 'CANCELADO',
};

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

function formatDateBr(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime()) || d.getFullYear() < 1990) return '';
  return d.toLocaleDateString('pt-BR');
}

function toNumber(value: string | number | null | undefined): number | '' {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return isNaN(n) ? '' : n;
}

function calcRemainingDays(dueDate: string, paidDate: string): number | '' {
  const due = new Date(dueDate);
  const paid = new Date(paidDate);
  if (isNaN(due.getTime()) || isNaN(paid.getTime())) return '';
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(paid.getFullYear(), paid.getMonth(), paid.getDate());
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
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
      Status: STATUS_LABELS[entry.status] ?? entry.status,
      'O.S.': entry.osCode ?? '',
      'Nome do Fornecedor': entry.supplierName ?? '',
      'Número da Parcela': entry.parcelNumber ?? '',
      'Data Emissão': formatDateBr(entry.emissionDate),
      Boleto: entry.boleto ?? '',
      'Data de Vencimento': formatDateBr(entry.dueDate),
      'Valor Original': toNumber(entry.originalValue),
      'O.C.': entry.ocNumber ?? '',
      'Valor Final': toNumber(entry.finalValue),
      'Data de Pagamento': formatDateBr(entry.paidDate),
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

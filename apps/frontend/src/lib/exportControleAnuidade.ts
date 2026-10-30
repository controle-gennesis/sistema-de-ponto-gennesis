import { exportBrandedExcelTable } from '@/lib/exportBrandedExcelTable';
import { exportBrandedPdfTable } from '@/lib/exportBrandedPdfTable';
import {
  CONTROLE_ANUIDADE_IMPORT_TEMPLATE_HEADERS,
  type ControleAnuidadeExportRow,
} from '@/lib/controleAnuidadeImport';

function formatExportDate(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Data real do Excel (filtra e ordena como data); texto original quando não dá para ler. */
function toExcelDate(value: string | null | undefined): Date | string {
  const text = formatExportDate(value);
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return text;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

function formatExportValor(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  // Mesma leitura da tela: com vírgula é formato BR (1.234,56); sem vírgula o ponto é decimal (304.84).
  const raw = String(value).trim().replace(/[^\d.,-]/g, '');
  const n = raw.includes(',') ? parseFloat(raw.replace(/\./g, '').replace(',', '.')) : parseFloat(raw);
  return Number.isFinite(n) ? n : String(value);
}

function toRowValues(r: ControleAnuidadeExportRow): (string | number | Date)[] {
  return [
    r.pagosPelo || '',
    r.empresa || '',
    r.profissional || '',
    r.porqueDesconto || '',
    r.crea || '',
    r.cpfCnpj || '',
    formatExportValor(r.valor),
    toExcelDate(r.dataVencimento),
    toExcelDate(r.dataParaPagamento),
    toExcelDate(r.dataPagamento),
    r.status || '',
    r.fluig || '',
  ];
}

export async function exportControleAnuidadeEntries(
  entries: ControleAnuidadeExportRow[],
  filenameSuffix?: string
): Promise<void> {
  const suffix = filenameSuffix || new Date().toISOString().slice(0, 10);
  const headers = CONTROLE_ANUIDADE_IMPORT_TEMPLATE_HEADERS;
  await exportBrandedExcelTable({
    title: 'Controle de Anuidade',
    subtitle: 'Exportação do sistema Gennesis — pagamentos e vencimentos de anuidade CREA',
    sheetName: 'Anuidades',
    filename: `controle-anuidade_${suffix}.xlsx`,
    columns: headers.map((header) => ({
      header,
      width:
        header === 'PROFISSIONAL'
          ? 28
          : header === 'PORQUE DO DESCONTO'
            ? 22
            : header === 'STATUS'
              ? 12
              : header.includes('DATA')
                ? 14
                : header === 'VALOR'
                  ? 12
                  : 14,
      align: header === 'STATUS' || header === 'VALOR' || header === 'CREA' ? 'center' : 'left',
      statusTone: header === 'STATUS',
      numFmt: header === 'VALOR' ? '"R$" #,##0.00' : header.includes('DATA') ? 'dd/mm/yyyy' : undefined,
    })),
    rows: entries.map(toRowValues),
  });
}

export async function exportControleAnuidadePdf(
  entries: ControleAnuidadeExportRow[],
  filenameSuffix?: string
): Promise<void> {
  const suffix = filenameSuffix || new Date().toISOString().slice(0, 10);
  await exportBrandedPdfTable({
    title: 'Controle de Anuidade',
    subtitle: 'Pagamentos e vencimentos de anuidade CREA — lista conforme filtros da tela.',
    filename: `controle-anuidade_${suffix}.pdf`,
    footerLabel: 'Controle de Anuidade',
    columns: [
      { key: 'n', label: 'ID', width: 10, tone: 'muted' },
      { key: 'empresa', label: 'EMPRESA', width: 30 },
      { key: 'pagosPelo', label: 'PAGOS PELO', width: 28 },
      { key: 'profissional', label: 'PROFISSIONAL', width: 75, tone: 'bold' },
      { key: 'valor', label: 'VALOR', width: 26 },
      { key: 'vencimento', label: 'VENCIMENTO', width: 25 },
      { key: 'paraPagamento', label: 'P/ PAGAMENTO', width: 25 },
      { key: 'pagamento', label: 'PAGAMENTO', width: 25 },
      { key: 'status', label: 'STATUS', width: 24, tone: 'status' },
    ],
    rows: entries.map((r, i) => ({
      n: String(i + 1),
      empresa: String(r.empresa || '—').trim() || '—',
      pagosPelo: String(r.pagosPelo || '—').trim() || '—',
      // Como na tela: o CREA aparece embaixo do nome do profissional.
      profissional: [String(r.profissional || '—').trim() || '—', String(r.crea || '').trim()]
        .filter(Boolean)
        .join('\n'),
      valor:
        r.valor === null || r.valor === undefined || r.valor === ''
          ? '—'
          : (() => {
              const n = formatExportValor(r.valor);
              return typeof n === 'number'
                ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                : String(r.valor);
            })(),
      vencimento: formatExportDate(r.dataVencimento) || '—',
      paraPagamento: formatExportDate(r.dataParaPagamento) || '—',
      pagamento: formatExportDate(r.dataPagamento) || '—',
      status: String(r.status || '—').trim().toUpperCase() || '—',
    })),
  });
}

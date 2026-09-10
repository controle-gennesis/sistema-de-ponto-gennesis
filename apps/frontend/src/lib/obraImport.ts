import * as XLSX from 'xlsx';

export const OBRA_IMPORT_COLUMNS = [
  { name: 'Nome', required: true, hint: 'Nome da obra' },
  {
    name: 'Contrato',
    required: true,
    hint: 'Nome, número ou ID do contrato já cadastrado',
  },
  {
    name: 'ID externo',
    required: false,
    hint: 'Opcional — ID legado (AppSheet / planilha). Se repetir, atualiza a obra',
  },
  { name: 'Ativo', required: false, hint: 'Sim / Não (padrão: Sim)' },
] as const;

export const OBRA_IMPORT_TEMPLATE_HEADERS = OBRA_IMPORT_COLUMNS.map((c) => c.name);

export const OBRA_IMPORT_TEMPLATE_EXAMPLE = [
  'Obra FHE - DF',
  'Contrato XYZ',
  'OBRA-001',
  'Sim',
];

function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pickRowValue(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  const normalized = new Map(
    Object.entries(row).map(([k, v]) => [normalizeHeaderKey(k), v]),
  );
  for (const key of keys) {
    const val = normalized.get(normalizeHeaderKey(key));
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function parseActive(raw: string): boolean | undefined {
  if (!raw) return undefined;
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['sim', 's', 'true', '1', 'ativo', 'yes'].includes(normalized)) return true;
  if (['nao', 'n', 'false', '0', 'inativo', 'no'].includes(normalized)) return false;
  return undefined;
}

export type ObraImportItem = {
  name: string;
  contrato: string;
  externalId?: string;
  isActive?: boolean;
};

export type ObraImportReport = {
  obras: ObraImportItem[];
  skipped: { line: number; reasons: string[]; preview: string }[];
  totalRows: number;
};

function analyzeRow(row: Record<string, unknown>, lineNumber: number): {
  obra: ObraImportItem | null;
  skipReasons: string[];
  preview: string;
} {
  const name = pickRowValue(row, 'Nome', 'name', 'Obra', 'obra');
  const contrato = pickRowValue(
    row,
    'Contrato',
    'contrato',
    'Contrato nome',
    'Nome do contrato',
    'Número do contrato',
    'Numero do contrato',
    'contratoId',
  );
  const externalId = pickRowValue(
    row,
    'ID externo',
    'Id externo',
    'externalId',
    'External Id',
    'ID',
    'Id',
  );
  const isActive = parseActive(pickRowValue(row, 'Ativo', 'isActive', 'Situação', 'Situacao'));
  const preview = [name, contrato, externalId].filter(Boolean).join(' · ') || `(linha ${lineNumber})`;
  const skipReasons: string[] = [];
  if (!name) skipReasons.push('Nome obrigatório');
  if (!contrato) skipReasons.push('Contrato obrigatório');
  if (skipReasons.length) return { obra: null, skipReasons, preview };
  return {
    obra: {
      name,
      contrato,
      ...(externalId ? { externalId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    skipReasons: [],
    preview,
  };
}

export async function parseObrasFromFile(file: File): Promise<ObraImportReport> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Planilha sem abas.');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Aba da planilha inválida.');

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  const obras: ObraImportItem[] = [];
  const skipped: ObraImportReport['skipped'] = [];
  const seenExternal = new Set<string>();
  const seenNameContrato = new Set<string>();

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const hasAny = Object.values(row).some((v) => String(v ?? '').trim());
    if (!hasAny) return;
    const { obra, skipReasons, preview } = analyzeRow(row, line);
    if (!obra) {
      skipped.push({ line, reasons: skipReasons, preview });
      return;
    }
    if (obra.externalId) {
      const key = obra.externalId.toLowerCase();
      if (seenExternal.has(key)) {
        skipped.push({ line, reasons: ['ID externo duplicado na planilha'], preview });
        return;
      }
      seenExternal.add(key);
    } else {
      const key = `${obra.contrato.toLowerCase()}|${obra.name.toLowerCase()}`;
      if (seenNameContrato.has(key)) {
        skipped.push({ line, reasons: ['Obra duplicada na planilha (mesmo nome + contrato)'], preview });
        return;
      }
      seenNameContrato.add(key);
    }
    obras.push(obra);
  });

  return { obras, skipped, totalRows: rows.length };
}

export function downloadObraImportTemplate() {
  const aoa = [OBRA_IMPORT_TEMPLATE_HEADERS.slice(), OBRA_IMPORT_TEMPLATE_EXAMPLE.slice()];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Obras');
  XLSX.writeFile(wb, 'modelo-importacao-obras.xlsx');
}

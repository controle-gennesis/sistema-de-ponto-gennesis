import { formatCurrencyInputBrFromNumber, maskCurrencyInputBrOrEmpty, parseCurrencyInputBr } from '@/lib/maskCurrencyBr';

export const ANALISE_PRELIMINAR_DEFAULT_ROWS: Array<{
  label: string;
  currency?: boolean;
  multiline?: boolean;
}> = [
  { label: 'ABERTURA' },
  { label: 'OBJETO', multiline: true },
  { label: 'HABILITAÇÃO' },
  { label: 'VALOR', currency: true },
  { label: 'TABELAS DE REFERÊNCIA' },
  { label: 'LOCAL', multiline: true },
  { label: 'LOTE' },
  { label: 'ADESÃO' },
  { label: 'CONSÓRCIO' },
  { label: 'VIGÊNCIA' },
  { label: 'PRORROGAÇÃO' },
  { label: 'MODO DE DISPUTA' },
  { label: 'JULGAMENTO' },
  { label: 'DESCONTO MÁXIMO' },
];

const LEGACY_FIELD_KEYS = [
  'abertura',
  'objeto',
  'habilitacao',
  'valor',
  'tabelasReferencia',
  'local',
  'lote',
  'adesao',
  'consorcio',
  'vigencia',
  'prorrogacao',
  'modoDisputa',
  'julgamento',
  'descontoMaximo',
] as const;

export type AnalisePreliminarRow = {
  id: string;
  label: string;
  value: string;
  currency?: boolean;
  /** Altura do campo de valor em px (redimensionável pelo usuário). */
  heightPx?: number;
};

export type AnalisePreliminarData = {
  cabecalho: string;
  rows: AnalisePreliminarRow[];
};

const DEFAULT_ROW_HEIGHT_PX = 40;
const DEFAULT_MULTILINE_HEIGHT_PX = 88;
const MIN_ROW_HEIGHT_PX = 36;
const MAX_ROW_HEIGHT_PX = 480;

export function defaultAnalisePreliminarRowHeight(label: string, multiline?: boolean): number {
  if (multiline) return DEFAULT_MULTILINE_HEIGHT_PX;
  const upper = label.toUpperCase();
  if (upper.includes('OBJETO') || upper.includes('LOCAL')) return DEFAULT_MULTILINE_HEIGHT_PX;
  return DEFAULT_ROW_HEIGHT_PX;
}

export function clampAnalisePreliminarRowHeight(heightPx: number): number {
  if (!Number.isFinite(heightPx)) return DEFAULT_ROW_HEIGHT_PX;
  return Math.min(MAX_ROW_HEIGHT_PX, Math.max(MIN_ROW_HEIGHT_PX, Math.round(heightPx)));
}

function newRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createAnalisePreliminarRow(
  partial?: Partial<Pick<AnalisePreliminarRow, 'label' | 'value' | 'currency' | 'heightPx'>>
): AnalisePreliminarRow {
  const label = partial?.label ?? '';
  return {
    id: newRowId(),
    label,
    value: partial?.value ?? '',
    currency: partial?.currency === true,
    heightPx:
      partial?.heightPx !== undefined
        ? clampAnalisePreliminarRowHeight(partial.heightPx)
        : defaultAnalisePreliminarRowHeight(label),
  };
}

export function emptyAnalisePreliminar(cabecalho = ''): AnalisePreliminarData {
  return {
    cabecalho,
    rows: ANALISE_PRELIMINAR_DEFAULT_ROWS.map((row) =>
      createAnalisePreliminarRow({
        label: row.label,
        currency: row.currency === true,
        heightPx: defaultAnalisePreliminarRowHeight(row.label, row.multiline === true),
      })
    ),
  };
}

/** Normaliza o valor para exibição/armazenamento em moeda BRL (R$ 1.234,56). */
export function formatAnalisePreliminarValor(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/R\$/i.test(trimmed) || /[.,]/.test(trimmed)) {
    const parsed = parseCurrencyInputBr(trimmed);
    return parsed === null ? '' : formatCurrencyInputBrFromNumber(parsed);
  }
  const asNumber = Number(trimmed.replace(/\D/g, ''));
  if (!Number.isFinite(asNumber)) return '';
  return formatCurrencyInputBrFromNumber(asNumber);
}

export function maskAnalisePreliminarValorInput(raw: string): string {
  return maskCurrencyInputBrOrEmpty(raw);
}

export function isAnalisePreliminarCurrencyRow(row: Pick<AnalisePreliminarRow, 'label' | 'currency'>): boolean {
  if (row.currency === true) return true;
  return normalizeLabel(row.label) === 'VALOR';
}

function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function parseRows(raw: unknown): AnalisePreliminarRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows: AnalisePreliminarRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const o = entry as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label : '';
    const value = typeof o.value === 'string' ? o.value : '';
    const currency = o.currency === true || normalizeLabel(label) === 'VALOR';
    const heightRaw = typeof o.heightPx === 'number' ? o.heightPx : Number(o.heightPx);
    rows.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id : newRowId(),
      label,
      value: currency && value ? formatAnalisePreliminarValor(value) : value,
      currency,
      heightPx: Number.isFinite(heightRaw)
        ? clampAnalisePreliminarRowHeight(heightRaw)
        : defaultAnalisePreliminarRowHeight(label),
    });
  }
  return rows.length > 0 ? rows : null;
}

function rowsFromLegacy(o: Record<string, unknown>): AnalisePreliminarRow[] {
  return ANALISE_PRELIMINAR_DEFAULT_ROWS.map((def, index) => {
    const key = LEGACY_FIELD_KEYS[index];
    const raw = key && typeof o[key] === 'string' ? (o[key] as string) : '';
    const currency = def.currency === true;
    return createAnalisePreliminarRow({
      label: def.label,
      value: currency && raw ? formatAnalisePreliminarValor(raw) : raw,
      currency,
      heightPx: defaultAnalisePreliminarRowHeight(def.label, def.multiline === true),
    });
  });
}

export function parseAnalisePreliminar(
  raw: unknown,
  fallbackCabecalho = ''
): AnalisePreliminarData {
  const base = emptyAnalisePreliminar(fallbackCabecalho);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const cabecalho =
    typeof o.cabecalho === 'string' && o.cabecalho.trim()
      ? o.cabecalho
      : fallbackCabecalho;
  const fromRows = parseRows(o.rows);
  if (fromRows) {
    return { cabecalho, rows: fromRows };
  }
  const hasLegacy = LEGACY_FIELD_KEYS.some((key) => typeof o[key] === 'string');
  if (hasLegacy) {
    return { cabecalho, rows: rowsFromLegacy(o) };
  }
  return { cabecalho, rows: base.rows };
}

export function analisePreliminarRows(
  data: AnalisePreliminarData
): Array<{ label: string; value: string }> {
  return data.rows.map((row) => {
    const raw = row.value?.trim() || '';
    const value =
      isAnalisePreliminarCurrencyRow(row) && raw
        ? formatAnalisePreliminarValor(raw) || '—'
        : raw || '—';
    return {
      label: row.label.trim() || '—',
      value,
    };
  });
}

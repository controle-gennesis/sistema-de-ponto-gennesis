import * as XLSX from 'xlsx';
import { extractKeywords, splitHabilitacaoServicos, type KeywordMatchResult } from './bancoCatsMatch';

export const EDITAL_IMPORT_HEADERS = ['Serviço', 'Quantidade', 'Unidade'] as const;

export type EditalItem = {
  descricao: string;
  quantidade: number | null;
  quantidadeLabel: string;
  unidade: string;
};

export type HabilitacaoItemStatus =
  | 'habilita'
  | 'nao-habilita'
  | 'compativel'
  | 'conferencia-detalhada'
  | 'sem-correspondencia';

export type HabilitacaoAvaliacao = {
  status: HabilitacaoItemStatus;
  somaCats: number;
  usedCount: number;
  undLabel: string;
  mixedUnits: boolean;
};

const MAX_EDITAL_ITENS = 300;

export function parseQuantidadeBr(value: string): number {
  const text = value.trim();
  if (!text || text === '-' || text === '—' || text === '–') return 0;

  let normalized = text.replace(/[^\d.,-]/g, '');
  if (!normalized) return 0;

  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatQuantidadeBr(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function normalizeUnd(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\.+$/g, '')
    .replace(/\s+/g, '');
}

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function looksNumeric(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (parseQuantidadeBr(text) > 0) return true;
  return /^-?\d/.test(text.replace(/\s/g, ''));
}

const QTY_UNIT_STOP = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'COM', 'PARA', 'POR', 'EM', 'E', 'OU', 'X']);

/** Unidade curta após o hífen (UND, M², KG, etc.). */
function isEditalUnidadeToken(value: string): boolean {
  const trimmed = value.trim().replace(/[.,;:]+$/g, '');
  if (!trimmed || trimmed.length > 12 || /\s/.test(trimmed)) return false;
  if (!/[A-Za-zµμ]/.test(trimmed)) return false;
  const key = normalizeUnd(trimmed);
  if (!key || QTY_UNIT_STOP.has(key)) return false;
  return true;
}

/**
 * Padrão do edital: descrição + hífen + quantidade + unidade
 * (ex.: "Chapa de madeira... - 200 UND").
 */
function extractQuantidadeAposHifen(text: string): EditalItem | null {
  const match = text.match(
    /[-–—]\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)\s*([A-Za-zµμ][A-Za-z0-9µμ²³°/.-]{0,11})\s*$/
  );
  if (!match || match.index == null) return null;

  const quantidadeLabel = match[1] ?? '';
  const unidade = (match[2] ?? '').replace(/[.,;:]+$/g, '');
  if (!isEditalUnidadeToken(unidade)) return null;

  const quantidade = parseQuantidadeBr(quantidadeLabel);
  if (!(quantidade > 0)) return null;

  const descricao = text.slice(0, match.index).trim().replace(/[.,;:\s]+$/g, '');
  if (!descricao) return null;

  return {
    descricao,
    quantidade,
    quantidadeLabel,
    unidade,
  };
}

export function formatEditalItemLine(item: EditalItem): string {
  if (item.quantidade == null && !item.unidade) return item.descricao;
  const parts = [item.descricao];
  if (item.quantidadeLabel || item.quantidade != null) {
    parts.push(item.quantidadeLabel || (item.quantidade != null ? String(item.quantidade) : ''));
  }
  if (item.unidade) parts.push(item.unidade);
  return parts.join('\t');
}

export function parseEditalItemFields(raw: string): EditalItem | null {
  const text = raw.replace(/\r/g, '').trim();
  if (!text) return null;

  const fromHyphen = extractQuantidadeAposHifen(text);
  if (fromHyphen) return fromHyphen;

  const fields = text.includes('\t')
    ? text.split('\t').map((part) => part.trim())
    : text.includes('|')
      ? text.split('|').map((part) => part.trim())
      : text.includes(';')
        ? text.split(';').map((part) => part.trim())
        : [text];

  const filled = fields.filter((field) => field.length > 0);
  if (filled.length === 0) return null;

  if (filled.length === 1) {
    return {
      descricao: filled[0]!,
      quantidade: null,
      quantidadeLabel: '',
      unidade: '',
    };
  }

  let quantidadeLabel = '';
  let unidade = '';
  const descParts: string[] = [];

  for (const field of filled) {
    if (!quantidadeLabel && looksNumeric(field)) {
      quantidadeLabel = field;
      continue;
    }
    if (!unidade && field.length <= 12 && !looksNumeric(field) && descParts.length > 0) {
      unidade = field;
      continue;
    }
    descParts.push(field);
  }

  const descricao = descParts.join(' ').trim() || filled[0]!;
  const quantidade = quantidadeLabel ? parseQuantidadeBr(quantidadeLabel) : 0;

  return {
    descricao,
    quantidade: quantidadeLabel && quantidade > 0 ? quantidade : quantidadeLabel ? quantidade : null,
    quantidadeLabel,
    unidade,
  };
}

export function parseEditalText(text: string): EditalItem[] {
  const blocks = splitHabilitacaoServicos(text);
  const itens: EditalItem[] = [];
  for (const block of blocks) {
    const headerFields = block
      .split(/\t|;|\|/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (
      headerFields.length >= 2 &&
      headerFields.every((field) => headerKind(field) != null)
    ) {
      continue;
    }
    const item = parseEditalItemFields(block);
    if (!item?.descricao) continue;
    itens.push(item);
    if (itens.length >= MAX_EDITAL_ITENS) break;
  }
  return itens;
}

function headerKind(header: string): 'descricao' | 'quantidade' | 'unidade' | null {
  const key = normalizeHeaderKey(header);
  if (!key) return null;
  if (
    key === 'qtd' ||
    key === 'qtde' ||
    key === 'quant' ||
    key === 'quantidade' ||
    key.startsWith('quant ') ||
    key.includes('quantidade')
  ) {
    return 'quantidade';
  }
  if (
    key === 'und' ||
    key === 'un' ||
    key === 'unid' ||
    key === 'unidade' ||
    key === 'unimed' ||
    key.includes('unidade')
  ) {
    return 'unidade';
  }
  if (
    key === 'servico' ||
    key === 'descricao' ||
    key === 'item' ||
    key === 'especificacao' ||
    key === 'discriminacao' ||
    key.includes('servico') ||
    key.includes('descricao')
  ) {
    return 'descricao';
  }
  return null;
}

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return String(value).trim();
}

function rowToItem(
  values: string[],
  map: { descricao: number; quantidade: number; unidade: number }
): EditalItem | null {
  const descricao = (values[map.descricao] ?? '').trim();
  if (!descricao) return null;
  const quantidadeLabel = map.quantidade >= 0 ? (values[map.quantidade] ?? '').trim() : '';
  const unidade = map.unidade >= 0 ? (values[map.unidade] ?? '').trim() : '';
  const quantidade = quantidadeLabel ? parseQuantidadeBr(quantidadeLabel) : 0;
  return {
    descricao,
    quantidade: quantidadeLabel ? quantidade : null,
    quantidadeLabel,
    unidade,
  };
}

function detectColumnMap(
  headers: string[]
): { descricao: number; quantidade: number; unidade: number } | null {
  const map = { descricao: -1, quantidade: -1, unidade: -1 };
  headers.forEach((header, index) => {
    const kind = headerKind(header);
    if (!kind) return;
    if (map[kind] < 0) map[kind] = index;
  });
  if (map.descricao < 0) return null;
  return map;
}

export async function parseEditalItensFromFile(file: File): Promise<EditalItem[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    throw new Error('Use uma planilha Excel (.xlsx, .xls) ou CSV.');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('A planilha não possui abas.');
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  const rows = matrix
    .map((row) => (Array.isArray(row) ? row.map(cellToText) : []))
    .filter((row) => row.some((cell) => cell.trim()));

  if (rows.length === 0) return [];

  const headerMap = detectColumnMap(rows[0] ?? []);
  const dataRows = headerMap ? rows.slice(1) : rows;
  const map =
    headerMap ??
    ({
      descricao: 0,
      quantidade: 1,
      unidade: 2,
    } as const);

  const itens: EditalItem[] = [];
  for (const row of dataRows) {
    const item = rowToItem(row, map);
    if (!item) continue;
    itens.push(item);
    if (itens.length >= MAX_EDITAL_ITENS) break;
  }
  return itens;
}

export function downloadEditalItensTemplate(): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [...EDITAL_IMPORT_HEADERS],
    ['Instalação de cabeamento estruturado', '1500', 'm'],
    ['Fornecimento e instalação de luminárias LED', '200', 'un'],
  ]);
  ws['!cols'] = [{ wch: 52 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Itens da licitação');
  XLSX.writeFile(wb, 'modelo-itens-licitacao-banco-cats.xlsx');
}

export function unitKeyword(unidade: string): string {
  return normalizeUnd(unidade).toLowerCase();
}

export function editalItemKeywords(item: EditalItem): string[] {
  const keywords = extractKeywords(item.descricao);
  const undKey = unitKeyword(item.unidade);
  if (!undKey) return keywords;
  if (keywords.some((keyword) => unitKeyword(keyword) === undKey || keyword === undKey)) {
    return keywords;
  }
  return [...keywords, undKey];
}

export function matchesAllKeywords(
  matchedKeywords: string[],
  keywords: string[]
): boolean {
  if (keywords.length === 0) return false;
  return matchedKeywords.length >= keywords.length;
}

/** CAT que entra na soma automática da Consulta Rápida (todas as chaves + unidade). */
export function isAutoSomaMatch(
  matchedKeywords: string[],
  keywords: string[],
  itemUnd: string,
  unidadeExigida: string
): boolean {
  if (!matchesAllKeywords(matchedKeywords, keywords)) return false;
  const demandedUnd = normalizeUnd(unidadeExigida);
  if (demandedUnd && normalizeUnd(itemUnd) !== demandedUnd) return false;
  return true;
}

function isStrongMatch(
  matchedKeywords: string[],
  keywords: string[],
  score: number
): boolean {
  if (keywords.length === 0) return false;
  if (score >= 40) return true;
  const coverage = matchedKeywords.length / Math.max(keywords.length, 1);
  if (coverage >= 0.5) return true;
  if (matchedKeywords.length >= 2 && coverage >= 0.3) return true;
  if (keywords.length === 1 && matchedKeywords.length === 1) return true;
  return false;
}

export function evaluateEditalHabilitacao<T extends { und: string; quant: string; rowKey?: string }>(input: {
  quantidadeExigida: number | null;
  unidadeExigida: string;
  keywords: string[];
  matches: KeywordMatchResult<T>[];
  somaSelecionada?: number;
  countSelecionado?: number;
  unidadesSelecionadas?: string[];
  /** Consulta Rápida: soma só CAT com todas as chaves (unidade inclusive) e avalia sozinha. */
  autoSomaTodasChaves?: boolean;
}): HabilitacaoAvaliacao {
  const {
    quantidadeExigida,
    unidadeExigida,
    keywords,
    matches,
    somaSelecionada = 0,
    countSelecionado = 0,
    unidadesSelecionadas = [],
    autoSomaTodasChaves = false,
  } = input;

  const emptyAvaliacao = (
    status: HabilitacaoItemStatus,
    extras?: Partial<HabilitacaoAvaliacao>
  ): HabilitacaoAvaliacao => ({
    status,
    somaCats: 0,
    usedCount: 0,
    undLabel: unidadeExigida.trim(),
    mixedUnits: false,
    ...extras,
  });

  if (autoSomaTodasChaves) {
    if (matches.length === 0 || keywords.length === 0) {
      return emptyAvaliacao('conferencia-detalhada');
    }

    const selectedUnitKeys = Array.from(
      new Set(unidadesSelecionadas.map((und) => normalizeUnd(und)).filter(Boolean))
    );
    const selectedUndLabel =
      selectedUnitKeys.length === 1
        ? (unidadesSelecionadas.find((und) => normalizeUnd(und) === selectedUnitKeys[0]) ??
          selectedUnitKeys[0] ??
          unidadeExigida.trim())
        : selectedUnitKeys.join(', ');
    const habilita =
      quantidadeExigida != null &&
      quantidadeExigida > 0 &&
      countSelecionado > 0 &&
      somaSelecionada + 1e-9 >= quantidadeExigida;

    return {
      status: habilita ? 'habilita' : 'conferencia-detalhada',
      somaCats: somaSelecionada,
      usedCount: countSelecionado,
      undLabel: selectedUndLabel || unidadeExigida.trim(),
      mixedUnits: selectedUnitKeys.length > 1,
    };
  }

  if (matches.length === 0) {
    return emptyAvaliacao('sem-correspondencia', { undLabel: '' });
  }

  let candidates = matches.filter((match) =>
    isStrongMatch(match.matchedKeywords, keywords, match.score)
  );
  if (candidates.length === 0) {
    candidates = matches.slice(0, 1);
  }

  const demandedUnd = normalizeUnd(unidadeExigida);
  if (demandedUnd) {
    const sameUnit = candidates.filter((match) => normalizeUnd(match.item.und) === demandedUnd);
    if (sameUnit.length > 0) {
      candidates = sameUnit;
    }
  }

  const seen = new Set<string>();
  let somaCats = 0;
  const units: string[] = [];
  candidates.forEach((match, index) => {
    const key = match.item.rowKey || `${normalizeUnd(match.item.und)}::${match.item.quant}::${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    somaCats += parseQuantidadeBr(match.item.quant);
    const und = match.item.und.trim();
    if (und) units.push(und);
  });

  const uniqueUnits = Array.from(new Set(units.map(normalizeUnd).filter(Boolean)));
  const undLabel = uniqueUnits.length === 1 ? (units[0] ?? uniqueUnits[0] ?? '') : uniqueUnits.join(', ');
  const mixedUnits = uniqueUnits.length > 1;
  const hasSelection = countSelecionado > 0;
  const selectedUnitKeys = Array.from(
    new Set(unidadesSelecionadas.map((und) => normalizeUnd(und)).filter(Boolean))
  );
  const selectedUndLabel =
    selectedUnitKeys.length === 1
      ? (unidadesSelecionadas.find((und) => normalizeUnd(und) === selectedUnitKeys[0]) ??
        selectedUnitKeys[0] ??
        '')
      : selectedUnitKeys.join(', ');

  if (
    quantidadeExigida != null &&
    quantidadeExigida > 0 &&
    hasSelection &&
    somaSelecionada + 1e-9 >= quantidadeExigida
  ) {
    return {
      status: 'habilita',
      somaCats: somaSelecionada,
      usedCount: countSelecionado,
      undLabel: selectedUndLabel || unidadeExigida.trim() || undLabel,
      mixedUnits: selectedUnitKeys.length > 1,
    };
  }

  return {
    status: 'compativel',
    somaCats: hasSelection ? somaSelecionada : somaCats,
    usedCount: hasSelection ? countSelecionado : seen.size,
    undLabel: hasSelection ? selectedUndLabel || undLabel : undLabel,
    mixedUnits: hasSelection ? selectedUnitKeys.length > 1 : mixedUnits,
  };
}

export function habilitacaoStatusLabel(status: HabilitacaoItemStatus): string {
  if (status === 'habilita') return 'Habilita';
  if (status === 'nao-habilita') return 'Não se habilita';
  if (status === 'compativel') return 'Compatível';
  if (status === 'conferencia-detalhada') return 'Fazer conferência detalhada';
  return 'Sem correspondência';
}

export function consultaHasKeywords(itens: EditalItem[]): boolean {
  return itens.some(
    (item) => extractKeywords(item.descricao).length > 0 || editalItemKeywords(item).length > 0
  );
}

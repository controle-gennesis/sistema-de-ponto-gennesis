import { buildLicitacaoRegiaoRowKey } from '../lib/licitacaoRegiaoRowKey';
import { listLicitacaoRegiaoAceites } from './licitacaoRegiaoAceiteStore';
import {
  getCanonicalRegiaoHeaders,
  listLicitacaoRegiaoManuais,
  snapshotToCells,
} from './licitacaoRegiaoManualStore';
import {
  buildSheetRowBusinessKey,
  cellsToSnapshot,
  listLicitacaoRegiaoSheetRows,
  retainedRowsMissingFromSheet,
  upsertLicitacaoRegiaoSheetRows,
} from './licitacaoRegiaoSheetRowStore';

const DEFAULT_SPREADSHEET_ID = '1a91oJtIVYdydilp9hrmtVXnPwnXQ5Pf0';
const SHEET_LIST_CACHE_TTL_MS = 60_000;

export type LicitacaoRegiaoTab = {
  key: string;
  label: string;
  sheetName: string;
};

export type LicitacaoRegiaoAceiteSummary = {
  rowKey: string;
  acceptedBy: string;
  acceptedByName: string;
  acceptedAt: string;
};

export type LicitacaoRegiaoSheetData = {
  tab: LicitacaoRegiaoTab;
  spreadsheetId: string;
  headers: string[];
  rows: string[][];
  rowKeys: string[];
  /** rowKeys criados manualmente no sistema (não vêm da planilha). */
  manualRowKeys: string[];
  aceites: LicitacaoRegiaoAceiteSummary[];
  rowCount: number;
  sheetAvailable: boolean;
  fetchedAt: string;
  syncSource: 'google_sheets_api' | 'csv_export' | 'gviz';
};

export const LICITACOES_REGIAO_TABS: LicitacaoRegiaoTab[] = [
  {
    key: 'centro-oeste',
    label: 'Região Centro-Oeste',
    sheetName: 'REGIÃO CENTRO OESTE',
  },
  {
    key: 'sudeste',
    label: 'Região Sudeste',
    sheetName: 'REGIÃO SUDESTE',
  },
  {
    key: 'nordeste',
    label: 'Região Nordeste',
    sheetName: 'REGIÃO NORDESTE',
  },
  {
    key: 'sul',
    label: 'Região Sul',
    sheetName: 'REGIÃO SUL',
  },
  {
    key: 'norte',
    label: 'Região Norte',
    sheetName: 'REGIÃO NORTE',
  },
];

type GvizCell = { v?: string | number | boolean | null; f?: string | null } | null;
type GvizRow = { c?: GvizCell[] | null };
type GvizCol = { label?: string | null };
type GvizTable = { cols?: GvizCol[]; rows?: GvizRow[] };
type GvizResponse = { status?: string; table?: GvizTable };

type SpreadsheetSheetMeta = {
  name: string;
  gid: string;
  regionKey: string;
};

type SheetCacheEntry = {
  data: LicitacaoRegiaoSheetData;
  expiresAt: number;
};

// Mantido apenas para abas vazias (evita martelar htmlview quando a aba ainda não existe).
const emptySheetCache = new Map<string, SheetCacheEntry>();

type SheetListCacheEntry = {
  sheets: SpreadsheetSheetMeta[];
  expiresAt: number;
};

let sheetListCache: SheetListCacheEntry | null = null;

function spreadsheetId(): string {
  return (process.env.LICITACOES_SPREADSHEET_ID ?? DEFAULT_SPREADSHEET_ID).trim();
}

function parseGvizPayload(raw: string): GvizResponse {
  const match = raw.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\)\s*;?\s*$/);
  if (!match) {
    throw new Error('Resposta inválida da planilha Google.');
  }
  return JSON.parse(match[1]) as GvizResponse;
}

function formatCell(cell: GvizCell | undefined): string {
  if (!cell) return '';
  const formatted = cell.f?.trim();
  if (formatted) return formatted;
  const value = cell.v;
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value).trim();
}

function decodeSheetName(name: string): string {
  return name.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

function normalizeSheetName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim()
    .replace(/^REGI[OAÃÓ]*\s+/, 'REGIAO ');
}

function regionSuffixForTab(tab: LicitacaoRegiaoTab): string {
  const fromSheet = normalizeSheetName(tab.sheetName).replace(/^REGIAO\s+/, '');
  if (fromSheet) return fromSheet;

  return normalizeSheetName(tab.label).replace(/^REGIAO\s+/, '');
}

function buildEmptySheetData(tab: LicitacaoRegiaoTab): LicitacaoRegiaoSheetData {
  return {
    tab,
    spreadsheetId: spreadsheetId(),
    headers: getCanonicalRegiaoHeaders(tab.key),
    rows: [],
    rowKeys: [],
    manualRowKeys: [],
    aceites: [],
    rowCount: 0,
    sheetAvailable: false,
    fetchedAt: new Date().toISOString(),
    syncSource: 'csv_export',
  };
}

async function mergeManualRowsIntoSheet(
  tab: LicitacaoRegiaoTab,
  data: LicitacaoRegiaoSheetData
): Promise<LicitacaoRegiaoSheetData> {
  const manuais = await listLicitacaoRegiaoManuais(tab.key);
  if (manuais.length === 0) {
    return {
      ...data,
      manualRowKeys: data.manualRowKeys ?? [],
    };
  }

  const headers =
    data.headers.length > 0 ? data.headers : getCanonicalRegiaoHeaders(tab.key);
  const manualRows = manuais.map((manual) => snapshotToCells(headers, manual.rowSnapshot));
  const manualRowKeys = manuais.map((manual) => manual.rowKey);

  return {
    ...data,
    headers,
    rows: [...manualRows, ...data.rows],
    rowKeys: [...manualRowKeys, ...data.rowKeys],
    manualRowKeys,
    rowCount: manualRows.length + data.rows.length,
    // Com manuais, a lista deve ser exibível mesmo sem aba na planilha.
    sheetAvailable: data.sheetAvailable || manuais.length > 0,
  };
}

/**
 * Persiste linhas vistas na planilha e reanexa as que sumiram (append-only).
 * Inclusões na sheet aparecem; exclusões na sheet não removem do sistema.
 */
async function mergeRetainedSheetRows(
  tab: LicitacaoRegiaoTab,
  data: LicitacaoRegiaoSheetData
): Promise<LicitacaoRegiaoSheetData> {
  const headers =
    data.headers.length > 0 ? data.headers : getCanonicalRegiaoHeaders(tab.key);

  if (data.rows.length > 0) {
    await upsertLicitacaoRegiaoSheetRows({
      regiaoKey: tab.key,
      spreadsheetId: data.spreadsheetId,
      headers,
      rows: data.rows.map((cells, index) => ({
        rowKey: data.rowKeys[index] ?? buildLicitacaoRegiaoRowKey(tab.key, data.spreadsheetId, cells),
        cells,
      })),
    });
  }

  const stored = await listLicitacaoRegiaoSheetRows({
    regiaoKey: tab.key,
    spreadsheetId: data.spreadsheetId,
  });
  if (stored.length === 0) {
    return { ...data, headers };
  }

  const liveRowKeys = new Set(data.rowKeys);
  const liveBusinessKeys = new Set<string>();
  for (const cells of data.rows) {
    const businessKey = buildSheetRowBusinessKey(cellsToSnapshot(headers, cells));
    if (businessKey) liveBusinessKeys.add(businessKey);
  }

  const retained = retainedRowsMissingFromSheet({
    headers,
    liveRowKeys,
    liveBusinessKeys,
    stored,
  });

  if (retained.rows.length === 0) {
    return { ...data, headers };
  }

  return {
    ...data,
    headers,
    rows: [...data.rows, ...retained.rows],
    rowKeys: [...data.rowKeys, ...retained.rowKeys],
    rowCount: data.rows.length + retained.rows.length,
    sheetAvailable: true,
  };
}

function googleSheetsApiKey(): string | null {
  const key =
    process.env.LICITACOES_GOOGLE_SHEETS_API_KEY?.trim() ||
    process.env.GOOGLE_SHEETS_API_KEY?.trim() ||
    '';
  return key || null;
}

type GoogleSheetsApiSpreadsheet = {
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
};

type GoogleSheetsApiValues = {
  values?: string[][];
  error?: { message?: string };
};

async function fetchSpreadsheetSheetsFromApi(apiKey: string): Promise<SpreadsheetSheetMeta[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}?fields=sheets.properties(title,sheetId)&key=${encodeURIComponent(apiKey)}`;
  const response = await fetchSheetWithRetry(url);
  const payload = (await response.json()) as GoogleSheetsApiSpreadsheet & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Sheets API retornou status ${response.status}.`);
  }

  return (payload.sheets ?? [])
    .map((sheet) => {
      const name = sheet.properties?.title?.trim() ?? '';
      if (!name) return null;
      return {
        name,
        gid: String(sheet.properties?.sheetId ?? ''),
        regionKey: normalizeSheetName(name),
      };
    })
    .filter((sheet): sheet is SpreadsheetSheetMeta => Boolean(sheet));
}

async function fetchSheetRowsFromApi(
  sheetName: string,
  apiKey: string
): Promise<{ headers: string[]; rows: string[][] }> {
  const escapedName = sheetName.replace(/'/g, "''");
  const range = encodeURIComponent(`'${escapedName}'!A1:ZZ2000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&key=${encodeURIComponent(apiKey)}`;
  const response = await fetchSheetWithRetry(url);
  const payload = (await response.json()) as GoogleSheetsApiValues;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Sheets API retornou status ${response.status}.`);
  }

  return getProcessedSheetRowsFromMatrix(payload.values ?? []);
}

async function fetchSpreadsheetSheets(forceRefresh = false): Promise<SpreadsheetSheetMeta[]> {
  if (!forceRefresh && sheetListCache && sheetListCache.expiresAt > Date.now()) {
    return sheetListCache.sheets;
  }

  const apiKey = googleSheetsApiKey();
  if (apiKey) {
    try {
      const sheets = await fetchSpreadsheetSheetsFromApi(apiKey);
      if (sheets.length > 0) {
        sheetListCache = {
          sheets,
          expiresAt: Date.now() + SHEET_LIST_CACHE_TTL_MS,
        };
        return sheets;
      }
    } catch (error) {
      console.warn(
        'Licitações: falha ao listar abas via Google Sheets API; usando htmlview.',
        error instanceof Error ? error.message : error
      );
    }
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId()}/htmlview`;
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,text/plain,*/*',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    cache: 'no-store',
  } as RequestInit & { cache?: 'no-store' });

  if (!response.ok) {
    throw new Error(`Falha ao consultar abas da planilha (${response.status}).`);
  }

  const html = await response.text();
  const sheets: SpreadsheetSheetMeta[] = [];
  const pattern = /items\.push\(\{name:\s*"([^"]+)"[^}]*gid:\s*"(\d+)"/g;
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match) {
    const name = decodeSheetName(match[1]);
    sheets.push({
      name,
      gid: match[2],
      regionKey: normalizeSheetName(name),
    });
    match = pattern.exec(html);
  }

  if (sheets.length === 0) {
    throw new Error('Não foi possível listar as abas da planilha.');
  }

  sheetListCache = {
    sheets,
    expiresAt: Date.now() + SHEET_LIST_CACHE_TTL_MS,
  };

  return sheets;
}

function resolveSheetMeta(
  sheets: SpreadsheetSheetMeta[],
  tab: LicitacaoRegiaoTab
): SpreadsheetSheetMeta | null {
  const targetKey = `REGIAO ${regionSuffixForTab(tab)}`;

  for (const sheet of sheets) {
    if (sheet.regionKey === targetKey) return sheet;
  }

  return null;
}

function normalizeHeader(label: string | null | undefined, index: number): string {
  const text = (label ?? '').trim();
  return text || `Coluna ${index + 1}`;
}

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isBlankCell(value: string): boolean {
  const text = value.trim();
  return !text || text === '-' || text === '?' || text === '—';
}

function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => isBlankCell(cell));
}

function isSkippableRow(row: string[]): boolean {
  const first = row[0]?.trim() ?? '';
  if (!first) return true;
  const key = normalizeHeaderKey(first);
  return key === 'item' || key === 'uf' || key === 'estado';
}

function trimEmptyColumns(headers: string[], rows: string[][]): { headers: string[]; rows: string[][] } {
  if (headers.length === 0) return { headers, rows };

  const lastNonEmpty = headers.reduce((max, header, index) => {
    const hasHeader = !isBlankCell(header) && !header.startsWith('Coluna ');
    const hasData = rows.some((row) => !isBlankCell(row[index] ?? ''));
    return hasHeader || hasData ? Math.max(max, index) : max;
  }, -1);

  if (lastNonEmpty < 0) return { headers: [], rows: [] };

  const trimmedHeaders = headers.slice(0, lastNonEmpty + 1);
  const trimmedRows = rows.map((row) => row.slice(0, lastNonEmpty + 1));
  return { headers: trimmedHeaders, rows: trimmedRows };
}

function getProcessedSheetRows(table: GvizTable): { headers: string[]; rows: string[][] } {
  const rawHeaders = (table.cols ?? []).map((col, index) => normalizeHeader(col.label, index));
  const parsedRows = (table.rows ?? []).map((row) =>
    (row.c ?? []).map((cell) => formatCell(cell ?? undefined))
  );

  const width = Math.max(rawHeaders.length, ...parsedRows.map((row) => row.length), 0);
  const headers = Array.from({ length: width }, (_, index) => rawHeaders[index] ?? `Coluna ${index + 1}`);
  const normalizedRows = parsedRows
    .map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))
    .filter((row) => !isSkippableRow(row));

  const { headers: trimmedHeaders, rows: trimmedRows } = trimEmptyColumns(headers, normalizedRows);

  return {
    headers: trimmedHeaders,
    rows: trimmedRows.filter((row) => !isEmptyRow(row)),
  };
}

function isLikelyWrongRegionFallback(headers: string[], rows: string[][]): boolean {
  const stateHeader = normalizeHeaderKey(headers[1] ?? '');
  if (stateHeader === 'estado') return false;
  if (stateHeader !== 'uf') return false;

  const states = new Set(
    rows
      .map((row) => (row[1] ?? '').trim().toUpperCase())
      .filter((uf) => /^[A-Z]{2}$/.test(uf))
  );

  return states.size >= 4;
}

export function listLicitacoesRegiaoTabs(): LicitacaoRegiaoTab[] {
  return LICITACOES_REGIAO_TABS;
}

export function findLicitacaoRegiaoTab(regiaoKey: string): LicitacaoRegiaoTab | undefined {
  const normalized = regiaoKey.trim().toLowerCase();
  return LICITACOES_REGIAO_TABS.find((tab) => tab.key === normalized);
}

export function invalidateLicitacaoRegiaoSheetCache(regiaoKey?: string): void {
  if (!regiaoKey) {
    emptySheetCache.clear();
    sheetListCache = null;
    return;
  }
  const tab = findLicitacaoRegiaoTab(regiaoKey);
  if (!tab) return;
  emptySheetCache.delete(`${spreadsheetId()}:${tab.key}`);
  sheetListCache = null;
}

async function loadAceitesSummary(
  regiaoKey: string,
  sheetId: string
): Promise<LicitacaoRegiaoAceiteSummary[]> {
  const aceiteRows = await listLicitacaoRegiaoAceites(regiaoKey, sheetId);
  return aceiteRows.map((aceite) => ({
    rowKey: aceite.rowKey,
    acceptedBy: aceite.acceptedBy,
    acceptedByName: aceite.acceptedByName,
    acceptedAt: aceite.acceptedAt.toISOString(),
  }));
}

async function fetchSheetWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json,text/csv,text/plain,*/*',
        'Cache-Control': 'no-cache, no-store',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
    } as RequestInit & { cache?: 'no-store' });

    if (response.ok) return response;

    lastError = new Error(`Falha ao consultar a planilha (${response.status}).`);

    if (response.status === 429 && attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      continue;
    }

    throw lastError;
  }

  throw lastError ?? new Error('Falha ao consultar a planilha.');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // ignore
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }

  return rows;
}

function getProcessedSheetRowsFromMatrix(matrix: string[][]): { headers: string[]; rows: string[][] } {
  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = matrix[0].map((header, index) => normalizeHeader(header, index));
  const parsedRows = matrix.slice(1).map((row) =>
    Array.from({ length: rawHeaders.length }, (_, index) => (row[index] ?? '').trim())
  );

  const normalizedRows = parsedRows.filter((row) => !isSkippableRow(row));
  const { headers: trimmedHeaders, rows: trimmedRows } = trimEmptyColumns(rawHeaders, normalizedRows);

  return {
    headers: trimmedHeaders,
    rows: trimmedRows.filter((row) => !isEmptyRow(row)),
  };
}

async function fetchSheetRowsFromCsv(gid: string): Promise<{ headers: string[]; rows: string[][] }> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId()}/export?format=csv&gid=${gid}&_=${Date.now()}`;
  const response = await fetchSheetWithRetry(url);
  const text = await response.text();
  if (!text.trim()) {
    throw new Error('Planilha retornou CSV vazio.');
  }
  return getProcessedSheetRowsFromMatrix(parseCsv(text));
}

async function fetchSheetRowsFromGviz(
  sheetMeta: SpreadsheetSheetMeta
): Promise<{ headers: string[]; rows: string[][] }> {
  const sheetParam = encodeURIComponent(sheetMeta.name);
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId()}/gviz/tq?tqx=out:json&headers=1&sheet=${sheetParam}&_=${Date.now()}`;
  const response = await fetchSheetWithRetry(url);
  const raw = await response.text();
  const payload = parseGvizPayload(raw);

  if (payload.status !== 'ok' || !payload.table) {
    throw new Error('Planilha retornou dados inválidos.');
  }

  return getProcessedSheetRows(payload.table);
}

async function fetchSheetRows(
  sheetMeta: SpreadsheetSheetMeta
): Promise<{ headers: string[]; rows: string[][]; syncSource: LicitacaoRegiaoSheetData['syncSource'] }> {
  const apiKey = googleSheetsApiKey();
  if (apiKey) {
    try {
      const processed = await fetchSheetRowsFromApi(sheetMeta.name, apiKey);
      return { ...processed, syncSource: 'google_sheets_api' };
    } catch (error) {
      console.warn(
        `Licitações: falha ao ler aba "${sheetMeta.name}" via Google Sheets API; usando exportação CSV.`,
        error instanceof Error ? error.message : error
      );
    }
  }

  try {
    const processed = await fetchSheetRowsFromCsv(sheetMeta.gid);
    return { ...processed, syncSource: 'csv_export' };
  } catch {
    const processed = await fetchSheetRowsFromGviz(sheetMeta);
    return { ...processed, syncSource: 'gviz' };
  }
}

export async function fetchLicitacaoRegiaoSheet(
  regiaoKey: string,
  forceRefresh = false
): Promise<LicitacaoRegiaoSheetData> {
  const tab = findLicitacaoRegiaoTab(regiaoKey);
  if (!tab) {
    throw new Error('Região não encontrada.');
  }

  const cacheKey = `${spreadsheetId()}:${tab.key}`;
  if (forceRefresh) {
    emptySheetCache.delete(cacheKey);
    sheetListCache = null;
  }

  const spreadsheetSheets = await fetchSpreadsheetSheets(forceRefresh);
  const sheetMeta = resolveSheetMeta(spreadsheetSheets, tab);
  if (!sheetMeta) {
    const cachedEmpty = emptySheetCache.get(cacheKey);
    if (!forceRefresh && cachedEmpty && cachedEmpty.expiresAt > Date.now()) {
      const aceites = await loadAceitesSummary(tab.key, cachedEmpty.data.spreadsheetId);
      const withRetained = await mergeRetainedSheetRows(tab, {
        ...cachedEmpty.data,
        aceites,
        fetchedAt: new Date().toISOString(),
      });
      return mergeManualRowsIntoSheet(tab, withRetained);
    }

    const empty = buildEmptySheetData(tab);
    emptySheetCache.set(cacheKey, {
      data: empty,
      expiresAt: Date.now() + SHEET_LIST_CACHE_TTL_MS,
    });
    const aceites = await loadAceitesSummary(tab.key, empty.spreadsheetId);
    const withRetained = await mergeRetainedSheetRows(tab, { ...empty, aceites });
    return mergeManualRowsIntoSheet(tab, withRetained);
  }

  const processed = await fetchSheetRows(sheetMeta);
  if (isLikelyWrongRegionFallback(processed.headers, processed.rows)) {
    throw new Error(`A aba ${tab.sheetName} retornou dados inconsistentes.`);
  }

  const sheetId = spreadsheetId();
  const rowKeys = processed.rows.map((row) =>
    buildLicitacaoRegiaoRowKey(tab.key, sheetId, row)
  );
  const aceites = await loadAceitesSummary(tab.key, sheetId);

  const withRetained = await mergeRetainedSheetRows(tab, {
    tab,
    spreadsheetId: sheetId,
    headers: processed.headers,
    rows: processed.rows,
    rowKeys,
    manualRowKeys: [],
    aceites,
    rowCount: processed.rows.length,
    sheetAvailable: true,
    fetchedAt: new Date().toISOString(),
    syncSource: processed.syncSource,
  });

  return mergeManualRowsIntoSheet(tab, withRetained);
}

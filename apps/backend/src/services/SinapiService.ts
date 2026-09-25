import { createError } from '../middleware/errorHandler';

/**
 * Proxy do catálogo SINAPI (insumos e composições oficiais Caixa/IBGE).
 *
 * A SINPRES só publica alguns meses recentes. Para o restante da série
 * (janeiro/2025 em diante no seletor), consultamos a API pública AutoSINAPI
 * quando a SINPRES não tem aquela referência.
 *
 * Passamos pelo backend por dois motivos: o rate-limit anônimo é compartilhado
 * entre todos os usuários se cada navegador chamasse direto, e o catálogo é
 * praticamente imutável dentro de um mês de referência — o cache em memória
 * elimina quase todas as chamadas externas.
 */
const SINPRES_BASE_URL = process.env.SINPRES_API_URL || 'https://api.sinpres.com.br/api/v1';
const AUTOSINAPI_BASE_URL =
  process.env.AUTOSINAPI_API_URL || 'https://autosinapi.mundoaec.com';
/** Primeiro mês que o seletor da Tabela SINAPI deve oferecer. */
const SINAPI_HISTORY_START = '2025-01';
const SECTOR_SLUG = 'civil-construction';

const METADATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LIST_CACHE_TTL_MS = 30 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const MAX_LIMIT = 100;
const MAX_EXPAND_DEPTH = 8;

type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

const cache = new Map<string, CacheEntry>();

/** Evita crescimento indefinido do cache em instâncias de longa duração. */
const MAX_CACHE_ENTRIES = 600;

function readCache(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function writeCache(key: string, data: unknown, ttlMs: number): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function currentYearMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return `${year}-${month}`;
}

/** Meses AAAA-MM de `start` até `end`, inclusive, em ordem crescente. */
export function listYearMonths(start: string, end: string): string[] {
  const match = /^(\d{4})-(\d{2})$/;
  const startParts = start.match(match);
  const endParts = end.match(match);
  if (!startParts || !endParts) return [];

  let year = Number(startParts[1]);
  let month = Number(startParts[2]);
  const endYear = Number(endParts[1]);
  const endMonth = Number(endParts[2]);
  if (!year || !month || month < 1 || month > 12) return [];

  const months: string[] = [];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function reaisToCents(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function isAppError(error: unknown): error is { statusCode?: number; message: string } {
  return error != null && typeof error === 'object' && 'message' in error;
}

async function fetchSinpres<T>(path: string, ttlMs: number): Promise<T> {
  const cached = readCache(path);
  if (cached !== undefined) return cached as T;

  let response: Response;
  try {
    response = await fetch(`${SINPRES_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' }
    });
  } catch {
    throw createError('Não foi possível consultar a base SINAPI no momento', 502);
  }

  if (response.status === 404) {
    throw createError('Código não encontrado na base SINAPI', 404);
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw createError(
      `Limite de consultas à base SINAPI atingido. Tente novamente em ${retryAfter || 60}s`,
      429
    );
  }

  if (!response.ok) {
    throw createError('Não foi possível consultar a base SINAPI no momento', 502);
  }

  const payload = (await response.json()) as { data?: T };
  const data = payload?.data;
  if (data === undefined || data === null) {
    throw createError('Resposta inesperada da base SINAPI', 502);
  }

  writeCache(path, data, ttlMs);
  return data;
}

export type SinapiListMeta = {
  total: number | null;
  page: number;
  limit: number;
  totalPages: number | null;
  hasNextPage: boolean;
};

/** Igual a fetchSinpres, mas preserva o `meta` de paginação. */
async function fetchSinpresList<T>(
  path: string,
  ttlMs: number
): Promise<{ data: T[]; meta: SinapiListMeta }> {
  const cacheKey = `list:${path}`;
  const cached = readCache(cacheKey);
  if (cached !== undefined) return cached as { data: T[]; meta: SinapiListMeta };

  let response: Response;
  try {
    response = await fetch(`${SINPRES_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' }
    });
  } catch {
    throw createError('Não foi possível consultar a base SINAPI no momento', 502);
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw createError(
      `Limite de consultas à base SINAPI atingido. Tente novamente em ${retryAfter || 60}s`,
      429
    );
  }

  if (!response.ok) {
    throw createError('Não foi possível consultar a base SINAPI no momento', 502);
  }

  const payload = (await response.json()) as {
    data?: T[];
    meta?: Partial<SinapiListMeta>;
  };

  const result = {
    data: Array.isArray(payload?.data) ? payload.data : [],
    meta: {
      total: payload?.meta?.total ?? null,
      page: payload?.meta?.page ?? 1,
      limit: payload?.meta?.limit ?? MAX_LIMIT,
      totalPages: payload?.meta?.totalPages ?? null,
      hasNextPage: payload?.meta?.hasNextPage ?? false
    }
  };

  writeCache(cacheKey, result, ttlMs);
  return result;
}

type AutoSinapiSearchItem = {
  codigo?: number;
  descricao?: string;
  unidade?: string;
  tipo?: string;
  valor?: number | null;
  custo_total?: number | null;
  preco_mediano?: number | null;
  classificacao?: string | null;
};

type AutoSinapiBomItem = {
  item_codigo?: number;
  tipo_item?: string;
  nivel?: number;
  descricao?: string;
  unidade?: string;
  coeficiente_total?: number;
  custo_unitario?: number | null;
  custo_impacto_total?: number | null;
};

type AutoSinapiSearchResponse = {
  items?: AutoSinapiSearchItem[];
  total?: number;
};

function autoSinapiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = process.env.AUTOSINAPI_API_KEY?.trim();
  if (apiKey) headers['X-API-KEY'] = apiKey;
  return headers;
}

function autoSinapiRegime(isDesonerated: boolean): string {
  return isDesonerated ? 'DESONERADO' : 'NAO_DESONERADO';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptySearchResult(page: number, limit: number): {
  data: [];
  meta: SinapiListMeta;
} {
  return {
    data: [],
    meta: {
      total: 0,
      page,
      limit,
      totalPages: 0,
      hasNextPage: false
    }
  };
}

async function fetchAutoSinapi<T>(path: string, ttlMs: number, attempt = 0): Promise<T> {
  const cacheKey = `autosinapi:${path}`;
  const cached = readCache(cacheKey);
  if (cached !== undefined) return cached as T;

  let response: Response;
  try {
    response = await fetch(`${AUTOSINAPI_BASE_URL}${path}`, {
      headers: autoSinapiHeaders()
    });
  } catch {
    throw createError('Não foi possível consultar a base SINAPI no momento', 502);
  }

  if (response.status === 404) {
    throw createError('Código não encontrado na base SINAPI', 404);
  }

  if (response.status === 429 && attempt < 2) {
    const retryAfter = Number.parseInt(response.headers.get('Retry-After') || '', 10);
    const waitMs = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter, 1), 15) * 1000 : 4000;
    await sleep(waitMs);
    return fetchAutoSinapi<T>(path, ttlMs, attempt + 1);
  }

  if (response.status === 429) {
    throw createError(
      'Limite de consultas à base SINAPI atingido. Tente novamente em instantes',
      429
    );
  }

  if (!response.ok) {
    throw createError('Não foi possível consultar a base SINAPI no momento', 502);
  }

  const data = (await response.json()) as T;
  writeCache(cacheKey, data, ttlMs);
  return data;
}

async function getSinpresMonths(): Promise<string[]> {
  try {
    const months = await fetchSinpres<string[]>('/sinapi/reference-months', METADATA_CACHE_TTL_MS);
    return Array.isArray(months) ? months : [];
  } catch {
    return [];
  }
}

async function getAutoSinapiMonths(): Promise<string[]> {
  try {
    const filters = await fetchAutoSinapi<{ datas?: string[] }>(
      '/api/v1/public/filters',
      METADATA_CACHE_TTL_MS
    );
    return Array.isArray(filters?.datas) ? filters.datas : [];
  } catch {
    return [];
  }
}

function mapAutoSinapiComposition(
  item: AutoSinapiSearchItem,
  params: { state: string | null; month: string | null; isDesonerated: boolean }
): SinapiComposition {
  const code = Number(item.codigo ?? 0);
  return {
    id: code,
    code,
    description: String(item.descricao ?? ''),
    unit: String(item.unidade ?? ''),
    stateCode: params.state,
    referenceMonth: params.month,
    isDesonerated: params.isDesonerated,
    baseUnitCost: reaisToCents(item.valor ?? item.custo_total)
  };
}

function mapAutoSinapiItem(
  item: AutoSinapiSearchItem,
  params: { state: string | null; month: string | null; isDesonerated: boolean }
): SinapiItem {
  const code = Number(item.codigo ?? 0);
  return {
    id: code,
    code,
    description: String(item.descricao ?? ''),
    unit: String(item.unidade ?? ''),
    stateCode: params.state,
    referenceMonth: params.month,
    isDesonerated: params.isDesonerated,
    unitPrice: reaisToCents(item.valor ?? item.preco_mediano)
  };
}

function autoSinapiItemType(tipo: string | undefined): 'INPUT' | 'SUB_COMPOSITION' {
  const raw = String(tipo ?? '').toUpperCase();
  if (/COMPOSI/.test(raw) || raw === 'SUB_COMPOSITION' || raw === 'SERVICO') {
    return 'SUB_COMPOSITION';
  }
  return 'INPUT';
}

function mapAutoSinapiBomToItems(bom: AutoSinapiBomItem[]): SinapiCompositionItem[] {
  const rows = Array.isArray(bom) ? bom : [];
  const firstLevel = rows.filter((item) => Number(item.nivel ?? 1) === 1);
  const source = firstLevel.length ? firstLevel : rows;
  return source
    .map((item) => ({
      itemType: autoSinapiItemType(item.tipo_item),
      code: Number(item.item_codigo ?? 0),
      description: String(item.descricao ?? ''),
      unit: String(item.unidade ?? ''),
      resourceType: item.tipo_item ? String(item.tipo_item) : null,
      coefficient: String(item.coeficiente_total ?? ''),
      unitPrice: reaisToCents(item.custo_unitario),
      totalPrice: reaisToCents(item.custo_impacto_total)
    }))
    .filter((item) => item.code > 0 || item.description);
}

function autoSinapiContextQuery(params: {
  state: string;
  month: string;
  isDesonerated: boolean;
}): string {
  const query = new URLSearchParams();
  query.set('uf', params.state);
  query.set('data_referencia', params.month);
  query.set('regime', autoSinapiRegime(params.isDesonerated));
  return query.toString();
}

async function fetchAutoSinapiBom(
  code: string,
  params: { state: string; month: string; isDesonerated: boolean }
): Promise<SinapiCompositionItem[]> {
  const bom = await fetchAutoSinapi<AutoSinapiBomItem[]>(
    `/api/v1/public/bi/composicao/${code}/bom?${autoSinapiContextQuery(params)}`,
    DETAIL_CACHE_TTL_MS
  );
  return mapAutoSinapiBomToItems(Array.isArray(bom) ? bom : []);
}

async function searchAutoSinapi(
  tipo: 'composicao' | 'insumo',
  params: SinapiSearchParams
): Promise<{ data: Array<SinapiComposition | SinapiItem>; meta: SinapiListMeta }> {
  const state = parseState(params.state) || 'SP';
  const month = parseMonth(params.month) || currentYearMonth();
  const isDesonerated = parseBoolean(params.isDesonerated);
  const page = parsePositiveInt(params.page, 1);
  const limit = parsePositiveInt(params.limit, 50, MAX_LIMIT);
  const unit = String(params.unit ?? '').trim().toUpperCase();
  const search = String(params.search ?? '').trim();
  const queryTerm = search || 'a';

  const query = new URLSearchParams();
  query.set('q', queryTerm);
  query.set('uf', state);
  query.set('data_referencia', month);
  query.set('regime', autoSinapiRegime(isDesonerated));
  query.set('tipo', tipo);
  query.set('sort', search ? 'relevance' : 'name');
  query.set('skip', String((page - 1) * limit));
  query.set('limit', String(limit));

  const payload = await fetchAutoSinapi<AutoSinapiSearchResponse>(
    `/api/v1/public/search?${query.toString()}`,
    LIST_CACHE_TTL_MS
  );

  const context = { state, month, isDesonerated };
  let rows = (payload.items ?? []).map((item) =>
    tipo === 'composicao'
      ? mapAutoSinapiComposition(item, context)
      : mapAutoSinapiItem(item, context)
  );

  if (unit) {
    rows = rows.filter((row) => row.unit.toUpperCase() === unit);
  }

  const total = payload.total ?? rows.length;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    data: rows,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages
    }
  };
}

export type SinapiSearchParams = {
  search?: unknown;
  unit?: unknown;
  state?: unknown;
  month?: unknown;
  isDesonerated?: unknown;
  page?: unknown;
  limit?: unknown;
};

export type SinapiPriceContext = {
  state?: unknown;
  month?: unknown;
  isDesonerated?: unknown;
};

function parseState(value: unknown): string | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  if (!/^[A-Z]{2}$/.test(raw)) throw createError('UF inválida', 400);
  return raw;
}

function parseMonth(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) throw createError('Mês de referência inválido (use AAAA-MM)', 400);
  return raw;
}

function parseBoolean(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

function buildSearchQuery(params: SinapiSearchParams): string {
  const query = new URLSearchParams();

  const search = String(params.search ?? '').trim();
  if (search) query.set('search', search);

  const unit = String(params.unit ?? '').trim().toUpperCase();
  if (unit) query.set('unit', unit);

  const state = parseState(params.state);
  if (state) {
    query.set('state', state);
    const month = parseMonth(params.month);
    if (month) query.set('month', month);
  }

  query.set('is_desonerated', String(parseBoolean(params.isDesonerated)));
  query.set('page', String(parsePositiveInt(params.page, 1)));
  query.set('limit', String(parsePositiveInt(params.limit, 50, MAX_LIMIT)));

  return query.toString();
}

function buildPriceQuery(params: SinapiPriceContext): string {
  const query = new URLSearchParams();
  const state = parseState(params.state);
  if (state) {
    query.set('state', state);
    const month = parseMonth(params.month);
    if (month) query.set('month', month);
  }
  query.set('is_desonerated', String(parseBoolean(params.isDesonerated)));
  return query.toString();
}

export type SinapiItem = {
  id: number;
  code: number;
  description: string;
  unit: string;
  stateCode: string | null;
  referenceMonth: string | null;
  isDesonerated: boolean;
  unitPrice: number | null;
  technicalStandards?: string | null;
  generalInfo?: string | null;
  imageUrl?: string | null;
  sourceUpdatedAt?: string | null;
  previousCode?: number | null;
};

export type SinapiComposition = {
  id: number;
  code: number;
  description: string;
  unit: string;
  stateCode: string | null;
  referenceMonth: string | null;
  isDesonerated: boolean;
  baseUnitCost: number | null;
  sourceUpdatedAt?: string | null;
  previousCode?: number | null;
  items?: SinapiCompositionItem[];
};

export type SinapiCompositionItem = {
  itemType: 'INPUT' | 'SUB_COMPOSITION';
  code: number;
  description: string;
  unit: string;
  resourceType: string | null;
  coefficient: string;
  unitPrice: number | null;
  totalPrice: number | null;
};

export type SinapiExpandedNode = {
  code: string;
  description: string;
  unit: string;
  depth: number;
  coefficient: string | null;
  item_type: 'COMPOSITION' | 'SUB_COMPOSITION' | 'INPUT';
  unit_price: number | null;
  items: SinapiExpandedNode[];
  truncated?: boolean;
};

/** UFs, meses de referência e unidades de medida disponíveis — alimenta os filtros da tela. */
export async function getSinapiMetadata(): Promise<{
  states: string[];
  months: string[];
  units: string[];
  defaultMonth: string | null;
}> {
  const [states, sinpresMonths, autoSinapiMonths, units] = await Promise.all([
    fetchSinpres<string[]>('/sinapi/states', METADATA_CACHE_TTL_MS).catch(() => [] as string[]),
    getSinpresMonths(),
    getAutoSinapiMonths(),
    fetchSinpres<string[]>(`/sectors/${SECTOR_SLUG}/units`, METADATA_CACHE_TTL_MS).catch(
      () => [] as string[]
    )
  ]);

  const months = listYearMonths(SINAPI_HISTORY_START, currentYearMonth()).sort((a, b) =>
    b.localeCompare(a)
  );

  const availableWithData = [...sinpresMonths, ...autoSinapiMonths]
    .filter((month) => /^\d{4}-\d{2}$/.test(month))
    .sort((a, b) => b.localeCompare(a));

  return {
    states: (states.length ? states : [
      'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
      'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
    ]).sort(),
    months,
    units: [...units].sort(),
    defaultMonth: availableWithData[0] || months[0] || null
  };
}

async function monthHasSinpresData(month: string | null): Promise<boolean> {
  if (!month) return true;
  const months = await getSinpresMonths();
  return months.includes(month);
}

async function monthHasAutoSinapiData(month: string | null): Promise<boolean> {
  if (!month) return false;
  const months = await getAutoSinapiMonths();
  return months.includes(month);
}

export async function searchSinapiCompositions(params: SinapiSearchParams) {
  const month = parseMonth(params.month);
  if (await monthHasSinpresData(month)) {
    return fetchSinpresList<SinapiComposition>(
      `/sectors/${SECTOR_SLUG}/compositions?${buildSearchQuery(params)}`,
      LIST_CACHE_TTL_MS
    );
  }

  if (!(await monthHasAutoSinapiData(month))) {
    return emptySearchResult(
      parsePositiveInt(params.page, 1),
      parsePositiveInt(params.limit, 50, MAX_LIMIT)
    );
  }

  return searchAutoSinapi('composicao', params) as Promise<{
    data: SinapiComposition[];
    meta: SinapiListMeta;
  }>;
}

export async function searchSinapiItems(params: SinapiSearchParams) {
  const month = parseMonth(params.month);
  if (await monthHasSinpresData(month)) {
    return fetchSinpresList<SinapiItem>(
      `/sectors/${SECTOR_SLUG}/items?${buildSearchQuery(params)}`,
      LIST_CACHE_TTL_MS
    );
  }

  if (!(await monthHasAutoSinapiData(month))) {
    return emptySearchResult(
      parsePositiveInt(params.page, 1),
      parsePositiveInt(params.limit, 50, MAX_LIMIT)
    );
  }

  return searchAutoSinapi('insumo', params) as Promise<{
    data: SinapiItem[];
    meta: SinapiListMeta;
  }>;
}

function parseCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) throw createError('Código SINAPI inválido', 400);
  return raw;
}

async function getAutoSinapiComposition(
  safeCode: string,
  params: SinapiPriceContext
): Promise<SinapiComposition> {
  const month = parseMonth(params.month);
  if (month && !(await monthHasAutoSinapiData(month))) {
    throw createError('Código não encontrado na base SINAPI', 404);
  }

  const state = parseState(params.state) || 'SP';
  const isDesonerated = parseBoolean(params.isDesonerated);
  const refMonth = month || currentYearMonth();
  const ctx = { state, month: refMonth, isDesonerated };
  const detail = await fetchAutoSinapi<{
    codigo?: number;
    descricao?: string;
    unidade?: string;
    custo_total?: number | null;
  }>(
    `/api/v1/public/composicoes/${safeCode}?${autoSinapiContextQuery(ctx)}`,
    DETAIL_CACHE_TTL_MS
  );

  const mapped = mapAutoSinapiComposition(detail, {
    state,
    month: refMonth,
    isDesonerated
  });

  try {
    const items = await fetchAutoSinapiBom(safeCode, ctx);
    if (items.length) mapped.items = items;
  } catch {
    // BOM é endpoint de BI; cabeçalho sozinho ainda serve para identificar a composição.
  }

  return mapped;
}

/** Composição com o analítico de primeiro nível (insumos e subcomposições com coeficiente). */
export async function getSinapiComposition(code: unknown, params: SinapiPriceContext) {
  const safeCode = parseCode(code);
  const month = parseMonth(params.month);
  const query = buildPriceQuery(params);

  if (await monthHasSinpresData(month)) {
    try {
      return await fetchSinpres<SinapiComposition>(
        `/sectors/${SECTOR_SLUG}/compositions/${safeCode}?${query}`,
        DETAIL_CACHE_TTL_MS
      );
    } catch (error) {
      if (!(isAppError(error) && error.statusCode === 404)) throw error;
    }
  }

  return getAutoSinapiComposition(safeCode, params);
}

/** Árvore recursiva da composição (subcomposições abertas até `maxDepth`). */
export async function getSinapiCompositionTree(
  code: unknown,
  params: SinapiPriceContext & { maxDepth?: unknown }
) {
  const safeCode = parseCode(code);
  const query = new URLSearchParams(buildPriceQuery(params));
  query.set('max_depth', String(parsePositiveInt(params.maxDepth, 5, MAX_EXPAND_DEPTH)));

  try {
    return await fetchSinpres<SinapiExpandedNode>(
      `/sectors/${SECTOR_SLUG}/compositions/${safeCode}/expanded?${query.toString()}`,
      DETAIL_CACHE_TTL_MS
    );
  } catch (error) {
    if (!(isAppError(error) && (error.statusCode === 404 || error.statusCode === 502))) {
      throw error;
    }
  }

  const composition = await getAutoSinapiComposition(safeCode, params);
  if (!composition.items?.length) {
    throw createError('Analítico não disponível para este mês de referência', 404);
  }

  return {
    code: String(composition.code),
    description: composition.description,
    unit: composition.unit,
    depth: 0,
    coefficient: null,
    item_type: 'COMPOSITION' as const,
    unit_price: composition.baseUnitCost,
    items: composition.items.map((item) => ({
      code: String(item.code),
      description: item.description,
      unit: item.unit,
      depth: 1,
      coefficient: item.coefficient,
      item_type: item.itemType === 'SUB_COMPOSITION' ? 'SUB_COMPOSITION' : 'INPUT',
      unit_price: item.unitPrice,
      items: [] as SinapiExpandedNode[]
    }))
  } satisfies SinapiExpandedNode;
}

export async function getSinapiItem(code: unknown, params: SinapiPriceContext) {
  const safeCode = parseCode(code);
  const month = parseMonth(params.month);
  const query = buildPriceQuery(params);

  if (await monthHasSinpresData(month)) {
    return fetchSinpres<SinapiItem>(
      `/sectors/${SECTOR_SLUG}/items/${safeCode}?${query}`,
      DETAIL_CACHE_TTL_MS
    );
  }

  if (!(await monthHasAutoSinapiData(month))) {
    throw createError('Código não encontrado na base SINAPI', 404);
  }

  const state = parseState(params.state) || 'SP';
  const isDesonerated = parseBoolean(params.isDesonerated);
  const detail = await fetchAutoSinapi<{
    codigo?: number;
    descricao?: string;
    unidade?: string;
    preco_mediano?: number | null;
  }>(
    `/api/v1/public/insumos/${safeCode}?uf=${encodeURIComponent(state)}&data_referencia=${encodeURIComponent(month || currentYearMonth())}&regime=${autoSinapiRegime(isDesonerated)}`,
    DETAIL_CACHE_TTL_MS
  );

  return mapAutoSinapiItem(detail, { state, month, isDesonerated });
}

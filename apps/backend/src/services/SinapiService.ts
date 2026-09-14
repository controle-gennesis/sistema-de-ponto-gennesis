import { createError } from '../middleware/errorHandler';

/**
 * Proxy da SINPRES API (https://api.sinpres.com.br) — catálogo SINAPI de insumos e
 * composições extraído das fontes oficiais da Caixa/IBGE.
 *
 * Passamos pelo backend por dois motivos: o rate-limit anônimo é de 100 req/min por IP
 * (compartilhado entre todos os usuários se cada navegador chamasse direto) e o catálogo
 * é praticamente imutável dentro de um mês de referência, então o cache em memória
 * elimina quase todas as chamadas externas.
 */
const SINPRES_BASE_URL = process.env.SINPRES_API_URL || 'https://api.sinpres.com.br/api/v1';
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
}> {
  const [states, months, units] = await Promise.all([
    fetchSinpres<string[]>('/sinapi/states', METADATA_CACHE_TTL_MS),
    fetchSinpres<string[]>('/sinapi/reference-months', METADATA_CACHE_TTL_MS),
    fetchSinpres<string[]>(`/sectors/${SECTOR_SLUG}/units`, METADATA_CACHE_TTL_MS)
  ]);

  return {
    states: [...states].sort(),
    months: [...months].sort((a, b) => b.localeCompare(a)),
    units: [...units].sort()
  };
}

export async function searchSinapiCompositions(params: SinapiSearchParams) {
  const query = buildSearchQuery(params);
  return fetchSinpresList<SinapiComposition>(
    `/sectors/${SECTOR_SLUG}/compositions?${query}`,
    LIST_CACHE_TTL_MS
  );
}

export async function searchSinapiItems(params: SinapiSearchParams) {
  const query = buildSearchQuery(params);
  return fetchSinpresList<SinapiItem>(
    `/sectors/${SECTOR_SLUG}/items?${query}`,
    LIST_CACHE_TTL_MS
  );
}

function parseCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) throw createError('Código SINAPI inválido', 400);
  return raw;
}

/** Composição com o analítico de primeiro nível (insumos e subcomposições com coeficiente). */
export async function getSinapiComposition(code: unknown, params: SinapiPriceContext) {
  const safeCode = parseCode(code);
  const query = buildPriceQuery(params);
  return fetchSinpres<SinapiComposition>(
    `/sectors/${SECTOR_SLUG}/compositions/${safeCode}?${query}`,
    DETAIL_CACHE_TTL_MS
  );
}

/** Árvore recursiva da composição (subcomposições abertas até `maxDepth`). */
export async function getSinapiCompositionTree(
  code: unknown,
  params: SinapiPriceContext & { maxDepth?: unknown }
) {
  const safeCode = parseCode(code);
  const query = new URLSearchParams(buildPriceQuery(params));
  query.set('max_depth', String(parsePositiveInt(params.maxDepth, 5, MAX_EXPAND_DEPTH)));

  return fetchSinpres<SinapiExpandedNode>(
    `/sectors/${SECTOR_SLUG}/compositions/${safeCode}/expanded?${query.toString()}`,
    DETAIL_CACHE_TTL_MS
  );
}

export async function getSinapiItem(code: unknown, params: SinapiPriceContext) {
  const safeCode = parseCode(code);
  const query = buildPriceQuery(params);
  return fetchSinpres<SinapiItem>(
    `/sectors/${SECTOR_SLUG}/items/${safeCode}?${query}`,
    DETAIL_CACHE_TTL_MS
  );
}

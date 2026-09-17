import api from '@/lib/api';

/** Mesmo staleTime do Fluig / Orçafascio select (~7 min). */
export const ORCAMENTO_DETAIL_STALE_MS = 7 * 60 * 1000;

export type OrcamentoDetailPayload = {
  servicos: unknown[];
  imports: unknown[];
  sessaoOrcamento: unknown | null;
  fetchedAt: number;
};

type Bucket = {
  payload: OrcamentoDetailPayload | null;
  inflight: Promise<OrcamentoDetailPayload | null> | null;
};

const buckets = new Map<string, Bucket>();

function cacheKey(centroCustoId: string, orcamentoId: string): string {
  return `${centroCustoId}::${orcamentoId}`;
}

function getBucket(centroCustoId: string, orcamentoId: string): Bucket {
  const key = cacheKey(centroCustoId, orcamentoId);
  let b = buckets.get(key);
  if (!b) {
    b = { payload: null, inflight: null };
    buckets.set(key, b);
  }
  return b;
}

export function peekOrcamentoDetailCache(
  centroCustoId: string,
  orcamentoId: string
): OrcamentoDetailPayload | null {
  const bucket = getBucket(centroCustoId, orcamentoId);
  if (!bucket.payload) return null;
  if (Date.now() - bucket.payload.fetchedAt >= ORCAMENTO_DETAIL_STALE_MS) return null;
  return bucket.payload;
}

export function seedOrcamentoDetailCache(
  centroCustoId: string,
  orcamentoId: string,
  data: {
    servicos?: unknown[];
    imports?: unknown[];
    sessaoOrcamento?: unknown | null;
  }
): void {
  const bucket = getBucket(centroCustoId, orcamentoId);
  bucket.payload = {
    servicos: Array.isArray(data.servicos) ? data.servicos : [],
    imports: Array.isArray(data.imports) ? data.imports : [],
    sessaoOrcamento: data.sessaoOrcamento ?? null,
    fetchedAt: Date.now(),
  };
}

export function invalidateOrcamentoDetailCache(
  centroCustoId: string,
  orcamentoId?: string
): void {
  if (orcamentoId) {
    buckets.delete(cacheKey(centroCustoId, orcamentoId));
    return;
  }
  const prefix = `${centroCustoId}::`;
  for (const key of buckets.keys()) {
    if (key.startsWith(prefix)) buckets.delete(key);
  }
}

async function fetchDetailFromApi(
  centroCustoId: string,
  orcamentoId: string
): Promise<OrcamentoDetailPayload | null> {
  try {
    const res = await api.get(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`, {
      timeout: 120000,
    });
    const d = res.data;
    if (!d || typeof d !== 'object') return null;
    return {
      servicos: Array.isArray(d.servicos) ? d.servicos : [],
      imports: Array.isArray(d.imports) ? d.imports : [],
      sessaoOrcamento: d.sessaoOrcamento ?? null,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function loadOrcamentoDetailCached(
  centroCustoId: string,
  orcamentoId: string,
  options?: { force?: boolean }
): Promise<OrcamentoDetailPayload | null> {
  const force = options?.force === true;
  const bucket = getBucket(centroCustoId, orcamentoId);
  const now = Date.now();

  if (!force && bucket.payload && now - bucket.payload.fetchedAt < ORCAMENTO_DETAIL_STALE_MS) {
    return bucket.payload;
  }
  if (!force && bucket.inflight) {
    return bucket.inflight;
  }

  const run = (async () => {
    const payload = await fetchDetailFromApi(centroCustoId, orcamentoId);
    if (payload) bucket.payload = payload;
    return payload;
  })();

  bucket.inflight = run;
  try {
    return await run;
  } finally {
    if (bucket.inflight === run) bucket.inflight = null;
  }
}

/** Prefetch em background (hover na lista / após listar). */
export function prefetchOrcamentoDetail(centroCustoId: string, orcamentoId: string): void {
  const bucket = getBucket(centroCustoId, orcamentoId);
  if (
    bucket.payload &&
    Date.now() - bucket.payload.fetchedAt < ORCAMENTO_DETAIL_STALE_MS
  ) {
    return;
  }
  if (bucket.inflight) return;
  void loadOrcamentoDetailCached(centroCustoId, orcamentoId).catch(() => {
    /* silencioso */
  });
}

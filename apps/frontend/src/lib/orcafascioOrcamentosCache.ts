import api from '@/lib/api';

/** Espelha o staleTime de 7 min do Fluig (react-query). */
export const ORCAFASCIO_ORCAMENTOS_STALE_MS = 7 * 60 * 1000;

export type OrcafascioOrcamentoListItem = {
  id: string;
  description?: string;
  code?: string;
  created_at?: string;
  updated_at?: string;
  department_id?: string;
  company_id?: string;
  [key: string]: unknown;
};

type OrcafascioOrcamentosApiResponse = {
  budgets: OrcafascioOrcamentoListItem[];
  total?: number;
  current_page?: number;
  per_page?: number;
};

export type OrcafascioOrcamentosCachePayload = {
  items: OrcafascioOrcamentoListItem[];
  total: number | null;
  fetchedAt: number;
  search: string;
  /** true enquanto ainda pagina o restante da lista. */
  incomplete?: boolean;
};

type CacheBucket = {
  payload: OrcafascioOrcamentosCachePayload | null;
  inflight: Promise<OrcafascioOrcamentosCachePayload> | null;
  partialListeners: Set<(partial: OrcafascioOrcamentosCachePayload) => void>;
};

const buckets = new Map<string, CacheBucket>();

function bucketKey(search: string): string {
  return search.trim().toLowerCase();
}

function getBucket(search: string): CacheBucket {
  const key = bucketKey(search);
  let b = buckets.get(key);
  if (!b) {
    b = { payload: null, inflight: null, partialListeners: new Set() };
    buckets.set(key, b);
  }
  return b;
}

function sortOrcamentos(items: OrcafascioOrcamentoListItem[]): OrcafascioOrcamentoListItem[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(String(a.updated_at || a.created_at || '')) || 0;
    const tb = Date.parse(String(b.updated_at || b.created_at || '')) || 0;
    if (tb !== ta) return tb - ta;
    return String(b.code || b.id || '').localeCompare(String(a.code || a.id || ''), 'pt-BR');
  });
}

function dedupeOrcamentos(items: OrcafascioOrcamentoListItem[]): OrcafascioOrcamentoListItem[] {
  const seen = new Set<string>();
  return items.filter((o) => {
    const id =
      String(
        (o as { _id?: unknown })._id ??
          (o as { budget_id?: unknown }).budget_id ??
          o.id ??
          ''
      ).trim() || '';
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function notifyPartial(bucket: CacheBucket, partial: OrcafascioOrcamentosCachePayload) {
  for (const listener of bucket.partialListeners) {
    try {
      listener(partial);
    } catch {
      /* ignore listener errors */
    }
  }
}

/**
 * Carrega a lista completa (paginando se preciso) e atualiza o cache do módulo.
 * `onPartial` é chamado assim que a 1ª página chega — e também se outro fetch
 * já estiver em voo (prefetch), para a UI não ficar com lista incompleta “cega”.
 */
export async function loadOrcafascioOrcamentosList(options?: {
  search?: string;
  force?: boolean;
  onPartial?: (partial: OrcafascioOrcamentosCachePayload) => void;
}): Promise<OrcafascioOrcamentosCachePayload> {
  const search = (options?.search ?? '').trim();
  const force = options?.force === true;
  const bucket = getBucket(search);
  const now = Date.now();
  const onPartial = options?.onPartial;

  if (onPartial) bucket.partialListeners.add(onPartial);

  const releaseListener = () => {
    if (onPartial) bucket.partialListeners.delete(onPartial);
  };

  try {
    if (
      !force &&
      bucket.payload &&
      !bucket.payload.incomplete &&
      now - bucket.payload.fetchedAt < ORCAFASCIO_ORCAMENTOS_STALE_MS
    ) {
      return bucket.payload;
    }

    // Já tem página parcial em cache (prefetch): entrega na hora ao novo assinante.
    if (!force && bucket.payload && onPartial) {
      onPartial(bucket.payload);
    }

    if (!force && bucket.inflight) {
      return await bucket.inflight;
    }

    const run = (async (): Promise<OrcafascioOrcamentosCachePayload> => {
      const all: OrcafascioOrcamentoListItem[] = [];
      let total: number | null = null;
      const q = search;

      const first = await api.get<OrcafascioOrcamentosApiResponse>('/orcafascio/orcamentos', {
        params: {
          page: 1,
          per_page: 500,
          ...(q ? { search: q } : {}),
        },
        timeout: 90000,
      });
      all.push(...(first.data.budgets ?? []));
      total = typeof first.data.total === 'number' ? first.data.total : null;

      const partialItems = sortOrcamentos(dedupeOrcamentos(all));
      const needsMore = total != null && partialItems.length < total && partialItems.length > 0;
      const partial: OrcafascioOrcamentosCachePayload = {
        items: partialItems,
        total: total ?? partialItems.length,
        fetchedAt: Date.now(),
        search,
        incomplete: needsMore,
      };
      bucket.payload = partial;
      notifyPartial(bucket, partial);

      const perPage = Math.max(1, first.data.per_page || all.length || 100);
      if (needsMore) {
        let page = 2;
        while (page <= 80 && all.length < (total ?? 0)) {
          const res = await api.get<OrcafascioOrcamentosApiResponse>('/orcafascio/orcamentos', {
            params: {
              page,
              per_page: Math.min(500, perPage),
              ...(q ? { search: q } : {}),
            },
            timeout: 60000,
          });
          const budgets = res.data.budgets ?? [];
          if (budgets.length === 0) break;
          all.push(...budgets);
          if (typeof res.data.total === 'number') total = res.data.total;
          const midItems = sortOrcamentos(dedupeOrcamentos(all));
          const mid: OrcafascioOrcamentosCachePayload = {
            items: midItems,
            total: total ?? midItems.length,
            fetchedAt: Date.now(),
            search,
            incomplete: total != null && midItems.length < total,
          };
          bucket.payload = mid;
          notifyPartial(bucket, mid);
          if (budgets.length < Math.min(500, perPage)) break;
          page += 1;
        }
      }

      const unique = sortOrcamentos(dedupeOrcamentos(all));
      const finalPayload: OrcafascioOrcamentosCachePayload = {
        items: unique,
        total: total ?? unique.length,
        fetchedAt: Date.now(),
        search,
        incomplete: false,
      };
      bucket.payload = finalPayload;
      notifyPartial(bucket, finalPayload);
      return finalPayload;
    })();

    bucket.inflight = run;
    try {
      return await run;
    } finally {
      if (bucket.inflight === run) bucket.inflight = null;
    }
  } finally {
    releaseListener();
  }
}

/** Lê cache fresco sem rede (para abrir o modal instantaneamente). */
export function peekOrcafascioOrcamentosCache(
  search = ''
): OrcafascioOrcamentosCachePayload | null {
  const bucket = getBucket(search);
  if (!bucket.payload) return null;
  if (Date.now() - bucket.payload.fetchedAt >= ORCAFASCIO_ORCAMENTOS_STALE_MS) return null;
  return bucket.payload;
}

/** true se ainda há fetch/paginação em andamento para essa busca. */
export function isOrcafascioOrcamentosListLoading(search = ''): boolean {
  return Boolean(getBucket(search).inflight);
}

/** Dispara fetch em background (prefetch ao entrar na página / hover). */
export function prefetchOrcafascioOrcamentosList(search = ''): void {
  const bucket = getBucket(search);
  if (
    bucket.payload &&
    !bucket.payload.incomplete &&
    Date.now() - bucket.payload.fetchedAt < ORCAFASCIO_ORCAMENTOS_STALE_MS
  ) {
    return;
  }
  if (bucket.inflight) return;
  void loadOrcafascioOrcamentosList({ search }).catch(() => {
    /* silencioso no prefetch */
  });
}

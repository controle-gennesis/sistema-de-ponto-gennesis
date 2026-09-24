import api from '@/lib/api';

/** Memória RAM: evita refetch no mesmo intervalo do Fluig / Orçafascio. */
export const ORCAMENTO_DETAIL_STALE_MS = 7 * 60 * 1000;

/** Disco: pinta na hora no F5; o GET confirma em background. */
const ORCAMENTO_DETAIL_DISK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const IDB_NAME = 'gennesis-orcamento-detail';
const IDB_STORE = 'details';
const IDB_VERSION = 1;

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

function isUsablePayload(raw: unknown): raw is OrcamentoDetailPayload {
  if (!raw || typeof raw !== 'object') return false;
  const row = raw as OrcamentoDetailPayload;
  return Array.isArray(row.servicos) && typeof row.fetchedAt === 'number';
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function idbGet(key: string): Promise<OrcamentoDetailPayload | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  const db = await openIdb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const row = req.result;
        resolve(isUsablePayload(row) ? row : null);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, payload: OrcamentoDetailPayload): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(payload, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('IndexedDB put failed'));
    });
  } finally {
    db.close();
  }
}

async function idbDeleteKeys(keys: string[]): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB || keys.length === 0) return;
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      for (const key of keys) store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
  } finally {
    db.close();
  }
}

function persistDetailToDisk(centroCustoId: string, orcamentoId: string, payload: OrcamentoDetailPayload): void {
  void idbSet(cacheKey(centroCustoId, orcamentoId), payload).catch(() => {
    /* quota / private mode */
  });
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
  persistDetailToDisk(centroCustoId, orcamentoId, bucket.payload);
}

export function invalidateOrcamentoDetailCache(
  centroCustoId: string,
  orcamentoId?: string
): void {
  if (orcamentoId) {
    const key = cacheKey(centroCustoId, orcamentoId);
    buckets.delete(key);
    void idbDeleteKeys([key]).catch(() => {
      /* ignore */
    });
    return;
  }
  const prefix = `${centroCustoId}::`;
  const keys: string[] = [];
  for (const key of buckets.keys()) {
    if (key.startsWith(prefix)) {
      keys.push(key);
      buckets.delete(key);
    }
  }
  void idbDeleteKeys(keys).catch(() => {
    /* ignore */
  });
}

/**
 * Lê o último detalhe gravado no aparelho (mesmo após F5).
 * Aceita dado “velho” de propósito — a tela pinta e o GET confirma.
 */
export async function hydrateOrcamentoDetailCache(
  centroCustoId: string,
  orcamentoId: string
): Promise<OrcamentoDetailPayload | null> {
  const mem = getBucket(centroCustoId, orcamentoId).payload;
  if (mem && Date.now() - mem.fetchedAt < ORCAMENTO_DETAIL_DISK_MAX_AGE_MS) {
    return mem;
  }
  try {
    const fromDisk = await idbGet(cacheKey(centroCustoId, orcamentoId));
    if (!fromDisk) return null;
    if (Date.now() - fromDisk.fetchedAt > ORCAMENTO_DETAIL_DISK_MAX_AGE_MS) return null;
    const bucket = getBucket(centroCustoId, orcamentoId);
    if (!bucket.payload) bucket.payload = fromDisk;
    return fromDisk;
  } catch {
    return null;
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

  if (!force && !bucket.payload) {
    const fromDisk = await hydrateOrcamentoDetailCache(centroCustoId, orcamentoId);
    if (fromDisk && now - fromDisk.fetchedAt < ORCAMENTO_DETAIL_STALE_MS) {
      return fromDisk;
    }
  }

  const run = (async () => {
    const payload = await fetchDetailFromApi(centroCustoId, orcamentoId);
    if (payload) {
      bucket.payload = payload;
      persistDetailToDisk(centroCustoId, orcamentoId, payload);
    }
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

/**
 * Gravação em localStorage/sessionStorage com recuperação de QuotaExceededError.
 * Rascunhos de orçamento (e outros caches grandes) são os principais culpados.
 */

const AUTH_KEYS = new Set(['token', 'user']);

const PREFERRED_KEEP_PREFIXES = ['theme', 'sidebar', 'unb-branding'];

export function isStorageQuotaError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) ||
    (err instanceof Error &&
      (err.name === 'QuotaExceededError' || /exceeded the quota/i.test(err.message)))
  );
}

function listLocalStorageKeys(): string[] {
  if (typeof window === 'undefined') return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) keys.push(k);
  }
  return keys;
}

function removeKeys(keys: string[]): void {
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** Nível 1–3: liberação progressiva; nível 4: remove as maiores chaves não essenciais. */
export function evictLocalStorageForQuota(level: 1 | 2 | 3 | 4): void {
  if (typeof window === 'undefined') return;
  const keys = listLocalStorageKeys();

  if (level >= 1) {
    removeKeys(keys.filter((k) => k.startsWith('orcamento-snapshots-')));
  }

  if (level >= 2) {
    removeKeys(keys.filter((k) => k.startsWith('orcamento-composicoes-')));
    for (const k of keys) {
      if (!k.startsWith('orcamento-imports-')) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const list = JSON.parse(raw) as unknown;
        if (Array.isArray(list) && list.length > 3) {
          localStorage.setItem(k, JSON.stringify(list.slice(0, 3)));
        }
      } catch {
        try {
          localStorage.removeItem(k);
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (level >= 3) {
    removeKeys(
      keys.filter(
        (k) =>
          k.startsWith('orcamento-sessao-') ||
          k.startsWith('orcamento-imports-') ||
          k.startsWith('orcamento-servicos-') ||
          (k.startsWith('orcamento-') && !AUTH_KEYS.has(k))
      )
    );
  }

  if (level >= 4) {
    const scored = keys
      .filter((k) => !AUTH_KEYS.has(k))
      .filter((k) => !PREFERRED_KEEP_PREFIXES.some((p) => k === p || k.startsWith(`${p}-`)))
      .map((k) => {
        let size = 0;
        try {
          size = (localStorage.getItem(k) ?? '').length;
        } catch {
          size = 0;
        }
        return { k, size };
      })
      .sort((a, b) => b.size - a.size);

    // Remove as maiores até ~ metade da lista (ou todas se forem poucas).
    const cut = Math.max(3, Math.ceil(scored.length / 2));
    removeKeys(scored.slice(0, cut).map((x) => x.k));
  }
}

/** setItem com retry após liberar espaço (localStorage ou sessionStorage). */
export function safeSetItem(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
    return;
  } catch (err) {
    if (!isStorageQuotaError(err)) throw err;
  }

  // sessionStorage cheio: limpa entradas grandes do próprio sessionStorage e tenta de novo.
  if (storage !== localStorage && typeof window !== 'undefined') {
    try {
      const sessKeys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k !== key && !AUTH_KEYS.has(k)) sessKeys.push(k);
      }
      for (const k of sessKeys) sessionStorage.removeItem(k);
      storage.setItem(key, value);
      return;
    } catch (err) {
      if (!isStorageQuotaError(err)) throw err;
    }
  }

  for (const level of [1, 2, 3, 4] as const) {
    evictLocalStorageForQuota(level);
    try {
      storage.setItem(key, value);
      return;
    } catch (err) {
      if (!isStorageQuotaError(err)) throw err;
    }
  }

  throw new Error(
    'Armazenamento do navegador cheio. Limpe o cache do site (localStorage) ou dados de orçamento locais e tente de novo.'
  );
}

import { normalizeContractOrderKey } from './gastosOperacionaisContractOrder';

const STORAGE_KEY = 'controle-geral-excluded-contracts';
const LEGACY_STORAGE_KEY = 'gastos-operacionais-excluded-contracts';

function toExcludedKey(contract: string): string {
  return normalizeContractOrderKey(contract);
}

function migrateLegacyExcludedContracts(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return new Set();

    const parsed = JSON.parse(legacyRaw) as unknown;
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);

    if (!Array.isArray(parsed)) return new Set();

    const migrated = new Set(
      parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
    );
    saveControleGeralExcludedContracts(migrated);
    return migrated;
  } catch {
    return new Set();
  }
}

export function loadControleGeralExcludedContracts(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateLegacyExcludedContracts();

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();

    return new Set(
      parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
    );
  } catch {
    return new Set();
  }
}

export function saveControleGeralExcludedContracts(excluded: Set<string>): void {
  if (typeof window === 'undefined') return;

  try {
    if (!excluded.size) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(excluded)));
  } catch {
    // ignore quota / private mode errors
  }
}

export function isContractExcludedFromControleGeralView(
  contract: string,
  excluded: Set<string>
): boolean {
  return excluded.has(toExcludedKey(contract));
}

export function addControleGeralExcludedContracts(
  contracts: readonly string[],
  excluded: Set<string>
): Set<string> {
  const next = new Set(excluded);
  let changed = false;

  for (const contract of contracts) {
    const key = toExcludedKey(contract);
    if (!next.has(key)) {
      next.add(key);
      changed = true;
    }
  }

  if (!changed) return excluded;
  saveControleGeralExcludedContracts(next);
  return next;
}

export function removeControleGeralExcludedContract(
  contract: string,
  excluded: Set<string>
): Set<string> {
  const key = toExcludedKey(contract);
  if (!excluded.has(key)) return excluded;
  const next = new Set(excluded);
  next.delete(key);
  saveControleGeralExcludedContracts(next);
  return next;
}

export function clearControleGeralExcludedContracts(): Set<string> {
  saveControleGeralExcludedContracts(new Set());
  return new Set();
}

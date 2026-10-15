import fs from 'fs';
import path from 'path';
import { normalizeGastosOperacionaisNaturezaKey } from '../constants/gastosOperacionaisDfcBlocks';

export type GastosNaturezaCustomMapping = {
  id: string;
  totvsLabel: string;
  blockId: string;
  targetCanonicalLabel: string;
  asAlias: boolean;
  sumAsPositiveCredit?: boolean;
  createdAt: string;
};

export type GastosNaturezaCustomBlock = {
  id: string;
  code: string;
  label: string;
  parentLabels: string[];
  createdAt: string;
};

export type GastosNaturezasConfigStore = {
  mappings: GastosNaturezaCustomMapping[];
  customBlocks: GastosNaturezaCustomBlock[];
  dismissedTotvsKeys: string[];
  acknowledgedTotvsKeys: string[];
  unlinkedConfiguredKeys: string[];
};

const EMPTY_STORE: GastosNaturezasConfigStore = {
  mappings: [],
  customBlocks: [],
  dismissedTotvsKeys: [],
  acknowledgedTotvsKeys: [],
  unlinkedConfiguredKeys: []
};

const CONFIG_PATH = path.join(
  __dirname,
  '../../data/gastos-operacionais-naturezas-config.json'
);

let memoryCache: GastosNaturezasConfigStore | null = null;

function isCustomBlock(item: unknown): item is GastosNaturezaCustomBlock {
  if (!item || typeof item !== 'object') return false;
  const block = item as GastosNaturezaCustomBlock;
  return (
    typeof block.id === 'string' &&
    typeof block.code === 'string' &&
    typeof block.label === 'string' &&
    Array.isArray(block.parentLabels) &&
    block.parentLabels.every((label) => typeof label === 'string') &&
    typeof block.createdAt === 'string'
  );
}

function sanitizeStore(parsed: Partial<GastosNaturezasConfigStore> | null | undefined): GastosNaturezasConfigStore {
  if (!parsed || typeof parsed !== 'object') return { ...EMPTY_STORE, customBlocks: [] };

  return {
    mappings: Array.isArray(parsed.mappings)
      ? parsed.mappings.filter(
          (item): item is GastosNaturezaCustomMapping =>
            !!item &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            typeof item.totvsLabel === 'string' &&
            typeof item.blockId === 'string' &&
            typeof item.targetCanonicalLabel === 'string' &&
            typeof item.createdAt === 'string'
        )
      : [],
    customBlocks: Array.isArray(parsed.customBlocks) ? parsed.customBlocks.filter(isCustomBlock) : [],
    dismissedTotvsKeys: Array.isArray(parsed.dismissedTotvsKeys)
      ? parsed.dismissedTotvsKeys.filter((key): key is string => typeof key === 'string')
      : [],
    acknowledgedTotvsKeys: Array.isArray(parsed.acknowledgedTotvsKeys)
      ? parsed.acknowledgedTotvsKeys.filter((key): key is string => typeof key === 'string')
      : [],
    unlinkedConfiguredKeys: Array.isArray(parsed.unlinkedConfiguredKeys)
      ? parsed.unlinkedConfiguredKeys.filter((key): key is string => typeof key === 'string')
      : []
  };
}

export function loadGastosNaturezasConfigStore(): GastosNaturezasConfigStore {
  if (memoryCache) return memoryCache;

  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      memoryCache = { ...EMPTY_STORE };
      return memoryCache;
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    memoryCache = sanitizeStore(JSON.parse(raw) as Partial<GastosNaturezasConfigStore>);
    return memoryCache;
  } catch {
    memoryCache = { ...EMPTY_STORE };
    return memoryCache;
  }
}

export function saveGastosNaturezasConfigStore(
  store: GastosNaturezasConfigStore
): GastosNaturezasConfigStore {
  const next = sanitizeStore(store);
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
  memoryCache = next;
  return next;
}

export function getCustomAllowedNaturezaKeys(
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): Set<string> {
  const keys = new Set<string>();
  for (const mapping of store.mappings) {
    const key = normalizeGastosOperacionaisNaturezaKey(mapping.totvsLabel);
    if (key) keys.add(key);
    const canonicalKey = normalizeGastosOperacionaisNaturezaKey(mapping.targetCanonicalLabel);
    if (canonicalKey && !mapping.asAlias) keys.add(canonicalKey);
  }
  return keys;
}

export function findNaturezaMapping(
  natureza: string,
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): GastosNaturezaCustomMapping | null {
  const key = normalizeGastosOperacionaisNaturezaKey(natureza);
  if (!key) return null;
  return (
    store.mappings.find(
      (mapping) => normalizeGastosOperacionaisNaturezaKey(mapping.totvsLabel) === key
    ) ?? null
  );
}

export function isUnlinkedConfiguredNatureza(
  natureza: string,
  store: GastosNaturezasConfigStore = loadGastosNaturezasConfigStore()
): boolean {
  const key = normalizeGastosOperacionaisNaturezaKey(natureza);
  if (!key) return false;
  if (store.unlinkedConfiguredKeys.includes(key)) return true;

  const mapping = findNaturezaMapping(natureza, store);
  if (mapping) {
    const canonicalKey = normalizeGastosOperacionaisNaturezaKey(mapping.targetCanonicalLabel);
    if (canonicalKey && store.unlinkedConfiguredKeys.includes(canonicalKey)) return true;
  }

  return false;
}

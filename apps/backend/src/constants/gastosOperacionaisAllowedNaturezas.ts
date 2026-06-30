/**
 * Espelha apps/frontend/.../gastosOperacionaisAllowedNaturezas.ts
 */

import {
  getGastosOperacionaisDfcAllowedKeys,
  normalizeGastosOperacionaisNaturezaKey
} from './gastosOperacionaisDfcBlocks';

const GASTOS_OPERACIONAIS_LEGACY_ALLOWED_NATUREZAS = [] as const;

const GASTOS_OPERACIONAIS_LEGACY_ALIASES = [] as const;

const GASTOS_OPERACIONAIS_LEGACY_ALLOWED_KEYS = new Set(
  [...GASTOS_OPERACIONAIS_LEGACY_ALLOWED_NATUREZAS, ...GASTOS_OPERACIONAIS_LEGACY_ALIASES].map(
    (natureza) => normalizeGastosOperacionaisNaturezaKey(natureza)
  )
);

const GASTOS_OPERACIONAIS_DFC_ALLOWED_KEYS = getGastosOperacionaisDfcAllowedKeys();

export function isGastosOperacionaisAllowedNatureza(natureza: string): boolean {
  const key = normalizeGastosOperacionaisNaturezaKey(natureza);
  if (!key || key === '—' || key === '-') return false;
  return GASTOS_OPERACIONAIS_DFC_ALLOWED_KEYS.has(key) || GASTOS_OPERACIONAIS_LEGACY_ALLOWED_KEYS.has(key);
}

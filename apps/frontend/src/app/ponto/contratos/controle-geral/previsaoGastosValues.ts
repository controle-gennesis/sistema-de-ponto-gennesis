const STORAGE_KEY = 'controle-geral-previsao-gastos-values-v1';

export type PrevisaoGastosMonthValues = Record<string, Record<string, number>>;

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function readStore(): Record<string, PrevisaoGastosMonthValues> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, PrevisaoGastosMonthValues>;
  } catch {
    return {};
  }
}

export function loadPrevisaoGastosMonthValues(year: number, month: number): PrevisaoGastosMonthValues {
  const stored = readStore()[monthKey(year, month)];
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};

  const values: PrevisaoGastosMonthValues = {};
  for (const [contract, columns] of Object.entries(stored)) {
    if (!columns || typeof columns !== 'object' || Array.isArray(columns)) continue;
    const columnValues: Record<string, number> = {};
    for (const [columnId, amount] of Object.entries(columns)) {
      const numeric = Number(amount);
      if (Number.isFinite(numeric)) columnValues[columnId] = numeric;
    }
    if (Object.keys(columnValues).length > 0) values[contract] = columnValues;
  }
  return values;
}

export function savePrevisaoGastosMonthValues(
  year: number,
  month: number,
  values: PrevisaoGastosMonthValues
): void {
  if (typeof window === 'undefined') return;
  try {
    const store = readStore();
    store[monthKey(year, month)] = values;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private mode errors
  }
}

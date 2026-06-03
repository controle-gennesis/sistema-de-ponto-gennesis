const currencyFormatterBr = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Mesma regra do salário em `CreateEmployeeForm` / `EditEmployeeForm`: só dígitos,
 * valor = int(dígitos) / 100 (os dois últimos dígitos são centavos).
 */
export function maskCurrencyInputBr(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const asNumber = digits ? parseInt(digits, 10) / 100 : 0;
  return currencyFormatterBr.format(asNumber);
}

/** Como `maskCurrencyInputBr`, mas retorna vazio quando não há dígitos. */
export function maskCurrencyInputBrOrEmpty(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return currencyFormatterBr.format(parseInt(digits, 10) / 100);
}

export function parseCurrencyInputBr(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return parseInt(digits, 10) / 100;
}

export function formatCurrencyInputBrFromNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return '';
  return currencyFormatterBr.format(n);
}

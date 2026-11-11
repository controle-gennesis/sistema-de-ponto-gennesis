/** Campo de percentual (ex.: "12,5"): só dígitos e uma vírgula. */
export function maskPercentInput(value: string): string {
  const limpo = value.replace(/[^\d,]/g, '');
  const [inteiro, ...resto] = limpo.split(',');
  const decimais = resto.join('').slice(0, 2);
  return resto.length ? `${inteiro.slice(0, 3)},${decimais}` : inteiro.slice(0, 3);
}

export function parsePercentInput(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function formatPercentInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

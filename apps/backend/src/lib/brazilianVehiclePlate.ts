const OLD_PLATE_REGEX = /^[A-Z]{3}[0-9]{4}$/;
const MERCOSUL_PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

export function stripPlaca(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidBrazilianPlate(value: string): boolean {
  const raw = stripPlaca(value);
  return OLD_PLATE_REGEX.test(raw) || MERCOSUL_PLATE_REGEX.test(raw);
}

export function formatPlacaDisplay(value: string): string {
  const raw = stripPlaca(value);
  if (!raw) return '';

  if (MERCOSUL_PLATE_REGEX.test(raw)) return raw;
  if (OLD_PLATE_REGEX.test(raw)) return `${raw.slice(0, 3)}-${raw.slice(3)}`;

  return raw;
}

export function normalizePlacaForStorage(value: unknown): string {
  return formatPlacaDisplay(String(value ?? '').trim());
}

export function placaVariants(value: string): string[] {
  const raw = stripPlaca(value);
  const formatted = formatPlacaDisplay(value);
  const variants = new Set<string>([raw, formatted]);
  if (OLD_PLATE_REGEX.test(raw)) {
    variants.add(`${raw.slice(0, 3)}-${raw.slice(3)}`);
    variants.add(raw);
  }
  return Array.from(variants);
}

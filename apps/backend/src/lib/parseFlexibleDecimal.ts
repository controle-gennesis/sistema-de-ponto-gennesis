/**
 * Interpreta decimais com `.` ou `,` de forma ambígua-segura para litros/preço.
 *
 * - `14,947` e `14.947` → 14.947 (um único separador = decimal, nunca milhar)
 * - `1.234,56` → 1234.56 (BR)
 * - `1,234.56` → 1234.56 (US)
 */
export function parseFlexibleDecimal(raw: string): number | null {
  let s = String(raw ?? '')
    .trim()
    .replace(/r\$\s*/gi, '')
    .replace(/\s/g, '');
  if (!s) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // 1.234,56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.56
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    // Um ponto = decimal (14.947). Vários = milhar (1.234.567).
    if (parts.length > 2) {
      s = s.replace(/\./g, '');
    }
  }

  s = s.replace(/[^0-9.-]/g, '');
  if (!s || s === '-' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Limite por abastecimento (evita ponto/vírgula virarem milhar no cupom). */
export const FUEL_LITERS_MAX = 500;

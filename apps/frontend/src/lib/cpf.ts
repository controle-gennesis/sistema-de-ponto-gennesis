export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCpfInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Máscara de CPF (até 11 dígitos) ou CNPJ (12 a 14 dígitos). */
export function formatCpfOrCnpjInput(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) return formatCpfInput(digits);
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** Detecta se o usuário está digitando e-mail (e não CPF). */
export function looksLikeEmail(value: string): boolean {
  return /[a-zA-Z@]/.test(value);
}

/** Máscara opcional enquanto digita CPF; e-mail passa direto. */
export function normalizeLoginIdentifierInput(value: string): string {
  const trimmed = value.trimStart();
  if (looksLikeEmail(trimmed)) return trimmed.toLowerCase();
  return formatCpfOrCnpjInput(trimmed);
}

/** Valor enviado ao backend: e-mail normalizado ou CPF só com dígitos. */
export function serializeLoginIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (looksLikeEmail(trimmed)) return trimmed.toLowerCase();
  return onlyDigits(trimmed);
}

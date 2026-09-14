import { onlyDigits } from './cpf';

/** Máscara progressiva de telefone brasileiro: (00) 0000-0000 ou (00) 00000-0000. */
export function formatPhoneBR(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Exibe um telefone já salvo; devolve o valor original quando não reconhece o formato. */
export function displayPhoneBR(value: string | null | undefined): string {
  if (!value) return '';
  const digits = onlyDigits(value);
  if (digits.length === 10 || digits.length === 11) return formatPhoneBR(digits);
  return value;
}

import { onlyDigits } from './cpf';

/** Remove DDI 55 quando vier no número (WhatsApp / Meta). */
function nationalBrPhoneDigits(value: string): string {
  let digits = onlyDigits(value);
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  return digits;
}

/** Máscara progressiva de telefone brasileiro: (00) 0000-0000 ou (00) 00000-0000. */
export function formatPhoneBR(value: string): string {
  const digits = nationalBrPhoneDigits(value).slice(0, 11);
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
  const digits = nationalBrPhoneDigits(value);
  if (digits.length === 10 || digits.length === 11) return formatPhoneBR(digits);
  return value;
}

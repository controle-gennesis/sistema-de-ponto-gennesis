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

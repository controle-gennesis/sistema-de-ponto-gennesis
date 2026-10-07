/**
 * Dia do mês em que abre o relatório do **mês seguinte**.
 * Ex.: 25/10 → Novembro/2026; de 01/11 a 24/11 o período ativo continua Novembro.
 */
export const MENSAL_REPORT_RELEASE_DAY = 25;
/** Último dia do mês calendário em que o período ainda é o mês corrente (antes da troca no dia 25). */
export const MENSAL_REPORT_DUE_DAY = 24;

/** Chave do mês (ex.: 2026-08). */
export function getIsoMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Mês do relatório mensal ativo:
 * - dia ≥ 25 → mês seguinte
 * - dia &lt; 25 → mês corrente (aberto no dia 25 do mês anterior)
 */
export function getMensalReportMonthKey(date = new Date()): string {
  if (date.getDate() >= MENSAL_REPORT_RELEASE_DAY) {
    return getIsoMonthKey(new Date(date.getFullYear(), date.getMonth() + 1, 1));
  }
  return getIsoMonthKey(date);
}

/** Sempre há período ativo; a troca para o próximo mês ocorre no dia 25. */
export function isMensalReportVisible(_date = new Date()): boolean {
  return true;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Rótulo amigável: "Agosto/2026". */
export function formatMonthLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const name = MONTH_NAMES[month - 1];
  if (!name) return monthKey;
  return `${name}/${year}`;
}

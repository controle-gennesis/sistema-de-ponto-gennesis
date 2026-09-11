/** A semana da produção semanal vai da data do preenchimento até + 7 dias. */
export const PRODUCTION_WEEK_OFFSET_DAYS = 7;

export function addCalendarDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12, 0, 0, 0);
}

export function productionWeekDate(fillingDate: Date): Date {
  return addCalendarDays(fillingDate, PRODUCTION_WEEK_OFFSET_DAYS);
}

function formatDayPtBr(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Ex.: "10/09/2026 a 17/09/2026" */
export function formatProductionWeekRange(fillingDate: Date): string {
  return `${formatDayPtBr(fillingDate)} a ${formatDayPtBr(productionWeekDate(fillingDate))}`;
}

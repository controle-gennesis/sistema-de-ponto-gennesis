import { prisma } from './prisma';

const DEFAULT_SLA_HOURS = 24;
const BRAZIL_OFFSET = '-03:00';

export async function getFuelSuppliesSlaHours(): Promise<number> {
  const settings = await prisma.companySettings.findFirst({
    select: { fuelSuppliesSlaHours: true },
    orderBy: { createdAt: 'asc' },
  });
  const hours = settings?.fuelSuppliesSlaHours;
  return typeof hours === 'number' && hours > 0 ? hours : DEFAULT_SLA_HOURS;
}

export function formatFuelSuppliesSlaMessage(slaHours: number): string {
  if (slaHours < 24) {
    return slaHours === 1
      ? 'Sua solicitação será atendida em até 1 hora.'
      : `Sua solicitação será atendida em até ${slaHours} horas.`;
  }
  const days = Math.round(slaHours / 24);
  if (days === 1) {
    return 'Sua solicitação será atendida em até 1 dia útil.';
  }
  return `Sua solicitação será atendida em até ${days} dias úteis.`;
}

/** Texto fixo do prazo de abastecimento (até 22:00 do dia). */
export function formatRefuelDeadlineLabel(): string {
  return 'até 22:00 do dia';
}

/**
 * Prazo = 22:00 (horário de Brasília) no dia da data de abastecimento,
 * independente da hora em que a solicitação foi feita ou liberada.
 */
export function computeRefuelDeadlineAtForDate(refuelDate: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(refuelDate);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) {
    const fallback = new Date(refuelDate);
    fallback.setHours(22, 0, 0, 0);
    return fallback;
  }
  return new Date(`${y}-${m}-${d}T22:00:00${BRAZIL_OFFSET}`);
}

/** @deprecated Prefer computeRefuelDeadlineAtForDate — mantido só por compat. */
export function computeRefuelDeadlineAt(amount: number, unit: 'HOURS' | 'DAYS'): Date {
  const deadline = new Date();
  if (unit === 'HOURS') {
    deadline.setHours(deadline.getHours() + amount);
    return deadline;
  }
  deadline.setDate(deadline.getDate() + amount);
  return deadline;
}

export function formatBrDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(',', ' às');
}

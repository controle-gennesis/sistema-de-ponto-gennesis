/** Valor completo, com centavos: R$ 15.000.000,00. */
export function brlFull(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(v) ? v : 0);
}

/** Valores grandes de forma curta: R$ 14,2 mi · R$ 633,6 mil · R$ 850. */
export function brlCompact(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/** 12,3% */
export function percent(n: number, digits = 1): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

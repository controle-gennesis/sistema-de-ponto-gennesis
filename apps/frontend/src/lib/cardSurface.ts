/** Superfície especial da tela de Contrato. */
export const CARD_SURFACE =
  'relative overflow-hidden !rounded-2xl border border-gray-200/80 bg-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-gray-900/70';

/** Card padrão do restante do sistema. */
export const CARD_SURFACE_DEFAULT =
  'relative overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800';

export const CARD_ACCENTS = {
  indigo: 'from-indigo-500 via-violet-500 to-fuchsia-400',
  blue: 'from-blue-500 via-indigo-500 to-sky-400',
  sky: 'from-sky-500 via-cyan-400 to-teal-400',
  green: 'from-emerald-500 via-green-400 to-teal-400',
  amber: 'from-amber-500 via-orange-400 to-yellow-400',
  rose: 'from-rose-500 via-pink-400 to-fuchsia-400',
  teal: 'from-teal-500 via-cyan-400 to-sky-400',
} as const;

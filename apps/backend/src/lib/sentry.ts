import * as Sentry from '@sentry/node';

/**
 * Monitoramento de erros em produção. Sem `SENTRY_DSN` configurado, tudo aqui vira no-op —
 * não afeta dev local nem exige nenhuma conta pra rodar o backend.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
}

export function isSentryEnabled(): boolean {
  return !!process.env.SENTRY_DSN;
}

export { Sentry };

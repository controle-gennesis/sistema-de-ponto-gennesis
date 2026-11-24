import type { NextFunction, Request, Response } from 'express';
import { Sentry, isSentryEnabled } from '../lib/sentry';

/** Rotas que passam desse tempo (ms) entram no log como «lentas». Override: SLOW_REQUEST_MS. */
const DEFAULT_SLOW_MS = 500;

function slowLimitMs(): number {
  const n = Number.parseInt(String(process.env.SLOW_REQUEST_MS ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SLOW_MS;
}

/**
 * Registra no log as requisições lentas (método, rota, status e tempo), para a gente saber o que
 * otimizar com número em vez de chute. Usa o padrão da rota (/api/x/:id), sem os dados do usuário.
 * Não cria serviço novo: é só o log do servidor; com o Sentry ligado, vira também um aviso lá.
 */
export function slowRequestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (ms < slowLimitMs()) return;
    const rota = `${req.baseUrl || ''}${req.route?.path ?? ''}` || req.path.replace(/\/[0-9a-z]{20,}/gi, '/:id');
    console.warn(`🐢 [lento] ${req.method} ${rota} → ${res.statusCode} em ${Math.round(ms)}ms`);
    if (isSentryEnabled()) {
      Sentry.addBreadcrumb({
        category: 'slow-request',
        level: 'warning',
        message: `${req.method} ${rota} ${Math.round(ms)}ms`,
      });
    }
  });
  next();
}

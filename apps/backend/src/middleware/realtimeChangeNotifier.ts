import type { NextFunction, Request, Response } from 'express';
import { broadcastDataChanged } from '../realtime/wsCallSignaling';

/** Prefixo da rota → escopo avisado ao app. */
const SCOPES: Array<[string, string]> = [
  ['/api/fuel-refuel-requests', 'fuel'],
  ['/api/vehicle-reservations', 'reservation'],
  ['/api/solicitacoes-dp', 'dp'],
  ['/api/gestao-os', 'workorder'],
  ['/api/approvals', 'approvals'],
  ['/api/demand-sheet-approvals', 'approvals'],
];

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEBOUNCE_MS = 400;

let pending = new Set<string>();
let timer: NodeJS.Timeout | null = null;

function schedule(scope: string) {
  pending.add(scope);
  if (timer) return;
  timer = setTimeout(() => {
    const scopes = [...pending];
    pending = new Set();
    timer = null;
    try {
      broadcastDataChanged(scopes);
    } catch (err) {
      console.warn('[realtime] falha ao avisar clientes:', err instanceof Error ? err.message : err);
    }
  }, DEBOUNCE_MS);
}

/**
 * Depois de qualquer escrita bem-sucedida nas áreas que alimentam a tab bar/sino do app,
 * avisa os clientes conectados (agrupa rajadas em um único aviso).
 */
export function realtimeChangeNotifier(req: Request, res: Response, next: NextFunction) {
  if (MUTATING.has(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const url = req.originalUrl || req.url || '';
      for (const [prefix, scope] of SCOPES) {
        if (url.startsWith(prefix)) {
          schedule(scope);
          break;
        }
      }
    });
  }
  next();
}

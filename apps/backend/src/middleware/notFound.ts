import { Request, Response, NextFunction } from 'express';
import type { AppError } from './errorHandler';
import { isTrustedOrigin } from '../lib/trustedOrigin';

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  // Garantir que headers CORS sejam enviados mesmo em caso de 404
  const origin = req.headers.origin;
  if (origin && isTrustedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  const error = new Error(`Rota não encontrada - ${req.originalUrl}`) as AppError;
  error.statusCode = 404;
  res.status(404);
  next(error);
};

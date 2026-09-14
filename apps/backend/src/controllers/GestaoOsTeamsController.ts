import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { gestaoOsTeamsService } from '../services/GestaoOsTeamsService';

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export class GestaoOsTeamsController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsTeamsService.list({
        search: queryString(req.query.search),
        companyId: queryString(req.query.companyId),
        buildingId: queryString(req.query.buildingId),
        onlyActive: req.query.onlyActive === '1' || req.query.onlyActive === 'true'
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsTeamsService.getById(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsTeamsService.create(req.body ?? {});
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsTeamsService.update(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsTeamsService.remove(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const gestaoOsTeamsController = new GestaoOsTeamsController();

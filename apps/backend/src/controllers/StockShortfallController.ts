import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { stockShortfallService } from '../services/StockShortfallService';
import { createError } from '../middleware/errorHandler';

export class StockShortfallController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, costCenterId, category, month, year, search, limit } = req.query;
      const st = status ? String(status).toUpperCase() : 'ALL';
      const statusFilter =
        st === 'ABERTO' || st === 'RESOLVIDO' ? (st as 'ABERTO' | 'RESOLVIDO') : 'ALL';
      const data = await stockShortfallService.list({
        status: statusFilter,
        costCenterId: costCenterId ? String(costCenterId) : undefined,
        category: category ? String(category) : undefined,
        month: month ? parseInt(String(month), 10) : undefined,
        year: year ? parseInt(String(year), 10) : undefined,
        search: search ? String(search) : undefined,
        limit: limit ? parseInt(String(limit), 10) : undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async resolve(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Não autenticado', 401);
      const { id } = req.params;
      const updated = await stockShortfallService.resolve(String(id), req.user.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
}
